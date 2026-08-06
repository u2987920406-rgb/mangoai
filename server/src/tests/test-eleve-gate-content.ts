// Tests du volet CONTENU du Gardien (#196 fault-finding, plan cohérence de contenu,
// 2026-07-24) — auto-cohérence PAR ITEM d'un tableau de données (quiz/catalogue/
// mapping), le trou que ni checkBiaisPosition (statistique, formation-only) ni les
// branches MangoQA (code, pas contenu) ne couvraient. Déterministe, deps injectées
// (readDataFiles/judge FAKE — aucun disque/réseau/LLM réel). Ne lève jamais.

import { checkContent, checkContentProjet, parseContentVerdict, type ContentDeps, type DataFile } from "../eleve-gate-content.js";
import { runClosureGate, type GateDeps, type GateVerdict } from "../eleve-gate.js";
import type { DesignCritique } from "../design/design-coach.js";
import type { IntentVerdict } from "../eleve-judge.js";
import type { TestRun } from "../inspection.js";

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

const QUIZ_TOUJOURS_A: DataFile = {
  path: "src/data/quiz-questions.ts",
  content: `export const QUIZ_QUESTIONS = [
  { question: "Quelle est la capitale de la France ?", options: ["Paris", "Lyon", "Marseille", "Nice"], correctIndex: 0 },
  { question: "Combien font 2 + 2 ?", options: ["3", "5", "4", "6"], correctIndex: 0 },
  { question: "Quel est le plus grand océan ?", options: ["Atlantique", "Indien", "Arctique", "Pacifique"], correctIndex: 0 },
];`,
};

function baseDeps(over: Partial<ContentDeps> = {}): ContentDeps {
  return {
    readDataFiles: over.readDataFiles ?? (async () => [QUIZ_TOUJOURS_A]),
    judge: over.judge ?? (async () => ({ status: "ok", summary: "COHERENCE: OK" })),
  };
}

async function run() {
  console.log("\n[1] parseContentVerdict — format nominal, OK");
  {
    const p = parseContentVerdict("COHERENCE: OK");
    check("coherenceOk=true", p.coherenceOk === true);
    check("lisible=true", p.lisible === true);
  }

  console.log("\n[2] parseContentVerdict — problème avec détail, accent variant (COHÉRENCE)");
  {
    const p = parseContentVerdict("COHÉRENCE: PROBLEME(question 2 : la bonne réponse \"4\" est en position 2, pas 0)");
    check("coherenceOk=false", p.coherenceOk === false);
    check("détail capté", p.detail.includes("position 2"));
  }

  console.log("\n[3] parseContentVerdict — réponse illisible (aucun marqueur)");
  {
    check("lisible=false", parseContentVerdict("Je ne comprends pas la question.").lisible === false);
  }

  console.log("\n[4] checkContent — aucun fichier de données → non applicable, neutre");
  {
    const v = await checkContent([], async () => ({ status: "ok", summary: "COHERENCE: OK" }));
    check("applicable=false", v.applicable === false);
    check("ok=true (neutre)", v.ok === true);
    check("aucune raison", v.raisons.length === 0);
  }

  console.log("\n[5] checkContent — juge lève (LLM KO) → sautée, ne pénalise pas");
  {
    const v = await checkContent([QUIZ_TOUJOURS_A], async () => { throw new Error("timeout"); });
    check("applicable=true", v.applicable === true);
    check("sautee=true", v.sautee === true);
    check("ok=true (fail-open)", v.ok === true);
  }

  console.log("\n[6] checkContent — réponse illisible → sautée, ne pénalise pas");
  {
    const v = await checkContent([QUIZ_TOUJOURS_A], async () => ({ status: "ok", summary: "blabla" }));
    check("sautee=true", v.sautee === true);
    check("ok=true", v.ok === true);
  }

  console.log("\n[7] checkContent — le juge détecte le motif « toujours la même réponse » → ok=false, raison précise");
  {
    const v = await checkContent(
      [QUIZ_TOUJOURS_A],
      async () => ({ status: "ok", summary: "COHERENCE: PROBLEME(correctIndex vaut 0 sur toutes les questions alors que la bonne réponse varie — ex. question 2 : \"4\" est en position 2)" }),
    );
    check("coherenceOk=false", v.coherenceOk === false);
    check("ok=false", v.ok === false);
    check("raison CONTENU citant le détail", v.raisons.some((r) => r.startsWith("CONTENU") && r.includes("correctIndex")));
  }

  console.log("\n[8] checkContent — juge OK → ok=true, aucune raison");
  {
    const v = await checkContent([QUIZ_TOUJOURS_A], async () => ({ status: "ok", summary: "COHERENCE: OK" }));
    check("ok=true", v.ok === true);
    check("aucune raison", v.raisons.length === 0);
  }

  console.log("\n[9] checkContentProjet — deps injectées, jamais de throw même si readDataFiles lève");
  {
    const deps: ContentDeps = { readDataFiles: () => { throw new Error("ENOENT"); }, judge: baseDeps().judge };
    let threw = false;
    let v;
    try {
      v = await checkContentProjet("/proj", deps);
    } catch {
      threw = true;
    }
    check("ne lève jamais", threw === false);
    check("applicable=false", v?.applicable === false);
  }

  console.log("\n[10] checkContentProjet — détecte l'incident via le projet (fixture quiz-toujours-a)");
  {
    const v = await checkContentProjet(
      "/proj",
      baseDeps({ judge: async () => ({ status: "ok", summary: "COHERENCE: PROBLEME(quiz-questions.ts : correctIndex fixe)" }) }),
    );
    check("ok=false", v.ok === false);
  }

  // -------------------------------------------------------------------------
  // Branchement dans runClosureGate (eleve-gate.ts)
  // -------------------------------------------------------------------------

  const goodIntent: IntentVerdict = { couverture: 90, manques: [], note: "", parsed: true };
  const critique = (overall: number): DesignCritique => ({
    overall,
    lenses: [{ name: "harmonie", score: overall, issue: "", fix: "" }],
    scored: true,
    measure: { contrastFails: [], offPalette: [], paletteSize: 3 },
    raw: "",
  });
  const noTests = async (): Promise<TestRun> => ({ ok: true, signal: "no-test-script", detail: "", durationMs: 0 });

  function gateDeps(over: Partial<GateDeps> = {}): GateDeps {
    return {
      judge: over.judge ?? (async () => goodIntent),
      critique: over.critique ?? (async () => critique(90)),
      stopPreview: over.stopPreview ?? (async () => {}),
      scanBalance: over.scanBalance ?? (() => []),
      scanPlaceholders: over.scanPlaceholders ?? (() => []),
      runTests: over.runTests ?? noTests,
      checkContent: over.checkContent,
      hasTestScript: over.hasTestScript ?? (() => false),
    };
  }
  const result = (text: string) => ({ text, toolTrace: [] as Array<{ name: string; args: string }> });

  // ELEVE_GATE_CONTENT est OFF PAR DÉFAUT (contrairement à IMAGES/CONSTANTES) — volet
  // neuf, rollout prudent (cf. flags.ts). Le comportement par défaut réel reste donc
  // "jamais appelé", même patron que le test [12]/[14] original d'IMAGES/CONSTANTES
  // avant leur propre bascule à ON.
  console.log("\n[11] runClosureGate — gate ELEVE_GATE_CONTENT OFF (défaut) : checkContent JAMAIS appelé, verdict byte-identique");
  {
    delete process.env.ELEVE_GATE_CONTENT;
    let appele = false;
    const withDep = await runClosureGate(
      "/proj",
      "tâche",
      result("fait"),
      "/ws",
      "vitrine",
      {},
      gateDeps({
        checkContent: async () => {
          appele = true;
          throw new Error("ne devrait jamais être appelé");
        },
      }),
    );
    check("ok=true", withDep.ok === true);
    check("aucun champ content dans le verdict (byte-identique)", !("content" in withDep) && !("contentOk" in withDep));

    const withoutDep = await runClosureGate("/proj", "tâche", result("fait"), "/ws", "vitrine", {}, gateDeps());
    check(
      "verdict OFF strictement identique avec ou sans deps.checkContent (JSON égal)",
      JSON.stringify(withDep as GateVerdict) === JSON.stringify(withoutDep as GateVerdict),
    );
  }

  console.log("\n[12] runClosureGate — gate ON explicite, volet CONTENU en échec → raisons remontées, ok=false");
  {
    process.env.ELEVE_GATE_CONTENT = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkContent: async () => ({
            ok: false,
            applicable: true,
            coherenceOk: false,
            sautee: false,
            raisons: ["CONTENU — correctIndex fixe sur toutes les questions"],
          }),
        }),
      );
      check("ok=false", v.ok === false);
      check("contentOk=false", v.contentOk === false);
      check("raison CONTENU remontée dans raisons[]", v.raisons.some((r) => r.startsWith("CONTENU")));
    } finally {
      delete process.env.ELEVE_GATE_CONTENT;
    }
  }

  console.log("\n[13] runClosureGate — gate ON explicite, volet CONTENU neutre (non applicable) → ok=true");
  {
    process.env.ELEVE_GATE_CONTENT = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkContent: async () => ({ ok: true, applicable: false, coherenceOk: true, sautee: false, raisons: [] }),
        }),
      );
      check("ok=true (non applicable)", v.ok === true);
      check("contentOk=true", v.contentOk === true);
    } finally {
      delete process.env.ELEVE_GATE_CONTENT;
    }
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

run();
