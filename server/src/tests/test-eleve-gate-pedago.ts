// Tests du volet PÉDAGO (#181 É4, D5 étages 2+3). Déterministe, deps injectées
// (loadManifest/loadBank/lirePage/juge FAKE — aucun réseau/LLM réel). Ne lève jamais.

import { checkPedago, tirerEchantillon, seedFromString, type PedagoDeps } from "../eleve-gate-pedago.js";
import { runClosureGate, type GateDeps, type GateVerdict } from "../eleve-gate.js";
import type { Curriculum, FormationManifest, Item } from "../formation/formation-model.js";
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function curriculum(modIds: string[], skillsByMod: Record<string, string[]> = {}): Curriculum {
  return {
    sujet: "café filtre",
    langue: "fr",
    niveau: "débutant",
    modules: modIds.map((id) => ({
      id,
      titre: `Module ${id}`,
      skillIds: skillsByMod[id] ?? [`${id}.base`],
      prerequis: [],
      typesAttendus: ["lecon", "qcm"],
    })),
  };
}

function manifest(c: Curriculum): FormationManifest {
  return {
    sujet: c.sujet,
    curriculum: c,
    etatModules: Object.fromEntries(c.modules.map((m) => [m.id, "verifie" as const])),
    decisions: { palette: [], typesItemsRetenus: ["lecon", "qcm"], sourcesMaitresses: [] },
  };
}

function lecon(moduleId: string, id: string, contenu: string, sources: string[]): Item {
  return {
    id,
    moduleId,
    skillIds: [`${moduleId}.base`],
    difficulty: 1,
    type: "lecon",
    titre: `Leçon ${id}`,
    contenu,
    sources,
  } as Item;
}

function qcm(moduleId: string, id: string, reponse = 0): Item {
  return {
    id,
    moduleId,
    skillIds: [`${moduleId}.base`],
    difficulty: 1,
    type: "qcm",
    question: "Question ?",
    choix: ["a", "b", "c", "d"],
    reponse,
    explication: "car la réponse est correcte",
  } as Item;
}

const LONGUE_LECON =
  "L'infusion à froid produit un café moins acide car les composés amers se dissolvent surtout à chaud. " +
  "Le temps de contact prolongé compense la basse température par une extraction plus longue et douce. " +
  "Cette méthode est appréciée pour sa rondeur en bouche et sa faible acidité perçue par les dégustateurs.";

function baseDeps(over: Partial<PedagoDeps> = {}): PedagoDeps {
  return {
    loadManifest: over.loadManifest ?? (() => null),
    loadBank: over.loadBank ?? (() => []),
    lirePage: over.lirePage ?? (async () => "texte de la source"),
    juge: over.juge ?? (async () => "oui"),
  };
}

async function run() {
  console.log("\n[1] applicable=false quand pas de manifest (projet non-formation)");
  {
    const v = await checkPedago("/proj", baseDeps());
    check("neutre : ok=true", v.ok);
    check("applicable=false", v.applicable === false);
    check("aucune raison", v.raisons.length === 0);
  }

  console.log("\n[2] COUVERTURE — module sans item généré");
  {
    const c = curriculum(["m1", "m2"]);
    const m = manifest(c);
    const banks: Record<string, Item[]> = { m1: [lecon("m1", "m1-l1", LONGUE_LECON, ["https://ex.com/a"])] };
    const v = await checkPedago(
      "/proj",
      baseDeps({
        loadManifest: () => m,
        loadBank: (_dir, modId) => banks[modId] ?? [],
      }),
    );
    check("couvertureOk=false", v.couvertureOk === false);
    check("raison COUVERTURE citant m2", v.raisons.some((r) => r.startsWith("COUVERTURE") && r.includes("m2")));
    check("ok=false", v.ok === false);
  }

  console.log("\n[3] COUVERTURE — compétence déclarée jamais exercée");
  {
    const c = curriculum(["m1"], { m1: ["m1.grain", "m1.mouture"] });
    const m = manifest(c);
    // l'item n'exerce que m1.grain — m1.mouture reste orpheline
    const item = { ...lecon("m1", "m1-l1", LONGUE_LECON, ["https://ex.com/a"]), skillIds: ["m1.grain"] } as Item;
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => [item] }));
    check("raison COUVERTURE citant m1.mouture orpheline", v.raisons.some((r) => r.includes("m1.mouture")));
  }

  console.log("\n[4] ORDRE — exercice avant leçon dans un module");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [qcm("m1", "m1-qcm-1"), lecon("m1", "m1-l1", LONGUE_LECON, ["https://ex.com/a"])];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("ordreOk=false", v.ordreOk === false);
    check("raison ORDRE présente", v.raisons.some((r) => r.startsWith("ORDRE")));
  }
  {
    console.log("  (contrôle : leçon avant exercice → ordreOk=true)");
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [lecon("m1", "m1-l1", LONGUE_LECON, ["https://ex.com/a"]), qcm("m1", "m1-qcm-1")];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("ordreOk=true", v.ordreOk === true);
  }

  console.log("\n[5] SOURCES — leçon sans source");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [lecon("m1", "m1-l1", LONGUE_LECON, [])];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("sourcesOk=false", v.sourcesOk === false);
    check("raison SOURCES citant m1/m1-l1", v.raisons.some((r) => r.startsWith("SOURCES") && r.includes("m1/m1-l1")));
  }

  console.log("\n[6] LISIBILITÉ — leçon squelettique (trop courte)");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [lecon("m1", "m1-l1", "Trop court.", ["https://ex.com/a"])];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("lisibiliteOk=false", v.lisibiliteOk === false);
    check("raison LISIBILITÉ squelettique", v.raisons.some((r) => r.startsWith("LISIBILITÉ") && r.includes("SQUELETTIQUE")));
  }

  console.log("\n[7] LISIBILITÉ — phrase trop longue");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const motsRepetes = Array.from({ length: 60 }, () => "mot").join(" ");
    const contenuLong = `${motsRepetes}. ${LONGUE_LECON}`;
    const items = [lecon("m1", "m1-l1", contenuLong, ["https://ex.com/a"])];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("lisibiliteOk=false (phrase longue)", v.lisibiliteOk === false);
  }

  console.log("\n[7b] BIAIS DE POSITION — 5 QCM/5 avec la bonne réponse en position 'a'");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = Array.from({ length: 5 }, (_, i) => qcm("m1", `m1-qcm-${i}`, 0));
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("biaisPositionOk=false", v.biaisPositionOk === false);
    check("raison BIAIS DE POSITION présente", v.raisons.some((r) => r.startsWith("BIAIS DE POSITION")));
    check("cite la position « a »", v.raisons.some((r) => r.includes("position « a »")));
    check("cite 5/5 (100%)", v.raisons.some((r) => r.includes("5/5") && r.includes("100%")));
    check("ok=false", v.ok === false);
  }
  {
    console.log("  (contrôle : positions équilibrées 0/1/2/3 sur 4 QCM → biaisPositionOk=true)");
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [qcm("m1", "q0", 0), qcm("m1", "q1", 1), qcm("m1", "q2", 2), qcm("m1", "q3", 3), qcm("m1", "q4", 0)];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("biaisPositionOk=true (2/5=40% < seuil 50%)", v.biaisPositionOk === true);
  }
  {
    console.log("  (contrôle : sous le seuil minQcmPourBiais (défaut 5) → pas de faux positif)");
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [qcm("m1", "q0", 0), qcm("m1", "q1", 0), qcm("m1", "q2", 0), qcm("m1", "q3", 0)]; // 4 < 5
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("biaisPositionOk=true (échantillon trop petit)", v.biaisPositionOk === true);
  }

  console.log("\n[8] EXACTITUDE — juge fake « non supporté » sur 3/10 affirmations");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    // 10 phrases vérifiables (≥5 mots), toutes sourcées.
    const phrases = Array.from({ length: 10 }, (_, i) => `Affirmation numéro ${i} avec assez de mots pour compter.`).join(" ");
    const items = [lecon("m1", "m1-l1", phrases, ["https://ex.com/source"])];
    let appelsJuge = 0;
    const v = await checkPedago(
      "/proj",
      baseDeps({
        loadManifest: () => m,
        loadBank: () => items,
        lirePage: async () => "texte de la source",
        juge: async (affirmation) => {
          appelsJuge++;
          // Les 3 premières (par ordre de tirage à seed fixe) sont déclarées "non".
          return appelsJuge <= 3 ? "non" : "oui";
        },
      }),
      { seed: 42 },
    );
    check("exactitudeOk=false", v.exactitudeOk === false);
    check("exactitudeSautee=false", v.exactitudeSautee === false);
    const raisonExactitude = v.raisons.find((r) => r.startsWith("EXACTITUDE"));
    check("raison EXACTITUDE présente", Boolean(raisonExactitude));
    check("cite 3 affirmations précises (3 lignes '  - ')", (raisonExactitude?.match(/\n {2}- /g) ?? []).length === 3);
    check("mentionne 3/10", Boolean(raisonExactitude?.includes("3/10")));
  }

  console.log("\n[9] EXACTITUDE — tout supporté → ok, sautee=false");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const phrases = Array.from({ length: 10 }, (_, i) => `Affirmation numéro ${i} avec assez de mots pour compter.`).join(" ");
    const items = [lecon("m1", "m1-l1", phrases, ["https://ex.com/source"])];
    const v = await checkPedago(
      "/proj",
      baseDeps({ loadManifest: () => m, loadBank: () => items, juge: async () => "oui" }),
      { seed: 7 },
    );
    check("exactitudeOk=true", v.exactitudeOk === true);
    check("ok=true", v.ok === true);
  }

  console.log("\n[10] EXACTITUDE — aucune affirmation exploitable → sautée, ne pénalise pas");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const items = [lecon("m1", "m1-l1", "Court mais suffisant pour la longueur minimale requise ici, sans phrase longue. ".repeat(4), [])];
    const v = await checkPedago("/proj", baseDeps({ loadManifest: () => m, loadBank: () => items }));
    check("exactitudeSautee=true (pas de source → pas d'affirmation)", v.exactitudeSautee === true);
    check("exactitudeOk=true (fail-open)", v.exactitudeOk === true);
  }

  console.log("\n[11] EXACTITUDE — source injoignable / juge KO → fail-open (sautée)");
  {
    const c = curriculum(["m1"]);
    const m = manifest(c);
    const phrases = Array.from({ length: 10 }, (_, i) => `Affirmation numéro ${i} avec assez de mots pour compter.`).join(" ");
    const items = [lecon("m1", "m1-l1", phrases, ["https://ex.com/source"])];
    const v = await checkPedago(
      "/proj",
      baseDeps({ loadManifest: () => m, loadBank: () => items, lirePage: async () => null }),
    );
    check("exactitudeSautee=true (source jamais lisible)", v.exactitudeSautee === true);
    check("exactitudeOk=true", v.exactitudeOk === true);
  }

  console.log("\n[12] tirerEchantillon / seedFromString — déterminisme");
  {
    const all = Array.from({ length: 30 }, (_, i) => ({ moduleId: "m", itemId: `i${i}`, texte: `t${i}`, source: "s" }));
    const seed = seedFromString("café filtre");
    const a = tirerEchantillon(all, 10, seed);
    const b = tirerEchantillon(all, 10, seed);
    check("même seed → même tirage", JSON.stringify(a) === JSON.stringify(b));
    check("taille échantillon = 10", a.length === 10);
    check("échantillon >= total → renvoie tout", tirerEchantillon(all, 999, seed).length === all.length);
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
      checkPedago: over.checkPedago,
      hasTestScript: over.hasTestScript ?? (() => false),
    };
  }
  const result = (text: string) => ({ text, toolTrace: [] as Array<{ name: string; args: string }> });

  console.log("\n[13] runClosureGate — gate ELEVE_GATE_PEDAGO OFF (défaut) : checkPedago JAMAIS appelé, verdict byte-identique");
  {
    delete process.env.ELEVE_GATE_PEDAGO;
    let appele = false;
    const withDep = await runClosureGate(
      "/proj",
      "tâche",
      result("fait"),
      "/ws",
      "vitrine",
      {},
      gateDeps({
        checkPedago: async () => {
          appele = true;
          throw new Error("ne devrait jamais être appelé");
        },
      }),
    );
    check("ok=true", withDep.ok === true);
    check("aucun champ pedago dans le verdict (byte-identique)", !("pedago" in withDep) && !("pedagoOk" in withDep));

    const withoutDep = await runClosureGate("/proj", "tâche", result("fait"), "/ws", "vitrine", {}, gateDeps());
    check(
      "verdict OFF strictement identique avec ou sans deps.checkPedago (JSON égal)",
      JSON.stringify(withDep as GateVerdict) === JSON.stringify(withoutDep as GateVerdict),
    );
  }

  console.log("\n[14] runClosureGate — gate ON, volet PÉDAGO en échec → raisons remontées, ok=false");
  {
    process.env.ELEVE_GATE_PEDAGO = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({
          checkPedago: async () => ({
            ok: false,
            applicable: true,
            couvertureOk: false,
            ordreOk: true,
            sourcesOk: true,
            lisibiliteOk: true,
            biaisPositionOk: true,
            exactitudeOk: true,
            exactitudeSautee: true,
            raisons: ["COUVERTURE — module m2 sans item"],
          }),
        }),
      );
      check("ok=false", v.ok === false);
      check("pedagoOk=false", v.pedagoOk === false);
      check("raison COUVERTURE remontée dans raisons[]", v.raisons.some((r) => r.startsWith("COUVERTURE")));
    } finally {
      delete process.env.ELEVE_GATE_PEDAGO;
    }
  }

  console.log("\n[15] runClosureGate — gate ON, volet PÉDAGO neutre (non applicable) → ok=true");
  {
    process.env.ELEVE_GATE_PEDAGO = "on";
    try {
      const v = await runClosureGate(
        "/proj",
        "tâche",
        result("fait"),
        "/ws",
        "vitrine",
        {},
        gateDeps({ checkPedago: async () => ({ ok: true, applicable: false, couvertureOk: true, ordreOk: true, sourcesOk: true, lisibiliteOk: true, biaisPositionOk: true, exactitudeOk: true, exactitudeSautee: true, raisons: [] }) }),
      );
      check("ok=true (non applicable)", v.ok === true);
      check("pedagoOk=true", v.pedagoOk === true);
    } finally {
      delete process.env.ELEVE_GATE_PEDAGO;
    }
  }

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

run();
