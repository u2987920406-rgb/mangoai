// Phase E2 (#135) — Pont registre↔runtime : résout le CERVEAU d'une intention.
//
// Le panneau Réglages › Cerveaux (E1b) enregistre « telle intention → tel cerveau ».
// Ici on TRADUIT cette affectation en termes que le runtime comprend : un modèle,
// un provider, et un ModelProfile prêt à passer à runRelay/chatEleve. Sans routage
// configuré, on retombe sur le cerveau GLOBAL (.env) → comportement actuel exact.

import { resolveBrainForIntention, type Intention, type BrainCard } from "./brains.js";
import { resolveProfile, type ModelProfile } from "./models/profile.js";
import type { LLMProvider } from "./llm-engine.js";

const ELEVE_MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";
function globalProvider(): LLMProvider {
  return (process.env.ELEVE_PROVIDER ?? "").trim().toLowerCase() === "openai" ? "openai" : "ollama";
}

export interface EleveBinding {
  intention: Intention;
  model: string;
  provider: LLMProvider;
  profile: ModelProfile;
  /** La fiche mesurée employée (null = aucun routage → repli global). */
  card: BrainCard | null;
}

export interface RuntimeFallback {
  model: string;
  provider: LLMProvider;
  profile: ModelProfile;
}

/** Le repli global (.env) — exactement le cerveau Élève par défaut. */
export function globalFallback(): RuntimeFallback {
  return { model: ELEVE_MODEL, provider: globalProvider(), profile: resolveProfile(ELEVE_MODEL) };
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
  if (!card) return { intention, model: fallback.model, provider: fallback.provider, profile: fallback.profile, card: null };
  return { intention, model: card.model, provider: card.provider, profile: profileForBrain(card), card };
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

/** Dérive l'intention d'un tour : explicite (bouton) si valide, sinon depuis le mode. */
export function deriveIntention(modeIsDiscuss: boolean, raw: unknown): Intention {
  if (raw === "construire" || raw === "planifier" || raw === "discuter") return raw;
  return modeIsDiscuss ? "discuter" : "construire";
}
