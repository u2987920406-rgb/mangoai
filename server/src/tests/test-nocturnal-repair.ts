// Test DÉTERMINISTE de la boucle d'auto-réparation nocturne (#58 robustesse).
// La boucle réelle appelle runAgent (réseau) + inspectProject (vrai vite build) ;
// on la teste ISOLÉE en injectant des fakes (même esprit que defaultRelayDeps
// dans eleve.ts), donc sans réseau ni build : on prouve le DÉCLENCHEMENT, le
// BORNAGE, la non-réparation des signaux objectifs ≠ build-failed, et que
// success = build réellement vert. Lancer : npx tsx src/test-nocturnal-repair.ts
import { ensureBuildPasses } from "../nocturnal.js";
import type { InspectionSignal } from "../inspection.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// Fake inspect : renvoie une séquence de signaux (le dernier est répété au-delà)
// et compte ses appels — simule un build qui passe/casse sans lancer Vite.
function fakeInspect(signals: InspectionSignal[]) {
  const calls = { n: 0 };
  const inspect = async (_dir: string) => {
    const sig = signals[Math.min(calls.n, signals.length - 1)];
    calls.n++;
    return { ok: sig === "ok", signal: sig, detail: sig === "build-failed" ? "X.jsx:1:14: ERROR: fake build error" : "" };
  };
  return { inspect, calls };
}

async function main(): Promise<void> {
  console.log("═".repeat(60));
  console.log("nocturnal — boucle d'auto-réparation (ensureBuildPasses)");
  console.log("─".repeat(60));

  // 1) Build cassé puis réparé au 1er tour.
  {
    const f = fakeInspect(["build-failed", "ok"]);
    const repairs: string[] = [];
    const v = await ensureBuildPasses("d", { inspect: f.inspect, repairTurn: async (p) => { repairs.push(p); } });
    check("1 réparation suffit → ok", v.ok === true);
    check("attempts = 1", v.attempts === 1);
    check("repairTurn appelé 1×", repairs.length === 1);
    check("le prompt de réparation réinjecte l'erreur du build", repairs[0].includes("fake build error"));
    check("inspect appelé 2× (avant + après la réparation)", f.calls.n === 2);
  }

  // 2) Build vert du premier coup → aucune réparation.
  {
    const f = fakeInspect(["ok"]);
    let repaired = 0;
    const v = await ensureBuildPasses("d", { inspect: f.inspect, repairTurn: async () => { repaired++; } });
    check("build OK direct → ok", v.ok === true);
    check("0 tentative, repairTurn jamais appelé", v.attempts === 0 && repaired === 0);
    check("inspect appelé 1×", f.calls.n === 1);
  }

  // 3) Build cassé en permanence → bornage à maxRepairs, reste KO.
  {
    const f = fakeInspect(["build-failed"]);
    let repaired = 0;
    const v = await ensureBuildPasses("d", { inspect: f.inspect, repairTurn: async () => { repaired++; } }, 2);
    check("build irréparable → KO", v.ok === false && v.signal === "build-failed");
    check("borné à 2 tentatives (pas de boucle infinie)", v.attempts === 2 && repaired === 2);
    check("inspect appelé 3× (1 initial + 2 re-checks)", f.calls.n === 3);
  }

  // 4) Signal objectif non réparable (no-deps) → la boucle ne se déclenche pas.
  {
    const f = fakeInspect(["no-deps"]);
    let repaired = 0;
    const v = await ensureBuildPasses("d", { inspect: f.inspect, repairTurn: async () => { repaired++; } });
    check("signal ≠ build-failed → KO sans réparation", v.ok === false && v.attempts === 0 && repaired === 0);
  }

  // 5) Deux échecs puis succès au 2e tour (réparation progressive).
  {
    const f = fakeInspect(["build-failed", "build-failed", "ok"]);
    let repaired = 0;
    const v = await ensureBuildPasses("d", { inspect: f.inspect, repairTurn: async () => { repaired++; } }, 2);
    check("réparé au 2e tour → ok", v.ok === true && v.attempts === 2 && repaired === 2);
  }

  console.log("═".repeat(60));
  if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
  else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
}

void main();
