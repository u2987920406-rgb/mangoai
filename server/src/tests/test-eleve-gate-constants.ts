// Tests du volet CONSTANTES du Gardien (L117, limites.md) — incident `systeme-solaire`
// (vitesse orbitale de Saturne fausse, jamais détectée). Déterministe, 0 réseau/LLM,
// deps injectées. Ne lève jamais.

import {
  extraireVitessesDeclarees,
  extrairePeriodesDeclarees,
  comparerAReference,
  checkConstants,
  checkConstantsProjet,
  VITESSES_ORBITALES_KM_S,
  PERIODES_ORBITALES_JOURS,
  type ConstantsDeps,
} from "../eleve-gate-constants.js";
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

async function run() {
  console.log("\n[1] extraireVitessesDeclarees — format objet JS classique");
  {
    const code = `const planets = { saturn: { name: "Saturne", vitesse: 9.6, distance: 1434 } };`;
    const out = extraireVitessesDeclarees(code);
    check("1 planète détectée", out.length === 1);
    check("planète = saturne", out[0]?.planete === "saturne");
    check("valeur = 9.6", out[0]?.valeur === 9.6);
  }

  console.log("\n[2] extraireVitessesDeclarees — l'incident réel : Saturne avec une vitesse fausse");
  {
    // Bug observé : Saturne codée avec une vitesse largement erronée (ex. confondue avec Mercure).
    const code = `const saturne = { orbitalSpeed: 47.9, periodeJours: 10747 };`;
    const out = extraireVitessesDeclarees(code);
    check("valeur fausse capturée telle quelle", out.find((o) => o.planete === "saturne")?.valeur === 47.9);
  }

  console.log("\n[3] extraireVitessesDeclarees — plusieurs planètes, FR et EN mêlés");
  {
    const code = `
      const mercure = { vitesse: 47.87 };
      const earth = { speed: 29.78 };
      const jupiter = { orbitalSpeed: 13.07 };
    `;
    const out = extraireVitessesDeclarees(code);
    check("3 planètes détectées", out.length === 3);
    check("terre détectée via alias earth", out.some((o) => o.planete === "terre" && o.valeur === 29.78));
  }

  console.log("\n[4] extraireVitessesDeclarees — planète mentionnée sans champ vitesse à proximité → absente");
  {
    const code = `const description = "Saturne est célèbre pour ses anneaux."; // pas de vitesse ici`;
    const out = extraireVitessesDeclarees(code);
    check("aucune détection (fail-open, pas de faux positif)", out.length === 0);
  }

  console.log("\n[5] extraireVitessesDeclarees — code vide/sans planète → liste vide");
  {
    check("aucune planète", extraireVitessesDeclarees("const x = 42;").length === 0);
  }

  console.log("\n[6] comparerAReference — écart au-delà de la tolérance (20% défaut)");
  {
    const ecarts = comparerAReference([{ planete: "saturne", valeur: 47.9 }]); // réf 9.69, énorme écart
    check("1 écart détecté", ecarts.length === 1);
    check("valeurRéférence = 9.69", ecarts[0]?.valeurReference === VITESSES_ORBITALES_KM_S.saturne);
    check("écart relatif > 1 (>100%)", (ecarts[0]?.ecartRelatif ?? 0) > 1);
  }

  console.log("\n[7] comparerAReference — valeur légèrement arrondie, sous la tolérance → pas d'écart");
  {
    const ecarts = comparerAReference([{ planete: "saturne", valeur: 9.7 }]); // réf 9.69, écart ~0.1%
    check("aucun écart (arrondi pédagogique toléré)", ecarts.length === 0);
  }

  console.log("\n[8] comparerAReference — planète inconnue de la table → ignorée");
  {
    const ecarts = comparerAReference([{ planete: "pluton", valeur: 4.7 }]);
    check("ignorée (hors table curée)", ecarts.length === 0);
  }

  // (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — miroir exact des tests
  // [1]-[8] ci-dessus, mais pour la PÉRIODE ORBITALE (jours) : la sonde de la nuit
  // précédente a prouvé que ce champ n'était pas détecté (seule la vitesse l'était).
  console.log("\n[1b] extrairePeriodesDeclarees — Saturne, période fausse (29j au lieu de ~10 759j), champ per-entry");
  {
    const code = `const saturne = { orbitalPeriod: 29 };`;
    const out = extrairePeriodesDeclarees(code);
    check("1 planète détectée", out.length === 1);
    check("planète = saturne", out[0]?.planete === "saturne");
    check("valeur fausse capturée telle quelle", out[0]?.valeur === 29);
  }

  console.log("\n[2b] extrairePeriodesDeclarees — FR, plusieurs planètes");
  {
    const code = `
      const mercure = { periode: 88 };
      const earth = { periodeOrbitale: 365 };
    `;
    const out = extrairePeriodesDeclarees(code);
    check("2 planètes détectées", out.length === 2);
    check("terre détectée via alias earth", out.some((o) => o.planete === "terre" && o.valeur === 365));
  }

  console.log("\n[3b] extrairePeriodesDeclarees — ne confond jamais avec un champ vitesse voisin");
  {
    const code = `const saturne = { vitesse: 9.69, periode: 10759 };`;
    const vitesses = extraireVitessesDeclarees(code);
    const periodes = extrairePeriodesDeclarees(code);
    check("vitesse détectée séparément", vitesses[0]?.valeur === 9.69);
    check("période détectée séparément", periodes[0]?.valeur === 10759);
  }

  console.log("\n[4b] extrairePeriodesDeclarees — planète sans champ période à proximité → absente");
  {
    const code = `const description = "Saturne est célèbre pour ses anneaux."; // pas de période ici`;
    check("aucune détection (fail-open)", extrairePeriodesDeclarees(code).length === 0);
  }

  console.log("\n[5b] comparerAReference (période) — écart au-delà de la tolérance");
  {
    const ecarts = comparerAReference([{ planete: "saturne", valeur: 29 }], PERIODES_ORBITALES_JOURS);
    check("1 écart détecté", ecarts.length === 1);
    check("valeurRéférence = 10759", ecarts[0]?.valeurReference === PERIODES_ORBITALES_JOURS.saturne);
    // 29j vs réf. 10759j → écart relatif = 10730/10759 ≈ 0.997 (borné sous 1 par construction
    // pour une valeur positive plus petite que la référence — jamais "> 1" ici, contrairement
    // au cas vitesse [6] où la valeur fausse DÉPASSE la référence).
    check("écart relatif énorme (>0.9, ~370x trop rapide)", (ecarts[0]?.ecartRelatif ?? 0) > 0.9);
  }

  console.log("\n[9] checkConstants — non applicable (aucune constante planétaire dans le code)");
  {
    const v = checkConstants("function App() { return <div>Hello</div>; }");
    check("applicable=false", v.applicable === false);
    check("ok=true (neutre)", v.ok === true);
  }

  console.log("\n[10] checkConstants — l'incident réel reproduit : ok=false, raison précise");
  {
    const code = `const saturne = { nom: "Saturne", vitesse: 47.9 };`;
    const v = checkConstants(code);
    check("applicable=true", v.applicable === true);
    check("ok=false", v.ok === false);
    check("1 écart", v.ecarts.length === 1);
    check("raison cite saturne et les deux valeurs", v.raisons.some((r) => r.includes("saturne") && r.includes("47.9") && r.includes("9.69")));
  }

  console.log("\n[11] checkConstants — toutes les planètes correctes → ok=true, applicable=true");
  {
    const code = `
      const saturne = { vitesse: 9.69 };
      const terre = { vitesse: 29.78 };
    `;
    const v = checkConstants(code);
    check("applicable=true", v.applicable === true);
    check("ok=true", v.ok === true);
    check("aucun écart", v.ecarts.length === 0);
  }

  console.log("\n[11b] checkConstants — même valeur que la sonde de la nuit précédente (Saturne 29j), champ per-entry détectable");
  {
    // Même VALEUR fausse que la fixture MangoQA de cette nuit (fault-corpus-data.ts,
    // constante-physique-fausse : Saturne à 29 jours au lieu de ~10 759). Champ per-entry
    // (`periodeJours` à proximité immédiate du nom de la planète), PAS la forme exacte de
    // cette fixture (`Record<Planète, number>` nommé UNE FOIS au niveau de la déclaration,
    // ex. `ORBITAL_PERIOD_DAYS = {Saturne: 29, ...}`) — cette forme-là reste un angle mort
    // ASSUMÉ de ce détecteur PUR (aucun mot "période" n'apparaît physiquement à proximité de
    // "Saturne" dans ce cas, seulement dans le nom de la constante globale) ; c'est
    // exactement le type de cas que la Partie 2 (volet content, jugement LLM du fichier
    // entier) couvre et que ce détecteur déterministe étroit ne peut pas voir par design.
    const code = `const saturne = { nom: "Saturne", periodeJours: 29 };`;
    const v = checkConstants(code);
    check("applicable=true", v.applicable === true);
    check("ok=false", v.ok === false);
    check("raison cite saturne, la période et l'unité jours", v.raisons.some((r) => r.includes("saturne") && r.includes("période orbitale") && r.includes("jours")));
  }

  console.log("\n[11c] checkConstants — vitesse ET période fausses simultanément → 2 écarts fusionnés");
  {
    const code = `const saturne = { vitesse: 47.9, periode: 29 };`;
    const v = checkConstants(code);
    check("ok=false", v.ok === false);
    check("2 écarts (1 vitesse + 1 période)", v.ecarts.length === 2);
    check("1 raison vitesse km/s + 1 raison période jours", v.raisons.some((r) => r.includes("km/s")) && v.raisons.some((r) => r.includes("jours")));
  }

  console.log("\n[12] checkConstantsProjet — deps injectées, jamais de throw même si readSourceConcat lève");
  {
    const deps: ConstantsDeps = { readSourceConcat: () => { throw new Error("ENOENT"); } };
    let threw = false;
    let v;
    try {
      v = await checkConstantsProjet("/proj", deps);
    } catch {
      threw = true;
    }
    check("ne lève jamais", threw === false);
    check("applicable=false", v?.applicable === false);
  }

  console.log("\n[13] checkConstantsProjet — deps réelle simulée, détecte l'incident via le projet");
  {
    const deps: ConstantsDeps = { readSourceConcat: () => `const saturne = { vitesse: 47.9 };` };
    const v = await checkConstantsProjet("/proj", deps);
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
      checkConstants: over.checkConstants,
      hasTestScript: over.hasTestScript ?? (() => false),
    };
  }
  const result = (text: string) => ({ text, toolTrace: [] as Array<{ name: string; args: string }> });

  // (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — ELEVE_GATE_CONSTANTS
  // est désormais ON PAR DÉFAUT (flags.ts) : 34 tests verts, fail-open, 100% souverain
  // ($0, zéro réseau/LLM) — aucun risque de faux positif coûteux à le laisser OFF.
  console.log("\n[14] runClosureGate — gate ELEVE_GATE_CONSTANTS ON (défaut depuis 2026-07-24) : checkConstants APPELÉ");
  {
    delete process.env.ELEVE_GATE_CONSTANTS;
    let appele: boolean = false;
    const withDep = await runClosureGate(
      "/proj",
      "tâche",
      result("fait"),
      "/ws",
      "vitrine",
      {},
      gateDeps({
        checkConstants: async () => {
          appele = true;
          return { ok: true, applicable: true, ecarts: [], raisons: [] };
        },
      }),
    );
    check("checkConstants appelé (défaut ON)", appele);
    check("ok=true", withDep.ok === true);
    check("constantsOk=true dans le verdict (défaut ON)", withDep.constantsOk === true);
  }

  console.log("\n[14b] runClosureGate — ELEVE_GATE_CONSTANTS explicitement OFF : checkConstants JAMAIS appelé, verdict byte-identique");
  {
    process.env.ELEVE_GATE_CONSTANTS = "off";
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
          checkConstants: async () => {
            appele = true;
            throw new Error("ne devrait jamais être appelé");
          },
        }),
      );
      check("checkConstants non appelé (gate explicitement off)", appele === false);
      check("ok=true", withDep.ok === true);
      check("aucun champ constants dans le verdict (byte-identique)", !("constants" in withDep) && !("constantsOk" in withDep));

      const withoutDep = await runClosureGate("/proj", "tâche", result("fait"), "/ws", "vitrine", {}, gateDeps());
      check(
        "verdict OFF strictement identique avec ou sans deps.checkConstants (JSON égal)",
        JSON.stringify(withDep as GateVerdict) === JSON.stringify(withoutDep as GateVerdict),
      );
    } finally {
      delete process.env.ELEVE_GATE_CONSTANTS;
    }
  }

  console.log("\n[15] runClosureGate — gate ON, volet CONSTANTES en échec → raisons remontées, ok=false");
  {
    process.env.ELEVE_GATE_CONSTANTS = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkConstants: async () => ({
            ok: false,
            applicable: true,
            ecarts: [{ planete: "saturne", valeurTrouvee: 47.9, valeurReference: 9.69, ecartRelatif: 3.9 }],
            raisons: ["CONSTANTES — vitesse orbitale de saturne déclarée à 47.9 km/s, référence ~9.69 km/s"],
          }),
        }),
      );
      check("ok=false", v.ok === false);
      check("constantsOk=false", v.constantsOk === false);
      check("raison CONSTANTES remontée dans raisons[]", v.raisons.some((r) => r.startsWith("CONSTANTES")));
    } finally {
      delete process.env.ELEVE_GATE_CONSTANTS;
    }
  }

  console.log("\n[16] runClosureGate — gate ON, volet CONSTANTES neutre (non applicable) → ok=true");
  {
    process.env.ELEVE_GATE_CONSTANTS = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({ checkConstants: async () => ({ ok: true, applicable: false, ecarts: [], raisons: [] }) }),
      );
      check("ok=true (non applicable)", v.ok === true);
      check("constantsOk=true", v.constantsOk === true);
    } finally {
      delete process.env.ELEVE_GATE_CONSTANTS;
    }
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

run();
