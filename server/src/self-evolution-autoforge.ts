// #168 tranche 2 — LE DISJONCTEUR de la forge auto (« frein avant moteur »).
//
// Tranche 1 : Mango PROPOSE une lacune, Raf VALIDE d'un clic, le forgeron crée l'agent.
// Tranche 2 : la forge peut s'ARMER seule (sans clic) — MAIS uniquement sous un disjoncteur
// DÉTERMINISTE, fidèle à la fondation (le moteur ne s'arme jamais sans le frein). Deux gardes :
//   1. plafond de forges par run (anti-emballement)
//   2. garde-coût Opus (le forgeron tourne sur Opus → borne la dépense par run)
// Gaté OFF par défaut (`SELF_EVOLVE_AUTO`). PUR / injectable / ne lève jamais. Le forgeage réel
// reste `forgeForGap` (agent-forge.ts) ; ici on ne fait que DÉCIDER et COMPTABILISER.

/** Coût estimé d'UNE forge Opus (spec courte). Sert au garde-coût AVANT de dépenser. */
export const OPUS_FORGE_EST_USD = 0.12;

export interface AutoForgeConfig {
  /** SELF_EVOLVE_AUTO=on → la forge peut s'armer sans validation humaine. */
  enabled: boolean;
  /** SELF_EVOLVE_MAX_FORGES : nombre max de forges automatiques par run (défaut 1). */
  maxForgesPerRun: number;
  /** SELF_EVOLVE_OPUS_BUDGET_USD : plafond de dépense Opus des forges auto par run (défaut 0.50). */
  opusBudgetUsd: number;
}

/** Lit la config du disjoncteur depuis l'environnement. PUR (env injectable). */
export function autoForgeConfig(env: NodeJS.ProcessEnv = process.env): AutoForgeConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    enabled: (env.SELF_EVOLVE_AUTO ?? "off").toLowerCase() === "on",
    maxForgesPerRun: Math.floor(num(env.SELF_EVOLVE_MAX_FORGES, 1)),
    opusBudgetUsd: num(env.SELF_EVOLVE_OPUS_BUDGET_USD, 0.5),
  };
}

/** État du disjoncteur pour UN run (compteur + dépense cumulée). */
export interface AutoForgeState {
  forges: number;
  spentUsd: number;
}

export function newAutoForgeState(): AutoForgeState {
  return { forges: 0, spentUsd: 0 };
}

export interface ForgeDecision {
  allow: boolean;
  reason: string;
}

/**
 * LE DISJONCTEUR : une forge automatique est-elle permise MAINTENANT ? PUR, ne dépense rien,
 * ne lève jamais. Refuse si le gate est OFF, si le plafond de forges est atteint, ou si le
 * garde-coût Opus serait dépassé. Sinon autorise.
 */
export function canAutoForge(
  config: AutoForgeConfig,
  state: AutoForgeState,
  estCostUsd: number = OPUS_FORGE_EST_USD,
): ForgeDecision {
  if (!config.enabled) {
    return { allow: false, reason: "forge auto désactivée (SELF_EVOLVE_AUTO=off) → validation humaine" };
  }
  if (config.maxForgesPerRun <= 0) {
    return { allow: false, reason: "plafond de forges = 0" };
  }
  if (state.forges >= config.maxForgesPerRun) {
    return { allow: false, reason: `plafond de ${config.maxForgesPerRun} forge(s)/run atteint` };
  }
  const est = Number.isFinite(estCostUsd) && estCostUsd >= 0 ? estCostUsd : OPUS_FORGE_EST_USD;
  if (state.spentUsd + est > config.opusBudgetUsd) {
    return {
      allow: false,
      reason: `garde-coût Opus atteint ($${state.spentUsd.toFixed(2)}+$${est.toFixed(2)} > $${config.opusBudgetUsd.toFixed(2)})`,
    };
  }
  return { allow: true, reason: "disjoncteur OK — forge auto autorisée" };
}

/** Comptabilise une forge effectuée (IMMUTABLE : renvoie un nouvel état). */
export function recordAutoForge(state: AutoForgeState, costUsd: number = OPUS_FORGE_EST_USD): AutoForgeState {
  const c = Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : OPUS_FORGE_EST_USD;
  return { forges: state.forges + 1, spentUsd: state.spentUsd + c };
}
