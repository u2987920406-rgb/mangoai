// Phase E2 (#135) — Pont registre↔runtime : résout le CERVEAU d'une intention.
//
// Le panneau Réglages › Cerveaux (E1b) enregistre « telle intention → tel cerveau ».
// Ici on TRADUIT cette affectation en termes que le runtime comprend : un modèle,
// un provider, et un ModelProfile prêt à passer à runRelay/chatEleve. Sans routage
// configuré, on retombe sur le cerveau GLOBAL (.env) → comportement actuel exact.

import { resolveBrainForIntention, type Intention, type BrainCard } from "../brains.js";
import { resolveProfile, type ModelProfile } from "../models/profile.js";
import { getBrain } from "./brain-registry.js";
import type { LLMProvider } from "../llm/llm-engine.js";
import { requiredCapabilities, type TaskContext } from "../intent-capabilities.js";
import type { Capability } from "../eleve-tools/eleve-tool-capabilities.js";

// Repli profond (.env) — utilisé seulement si l'agent `codeur` du registre ne donne
// rien d'exploitable. Depuis #162, l'Élève (les « mains ») EST l'agent `codeur` du
// registre `brain-registry.json` → éditable depuis l'Atelier des cerveaux. Les
// SECRETS (endpoint ELEVE_API_URL + clé ELEVE_API_KEY) restent dans .env (lus par le
// chemin openai de llm-engine) ; le registre ne porte que provider + modèle.
const ELEVE_MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";
function envProvider(): LLMProvider {
  return (process.env.ELEVE_PROVIDER ?? "").trim().toLowerCase() === "openai" ? "openai" : "ollama";
}

export interface EleveBinding {
  intention: Intention;
  model: string;
  provider: LLMProvider;
  profile: ModelProfile;
  /** La fiche mesurée employée (null = aucun routage → repli global). */
  card: BrainCard | null;
  /** Endpoint OpenAI-compat custom (C1-P0) — absent = endpoint .env (ELEVE_API_URL). */
  baseUrl?: string;
  /** Nom de la variable d'env qui porte la clé API — JAMAIS la clé elle-même. */
  apiKeyEnv?: string;
  /** CHANTIER 3 (2026-09-29) — timeout du ROLE, déclaré au registre (codeur:
   *  1_800_000 = 30 min) mais JAMAIS transmis au transport avant ce correctif.
   *  Un rôle cloud héritait donc des 30 min prévus pour un runner local : mesure,
   *  les runs en échec ont payé 1801 s / 1707 s / 1664 s pour conclure
   *  « injoignable ». Renseigné = le transport le respecte. */
  timeoutMs?: number;
}

export interface RuntimeFallback {
  model: string;
  provider: LLMProvider;
  profile: ModelProfile;
  /** Endpoint OpenAI-compat custom (C1-P0) — repris de l'agent `codeur` du registre. */
  baseUrl?: string;
  /** Nom de la variable d'env qui porte la clé API — JAMAIS la clé elle-même. */
  apiKeyEnv?: string;
  /** CHANTIER 3 — timeout déclaré au registre pour ce rôle (cf. EleveBinding). */
  timeoutMs?: number;
}

/** Le cerveau Élève « par défaut » (sans routage par intention) = l'agent `codeur`
 * du registre (#162) → pilotable depuis l'Atelier des cerveaux, lu À CHAUD (un édit
 * prend effet sans redémarrage). Repli profond sur .env si le registre ne donne rien. */
export function globalFallback(): RuntimeFallback {
  const c = getBrain("codeur");
  const model = (c.model ?? "").trim() || ELEVE_MODEL;
  // Normaliser comme syncEleveFromBrainRegistry : "claude" (ou tout provider non-Élève)
  // est ignoré → repli .env ; seuls "ollama" et les compat OpenAI sont valides ici.
  const rawProv = c.provider ?? "";
  const provider: LLMProvider = rawProv === "ollama" ? "ollama"
    : (rawProv && rawProv !== "claude") ? "openai" as LLMProvider
    : envProvider();
  // C1-P0 — le registre (server/data/brain-registry.json) peut porter un endpoint
  // custom (baseUrl + NOM de variable d'env pour la clé). Absents aujourd'hui →
  // undefined ici, donc AUCUN changement de comportement (repli .env inchangé,
  // résolu au tout dernier moment dans eleve.ts:openAiEndpoint).
  return { model, provider, profile: resolveProfile(model), baseUrl: c.baseUrl, apiKeyEnv: c.apiKeyEnv, timeoutMs: c.timeoutMs };
}

/** Profil RUNTIME d'un cerveau mesuré : la prose de famille (system, fichiers
 * d'axiomes, routage d'escalade) vient de resolveProfile(model) ; les caps et le
 * drapeau agentic sont ÉCRASÉS par la MESURE #148 (le mesuré prime sur le présumé). */
export function profileForBrain(card: BrainCard): ModelProfile {
  return { ...resolveProfile(card.model), caps: card.caps, agentic: card.agentic };
}

/** Le routeur d'intention : la fiche affectée → binding complet ; sinon repli global. */
export function resolveBinding(intention: Intention, fallback: RuntimeFallback = globalFallback()): EleveBinding {
  const card = resolveBrainForIntention(intention);
  if (!card) {
    return {
      intention, model: fallback.model, provider: fallback.provider, profile: fallback.profile, card: null,
      baseUrl: fallback.baseUrl, apiKeyEnv: fallback.apiKeyEnv, timeoutMs: fallback.timeoutMs,
    };
  }
  return {
    intention, model: card.model, provider: card.provider, profile: profileForBrain(card), card,
    baseUrl: card.baseUrl, apiKeyEnv: card.apiKeyEnv, timeoutMs: card.timeoutMs,
  };
}

// ── Phase E3 — politique d'outils gatée par la FORCE MESURÉE du cerveau ────────

export interface BrainPolicy {
  /** run_command (shell libre) autorisé. */
  allowRun: boolean;
  /** délégation à des sous-agents autorisée. */
  allowDelegate: boolean;
}

/** Politique d'outils d'un cerveau : un function-calling moins fiable (frontière
 * #135) → on retire le shell libre puis la délégation. Sans fiche (repli global) →
 * plein pouvoir (= comportement actuel). Un cerveau non-agentique n'a aucun outil
 * d'action (il ne pilote pas la boucle de toute façon). */
export function policyForBinding(b: EleveBinding): BrainPolicy {
  if (!b.profile.agentic) return { allowRun: false, allowDelegate: false };
  const tool = b.card?.capabilities?.["appel d'outils"] ?? 1; // pas de fiche → plein pouvoir
  return { allowRun: tool >= 0.7, allowDelegate: tool >= 0.9 };
}

/** Sortie de `deriveIntention` (#182 É2) — l'intention (→ le CERVEAU, E2) ET les
 *  capacités requises (→ les OUTILS, D2), calculées au MÊME joint pour ne jamais diverger. */
export interface IntentionResult {
  intention: Intention;
  requiredCaps: Set<Capability>;
}

/**
 * Dérive l'intention d'un tour (explicite via bouton si valide, sinon depuis le mode) ET,
 * au même endroit, les capacités que la TÂCHE réclame (#182 É2 — `requiredCapabilities`,
 * `intent-capabilities.ts`). UN SEUL joint : on n'ajoute pas un `deriveCapabilities`
 * parallèle qui pourrait diverger de celui-ci (c'est exactement la cause-racine du
 * « trou » de vision d'hier — deux chemins qui ne se synchronisent pas).
 *
 * `task`/`context` sont optionnels (défaut `""`/`{}`) : un appelant qui ne les fournit
 * pas obtient `requiredCaps` = `DISCUSS_DEFAULT_CAPS` (sur-provisionnement read-safe
 * seul, étage 1 de D2) — jamais un throw, jamais un appel LLM implicite.
 */
export async function deriveIntention(
  modeIsDiscuss: boolean,
  raw: unknown,
  task: string = "",
  context: TaskContext = {},
): Promise<IntentionResult> {
  const intention: Intention =
    raw === "construire" || raw === "planifier" || raw === "discuter"
      ? raw
      : modeIsDiscuss ? "discuter" : "construire";
  const requiredCaps = await requiredCapabilities(task, context);
  return { intention, requiredCaps };
}
