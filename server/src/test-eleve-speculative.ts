// Tests de l'exécution agentique spéculative (#171) — exécuteur/vérificateur mockés, aucun LLM/GPU.
import {
  runSpeculative,
  nextDepth,
  summarizeSpeculation,
  type SpecStep,
  type SpeculativeDeps,
} from "./eleve-speculative.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const steps = (...labels: string[]): SpecStep[] => labels.map((label) => ({ label }));

async function run() {
  console.log("[1] tout accepté");
  {
    const executed: number[] = [];
    const deps: SpeculativeDeps<unknown> = {
      execute: (_s, i) => { executed.push(i); return { ok: true }; },
      verify: () => true,
    };
    const r = await runSpeculative(steps("a", "b", "c"), deps);
    check("accepted = drafted", r.accepted === 3 && r.drafted === 3);
    check("divergedAt null", r.divergedAt === null);
    check("ratio 1", r.acceptanceRatio === 1);
    check("savedRoundTrips = accepted-1", r.savedRoundTrips === 2);
    check("toutes exécutées", executed.join() === "0,1,2");
  }

  console.log("\n[2] divergence au milieu — la suite N'EST PAS exécutée");
  {
    const executed: number[] = [];
    const deps: SpeculativeDeps<unknown> = {
      execute: (_s, i) => { executed.push(i); return { ok: true }; },
      verify: (_s, _o, i) => i < 2, // l'étape #2 échoue à la vérif
    };
    const r = await runSpeculative(steps("a", "b", "c", "d"), deps);
    check("accepted = 2", r.accepted === 2);
    check("divergedAt = 2", r.divergedAt === 2);
    check("préfixe accepté = a,b", r.acceptedSteps.map((s) => s.label).join() === "a,b");
    check("step #2 exécutée puis rejetée, #3 jamais exécutée", executed.join() === "0,1,2");
    check("ratio = 0.5", r.acceptanceRatio === 0.5);
  }

  console.log("\n[3] rejet dès la 1ʳᵉ étape");
  {
    const r = await runSpeculative(steps("a", "b"), { execute: () => ({ ok: true }), verify: () => false });
    check("accepted 0", r.accepted === 0 && r.divergedAt === 0);
    check("savedRoundTrips 0", r.savedRoundTrips === 0);
  }

  console.log("\n[4] robustesse — execute/verify qui plantent, draft vide");
  {
    const rExec = await runSpeculative(steps("a", "b"), {
      execute: (_s, i) => { if (i === 1) throw new Error("boom"); return { ok: true }; },
      verify: () => true,
    });
    check("execute qui throw → rejet propre à cette étape", rExec.accepted === 1 && rExec.divergedAt === 1);

    const rVerif = await runSpeculative(steps("a"), {
      execute: () => ({ ok: true }),
      verify: () => { throw new Error("juge planté"); },
    });
    check("verify qui throw → rejet (ne lève jamais)", rVerif.accepted === 0 && rVerif.divergedAt === 0);

    const rEmpty = await runSpeculative([], { execute: () => ({ ok: true }), verify: () => true });
    check("draft vide → 0, ratio 0, pas de crash", rEmpty.drafted === 0 && rEmpty.accepted === 0 && rEmpty.acceptanceRatio === 0);

    const rOutcome = await runSpeculative(steps("a"), { execute: () => ({ ok: false, detail: "build cassé" }), verify: () => true });
    check("outcome.ok=false → rejet sans appeler verify comme succès", rOutcome.accepted === 0 && rOutcome.outcomes[0].detail === "build cassé");
  }

  console.log("\n[5] profondeur adaptative (comme la longueur de draft en spec-decoding)");
  {
    const policy = { min: 1, max: 8 };
    check("acceptation haute → +1", nextDepth(3, 0.9, policy) === 4);
    check("acceptation basse → ÷2", nextDepth(6, 0.2, policy) === 3);
    check("acceptation moyenne → inchangée", nextDepth(4, 0.6, policy) === 4);
    check("borné au max", nextDepth(8, 1, policy) === 8);
    check("borné au min", nextDepth(1, 0, policy) === 1);
  }

  console.log("\n[6] résumé lisible");
  {
    const r = await runSpeculative(steps("a", "b", "c", "d"), { execute: () => ({ ok: true }), verify: (_s, _o, i) => i < 3 });
    const line = summarizeSpeculation(r);
    check("résumé porte le ratio et la divergence", /3\/4/.test(line) && /75%/.test(line) && /#3/.test(line));
  }

  console.log(`\n=== eleve-speculative : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
