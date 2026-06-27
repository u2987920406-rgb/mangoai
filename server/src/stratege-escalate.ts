// #164 « Le Stratège » Phase 4 — ÉCHELLE D'ESCALADE DE L'EXÉCUTANT (brain-inadequate).
//
// Quand un blocage RÉCIDIVE alors que le Stratège a DÉJÀ tenté son remède pour cette
// classe (le remède n'a pas « pris » → `strategeState.tried` le contient déjà), le
// problème n'est plus la stratégie : c'est que le CERVEAU de l'Élève ne suffit pas pour
// CE projet. Au lieu d'abandonner (escalade Claude), on **monte le cerveau de l'Élève
// d'un cran** sur l'échelle d'escalade, et on relance — frugal d'abord, fort si nécessaire.
//
// Condition (B) du plan (refinement Raf) : « la RÉSOLUTION prime, mais BORNÉE ». D'où :
//   • on ne DESCEND jamais (on ne refait pas un barreau déjà tenté) ;
//   • on MONTE d'un cran seulement quand le courant ne résout pas ;
//   • l'échelle est FINIE (au plus N barreaux) → aucune boucle ; au sommet sans
//     résolution → on rend la main (escalade Claude opt-in inchangée, ou retour à Raf).
//
// Claude (le Maître) n'est PAS un barreau de cette échelle : il reste le filet SÉPARÉ
// (finalizeEscalation, gaté ELEVE_ESCALATE_ON_BLOCK) — les barreaux cloud-Ollama
// s'insèrent AVANT lui → moins de dépendance à Claude (souveraineté).
//
// PUR & déterministe (aucun réseau) : le caller applique le swap (`runCtx.post`).

import type { LLMProvider } from "./llm-engine.js";
import type { Diagnosis } from "./stratege-signals.js";
import { remedyKey, type StrategeState } from "./stratege.js";

/** Un barreau de l'échelle de l'exécutant. tier 0 = cerveau courant ; >0 = supérieur. */
export interface ExecRung {
  model: string;
  provider: LLMProvider;
  label: string;
  tier: number;
}

/** Le cerveau courant de l'Élève (barreau 0). */
export interface CurrentBrain {
  model: string;
  provider: LLMProvider;
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>(
  ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"],
);

/**
 * Construit l'échelle d'escalade de l'exécutant à partir du cerveau courant.
 * Barreau 0 = courant. Barreau 1 = « cloud supérieur » CONFIGURABLE par env
 * (`STRATEGE_EXEC_ESCALATE_MODEL` + `_PROVIDER`, défaut provider `ollama`). Si aucun
 * modèle supérieur n'est configuré → échelle d'UN seul barreau (= pas de swap possible,
 * on retombe sur l'escalade Claude opt-in : comportement actuel inchangé).
 * `env` injectable (tests). On REFUSE un barreau supérieur identique au courant
 * (sinon « monter » ne changerait rien).
 */
export function executorLadder(current: CurrentBrain, env: NodeJS.ProcessEnv = process.env): ExecRung[] {
  const ladder: ExecRung[] = [{ model: current.model, provider: current.provider, label: `${current.model} (courant)`, tier: 0 }];
  const sup = (env.STRATEGE_EXEC_ESCALATE_MODEL ?? "").trim();
  if (sup && sup !== current.model) {
    const rawProv = (env.STRATEGE_EXEC_ESCALATE_PROVIDER ?? "ollama").trim();
    const provider = (VALID_PROVIDERS.has(rawProv) ? rawProv : "ollama") as LLMProvider;
    ladder.push({ model: sup, provider, label: `${sup} (cloud supérieur)`, tier: 1 });
  }
  return ladder;
}

/**
 * Le prochain barreau STRICTEMENT au-dessus de `currentTier`, ou null si on est déjà
 * au sommet (→ on rend la main). Borné par la longueur de l'échelle : aucune boucle.
 */
export function nextExecutorRung(ladder: ExecRung[], currentTier: number): ExecRung | null {
  return ladder.find((r) => r.tier > currentTier) ?? null;
}

/**
 * « Cerveau inadéquat ? » — un blocage RÉCIDIVE alors que son remède a DÉJÀ été tenté
 * (présent dans `state.tried`). C'est le signal que la STRATÉGIE est épuisée et que le
 * problème est le CERVEAU, pas le remède. PUR. (Un blocage `none` n'est jamais inadéquat.)
 */
export function isBrainInadequate(d: Diagnosis, state: StrategeState): boolean {
  if (d.blocker === "none") return false;
  return state.tried.has(remedyKey(d));
}

/** Nudge injecté à l'Élève après une montée de cerveau (divulgation de l'enjeu). */
export function brainEscalationNudge(d: Diagnosis, rung: ExecRung): string {
  return (
    `⤴ STRATÈGE — le blocage « ${d.blocker} » a résisté au remède précédent. ` +
    `Je te confie à un cerveau plus fort (${rung.label}). ` +
    `Reprends le projet, corrige la cause (${d.cause}), vérifie le build et appelle \`finish\`.`
  );
}

/** Ligne lisible « Mango monte d'un cran » (observabilité). */
export function formatExecutorEscalation(d: Diagnosis, rung: ExecRung): string {
  return `🧠 Stratège — cerveau-exécutant inadéquat sur « ${d.blocker} » → MONTE au barreau ${rung.tier} : ${rung.label}`;
}
