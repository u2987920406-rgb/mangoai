// Tests de design-loop.ts (#196, Loop Design v1) — gate opt-in + le Contrôleur
// (shouldContinueLoop), pur et testable seul.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isLoopDesignEnabled, setLoopDesignEnabled, shouldContinueLoop } from "../design-loop.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

console.log("test-design-loop");
line("─");

console.log("\n[1] Gate opt-in (isLoopDesignEnabled/setLoopDesignEnabled)");
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loop-design-gate-test-"));
  try {
    check("false par défaut (aucun marqueur)", !isLoopDesignEnabled(tmp));
    setLoopDesignEnabled(tmp, true);
    check("true après activation", isLoopDesignEnabled(tmp));
    setLoopDesignEnabled(tmp, false);
    check("false après désactivation", !isLoopDesignEnabled(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("\n[2] shouldContinueLoop — le Contrôleur");
{
  const base: Parameters<typeof shouldContinueLoop>[0] = { cycle: 0, maxCycles: 3, hasIssues: true, verdict: null, costUsd: 0, maxCostUsd: 0.3 };

  check("1er cycle (verdict null) + écarts → continue", shouldContinueLoop(base).continue === true);
  check("aucun écart → s'arrête", shouldContinueLoop({ ...base, hasIssues: false }).continue === false);
  check("aucun écart → raison explicite", shouldContinueLoop({ ...base, hasIssues: false }).reason.includes("aucun écart"));

  check("plafond de cycles atteint → s'arrête", shouldContinueLoop({ ...base, cycle: 3 }).continue === false);
  check("plafond de cycles → raison explicite", shouldContinueLoop({ ...base, cycle: 3 }).reason.includes("plafond"));
  check("sous le plafond → continue", shouldContinueLoop({ ...base, cycle: 2 }).continue === true);

  check("garde-coût atteint → s'arrête", shouldContinueLoop({ ...base, costUsd: 0.3 }).continue === false);
  check("garde-coût dépassé → s'arrête", shouldContinueLoop({ ...base, costUsd: 0.5 }).continue === false);
  check("sous le garde-coût → continue", shouldContinueLoop({ ...base, costUsd: 0.1 }).continue === true);

  check("verdict B (mieux qu'avant) + écarts → continue", shouldContinueLoop({ ...base, cycle: 1, verdict: "B" }).continue === true);
  check("verdict A (pire qu'avant) → s'arrête", shouldContinueLoop({ ...base, cycle: 1, verdict: "A" }).continue === false);
  check("verdict tie (convergence) → s'arrête", shouldContinueLoop({ ...base, cycle: 1, verdict: "tie" }).continue === false);
  check("verdict instable (biais d'ordre) → s'arrête", shouldContinueLoop({ ...base, cycle: 1, verdict: "instable" }).continue === false);
  check("verdict instable → raison explicite", shouldContinueLoop({ ...base, cycle: 1, verdict: "instable" }).reason.includes("instable"));

  // Priorité : le plafond de cycles prime même si le verdict dirait de continuer.
  check("plafond prime sur un verdict B", shouldContinueLoop({ ...base, cycle: 3, verdict: "B" }).continue === false);
}

line("═");
if (failures === 0) {
  console.log("✅ Toutes les assertions passent.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
