// Tests de l'outil teste_parcours (eleve-parcours-tools.ts, #155) + du formateur
// de rapport (eleve-parcours.ts). Déterministe, sans navigateur : runParcours et
// startPreview sont injectés (faux rapports scriptés). Le moteur Playwright réel
// est prouvé LIVE (glue navigateur, peu unit-testable, comme capturePreview).

import { buildEleveParcoursTools, type ParcoursToolDeps } from "./eleve-parcours-tools.js";
import { formatParcoursReport, type ParcoursReport, type ParcoursEtape } from "./eleve-parcours.js";

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

const PROJECT = "/tmp/projet-parcours";

function tool(deps: ParcoursToolDeps) {
  const t = buildEleveParcoursTools(PROJECT, deps).find((x) => x.name === "teste_parcours");
  if (!t) throw new Error("teste_parcours absent");
  return t;
}

const okReport: ParcoursReport = {
  ok: true,
  consoleErrors: [],
  etapes: [{ description: "Ouvrir la Partie 1", ok: true, messages: ["✓ texte « Question 1 » visible", "✓ au moins une image chargée"] }],
};
const failReport: ParcoursReport = {
  ok: false,
  consoleErrors: ["TypeError: Cannot read properties of undefined (reading 'map')"],
  etapes: [
    { description: "Ouvrir la Partie 1", ok: true, messages: ["✓ texte « Question 1 » visible"] },
    { description: "Vérifier l'image", ok: false, messages: ["✗ aucune image réellement chargée (naturalWidth=0 partout) — image cassée"] },
  ],
};

function makeDeps(over: Partial<ParcoursToolDeps> = {}): { deps: ParcoursToolDeps; calls: { previews: number; runs: ParcoursEtape[][] } } {
  const calls = { previews: 0, runs: [] as ParcoursEtape[][] };
  const deps: ParcoursToolDeps = {
    startPreview: async () => {
      calls.previews++;
      return { url: "http://localhost:5174" };
    },
    runParcours: async (_url, etapes) => {
      calls.runs.push(etapes);
      return okReport;
    },
    ...over,
  };
  return { deps, calls };
}

const etapesDemo: ParcoursEtape[] = [
  { description: "Aller dans Entraînement", actions: [{ clickText: "Entraînement" }], attendu: { texte: "Partie 1" } },
];

async function run() {
  console.log("\n[1] Construction");
  {
    const { deps } = makeDeps();
    const tools = buildEleveParcoursTools(PROJECT, deps);
    check("1 outil teste_parcours", tools.length === 1 && tools[0].name === "teste_parcours");
  }

  console.log("\n[2] Parcours réussi");
  {
    const { deps, calls } = makeDeps();
    const r = await tool(deps).handler({ etapes: etapesDemo });
    check("pas d'erreur", !r.isError);
    check("startPreview appelé", calls.previews === 1);
    check("runParcours reçoit les étapes", calls.runs.length === 1 && calls.runs[0].length === 1);
    check("texte de réussite", /RÉUSSI/.test(r.text) && /finaliser/.test(r.text));
  }

  console.log("\n[3] Parcours échoué → isError + détail");
  {
    const { deps } = makeDeps({ runParcours: async () => failReport });
    const r = await tool(deps).handler({ etapes: etapesDemo });
    check("isError (la boucle GLM doit se corriger)", r.isError === true);
    check("étape ✗ détaillée (image cassée)", /image cassée/.test(r.text));
    check("erreur console remontée", /TypeError/.test(r.text));
    check("consigne de correction", /Corrige les ✗/.test(r.text));
  }

  console.log("\n[4] Garde-fous d'entrée");
  {
    const { deps } = makeDeps();
    const empty = await tool(deps).handler({ etapes: [] });
    check("0 étape → isError", empty.isError === true);
  }

  console.log("\n[5] startPreview KO → isError gracieux (ne lève pas)");
  {
    const { deps, calls } = makeDeps({ startPreview: async () => { throw new Error("dev server exited (code 1)"); } });
    const r = await tool(deps).handler({ etapes: etapesDemo });
    check("isError", r.isError === true);
    check("message explicite (aperçu indisponible)", /Aperçu indisponible/.test(r.text) && /code 1/.test(r.text));
    check("runParcours non appelé si pas d'aperçu", calls.runs.length === 0);
  }

  console.log("\n[6] Budget par tâche (ELEVE_PARCOURS_BUDGET)");
  {
    process.env.ELEVE_PARCOURS_BUDGET = "2";
    const t = tool(makeDeps().deps); // une INSTANCE → budget propre
    const r1 = await t.handler({ etapes: etapesDemo });
    const r2 = await t.handler({ etapes: etapesDemo });
    const r3 = await t.handler({ etapes: etapesDemo });
    check("2 premiers OK", !r1.isError && !r2.isError);
    check("3e refusé (budget épuisé)", r3.isError === true && /Budget parcours épuisé/.test(r3.text));
    delete process.env.ELEVE_PARCOURS_BUDGET;
  }

  console.log("\n[7] formatParcoursReport (pur)");
  {
    const okTxt = formatParcoursReport(okReport);
    check("rapport OK → ✅", /✅ Parcours RÉUSSI/.test(okTxt));
    const failTxt = formatParcoursReport(failReport);
    check("rapport KO → ❌", /❌ Parcours ÉCHOUÉ/.test(failTxt));
    check("numérote les étapes", /Étape 1/.test(failTxt) && /Étape 2/.test(failTxt));
    check("section erreurs console", /erreur\(s\) console au total/.test(failTxt));
    const emptyTxt = formatParcoursReport({ ok: false, etapes: [], consoleErrors: [] });
    check("rapport vide ne casse pas", typeof emptyTxt === "string" && emptyTxt.length > 0);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-parcours-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
