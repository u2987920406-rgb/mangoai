// Tests du store de plan + formateurs (#160). PUR, déterministe. On exerce :
// store set/get/clear, formatPlan (étapes numérotées + consigne), formatPlanReminder
// (compact), et buildRelanceNudge (préfixe le rappel du plan SI un plan existe).

import {
  setPlan,
  getPlan,
  clearPlan,
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

  console.log("\n[2] formatPlan — étapes numérotées + consigne");
  {
    const t = formatPlan(plan());
    check("titre", /📋 Plan — Page Contact/.test(t));
    check("étape 1 avec détail", t.includes("1. Composant formulaire — nom/email/message"));
    check("étape 2 sans détail", t.includes("2. Validation des champs"));
    check("consigne « suis ce plan »", /étape par étape/.test(t) && /check_build/.test(t));
  }

  console.log("\n[3] formatPlanReminder — compact");
  {
    const r = formatPlanReminder(plan());
    check("rappel du titre", /Rappel de TON plan « Page Contact »/.test(r));
    check("étapes en ligne compacte", r.includes("1. Composant formulaire · 2. Validation des champs · 3. État d'envoi"));
    check("incite à reprendre les non-faites", /non faites/i.test(r));
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

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-plan : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run();
