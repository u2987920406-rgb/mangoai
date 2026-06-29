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
  const calls: { plans: ElevePlan[]; marks: Array<{ dir: string; n: number }> } = { plans: [], marks: [] };
  const store = new Map<string, ElevePlan>();
  const deps: PlanifierDeps = {
    setPlan: over.setPlan ?? ((dir, plan) => { calls.plans.push(plan); store.set(dir, plan); }),
    getPlan: over.getPlan ?? ((dir) => store.get(dir)),
    markStepDone:
      over.markStepDone ??
      ((dir, n) => {
        calls.marks.push({ dir, n });
        const plan = store.get(dir);
        if (!plan) return undefined;
        const done = plan.done ?? (plan.done = []);
        if (n >= 1 && n <= plan.etapes.length && !done.includes(n)) done.push(n);
        return plan;
      }),
    now: over.now ?? (() => 42),
  };
  const [t, etape] = buildElevePlanifierTools("/tmp/proj", deps);
  return { t, etape, calls };
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
    check("done initialisé à []", Array.isArray(calls.plans[0].done) && calls.plans[0].done!.length === 0);
    check("texte affiche le plan + cases à cocher", /📋 Plan — Page Contact/.test(r.text) && /☐ 1\. Composant formulaire/.test(r.text) && /Prochaine étape/.test(r.text));
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

  console.log("\n[5] etape_faite — coche la progression (L18)");
  {
    const { t, etape } = tool();
    check("nom = etape_faite", etape.name === "etape_faite");
    check("schéma : n", "n" in etape.inputSchema);
    // sans plan → erreur explicite
    const sansPlan = await etape.handler({ n: 1 });
    check("sans plan → isError", sansPlan.isError === true && /planifier/.test(sansPlan.text));
    // pose un plan puis coche
    await t.handler({ titre: "X", etapes: [{ titre: "a" }, { titre: "b" }, { titre: "c" }] });
    const r1 = await etape.handler({ n: 1 });
    check("coche 1 → ☑ 1 et prochaine = 2", /☑ 1\. a/.test(r1.text) && /Prochaine étape : 2/.test(r1.text));
    const r2 = await etape.handler({ n: 2 });
    check("coche 2 → prochaine = 3", /☑ 2\. b/.test(r2.text) && /Prochaine étape : 3/.test(r2.text));
    await etape.handler({ n: 3 });
    const rAll = await etape.handler({ n: 3 }); // idempotent
    check("toutes cochées → invite finish", /appelle finish/.test(rAll.text));
    // n invalide
    const bad = await etape.handler({ n: 0 });
    check("n < 1 → isError", bad.isError === true);
  }

  console.log("\n[6] etape_faite — ne lève jamais (markStepDone qui throw)");
  {
    const { etape } = tool({
      markStepDone: () => {
        throw new Error("store HS");
      },
    });
    let threw = false;
    try {
      await etape.handler({ n: 1 });
    } catch {
      threw = true;
    }
    check("handler ne lève pas", !threw);
  }

  console.log("\n[7] re-planifier IDEMPOTENT — la progression est conservée (L56)");
  {
    const { t, etape, calls } = tool();
    // Plan initial, on coche les 2 premières étapes.
    await t.handler({ titre: "RPG", etapes: [{ titre: "constants" }, { titre: "entities" }, { titre: "combat" }] });
    await etape.handler({ n: 1 });
    await etape.handler({ n: 2 });
    // Relance « décompose » : l'Élève re-planifie le MÊME plan.
    const r = await t.handler({ titre: "RPG", etapes: [{ titre: "constants" }, { titre: "entities" }, { titre: "combat" }] });
    const replanned = calls.plans[calls.plans.length - 1];
    check("done conservé après re-planifier (1 & 2 toujours cochées)", replanned.done?.slice().sort().join() === "1,2");
    check("le texte indique la progression conservée", /CONSERVÉE/.test(r.text) && /☑ 1\. constants/.test(r.text) && /☑ 2\. entities/.test(r.text));
    check("prochaine étape = 3 (pas réécriture des modules faits)", /Prochaine étape : 3/.test(r.text));
    // Matching insensible à la casse/accents + étapes nouvelles non cochées.
    const r2 = await t.handler({ titre: "RPG", etapes: [{ titre: "Constants" }, { titre: "ENTITIES" }, { titre: "world" }, { titre: "combat" }] });
    const merged = calls.plans[calls.plans.length - 1];
    check("matching titre insensible casse → 1&2 cochées, world(3) neuf non coché", merged.done?.slice().sort().join() === "1,2");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-planifier-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
