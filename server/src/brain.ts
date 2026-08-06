// Façade cerveau UNIQUE (chantier #2, tranche T5) — le point d'entrée de HAUT niveau
// unique du cerveau de MangoOS.
//
// Elle N'IMPLÉMENTE rien : elle ORIENTE vers les moteurs DÉJÀ consolidés (T1-T4).
// brain-dispatch reste l'implémentation privée — son contrat « ne throw JAMAIS » +
// rate-limit par provider + fallback inter-providers + brainOverride sont précieux et
// testés ; la façade les EXPOSE, elle ne les réécrit pas. De même askLLM (one-shot),
// chatEleve (Élève conversationnel) et elevePost (transport agentique Élève) restent
// les moteurs ; la façade leur donne UNE porte commune et documentée.
//
// Objectif : à terme, tout appel de haut niveau passe par `brain(...)` / `brain.ask` /
// `brain.chatEleve` / `brain.elevePost`, et l'observabilité/retry centralisés se
// branchent ICI, en un seul endroit. Les appelants migrent un par un (adossée, pas
// substituée) — les imports directs de brain-dispatch/llm-engine/eleve restent valides.
//
// ── SA PLACE FACE À `v3/` — arbitrage Raf du 2026-08-06 (option A) ────────────────
// `v3/` (le socle des équipes) annonçait le MÊME objectif dans son en-tête, et les
// deux façades avaient l'air concurrentes. Elles ne le sont pas : elles répondent à
// deux questions différentes, et elles sont SUPERPOSÉES.
//
//     v3/       → QUELLE ÉQUIPE ?  périmètre d'outils, budget, clôture par le juge
//       │
//       ▼
//     brain.ts  → QUEL MOTEUR ?    dispatch / askLLM / chatEleve / elevePost   ← ICI
//       │
//       ▼
//     brain-dispatch.ts (implémentation privée)
//
// Cette façade RESTE, avec ses 14 importateurs : `v3/team-dispatch.ts` l'appelle au
// lieu d'appeler `dispatch` directement, et `test-v3-teams` garde la règle en lisant
// les sources de `v3/`. Ce qui sera branché ICI (observabilité, retry) vaudra donc
// aussi pour les équipes, sans double câblage — c'est tout l'intérêt de l'option A.

import { dispatch, dispatchParallel, type DispatchOpts } from "./brain/brain-dispatch.js";
import { askLLM } from "./llm/llm-engine.js";
import { chatEleve, elevePost } from "./eleve.js";
import { getBrain } from "./brain/brain-registry.js";
import type { AgentId, BrainConfig } from "./brain/brain-registry.js";
import type { AgentResult } from "./agent/agent-contract.js";

/** Options d'`askAs`. Tout est optionnel : sans rien, le cerveau du rôle s'applique.
 *  Les champs de cerveau (provider/model/baseUrl/apiKeyEnv/timeoutMs) forment un
 *  `brainOverride` — ils servent aux appelants qui choisissaient déjà explicitement
 *  leur moteur et doivent continuer à le faire à l'octet près. */
export interface AskAsOptions {
  provider?: BrainConfig["provider"];
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  timeoutMs?: number;
  maxTokens?: number;
  imageBase64?: string;
  imageMimeType?: string;
  /** Transport injectable (tests). */
  ask?: DispatchOpts["ask"];
}

/** Façade appelable + méthodes orientant vers chaque moteur consolidé. */
export interface BrainFacade {
  /** Appel agentique de HAUT niveau : route vers LE cerveau du rôle (registre ou
   *  `opts.brainOverride`), applique le contrat Mango, l'anti-injection, le rate-limit
   *  et le fallback. Ne throw JAMAIS (toute erreur → AgentResult dégradé). */
  (agentId: AgentId, system: string, user: string, opts?: DispatchOpts): Promise<AgentResult>;
  /** Idem, forme nommée (alias explicite de la forme appelable). */
  dispatch: typeof dispatch;
  /** dispatch en parallèle (Promise.all, chaque entrée résout en AgentResult). */
  parallel: typeof dispatchParallel;
  /** Appel LLM one-shot (system, user) → texte. Lève si le provider échoue.
   *  ⚠️ CONTOURNE le dispatcher : ni rate limiter, ni garde de souveraineté, ni repli.
   *  Réservé aux cas où il n'existe pas de rôle pertinent. Sinon : `askAs`. */
  ask: typeof askLLM;
  /** Le CHAÎNON MANQUANT (2026-08-06). Même contrat qu'`ask` — rend du TEXTE, LÈVE en
   *  cas d'échec — mais l'appel passe par le dispatcher, sous l'identité d'un rôle.
   *
   *  Ce qu'un appelant y GAGNE sans rien changer à sa gestion d'erreur :
   *    · le rate limiter le compte (un appel direct est invisible du compteur) ;
   *    · la garde de souveraineté s'applique (un rôle localOnly ne sort pas) ;
   *    · le repli inter-providers joue si le rôle en déclare un ;
   *    · le provider devient EXPLICITE au lieu du défaut d'environnement.
   *
   *  Ce qui CHANGE, et qu'il faut savoir : la conscience temporelle est injectée en
   *  tête du system (figée ON au lot 2). Le contrat Mango, lui, ne l'est PAS
   *  (`freeform`), et le contenu utilisateur n'est PAS encadré (`trustExternal`) —
   *  le prompt reste donc celui que l'appelant a écrit. */
  askAs: (agentId: AgentId, system: string, user: string, opts?: AskAsOptions) => Promise<string>;
  /** Tour conversationnel de l'Élève (Discuter / Planifier) → texte. */
  chatEleve: typeof chatEleve;
  /** Construit la PostFn du transport agentique de l'Élève (function-calling). */
  elevePost: typeof elevePost;
}

const brainImpl = ((agentId: AgentId, system: string, user: string, opts?: DispatchOpts) =>
  dispatch(agentId, system, user, opts)) as BrainFacade;
brainImpl.dispatch = dispatch;
brainImpl.askAs = async (agentId, system, user, opts = {}) => {
  // Override PARTIEL : dès qu'un champ de cerveau est précisé, il se FUSIONNE sur
  // celui du rôle. Un appelant qui ne veut imposer que le modèle (« même cerveau,
  // autre modèle ») ne doit pas avoir à répéter le provider — sinon il le répète
  // mal, ou il ne le répète pas et son modèle est silencieusement ignoré.
  const precise = opts.provider ?? opts.model ?? opts.baseUrl ?? opts.apiKeyEnv ?? opts.timeoutMs;
  let brainOverride: BrainConfig | undefined;
  if (precise !== undefined) {
    const duRole = getBrain(agentId);
    brainOverride = {
      provider: opts.provider ?? duRole.provider,
      model: opts.model ?? duRole.model,
      baseUrl: opts.baseUrl ?? duRole.baseUrl,
      apiKeyEnv: opts.apiKeyEnv ?? duRole.apiKeyEnv,
      timeoutMs: opts.timeoutMs ?? duRole.timeoutMs,
      // La souveraineté et la chaîne de repli du RÔLE sont conservées : un override
      // choisit un moteur, il ne lève pas une garde.
      localOnly: duRole.localOnly,
      fallback: duRole.fallback,
    };
  }

  const r = await dispatch(agentId, system, user, {
    // freeform : pas de contrat Mango imposé — l'appelant attend du texte brut, et
    // c'est son prompt qui décide de la forme. trustExternal : pas d'encadrement
    // anti-injection — l'ajouter changerait le prompt de tous les appelants d'un
    // coup. Ceux qui en ont besoin l'appliquent déjà eux-mêmes (specialist-agents).
    freeform: true,
    trustExternal: true,
    brainOverride,
    maxTokens: opts.maxTokens,
    imageBase64: opts.imageBase64,
    imageMimeType: opts.imageMimeType,
    ask: opts.ask,
  });

  // On RELÈVE l'échec. `dispatch` ne throw jamais — c'est sa garantie — mais les
  // appelants d'`askLLM` ont tous un try/catch qui compte là-dessus. Leur rendre
  // « erreur cerveau : … » comme s'il s'agissait d'une réponse valide serait pire
  // qu'une exception : ils la traiteraient comme du contenu.
  if (r.status !== "ok") {
    throw new Error(`[${agentId}] ${r.summary || `échec du cerveau (${r.status})`}`);
  }
  return r.summary;
};
brainImpl.parallel = dispatchParallel;
brainImpl.ask = askLLM;
brainImpl.chatEleve = chatEleve;
brainImpl.elevePost = elevePost;

/** Le point d'entrée cerveau unique. */
export const brain: BrainFacade = brainImpl;

// Ré-exports nommés de délégation pure — permettent aux appelants d'importer
// `dispatch` / `dispatchParallel` / `DispatchOpts` DEPUIS la façade (`./brain.js`)
// plutôt que directement depuis brain-dispatch. Aucune logique ajoutée : ce sont
// exactement les symboles de brain-dispatch (l'implémentation privée reste inchangée).
export { dispatch, dispatchParallel };
export type { DispatchOpts };
