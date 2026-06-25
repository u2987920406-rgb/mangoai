// Tests du Gardien de clôture (#161). Déterministe, deps injectées (judge/critique/
// stopPreview). On exerce : changedFilesFromTrace, runClosureGate (tout OK, intention
// KO, goût KO, WCAG KO, aperçu KO → design sauté), evaluateGate (ok/corrige/laisse-
// passer), buildGateNudge. Ne lève jamais.

import {
  runClosureGate,
  evaluateGate,
  changedFilesFromTrace,
  buildGateNudge,
  type GateDeps,
  type GateVerdict,
} from "./eleve-gate.js";
import { setPlan, clearPlan } from "./eleve-plan.js";
import type { DesignCritique } from "./design-coach.js";
import type { IntentVerdict } from "./eleve-judge.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const trace = (names: Array<[string, string]>) => names.map(([name, args]) => ({ name, args }));
const result = (text: string, t: Array<{ name: string; args: string }> = []) => ({ text, toolTrace: t });

const goodIntent: IntentVerdict = { couverture: 90, manques: [], note: "" };
const critique = (overall: number, fails = 0): DesignCritique => ({
  overall,
  lenses: [{ name: "harmonie", score: overall, issue: "couleurs ternes", fix: "augmente le contraste" }],
  measure: { contrastFails: Array.from({ length: fails }, () => ({ fg: "#888", bg: "#999", ratio: 1.2, required: 4.5, level: "AA" as const })), offPalette: [], paletteSize: 3 },
  raw: "",
});

function deps(over: Partial<GateDeps> = {}): GateDeps {
  return {
    judge: over.judge ?? (async () => goodIntent),
    critique: over.critique ?? (async () => critique(90)),
    stopPreview: over.stopPreview ?? (async () => {}),
  };
}

async function run() {
  console.log("\n[1] changedFilesFromTrace (PUR)");
  {
    const files = changedFilesFromTrace(
      trace([
        ["read_file", '{"path":"a"}'],
        ["write_file", '{"path":"src/A.jsx","content":"x"}'],
        ["edit_file", '{"path":"src/B.jsx"}'],
        ["write_file", '{"path":"src/A.jsx"}'], // doublon
        ["check_build", "{}"],
      ]),
    );
    check("seulement write/edit, dédupliqués", files.length === 2 && files.includes("src/A.jsx") && files.includes("src/B.jsx"));
  }

  console.log("\n[2] runClosureGate — tout OK");
  {
    const v = await runClosureGate("/proj", "tâche", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 }, deps());
    check("ok:true", v.ok === true && v.raisons.length === 0);
    check("design présent", !!v.design);
  }

  console.log("\n[3] runClosureGate — intention KO");
  {
    const v = await runClosureGate(
      "/proj",
      "tâche",
      result("fait"),
      "/ws",
      "dashboard",
      { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 },
      deps({ judge: async () => ({ couverture: 40, manques: ["la page Contact"], note: "" }) }),
    );
    check("ok:false", v.ok === false);
    check("raison intention + manque", v.raisons.some((r) => /INTENTION 40/.test(r) && /page Contact/.test(r)));
  }

  console.log("\n[4] runClosureGate — goût KO");
  {
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 80, wcagMaxFails: 0 }, deps({ critique: async () => critique(55) }));
    check("ok:false (goût 55 < 80)", v.ok === false);
    check("raison goût + correctif", v.raisons.some((r) => /GOÛT 55/.test(r) && /contraste/i.test(r)));
  }

  console.log("\n[5] runClosureGate — WCAG KO");
  {
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 50, wcagMaxFails: 0 }, deps({ critique: async () => critique(90, 3) }));
    check("ok:false (3 fails > 0)", v.ok === false);
    check("raison QA WCAG", v.raisons.some((r) => /QA/.test(r) && /WCAG/.test(r)));
  }

  console.log("\n[6] runClosureGate — aperçu KO → design sauté, intention seule");
  {
    const stops = { n: 0 };
    const v = await runClosureGate(
      "/proj",
      "t",
      result("fait"),
      "/ws",
      "dashboard",
      {},
      deps({
        critique: async () => {
          throw new Error("aperçu indispo");
        },
        stopPreview: async () => {
          stops.n++;
        },
      }),
    );
    check("design absent", v.design === undefined);
    check("ok:true (intention OK, goût sauté)", v.ok === true);
    check("stopPreview quand même appelé", stops.n === 1);
  }

  console.log("\n[7] runClosureGate — judge qui lève → neutre, ne lève jamais");
  {
    let threw = false;
    let v;
    try {
      v = await runClosureGate("/proj", "t", result("fait"), "/ws", "x", {}, deps({ judge: async () => { throw new Error("juge HS"); } }));
    } catch {
      threw = true;
    }
    check("ne lève pas", !threw);
    check("intention neutre", v?.intent.couverture === 100);
  }

  console.log("\n[8] evaluateGate — décision pure");
  {
    const koVerdict: GateVerdict = { ok: false, intent: { couverture: 40, manques: ["x"], note: "" }, design: critique(50), raisons: ["INTENTION 40", "GOÛT 50"] };
    const okVerdict: GateVerdict = { ok: true, intent: goodIntent, raisons: [] };
    check("ok → action ok", evaluateGate("/p", okVerdict, 0, 2).action === "ok");
    const d1 = evaluateGate("/p", koVerdict, 0, 2);
    check("KO + budget → corrige + nudge", d1.action === "corrige" && "nudge" in d1 && /Gardien/.test((d1 as { nudge: string }).nudge));
    check("KO + budget épuisé → laisse-passer", evaluateGate("/p", koVerdict, 2, 2).action === "laisse-passer");
  }

  console.log("\n[9] buildGateNudge — préfixe le plan (#160) s'il existe");
  {
    const v: GateVerdict = { ok: false, intent: { couverture: 40, manques: ["la nav"], note: "" }, raisons: ["INTENTION 40 — il manque :\n  - la nav"] };
    clearPlan("/p");
    const sansPlan = buildGateNudge("/p", v, 1, 2);
    check("sans plan : pas de rappel mais le nudge Gardien", !/Rappel de TON plan/.test(sansPlan) && /Gardien/.test(sansPlan) && /la nav/.test(sansPlan));
    setPlan("/p", { titre: "Contact", etapes: [{ n: 1, titre: "form" }, { n: 2, titre: "nav" }], at: 1 });
    const avecPlan = buildGateNudge("/p", v, 1, 2);
    check("avec plan : rappel EN TÊTE", avecPlan.startsWith("📋 Rappel de TON plan"));
    clearPlan("/p");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-gate : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
