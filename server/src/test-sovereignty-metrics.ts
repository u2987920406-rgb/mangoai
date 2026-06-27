// Tests de la métrique de souveraineté (sovereignty-metrics.ts) — Phase 4.
// PUR : calcul sur des TurnMetrics fabriqués, aucune I/O.
import {
  sovereigntyByProject, sovereigntyByType, sovereigntyTrend, sovereigntyReport, formatSovereignty,
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

console.log("\n[5] sovereigntyByType — agrégat par projectType");
{
  // 2 types : "web" (3 tours dont 1 escalade Claude) et "cli" (2 tours, 100% Élève).
  // Un tour sans projectType → regroupé sous "(inconnu)".
  const rows: TurnMetrics[] = [
    { ...tm("p1", "eleve", "2026-06-25T10:00:00Z"), projectType: "web" },
    { ...tm("p2", "maitre", "2026-06-25T11:00:00Z"), projectType: "web" },
    { ...tm("p3", "eleve", "2026-06-26T09:00:00Z"), projectType: "web" },
    { ...tm("p4", "eleve", "2026-06-26T10:00:00Z"), projectType: "cli" },
    { ...tm("p5", "eleve", "2026-06-26T11:00:00Z"), projectType: "cli" },
    { ...tm("p6", "maitre", "2026-06-27T08:00:00Z") }, // pas de projectType → "(inconnu)"
  ];
  const by = sovereigntyByType(rows);
  check("3 types regroupés (web, cli, inconnu)", by.length === 3);
  check("ordre récent→ancien (inconnu avant cli avant web)",
    by[0].project === "(inconnu)" && by[1].project === "cli" && by[2].project === "web");
  const web = by.find((p) => p.project === "web")!;
  check("web : 3 tours (2 eleve + 1 maitre)", web.turns === 3 && web.eleve === 2 && web.maitre === 1);
  check("web : claudeRate = 1/3", web.claudeRate === 1 / 3);
  const cli = by.find((p) => p.project === "cli")!;
  check("cli : 2 tours, 100% Élève → claudeRate 0", cli.turns === 2 && cli.maitre === 0 && cli.claudeRate === 0);
  const inconnu = by.find((p) => p.project === "(inconnu)")!;
  check("inconnu : 1 tour (1 maitre) → claudeRate 1", inconnu.turns === 1 && inconnu.maitre === 1 && inconnu.claudeRate === 1);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} sovereignty-metrics : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
