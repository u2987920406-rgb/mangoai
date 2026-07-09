// Tests du disjoncteur cron (cron-breaker.ts, #173 Phase 0). Déterministe : `now` fixe.

import {
  cronBreakerConfig,
  canRunCron,
  recordCronRun,
  newCronBreakerState,
  computeNextRunHint,
  extractTouchedFiles,
  type CronBreakerState,
} from "../cron-breaker.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const T = 10_000_000; // "now" fixe
const HOUR = 60 * 60 * 1000;

// ---- config ----
const def = cronBreakerConfig({});
check("défaut : off, 4 runs/h, $1/h", !def.enabled && def.maxRunsPerHour === 4 && def.budgetUsdPerHour === 1.0);
check("CRON_AGENTIC=on active", cronBreakerConfig({ CRON_AGENTIC: "on" }).enabled);
const cfg = cronBreakerConfig({ CRON_AGENTIC: "on", CRON_MAX_RUNS_PER_HOUR: "3", CRON_BUDGET_USD_PER_HOUR: "0.5" });
check("valeurs custom lues", cfg.maxRunsPerHour === 3 && cfg.budgetUsdPerHour === 0.5);
check("valeur invalide → défaut", cronBreakerConfig({ CRON_MAX_RUNS_PER_HOUR: "-2" }).maxRunsPerHour === 4);

// ---- canRunCron ----
const on = cronBreakerConfig({ CRON_AGENTIC: "on" }); // 4/h, $1/h
check("gate off → refus (repli complétion texte)", !canRunCron(cronBreakerConfig({}), newCronBreakerState(), T).allow);
check("état vide + gate on → allow", canRunCron(on, newCronBreakerState(), T, 0.1).allow);

let st: CronBreakerState = newCronBreakerState();
for (let i = 0; i < 4; i++) st = recordCronRun(st, T, 0.01);
check("4 runs dans l'heure → 5e refusé (plafond runs/h)", !canRunCron(on, st, T, 0.1).allow);

const oldSt: CronBreakerState = { runs: [{ at: T - HOUR - 1000, costUsd: 0.5 }, { at: T - HOUR - 2000, costUsd: 0.5 }] };
check("runs vieux de +1h exclus (fenêtre glissante) → allow", canRunCron(on, oldSt, T, 0.1).allow);

const budgetCfg = cronBreakerConfig({ CRON_AGENTIC: "on", CRON_BUDGET_USD_PER_HOUR: "0.30" });
const spentSt: CronBreakerState = { runs: [{ at: T - 1000, costUsd: 0.25 }] };
check("garde-coût : $0.25 + est $0.10 > $0.30 → refus", !canRunCron(budgetCfg, spentSt, T, 0.1).allow);
check("sous le garde-coût → allow", canRunCron(budgetCfg, spentSt, T, 0.04).allow);
check("plafond runs/h = 0 → refus", !canRunCron(cronBreakerConfig({ CRON_AGENTIC: "on", CRON_MAX_RUNS_PER_HOUR: "0" }), newCronBreakerState(), T).allow);

// ---- recordCronRun ----
const pruneSt: CronBreakerState = { runs: [{ at: T - HOUR - 1, costUsd: 1 }, { at: T - 100, costUsd: 0.1 }] };
const after = recordCronRun(pruneSt, T, 0.05);
check("recordCronRun purge les >1h + ajoute le nouveau (2 restants)", after.runs.length === 2 && after.runs.every((r) => T - r.at < HOUR));
check("recordCronRun immuable (état d'origine intact)", pruneSt.runs.length === 2);

// ---- computeNextRunHint (Phase 2 : rythme adaptatif) ----
const MIN = 15 * 60 * 1000, NORMAL = 60 * 60 * 1000, BACKOFF = 6 * 60 * 60 * 1000;
check("incomplet → repasser vite (15 min)", computeNextRunHint({ success: true, incomplete: true }) === MIN);
check("fait ce cycle → délai normal (1 h)", computeNextRunHint({ success: true }) === NORMAL);
check("échec → backoff long (6 h)", computeNextRunHint({ success: false }) === BACKOFF);
check("null → backoff (prudent)", computeNextRunHint(null) === BACKOFF);

// ---- extractTouchedFiles (Phase 3 : diff-friendly) ----
const sampleLog = [
  "  🔧 planifier {\"titre\":\"x\"}",
  "  🔧 write_file {\"path\":\"src/App.jsx\",\"content\":\"...\"}",
  "  🔧 read_file {\"path\":\"src/index.css\"}",
  "  🔧 edit_file {\"path\":\"src/App.jsx\"}",
  "  🔧 edit_file {\"path\":\"vite.config.js\"}",
];
const touched = extractTouchedFiles(sampleLog);
check("extractTouchedFiles : uniquement write/edit, dédupliqués", touched.length === 2 && touched.includes("src/App.jsx") && touched.includes("vite.config.js"));
check("extractTouchedFiles : read_file ignoré", !touched.includes("src/index.css"));
check("extractTouchedFiles : log vide → []", extractTouchedFiles([]).length === 0);

console.log(`\n✅ cron-breaker : ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
