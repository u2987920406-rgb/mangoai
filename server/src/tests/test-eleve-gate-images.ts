// Tests du volet IMAGES du Gardien (L114 CONTEXTE + L116 CADRAGE, limites.md).
// Déterministe, deps injectées (captureScreen/dispatch FAKE — aucun réseau/navigateur/LLM réel).
// Ne lève jamais.

import { checkImages, parseImagesVerdict, type ImagesDeps } from "../eleve-gate-images.js";
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

function baseDeps(over: Partial<ImagesDeps> = {}): ImagesDeps {
  return {
    captureScreen: over.captureScreen ?? (async () => "base64img"),
    dispatch: over.dispatch ?? (async () => ({ status: "ok", summary: "CADRAGE: OK\nCONTEXTE: OK" })),
  };
}

async function run() {
  console.log("\n[1] parseImagesVerdict — format nominal, tout OK");
  {
    const p = parseImagesVerdict("CADRAGE: OK\nCONTEXTE: OK");
    check("cadrageOk=true", p.cadrageOk === true);
    check("contexteOk=true", p.contexteOk === true);
    check("lisible=true", p.lisible === true);
  }

  console.log("\n[2] parseImagesVerdict — CADRAGE en problème avec détail");
  {
    const p = parseImagesVerdict("CADRAGE: PROBLEME(la photo du héros est coupée en haut)\nCONTEXTE: OK");
    check("cadrageOk=false", p.cadrageOk === false);
    check("détail capté", p.cadrageDetail.includes("coupée en haut"));
    check("contexteOk=true", p.contexteOk === true);
  }

  console.log("\n[3] parseImagesVerdict — CONTEXTE en problème, accent variant (PROBLÈME)");
  {
    const p = parseImagesVerdict("CADRAGE: OK\nCONTEXTE: PROBLÈME(photo de plage sur un article de comptabilité)");
    check("contexteOk=false", p.contexteOk === false);
    check("détail capté", p.contexteDetail.includes("comptabilité"));
  }

  console.log("\n[4] parseImagesVerdict — réponse illisible (aucun marqueur)");
  {
    const p = parseImagesVerdict("Je ne comprends pas la question.");
    check("lisible=false", p.lisible === false);
  }

  console.log("\n[5] checkImages — pas de capture (tâche non-UI) → non applicable, neutre");
  {
    const v = await checkImages("/proj", baseDeps({ captureScreen: async () => null }));
    check("applicable=false", v.applicable === false);
    check("ok=true (neutre)", v.ok === true);
    check("aucune raison", v.raisons.length === 0);
  }

  console.log("\n[6] checkImages — dispatch lève (VL KO) → sautée, ne pénalise pas");
  {
    const v = await checkImages("/proj", baseDeps({ dispatch: async () => { throw new Error("timeout"); } }));
    check("applicable=true", v.applicable === true);
    check("sautee=true", v.sautee === true);
    check("ok=true (fail-open)", v.ok === true);
  }

  console.log("\n[7] checkImages — réponse illisible → sautée, ne pénalise pas");
  {
    const v = await checkImages("/proj", baseDeps({ dispatch: async () => ({ status: "ok", summary: "blabla" }) }));
    check("sautee=true", v.sautee === true);
    check("ok=true", v.ok === true);
  }

  console.log("\n[8] checkImages — CADRAGE en problème → ok=false, raison précise");
  {
    const v = await checkImages(
      "/proj",
      baseDeps({ dispatch: async () => ({ status: "ok", summary: "CADRAGE: PROBLEME(logo tronqué en bas)\nCONTEXTE: OK" }) }),
    );
    check("cadrageOk=false", v.cadrageOk === false);
    check("ok=false", v.ok === false);
    check("raison CADRAGE citant le détail", v.raisons.some((r) => r.startsWith("CADRAGE") && r.includes("logo tronqué")));
  }

  console.log("\n[9] checkImages — CONTEXTE en problème → ok=false, raison précise");
  {
    const v = await checkImages(
      "/proj",
      baseDeps({ dispatch: async () => ({ status: "ok", summary: "CADRAGE: OK\nCONTEXTE: PROBLEME(photo générique de café sur une page dédiée à l'astronomie)" }) }),
    );
    check("contexteOk=false", v.contexteOk === false);
    check("raison CONTEXTE citant le détail", v.raisons.some((r) => r.startsWith("CONTEXTE") && r.includes("astronomie")));
  }

  console.log("\n[10] checkImages — les deux en problème → 2 raisons");
  {
    const v = await checkImages(
      "/proj",
      baseDeps({ dispatch: async () => ({ status: "ok", summary: "CADRAGE: PROBLEME(x)\nCONTEXTE: PROBLEME(y)" }) }),
    );
    check("2 raisons", v.raisons.length === 2);
  }

  console.log("\n[11] checkImages — captureScreen lève une exception → non applicable, jamais de throw");
  {
    let threw = false;
    let v;
    try {
      v = await checkImages("/proj", baseDeps({ captureScreen: async () => { throw new Error("preview KO"); } }));
    } catch {
      threw = true;
    }
    check("ne lève jamais", threw === false);
    check("applicable=false", v?.applicable === false);
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
      checkImages: over.checkImages,
      hasTestScript: over.hasTestScript ?? (() => false),
    };
  }
  const result = (text: string) => ({ text, toolTrace: [] as Array<{ name: string; args: string }> });

  // (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — ELEVE_GATE_IMAGES est
  // désormais ON PAR DÉFAUT (flags.ts) : le volet a 34 tests verts et est fail-open, le
  // laisser OFF laissait un vrai gap ouvert (aucun autre mécanisme ne vérifie image↔contexte).
  console.log("\n[12] runClosureGate — gate ELEVE_GATE_IMAGES ON (défaut depuis 2026-07-24) : checkImages APPELÉ");
  {
    delete process.env.ELEVE_GATE_IMAGES;
    let appele: boolean = false;
    const withDep = await runClosureGate(
      "/proj",
      "tâche",
      result("fait"),
      "/ws",
      "vitrine",
      {},
      gateDeps({
        checkImages: async () => {
          appele = true;
          return { ok: true, applicable: true, cadrageOk: true, contexteOk: true, sautee: false, raisons: [] };
        },
      }),
    );
    check("checkImages appelé (défaut ON)", appele);
    check("ok=true", withDep.ok === true);
    check("imagesOk=true dans le verdict (défaut ON)", withDep.imagesOk === true);
  }

  console.log("\n[12b] runClosureGate — ELEVE_GATE_IMAGES explicitement OFF : checkImages JAMAIS appelé, verdict byte-identique");
  {
    process.env.ELEVE_GATE_IMAGES = "off";
    try {
      let appele = false;
      const withDep = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkImages: async () => {
            appele = true;
            throw new Error("ne devrait jamais être appelé");
          },
        }),
      );
      check("ok=true", withDep.ok === true);
      check("aucun champ images dans le verdict (byte-identique)", !("images" in withDep) && !("imagesOk" in withDep));

      const withoutDep = await runClosureGate("/proj", "tâche", result("fait"), "/ws", "vitrine", {}, gateDeps());
      check(
        "verdict OFF strictement identique avec ou sans deps.checkImages (JSON égal)",
        JSON.stringify(withDep as GateVerdict) === JSON.stringify(withoutDep as GateVerdict),
      );
    } finally {
      delete process.env.ELEVE_GATE_IMAGES;
    }
  }

  console.log("\n[13] runClosureGate — gate ON, volet IMAGES en échec → raisons remontées, ok=false");
  {
    process.env.ELEVE_GATE_IMAGES = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkImages: async () => ({
            ok: false,
            applicable: true,
            cadrageOk: false,
            contexteOk: true,
            sautee: false,
            raisons: ["CADRAGE — image tronquée détectée"],
          }),
        }),
      );
      check("ok=false", v.ok === false);
      check("imagesOk=false", v.imagesOk === false);
      check("raison CADRAGE remontée dans raisons[]", v.raisons.some((r) => r.startsWith("CADRAGE")));
    } finally {
      delete process.env.ELEVE_GATE_IMAGES;
    }
  }

  console.log("\n[14] runClosureGate — gate ON, volet IMAGES neutre (non applicable) → ok=true");
  {
    process.env.ELEVE_GATE_IMAGES = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({ checkImages: async () => ({ ok: true, applicable: false, cadrageOk: true, contexteOk: true, sautee: false, raisons: [] }) }),
      );
      check("ok=true (non applicable)", v.ok === true);
      check("imagesOk=true", v.imagesOk === true);
    } finally {
      delete process.env.ELEVE_GATE_IMAGES;
    }
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

run();
