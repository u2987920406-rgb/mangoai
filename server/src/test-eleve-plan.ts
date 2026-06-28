// Tests du store de plan + formateurs (#160). PUR, déterministe. On exerce :
// store set/get/clear, formatPlan (étapes numérotées + consigne), formatPlanReminder
// (compact), et buildRelanceNudge (préfixe le rappel du plan SI un plan existe).

import {
  setPlan,
  getPlan,
  clearPlan,
  markStepDone,
  nextStep,
  formatPlan,
  formatPlanReminder,
  buildRelanceNudge,
  type ElevePlan,
} from "./eleve-plan.js";

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

const plan = (): ElevePlan => ({
  titre: "Page Contact",
  etapes: [
    { n: 1, titre: "Composant formulaire", detail: "nom/email/message" },
    { n: 2, titre: "Validation des champs" },
    { n: 3, titre: "État d'envoi" },
  ],
  at: 1,
});

function run() {
  console.log("\n[1] Store set/get/clear (par projet)");
  {
    clearPlan("/p");
    check("get vide au départ", getPlan("/p") === undefined);
    setPlan("/p", plan());
    check("get après set", getPlan("/p")?.titre === "Page Contact");
    check("isolé par projet", getPlan("/autre") === undefined);
    clearPlan("/p");
    check("get vide après clear", getPlan("/p") === undefined);
  }

  console.log("\n[2] formatPlan — cases à cocher + prochaine étape");
  {
    const t = formatPlan(plan());
    check("titre", /📋 Plan — Page Contact/.test(t));
    check("étape 1 cochable (☐) avec détail", t.includes("☐ 1. Composant formulaire — nom/email/message"));
    check("étape 2 sans détail", t.includes("☐ 2. Validation des champs"));
    check("indique la prochaine étape + etape_faite + check_build", /Prochaine étape/.test(t) && /etape_faite/.test(t) && /check_build/.test(t));
  }

  console.log("\n[3] formatPlanReminder — compact + progression");
  {
    const r = formatPlanReminder(plan());
    check("rappel du titre", /Rappel de TON plan « Page Contact »/.test(r));
    check("progression 0/3", /0\/3 fait/.test(r));
    check("étapes en ligne compacte cochées", r.includes("☐1. Composant formulaire · ☐2. Validation des champs · ☐3. État d'envoi"));
    check("incite à reprendre les non cochées", /non cochées|Reprends/i.test(r));
  }

  console.log("\n[4] buildRelanceNudge — préfixe le plan SI présent");
  {
    const sansPlan = buildRelanceNudge("/x", "plafond d'itérations", 1, 2, () => undefined);
    check("sans plan : pas de rappel, mais le nudge classique", !/Rappel de TON plan/.test(sansPlan) && /AGIS maintenant/.test(sansPlan));
    check("sans plan : mentionne la relance", /relance 1\/2/.test(sansPlan));

    const avecPlan = buildRelanceNudge("/x", "blocage (sur-exploration)", 2, 2, () => plan());
    check("avec plan : rappel EN TÊTE", avecPlan.startsWith("📋 Rappel de TON plan"));
    check("avec plan : suivi du nudge classique", /AGIS maintenant/.test(avecPlan) && /relance 2\/2/.test(avecPlan));
  }

  console.log("\n[5] buildRelanceNudge — lookup réel (store)");
  {
    clearPlan("/proj");
    const a = buildRelanceNudge("/proj", "plafond d'itérations", 1, 2);
    check("store vide → pas de rappel", !/Rappel de TON plan/.test(a));
    setPlan("/proj", plan());
    const b = buildRelanceNudge("/proj", "plafond d'itérations", 1, 2);
    check("store peuplé → rappel injecté", /Rappel de TON plan/.test(b));
    clearPlan("/proj");
  }

  console.log("\n[6] L18 — markStepDone + nextStep + progression cochée");
  {
    clearPlan("/l18");
    check("markStepDone sans plan → undefined", markStepDone("/l18", 1) === undefined);
    setPlan("/l18", { ...plan(), done: [] });
    check("nextStep initial = étape 1", nextStep(getPlan("/l18")!)?.n === 1);

    markStepDone("/l18", 1);
    const p1 = getPlan("/l18")!;
    check("étape 1 cochée", (p1.done ?? []).includes(1));
    check("nextStep avance à 2", nextStep(p1)?.n === 2);
    check("formatPlan montre ☑ 1 et ☐ 2", formatPlan(p1).includes("☑ 1. Composant formulaire") && formatPlan(p1).includes("☐ 2."));
    check("reminder progression 1/3", /1\/3 fait/.test(formatPlanReminder(p1)));

    markStepDone("/l18", 1); // idempotent
    check("double coche idempotente", (getPlan("/l18")!.done ?? []).filter((n) => n === 1).length === 1);
    check("hors borne ignoré (0 et 99)", (markStepDone("/l18", 99), markStepDone("/l18", 0), (getPlan("/l18")!.done ?? []).join() === "1"));

    markStepDone("/l18", 2);
    markStepDone("/l18", 3);
    const pAll = getPlan("/l18")!;
    check("toutes cochées → nextStep undefined", nextStep(pAll) === undefined);
    check("formatPlan invite à finish", /appelle finish/.test(formatPlan(pAll)));
    clearPlan("/l18");
  }

  console.log("\n[7] L35/L47 — escalade de CONVERGENCE en fin de budget de relances");
  {
    const planDone = (): ElevePlan => ({ ...plan(), done: [1] }); // prochaine = étape 2
    const tot = (relances: number) => buildRelanceNudge("/x", "blocage", relances, 6, planDone);

    const early = tot(1); // 1 < ceil(6/2)=3 → pas de convergence
    check("relance précoce (1/6) → PAS de bloc CONVERGENCE", !/CONVERGENCE/.test(early));
    check("relance précoce garde le nudge normal", /AGIS maintenant/.test(early) && /relance 1\/6/.test(early));

    const late = tot(4); // 4 >= 3 → convergence
    check("relance tardive (4/6) → bloc CONVERGENCE", /🔴 CONVERGENCE/.test(late));
    check("interdit l'exploration", /INTERDICTION d'appeler read_file/.test(late));
    check("pointe la prochaine étape (2)", /étape 2/.test(late) && /Validation des champs/.test(late));

    // sans plan : convergence générique (pas de numéro d'étape) mais bien présente
    const lateNoPlan = buildRelanceNudge("/x", "plafond", 3, 6, () => undefined);
    check("convergence sans plan = générique", /CONVERGENCE/.test(lateNoPlan) && /code qui manque/.test(lateNoPlan));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-plan : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run();
