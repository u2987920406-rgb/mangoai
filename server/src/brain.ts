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

import { dispatch, dispatchParallel, type DispatchOpts } from "./brain-dispatch.js";
import { askLLM } from "./llm-engine.js";
import { chatEleve, elevePost } from "./eleve.js";
import type { AgentId } from "./brain-registry.js";
import type { AgentResult } from "./agent-contract.js";

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
  /** Appel LLM one-shot (system, user) → texte. Lève si le provider échoue. */
  ask: typeof askLLM;
  /** Tour conversationnel de l'Élève (Discuter / Planifier) → texte. */
  chatEleve: typeof chatEleve;
  /** Construit la PostFn du transport agentique de l'Élève (function-calling). */
  elevePost: typeof elevePost;
}

const brainImpl = ((agentId: AgentId, system: string, user: string, opts?: DispatchOpts) =>
  dispatch(agentId, system, user, opts)) as BrainFacade;
brainImpl.dispatch = dispatch;
brainImpl.parallel = dispatchParallel;
brainImpl.ask = askLLM;
brainImpl.chatEleve = chatEleve;
brainImpl.elevePost = elevePost;

/** Le point d'entrée cerveau unique. */
export const brain: BrainFacade = brainImpl;
