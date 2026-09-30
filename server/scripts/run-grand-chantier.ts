// CLI du Grand Chantier (Phase 2) — lance l'orchestrateur autonome sur UN projet
// existant (squelette + .project-plan.json déjà posés, ou à poser au premier tour).
//
//   GRAND_CHANTIER=on npx tsx src/run-grand-chantier.ts <nom-projet> [--budget 5] [--attempts 2] [--stop-on-failure]
//
// GATÉ : ne fait rien sans GRAND_CHANTIER=on (zéro régression, déclenchement explicite).
// CHECKPOINTÉ : relancer la même commande reprend là où ça s'est arrêté (.grand-chantier.state.json).

import "dotenv/config";
import { projectDir } from "../src/projects.js";
import { runGrandChantier } from "../src/grand-chantier.js";
import { installNightBusExport } from "../src/night-guards.js";

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  installNightBusExport(); // le coût de ce chantier doit atteindre le Bus (Disjoncteur MangoQA)
  if (process.env.GRAND_CHANTIER !== "on") {
    console.error("⛔ Grand Chantier désactivé. Relance avec GRAND_CHANTIER=on pour l'autoriser.");
    process.exit(2);
  }
  const name = process.argv[2];
  if (!name || name.startsWith("--")) {
    console.error("Usage : GRAND_CHANTIER=on npx tsx src/run-grand-chantier.ts <nom-projet> [--budget 5] [--attempts 2] [--stop-on-failure]");
    process.exit(2);
  }

  const dir = projectDir(name);
  const budget = argValue("budget");
  const attempts = argValue("attempts");

  const r = await runGrandChantier(dir, {
    budgetUsd: budget !== undefined ? Number(budget) : undefined,
    attemptsPerIncrement: attempts !== undefined ? Number(attempts) : undefined,
    stopOnFailure: argFlag("stop-on-failure"),
    onLog: (line) => console.log(line),
  });

  console.log(
    `\n${r.ok ? "✅" : "⛔"} ${r.reason} — ${r.done.length} fait(s)` +
      `${r.failed.length ? `, ${r.failed.length} en quarantaine (${r.failed.join(", ")})` : ""} · $${r.costUsd.toFixed(2)}`,
  );
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
