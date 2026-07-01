// #173 « Loop » — LE DISJONCTEUR du cron agentique (« frein avant moteur »).
//
// Aujourd'hui une tâche cron ne fait qu'une complétion texte (getBrain().complete). Le plan
// #173 lui donne la VRAIE boucle agentique (runRelay) — donc le pouvoir d'écrire des fichiers,
// SEUL, la nuit, sans personne pour relire le diff en direct. Condition non négociable (A) :
// aucun run agentique cron sans ce disjoncteur. Même patron que self-evolution-autoforge.ts
// (config env / état immuable / canX pur / recordX), mais avec une dimension TEMPORELLE : le
// plafond porte sur une FENÊTRE GLISSANTE d'une heure (un cron emballé ne peut pas boucler).
//
// PUR / injectable (`now` passé en argument → testable) / ne lève jamais.

/** Coût estimé d'UN run agentique cron (GLM ~$0 + escalade Claude possible). Prudent. */
export const CRON_RUN_EST_USD = 0.1;
const HOUR_MS = 60 * 60 * 1000;

export interface CronBreakerConfig {
  /** CRON_AGENTIC=on → une tâche cron accède à la vraie boucle agentique (runRelay). */
  enabled: boolean;
  /** CRON_MAX_RUNS_PER_HOUR : nombre max de runs agentiques par heure glissante (défaut 4). */
  maxRunsPerHour: number;
  /** CRON_BUDGET_USD_PER_HOUR : plafond de dépense par heure glissante (défaut 1.0). */
  budgetUsdPerHour: number;
}

/** Lit la config du disjoncteur depuis l'environnement. PUR (env injectable). */
export function cronBreakerConfig(env: NodeJS.ProcessEnv = process.env): CronBreakerConfig {
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    enabled: (env.CRON_AGENTIC ?? "off").toLowerCase() === "on",
    maxRunsPerHour: Math.floor(num(env.CRON_MAX_RUNS_PER_HOUR, 4)),
    budgetUsdPerHour: num(env.CRON_BUDGET_USD_PER_HOUR, 1.0),
  };
}

/** Un run agentique cron effectué (horodatage + coût réel). */
export interface CronRunRecord {
  at: number;
  costUsd: number;
}

/** État du disjoncteur : les runs récents (fenêtre glissante, in-process). */
export interface CronBreakerState {
  runs: CronRunRecord[];
}

export function newCronBreakerState(): CronBreakerState {
  return { runs: [] };
}

/** Runs tombant dans la dernière heure (par rapport à `now`). PUR. */
function windowRuns(state: CronBreakerState, now: number): CronRunRecord[] {
  return (state.runs ?? []).filter((r) => now - r.at < HOUR_MS);
}

export interface CronDecision {
  allow: boolean;
  reason: string;
}

/**
 * LE DISJONCTEUR : un run agentique cron est-il permis MAINTENANT ? PUR, ne dépense rien,
 * ne lève jamais. Refuse si le gate est OFF, si le plafond de runs/heure est atteint, ou si
 * le garde-coût horaire serait dépassé. Condition D'ENTRÉE (refusé AVANT de lancer runRelay).
 */
export function canRunCron(
  config: CronBreakerConfig,
  state: CronBreakerState,
  now: number,
  estCostUsd: number = CRON_RUN_EST_USD,
): CronDecision {
  if (!config.enabled) {
    return { allow: false, reason: "cron agentique désactivé (CRON_AGENTIC=off) → complétion texte" };
  }
  if (config.maxRunsPerHour <= 0) {
    return { allow: false, reason: "plafond de runs/heure = 0" };
  }
  const recent = windowRuns(state, now);
  if (recent.length >= config.maxRunsPerHour) {
    return { allow: false, reason: `plafond de ${config.maxRunsPerHour} run(s)/heure atteint` };
  }
  const spent = recent.reduce((s, r) => s + r.costUsd, 0);
  const est = Number.isFinite(estCostUsd) && estCostUsd >= 0 ? estCostUsd : CRON_RUN_EST_USD;
  if (spent + est > config.budgetUsdPerHour) {
    return {
      allow: false,
      reason: `garde-coût horaire atteint ($${spent.toFixed(2)}+$${est.toFixed(2)} > $${config.budgetUsdPerHour.toFixed(2)})`,
    };
  }
  return { allow: true, reason: "disjoncteur cron OK — run agentique autorisé" };
}

/**
 * Comptabilise un run effectué (IMMUTABLE : renvoie un nouvel état). Purge au passage les runs
 * de plus d'une heure → l'état ne grossit pas indéfiniment (le scheduler vit longtemps).
 */
export function recordCronRun(
  state: CronBreakerState,
  now: number,
  costUsd: number = CRON_RUN_EST_USD,
): CronBreakerState {
  const c = Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : CRON_RUN_EST_USD;
  return { runs: [...windowRuns(state, now), { at: now, costUsd: c }] };
}

/**
 * #173 Phase 2 — intervalle ADAPTATIF : Mango propose le délai (ms) du PROCHAIN run selon le
 * résultat du dernier (miroir du /loop dynamique). Travail restant (INCOMPLET) → repasser vite ;
 * tâche traitée ce cycle → délai normal ; échec → backoff long (ne pas marteler un projet cassé).
 * PUR, type structural (n'importe pas RelayResult → testable sans charger le moteur).
 */
export function computeNextRunHint(result: { success?: boolean; incomplete?: boolean } | null | undefined): number {
  const MIN = 15 * 60 * 1000;        // 15 min — du travail reste
  const NORMAL = 60 * 60 * 1000;     // 1 h — tâche traitée ce cycle
  const BACKOFF = 6 * 60 * 60 * 1000; // 6 h — échec, on espace
  if (!result?.success) return BACKOFF;
  if (result.incomplete) return MIN;
  return NORMAL;
}

/**
 * #173 Phase 3 — extrait les FICHIERS TOUCHÉS (write_file/edit_file) du journal d'un run, pour
 * rendre le résumé cron « diff-friendly » (voir CE qui a changé, pas juste du texte libre). PUR.
 */
export function extractTouchedFiles(logs: string[]): string[] {
  const set = new Set<string>();
  for (const line of logs ?? []) {
    if (!/write_file|edit_file/.test(line)) continue;
    const m = line.match(/"path"\s*:\s*"([^"]+)"/);
    if (m) set.add(m[1]);
  }
  return [...set];
}
