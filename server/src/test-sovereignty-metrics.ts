// Tests de la métrique de souveraineté (sovereignty-metrics.ts) — Phase 4.
// PUR : calcul sur des TurnMetrics fabriqués, aucune I/O.
import {
  sovereigntyByProject, sovereigntyTrend, sovereigntyReport, formatSovereignty,
} from "./sovereignty-metrics.js";
import type { TurnMetrics } from "./metrics.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

let seq = 0;
const tm = (project: string, resolvedBy: TurnMetrics["resolvedBy"], ts?: string): TurnMetrics => ({
  ts: ts ?? `2026-06-27T00:00:${String(seq++).padStart(2, "0")}.000Z`,
  project, model: "glm-5.2:cloud", mode: "construire", costUsd: 0, numTurns: 1,
  snapshots: 0, durationMs: 1, error: false, resolvedBy,
});

console.log("[1] sovereigntyByProject — agrégat + ordre récent→ancien");
{
  const rows: TurnMetrics[] = [
    tm("alpha", "eleve", "2026-06-25T10:00:00Z"),
    tm("alpha", "maitre", "2026-06-25T11:00:00Z"),
    tm("beta", "eleve", "2026-06-26T10:00:00Z"),
    tm("beta", "eleve", "2026-06-26T11:00:00Z"),
    { ...tm("legacy", undefined, "2026-06-20T00:00:00Z"), resolvedBy: undefined }, // ligne Claude-pur : ignorée
  ];
  const by = sovereigntyByProject(rows);
  check("2 projets (la ligne sans resolvedBy est ignorée)", by.length === 2);
  check("ordre récent→ancien (beta avant alpha)", by[0].project === "beta" && by[1].project === "alpha");
  const alpha = by.find((p) => p.project === "alpha")!;
  check("alpha : 1 eleve + 1 maitre = 2 tours", alpha.turns === 2 && alpha.eleve === 1 && alpha.maitre === 1);
  check("alpha : claudeRate = 0.5", alpha.claudeRate === 0.5);
  const beta = by.find((p) => p.project === "beta")!;
  check("beta : 100% Élève → claudeRate 0", beta.maitre === 0 && beta.claudeRate === 0);
}

console.log("\n[2] sovereigntyReport — global");
{
  const rep = sovereigntyReport([
    tm("a", "eleve"), tm("a", "eleve"), tm("a", "maitre"), tm("b", "none"),
  ]);
  check("4 tours mesurés", rep.totalTurns === 4);
  check("eleve 2 / maitre 1 / none 1", rep.eleve === 2 && rep.maitre === 1 && rep.none === 1);
  check("claudeRate = 1/4 = 0.25", rep.claudeRate === 0.25);
  check("sovereignRate = 2/4 = 0.5", rep.sovereignRate === 0.5);
}

console.log("\n[3] sovereigntyTrend — la baisse d'escalade Claude = souveraineté qui monte");
{
  // 4 projets : 2 anciens très dépendants de Claude, 2 récents souverains.
  const rows: TurnMetrics[] = [
    tm("old1", "maitre", "2026-06-20T00:00:00Z"),
    tm("old2", "maitre", "2026-06-21T00:00:00Z"),
    tm("new1", "eleve", "2026-06-26T00:00:00Z"),
    tm("new2", "eleve", "2026-06-27T00:00:00Z"),
  ];
  const tr = sovereigntyTrend(rows, 2);
  check("récent (new1,new2) Claude 0% < ancien (old1,old2) 100%", tr.recentRate === 0 && tr.previousRate === 1);
  check("improving = true (on devient souverain)", tr.improving === true);
  check("échantillon suffisant (2 fenêtres pleines de 2)", tr.sampleSufficient === true);

  const tooFew = sovereigntyTrend([tm("x", "eleve")], 5);
  check("pas assez de projets → sampleSufficient false", tooFew.sampleSufficient === false);
}

console.log("\n[4] formatSovereignty — lisible");
{
  check("aucun tour → message dédié", /aucun tour Élève/.test(formatSovereignty(sovereigntyReport([]))));
  const rows: TurnMetrics[] = [
    tm("o1", "maitre", "2026-06-20T00:00:00Z"), tm("o2", "maitre", "2026-06-21T00:00:00Z"),
    tm("n1", "eleve", "2026-06-26T00:00:00Z"), tm("n2", "eleve", "2026-06-27T00:00:00Z"),
  ];
  const line = formatSovereignty(sovereigntyReport(rows, 2));
  check("ligne contient le taux Élève (%)", /Élève/.test(line) && /%/.test(line));
  check("ligne signale la BAISSE d'escalade Claude (✅)", /EN BAISSE/.test(line) && line.includes("✅"));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} sovereignty-metrics : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
