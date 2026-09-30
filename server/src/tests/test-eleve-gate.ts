// Tests du Gardien de clôture (#161). Déterministe, deps injectées (judge/critique/
// stopPreview). On exerce : changedFilesFromTrace, runClosureGate (tout OK, intention
// KO, goût KO, WCAG KO, aperçu KO → design sauté), evaluateGate (ok/corrige/laisse-
// passer), buildGateNudge. Ne lève jamais.

import {
  runClosureGate,
  evaluateGate,
  changedFilesFromTrace,
  readFilesFromTrace,
  buildGateNudge,
  scanFilesForPlaceholders,
  hasRealTestScript,
  type GateDeps,
  type GateVerdict,
} from "../eleve-gate.js";
import { setPlan, clearPlan } from "../eleve-plan.js";
import type { DesignCritique } from "../design/design-coach.js";
import type { IntentVerdict } from "../eleve-judge.js";
import type { TestRun } from "../inspection.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const noTests = async (): Promise<TestRun> => ({ ok: true, signal: "no-test-script", detail: "", durationMs: 0 });

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

const goodIntent: IntentVerdict = { couverture: 90, manques: [], note: "", parsed: true };
const critique = (overall: number, fails = 0, scored = true): DesignCritique => ({
  overall,
  lenses: [{ name: "harmonie", score: overall, issue: "couleurs ternes", fix: "augmente le contraste" }],
  scored,
  measure: { contrastFails: Array.from({ length: fails }, () => ({ fg: "#888", bg: "#999", ratio: 1.2, required: 4.5, level: "AA" as const })), offPalette: [], paletteSize: 3 },
  raw: "",
});

function deps(over: Partial<GateDeps> = {}): GateDeps {
  return {
    judge: over.judge ?? (async () => goodIntent),
    critique: over.critique ?? (async () => critique(90)),
    stopPreview: over.stopPreview ?? (async () => {}),
    scanBalance: over.scanBalance ?? (() => []), // défaut : équilibre OK (pas de finding)
    scanPlaceholders: over.scanPlaceholders ?? (() => []), // défaut : vraies images OK
    runTests: over.runTests ?? noTests, // défaut : pas de script test → ne pénalise pas
    hasTestScript: over.hasTestScript ?? (() => false), // défaut : pas de script réel → pas de signalGap
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

  console.log("\n[1b] readFilesFromTrace (PUR) — anti-wandering (2026-07-21)");
  {
    const files = readFilesFromTrace(
      trace([
        ["read_file", '{"path":"src/App.jsx"}'],
        ["write_file", '{"path":"src/A.jsx","content":"x"}'],
        ["read_file", '{"path":"src/App.jsx"}'], // doublon
        ["read_file", '{"path":"src/Home.jsx"}'],
        ["list_files", '{"dir":"src"}'],
      ]),
    );
    check("seulement read_file, dédupliqués", files.length === 2 && files.includes("src/App.jsx") && files.includes("src/Home.jsx"));
    check("trace vide → tableau vide", readFilesFromTrace([]).length === 0);
    check("args illisibles → sauté sans lever", readFilesFromTrace(trace([["read_file", "{pas du json"]])).length === 0);
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
      deps({ judge: async () => ({ couverture: 40, manques: ["la page Contact"], note: "", parsed: true }) }),
    );
    check("ok:false", v.ok === false);
    check("raison intention + manque", v.raisons.some((r) => /INTENTION 40/.test(r) && /page Contact/.test(r)));
  }

  console.log("\n[4] runClosureGate — goût KO (mode DURCI, observe off)");
  {
    process.env.ELEVE_GATE_TASTE_OBSERVE = "off";
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 80, wcagMaxFails: 0 }, deps({ critique: async () => critique(55) }));
    check("ok:false (goût 55 < 80)", v.ok === false);
    check("raison goût + correctif", v.raisons.some((r) => /GOÛT 55/.test(r) && /contraste/i.test(r)));
    delete process.env.ELEVE_GATE_TASTE_OBSERVE;
  }

  console.log("\n[4b] runClosureGate — mode OBSERVE (L34) : goût scoré, ne bloque pas AU-DESSUS du plancher");
  {
    // Observe ON (défaut) : un goût médiocre-mais-pas-grossier (60 ≥ plancher 50) est SCORÉ
    // et exposé, mais ne bloque pas et ne produit aucune raison.
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 }, deps({ critique: async () => critique(60, 0, true) }));
    check("observe : goût 60 scoré + exposé mais ok:true (ne bloque pas)", v.ok === true && v.tasteScored === true && v.tasteObserve === true && v.design?.overall === 60);
    check("observe : aucune raison GOÛT", !v.raisons.some((r) => /GOÛT/.test(r)));
  }

  console.log("\n[4c] runClosureGate — PLANCHER même en observe : échec grossier (< 50) bloque");
  {
    // Nuit 2026-07-03 : « build-vert ≠ réussi » — un score FIABLE sous le plancher bloque
    // même en observe (une app laide mais couvrante ne sort plus verte sans un regard).
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 }, deps({ critique: async () => critique(40, 0, true) }));
    check("observe : goût 40 < plancher 50 → ok:false", v.ok === false && v.tasteOk === false);
    check("raison ÉCHEC GROSSIER", v.raisons.some((r) => /GOÛT 40/.test(r) && /GROSSIER/.test(r)));
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

  console.log("\n[7b] runClosureGate — juge ET critique KO SIMULTANÉMENT (revue 2026-07-03, action #6)");
  {
    const bothKo = deps({
      judge: async () => { throw new Error("juge HS"); },
      critique: async () => { throw new Error("preview HS"); },
    });
    delete process.env.ELEVE_GATE_DUAL_SKIP_BLOCK;
    const vOff = await runClosureGate("/proj", "t", result("fait"), "/ws", "x", {}, bothKo);
    check("dualSkip toujours calculé (observabilité)", vOff.dualSkip === true);
    check("gate OFF (défaut) → ne bloque pas la clôture", vOff.ok === true);

    process.env.ELEVE_GATE_DUAL_SKIP_BLOCK = "on";
    const vOn = await runClosureGate("/proj", "t", result("fait"), "/ws", "x", {}, bothKo);
    check("gate ON → bloque la clôture (non-vérifié ≠ vert)", vOn.ok === false);
    check("raison GARDIEN DÉGRADÉ présente", vOn.raisons.some((r) => /GARDIEN DÉGRADÉ/.test(r)));
    delete process.env.ELEVE_GATE_DUAL_SKIP_BLOCK;

    // Un seul des deux KO (l'autre OK) → dualSkip false, jamais bloquant même gate ON.
    process.env.ELEVE_GATE_DUAL_SKIP_BLOCK = "on";
    const vSingle = await runClosureGate("/proj", "t", result("fait"), "/ws", "x", {}, deps({ judge: async () => { throw new Error("juge HS"); } }));
    check("un seul KO → dualSkip false", vSingle.dualSkip === false);
    check("un seul KO → ne bloque pas même gate ON", vSingle.ok === true);
    delete process.env.ELEVE_GATE_DUAL_SKIP_BLOCK;
  }

  console.log("\n[8] evaluateGate — décision pure");
  {
    const koVerdict: GateVerdict = { ok: false, intent: { couverture: 40, manques: ["x"], note: "", parsed: true }, intentOk: false, design: critique(50), tasteScored: true, tasteOk: false, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: ["INTENTION 40", "GOÛT 50"] };
    const okVerdict: GateVerdict = { ok: true, intent: goodIntent, intentOk: true, tasteScored: false, tasteOk: true, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: [] };
    check("ok → action ok", evaluateGate("/p", okVerdict, 0, 2).action === "ok");
    const d1 = evaluateGate("/p", koVerdict, 0, 2);
    check("KO + budget → corrige + nudge", d1.action === "corrige" && "nudge" in d1 && /Gardien/.test((d1 as { nudge: string }).nudge));
    check("KO + budget épuisé → laisse-passer", evaluateGate("/p", koVerdict, 2, 2).action === "laisse-passer");
  }

  console.log("\n[8b] evaluateGate — anti-thrash goût (L28)");
  {
    // SEUL le goût bloque (intention OK, WCAG OK), goût scoré 71.
    const goutVerdict: GateVerdict = { ok: false, intent: goodIntent, intentOk: true, design: critique(71), tasteScored: true, tasteOk: false, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: ["GOÛT 71"] };
    check("goût 71, 1er tour (prevGout null) → corrige", evaluateGate("/p", goutVerdict, 0, 3, null).action === "corrige");
    check("goût n'a pas progressé (71 ≤ 71) → laisse-passer (pas de thrash)", evaluateGate("/p", goutVerdict, 1, 3, 71).action === "laisse-passer");
    check("goût a régressé (71 ≤ 73) → laisse-passer", evaluateGate("/p", goutVerdict, 1, 3, 73).action === "laisse-passer");
    check("goût a progressé (71 > 65) → corrige encore", evaluateGate("/p", goutVerdict, 1, 3, 65).action === "corrige");
    // L'anti-thrash ne s'applique PAS si l'intention bloque aussi (signal fiable).
    const mixteVerdict: GateVerdict = { ok: false, intent: { couverture: 40, manques: ["x"], note: "", parsed: true }, intentOk: false, design: critique(71), tasteScored: true, tasteOk: false, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: ["INTENTION 40", "GOÛT 71"] };
    check("intention KO aussi → corrige malgré goût stagnant", evaluateGate("/p", mixteVerdict, 1, 3, 71).action === "corrige");
  }

  console.log("\n[8c] runClosureGate — goût NON-SCORÉ → sauté, QA conservée (L28)");
  {
    // VL hors-format (scored:false) avec overall=50 fabriqué : ne doit PAS plomber le goût.
    const v = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 80, wcagMaxFails: 0 }, deps({ critique: async () => critique(50, 0, false) }));
    check("goût non-scoré → ok:true (sauté, pas de faux 50)", v.ok === true && v.tasteScored === false && v.tasteOk === true);
    check("aucune raison GOÛT", !v.raisons.some((r) => /GOÛT/.test(r)));
    // Mais la QA WCAG objective s'applique TOUJOURS, même sans score VL fiable.
    const v2 = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", { intentMin: 70, tasteMin: 80, wcagMaxFails: 0 }, deps({ critique: async () => critique(50, 2, false) }));
    check("WCAG s'applique même goût non-scoré → ok:false + raison QA", v2.ok === false && v2.raisons.some((r) => /QA/.test(r)));
  }

  console.log("\n[9] buildGateNudge — préfixe le plan (#160) s'il existe");
  {
    const v: GateVerdict = { ok: false, intent: { couverture: 40, manques: ["la nav"], note: "", parsed: true }, intentOk: false, tasteScored: false, tasteOk: true, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: ["INTENTION 40 — il manque :\n  - la nav"] };
    clearPlan("/p");
    const sansPlan = buildGateNudge("/p", v, 1, 2);
    check("sans plan : pas de rappel mais le nudge Gardien", !/Rappel de TON plan/.test(sansPlan) && /Gardien/.test(sansPlan) && /la nav/.test(sansPlan));
    setPlan("/p", { titre: "Contact", etapes: [{ n: 1, titre: "form" }, { n: 2, titre: "nav" }], at: 1 });
    const avecPlan = buildGateNudge("/p", v, 1, 2);
    check("avec plan : rappel EN TÊTE", avecPlan.startsWith("📋 Rappel de TON plan"));
    clearPlan("/p");
  }

  console.log("\n[10] runClosureGate — ÉQUILIBRE KO (déterministe) → ok:false, raison STRUCTURE");
  {
    const finding = { file: "src/Hero.jsx", line: 12, kind: "jsx-maxw-no-center" as const, snippet: "max-w-3xl px-5" };
    const v = await runClosureGate(
      "/proj", "t", result("fait"), "/ws", "vitrine",
      { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 },
      deps({ scanBalance: () => [finding] }),
    );
    check("ok:false (collé à gauche)", v.ok === false && v.balanceOk === false);
    check("raison STRUCTURE + fichier", v.raisons.some((r) => /STRUCTURE/.test(r) && /src\/Hero\.jsx:12/.test(r)));
    check("balance détaillé renvoyé", v.balance.length === 1);
  }

  console.log("\n[10b] runClosureGate — ELEVE_GATE_BALANCE=off → volet ignoré");
  {
    const prev = process.env.ELEVE_GATE_BALANCE;
    process.env.ELEVE_GATE_BALANCE = "off";
    const v = await runClosureGate(
      "/proj", "t", result("fait"), "/ws", "vitrine",
      { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 },
      deps({ scanBalance: () => [{ file: "x.jsx", line: 1, kind: "jsx-maxw-no-center", snippet: "max-w-3xl" }] }),
    );
    check("désactivé → balanceOk:true, ok:true", v.balanceOk === true && v.ok === true);
    if (prev === undefined) delete process.env.ELEVE_GATE_BALANCE; else process.env.ELEVE_GATE_BALANCE = prev;
  }

  console.log("\n[10c] evaluateGate — ÉQUILIBRE seul KO → corrige (signal fiable, pas d'anti-thrash)");
  {
    const balVerdict: GateVerdict = { ok: false, intent: goodIntent, intentOk: true, tasteScored: false, tasteOk: true, tasteObserve: false, wcagOk: true, balanceOk: false, balance: [{ file: "a.jsx", line: 3, kind: "jsx-maxw-no-center", snippet: "max-w-4xl" }], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: false, testsOk: true, raisons: ["STRUCTURE — 1 bloc…"] };
    const d = evaluateGate("/p", balVerdict, 0, 2, 80); // prevGout fourni : ne doit PAS court-circuiter (ce n'est pas onlyGout)
    check("balance KO → corrige", d.action === "corrige");
  }

  console.log("\n[11] runClosureGate — volet TESTS (#L55), gated ELEVE_GATE_TESTS");
  {
    const prev = process.env.ELEVE_GATE_TESTS;
    const failing = async (): Promise<TestRun> => ({ ok: false, signal: "tests-failed", detail: "3 failed", durationMs: 10 });
    const passing = async (): Promise<TestRun> => ({ ok: true, signal: "tests-ok", detail: "12 passed", durationMs: 10 });

    // Gate DÉSARMÉ explicitement (gate-optim 2026-09-30 : ARMÉ par défaut, audit dormant #30) → tests
    // jamais lancés, même si runTests renverrait rouge.
    process.env.ELEVE_GATE_TESTS = "off";
    const vOff = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: failing }));
    delete process.env.ELEVE_GATE_TESTS;
    const vDef = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: failing }));
    check("défaut (variable absente) → ARMÉ : tests lancés, rouge bloque", vDef.testsRan === true && vDef.ok === false);
    process.env.ELEVE_GATE_TESTS = "off";
    check("gate off → testsRan:false, ok:true (volet ignoré)", vOff.testsRan === false && vOff.testsOk === true && vOff.ok === true);

    // Gate ON + tests ROUGES → ok:false, raison TESTS (signal fiable).
    process.env.ELEVE_GATE_TESTS = "on";
    const vFail = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: failing }));
    check("gate on + tests rouges → ok:false, testsOk:false, testsRan:true", vFail.ok === false && vFail.testsOk === false && vFail.testsRan === true);
    check("raison TESTS présente", vFail.raisons.some((r) => /TESTS/.test(r)));

    // Gate ON + tests VERTS → ok:true.
    const vOk = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: passing }));
    check("gate on + tests verts → ok:true, testsOk:true", vOk.ok === true && vOk.testsOk === true && vOk.testsRan === true);

    // Gate ON + pas de script test → non lancé, ne pénalise pas.
    const vNone = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: noTests }));
    check("gate on + pas de test → testsRan:false, ok:true", vNone.testsRan === false && vNone.testsOk === true && vNone.ok === true);

    if (prev === undefined) delete process.env.ELEVE_GATE_TESTS; else process.env.ELEVE_GATE_TESTS = prev;
  }

  console.log("\n[11b] evaluateGate — tests KO = signal fiable → corrige (pas d'anti-thrash)");
  {
    // Le goût stagne MAIS les tests sont rouges → on DOIT corriger (testsOk:false casse onlyGout).
    const v: GateVerdict = { ok: false, intent: goodIntent, intentOk: true, design: critique(71), tasteScored: true, tasteOk: false, tasteObserve: false, wcagOk: true, balanceOk: true, balance: [], placeholdersOk: true, placeholders: [], dualSkip: false, testsRan: true, testsOk: false, raisons: ["TESTS rouges", "GOÛT 71"] };
    check("tests KO + goût stagnant → corrige", evaluateGate("/p", v, 1, 3, 71).action === "corrige");
  }

  console.log("\n[12] scanFilesForPlaceholders (PUR) — garde « vraies images »");
  {
    const contents: Record<string, string> = {
      "src/Hero.jsx": `<img src="https://picsum.photos/800/600" /> et <img src="https://images.pexels.com/photos/12/tree.jpg" />`,
      "src/Cards.jsx": `const u = 'https://loremflickr.com/320/240/dog'; const ok = "https://images.pexels.com/photos/9/x.jpg";`,
      "src/logic.ts": `// pas d'image ici`,
      "assets/photo.png": `binaire — extension ignorée`,
    };
    const found = scanFilesForPlaceholders(Object.keys(contents), (f) => contents[f] ?? null);
    check("détecte picsum + loremflickr (2)", found.length === 2);
    check("jamais les URLs Pexels", !found.some((p) => /pexels/.test(p.url)));
    check("fichier + URL remontés", found.some((p) => p.file === "src/Hero.jsx" && /picsum/.test(p.url)));
  }

  console.log("\n[13] runClosureGate — placeholder vivant → ok:false, raison IMAGES");
  {
    const finding = { file: "src/Hero.jsx", url: "https://picsum.photos/800/600" };
    const v = await runClosureGate(
      "/proj", "t", result("fait"), "/ws", "vitrine",
      { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 },
      deps({ scanPlaceholders: () => [finding] }),
    );
    check("ok:false (placeholder détecté)", v.ok === false && v.placeholdersOk === false);
    check("raison IMAGES + chercher_image", v.raisons.some((r) => /IMAGES/.test(r) && /chercher_image/.test(r)));
    check("placeholders détaillés renvoyés", v.placeholders.length === 1);
    // Opt-out ELEVE_GATE_PLACEHOLDERS=off → volet ignoré.
    const prev = process.env.ELEVE_GATE_PLACEHOLDERS;
    process.env.ELEVE_GATE_PLACEHOLDERS = "off";
    const vOff = await runClosureGate("/proj", "t", result("fait"), "/ws", "vitrine", { intentMin: 70, tasteMin: 70, wcagMaxFails: 0 }, deps({ scanPlaceholders: () => [finding] }));
    check("désactivé → placeholdersOk:true, ok:true", vOff.placeholdersOk === true && vOff.ok === true);
    if (prev === undefined) delete process.env.ELEVE_GATE_PLACEHOLDERS; else process.env.ELEVE_GATE_PLACEHOLDERS = prev;
  }

  console.log("\n[14] hasRealTestScript (axiome 17) — détecte un script test RÉEL vs placeholder npm par défaut");
  {
    function tmpProjectWithScript(test?: string): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-gate-signal-"));
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "x", scripts: test !== undefined ? { test } : {} }),
      );
      return dir;
    }
    check("script réel (vitest) → true", hasRealTestScript(tmpProjectWithScript("vitest run")));
    check("placeholder npm init par défaut → false", !hasRealTestScript(tmpProjectWithScript('echo "Error: no test specified" && exit 1')));
    check("scripts.test absent → false", !hasRealTestScript(tmpProjectWithScript(undefined)));
    check("package.json absent (dossier inexistant) → false, ne lève pas", !hasRealTestScript(path.join(os.tmpdir(), "mango-gate-signal-n-existe-pas")));
  }

  console.log("\n[15] runClosureGate — signalGap (axiome 17) : surfacé mais JAMAIS bloquant");
  {
    // Script réel présent + gate désarmé explicitement → signalGap surfacé, ok INCHANGÉ (true).
    process.env.ELEVE_GATE_TESTS = "off";
    const vGapOff = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ hasTestScript: () => true }));
    check("gate off + script réel → signalGap présent", typeof vGapOff.signalGap === "string" && /ELEVE_GATE_TESTS=off/.test(vGapOff.signalGap ?? ""));
    check("signalGap ne bloque JAMAIS ok", vGapOff.ok === true);

    // Pas de script réel → jamais de signalGap.
    const vNoGap = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ hasTestScript: () => false }));
    check("pas de script réel → signalGap absent", vNoGap.signalGap === undefined);

    // Gate ON + tests verts (testsRan:true) → signal déjà pris, pas de gap.
    process.env.ELEVE_GATE_TESTS = "on";
    const passing = async (): Promise<TestRun> => ({ ok: true, signal: "tests-ok", detail: "", durationMs: 10 });
    const vRan = await runClosureGate("/proj", "t", result("fait"), "/ws", "dashboard", {}, deps({ runTests: passing, hasTestScript: () => true }));
    check("gate on + tests lancés → signalGap absent (signal déjà pris)", vRan.signalGap === undefined);
    delete process.env.ELEVE_GATE_TESTS;
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-gate : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
