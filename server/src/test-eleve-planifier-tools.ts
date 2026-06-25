// Tests de l'outil planifier (#160). Déterministe, deps injectées (setPlan mouchard).
// On exerce : forme, happy (plan posé + étapes numérotées + texte « suis ce plan »),
// titre vide → isError, < 2 étapes → isError, étapes vides filtrées, ne lève jamais.

import { buildElevePlanifierTools, type PlanifierDeps } from "./eleve-planifier-tools.js";
import type { ElevePlan } from "./eleve-plan.js";

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

function tool(over: Partial<PlanifierDeps> = {}) {
  const calls: { plans: ElevePlan[] } = { plans: [] };
  const deps: PlanifierDeps = {
    setPlan: over.setPlan ?? ((_dir, plan) => calls.plans.push(plan)),
    now: over.now ?? (() => 42),
  };
  const [t] = buildElevePlanifierTools("/tmp/proj", deps);
  return { t, calls };
}

async function run() {
  console.log("\n[1] Forme");
  {
    const { t } = tool();
    check("nom = planifier", t.name === "planifier");
    check("schéma : titre + etapes", "titre" in t.inputSchema && "etapes" in t.inputSchema);
    check("description mentionne plan/étapes", /plan/i.test(t.description) && /étapes/i.test(t.description));
  }

  console.log("\n[2] Happy — plan posé");
  {
    const { t, calls } = tool();
    const r = await t.handler({
      titre: "Page Contact",
      etapes: [
        { titre: "Composant formulaire", detail: "nom/email/message" },
        { titre: "Validation" },
        { titre: "État d'envoi" },
      ],
    });
    check("pas d'erreur", r.isError !== true);
    check("setPlan appelé 1×", calls.plans.length === 1);
    check("3 étapes numérotées 1..3", calls.plans[0].etapes.map((e) => e.n).join() === "1,2,3");
    check("titre conservé", calls.plans[0].titre === "Page Contact");
    check("détail conservé", calls.plans[0].etapes[0].detail === "nom/email/message");
    check("now() utilisé", calls.plans[0].at === 42);
    check("texte affiche le plan + consigne", /📋 Plan — Page Contact/.test(r.text) && /étape par étape/.test(r.text));
  }

  console.log("\n[3] Garde-fous");
  {
    const vide = await tool().t.handler({ titre: "", etapes: [{ titre: "a" }, { titre: "b" }] });
    check("titre vide → isError", vide.isError === true);

    const une = await tool().t.handler({ titre: "X", etapes: [{ titre: "seule étape" }] });
    check("< 2 étapes → isError", une.isError === true && /au moins 2/i.test(une.text));

    const blanches = tool();
    const rb = await blanches.t.handler({ titre: "X", etapes: [{ titre: "  " }, { titre: "" }, { titre: "réelle 1" }, { titre: "réelle 2" }] });
    check("étapes vides filtrées + renumérotées", rb.isError !== true && blanches.calls.plans[0].etapes.length === 2 && blanches.calls.plans[0].etapes[0].n === 1);
  }

  console.log("\n[4] setPlan qui lève → isError gracieux (ne lève jamais)");
  {
    const { t } = tool({
      setPlan: () => {
        throw new Error("store HS");
      },
    });
    let threw = false;
    let r;
    try {
      r = await t.handler({ titre: "X", etapes: [{ titre: "a" }, { titre: "b" }] });
    } catch {
      threw = true;
    }
    check("handler ne lève pas", !threw);
    check("isError + motif", r?.isError === true && /store HS/.test(r!.text));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-planifier-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
