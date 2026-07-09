// Orchestrateur du run nocturne d'entraînement (#145).
//
// Enchaîne les 3 phases du cycle d'apprentissage, en SOUS-PROCESS séquentiels
// (chaque script a son propre main() auto-exécuté, donc on les spawn) :
//
//   Phase 0 — run-tonight.ts : Gemma génère N apps, escalade Claude au blocage
//             → chaque escalade écrit un AXIOME réinjecté aux apps suivantes.
//   Phase 1 — run-finish.ts  : Claude FINIT chaque app (elite/esthetique/finition),
//             borné par le garde-budget (FINISH_BUDGET_USD).
//   Phase 2 — run-learn.ts   : Gemma distille une PROCÉDURE du diff Gemma→Claude
//             + validation boucle fermée.
//
// Lancer :  npx tsx src/run-night.ts --budget 20
// Dry-run : npx tsx src/run-night.ts --budget 5 --limit 2   (2 apps, valide l'enchaînement)
//
// Reprise : chaque phase est résumable (ses propres fichiers d'état) → relancer
// la même commande reprend là où ça s'est arrêté.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WORKSPACE_DIR } from "../src/projects.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(WORKSPACE_DIR, ".night.log");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* */ }
}

// ── Args ────────────────────────────────────────────────────────────────────
function argValue(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BUDGET = argValue("--budget", "20");          // plafond Claude Phase 1 ($)
const LIMIT = argValue("--limit", "0");             // 0 = les 12 apps ; N = dry-run

// ── Lance un script tsx et attend sa fin (hérite stdio → logs visibles) ────────
function runScript(script: string, extraEnv: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const child = spawn(
      isWin ? "npx.cmd" : "npx",
      ["tsx", path.join(HERE, script)],
      { stdio: "inherit", shell: isWin, env: { ...process.env, ...extraEnv } },
    );
    child.on("exit", (code) => resolve(code ?? 0));
    child.on("error", (e) => { log(`✗ spawn ${script} : ${e.message}`); resolve(1); });
  });
}

async function main(): Promise<void> {
  const limitEnv: Record<string, string> = Number(LIMIT) > 0 ? { TONIGHT_LIMIT: LIMIT } : {};
  const appsLabel = Number(LIMIT) > 0 ? `${LIMIT} app(s) [dry-run]` : "12 apps";

  log("\n🌙 ═══════════════════════════════════════════════════════════════");
  log(`   RUN NOCTURNE D'ENTRAÎNEMENT — ${appsLabel}`);
  log(`   Phase 0 (Gemma génère + escalade) → Phase 1 (Claude finit, budget $${BUDGET}) → Phase 2 (Gemma apprend)`);
  log("═══════════════════════════════════════════════════════════════════");

  // ── Phase 0 — Gemma génère, escalade Claude, axiomes incrémentaux ──────────
  log("\n▶ PHASE 0 — run-tonight.ts (Gemma + Sharingan $0, Claude = escalade)");
  const c0 = await runScript("run-tonight.ts", { ...limitEnv });
  log(`Phase 0 terminée (exit ${c0}).`);

  // ── Phase 1 — Claude finit, borné par le budget ───────────────────────────
  log(`\n▶ PHASE 1 — run-finish.ts (Claude finit, garde-budget $${BUDGET})`);
  const c1 = await runScript("run-finish.ts", { ...limitEnv, FINISH_BUDGET_USD: BUDGET });
  log(`Phase 1 terminée (exit ${c1}).`);

  // ── Phase 2 — Gemma apprend par reverse-engineering ────────────────────────
  log("\n▶ PHASE 2 — run-learn.ts (diff Gemma→Claude → procédures + validation)");
  const c2 = await runScript("run-learn.ts", { ...limitEnv });
  log(`Phase 2 terminée (exit ${c2}).`);

  log("\n🌅 ═══════════════════════════════════════════════════════════════");
  log("   RUN TERMINÉ. Data de retour à lire au matin :");
  log("   · .tonight.bilan.md   — Gemma : builds OK, taux d'escalade, scores");
  log("   · .finish.bilan.md    — Claude : coût total Phase 1");
  log("   · .relearn.bilan.md   — procédures apprises + score de validation");
  log("   · .axioms.md / .axioms.gemma.md — axiomes accumulés cette nuit");
  log("═══════════════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
