// Suite de preuve du Tuteur (#181 É5, formation-tuteur.ts). Store FAKE injecté,
// AUCUN vrai réseau/LLM. Patron `check(label, cond)` calqué sur
// test-formation-model.ts / test-eleve-gate-pedago.ts.
import {
  groupWeaknessesByModule,
  buildSujetCible,
  mergeBankExt,
  sharedCollectionForMangoAppId,
  runTuteurSurFormation,
  runTuteurCycle,
  maybeRunTuteurCycle,
  type TuteurDeps,
} from "./formation-tuteur.js";
import type { Curriculum, Item, LearnerModel } from "./formation-model.js";
import type { WeaknessDiagnosis } from "./formation-adaptive.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const curriculum: Curriculum = {
  sujet: "La photographie argentique",
  langue: "fr",
  niveau: "débutant",
  modules: [
    { id: "m1", titre: "L'exposition", skillIds: ["expo.ouverture", "expo.iso"], prerequis: [], typesAttendus: ["lecon", "qcm"] },
    { id: "m2", titre: "Le développement", skillIds: ["dev.chimie"], prerequis: ["m1"], typesAttendus: ["lecon", "flashcard"] },
  ],
};

/** Modèle apprenant avec une faiblesse PERSISTANTE connue sur "expo.ouverture"
 * (le cas exact cité par la mission : "ouverture/diaphragme" sous le seuil
 * après N tentatives), une compétence FORTE ("dev.chimie") et rien sur "expo.iso". */
function learnerAvecFaiblesse(): LearnerModel {
  const historique: LearnerModel["historique"] = [
    { itemId: "a", skillIds: ["expo.ouverture"], difficulty: 2, correct: false, at: "2026-07-01T00:00:00Z" },
    { itemId: "b", skillIds: ["expo.ouverture"], difficulty: 2, correct: false, at: "2026-07-02T00:00:00Z" },
    { itemId: "c", skillIds: ["expo.ouverture"], difficulty: 2, correct: false, at: "2026-07-03T00:00:00Z" },
    { itemId: "d", skillIds: ["expo.ouverture"], difficulty: 2, correct: false, at: "2026-07-04T00:00:00Z" },
    { itemId: "e", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-01T00:00:00Z" },
    { itemId: "f", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-02T00:00:00Z" },
    { itemId: "g", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-03T00:00:00Z" },
  ];
  return {
    mastery: { "expo.ouverture": 0.2, "dev.chimie": 0.9 },
    moduleCourant: "m1",
    modulesValides: [],
    historique,
    fsrs: {},
  };
}

function learnerSansFaiblesse(): LearnerModel {
  const historique: LearnerModel["historique"] = [
    { itemId: "e", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-01T00:00:00Z" },
    { itemId: "f", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-02T00:00:00Z" },
    { itemId: "g", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-03T00:00:00Z" },
  ];
  return {
    mastery: { "dev.chimie": 0.95 },
    moduleCourant: "m2",
    modulesValides: ["m1"],
    historique,
    fsrs: {},
  };
}

/** Store fake en mémoire : Map<collection, Map<key, value>>. Aucune I/O réelle. */
function fakeStore() {
  const data = new Map<string, Map<string, unknown>>();
  return {
    getDoc: (collection: string, key: string): unknown => data.get(collection)?.get(key),
    putDoc: (collection: string, key: string, value: unknown): void => {
      if (!data.has(collection)) data.set(collection, new Map());
      data.get(collection)!.set(key, value);
    },
    raw: data,
  };
}

/** `ask` fake déterministe : renvoie un lot JSON minimal mais VALIDE selon le
 * type demandé, en réutilisant le `sujet` du prompt tel quel dans les champs
 * texte — permet de vérifier que le sujet du lot cite bien la compétence ciblée. */
function fakeAsk(): TuteurDeps["ask"] {
  return async (_system: string, user: string) => {
    const isQcm = /"question"/.test(user);
    const n = 3;
    if (isQcm) {
      const arr = Array.from({ length: n }, (_, i) => ({
        question: `Q${i} — ${user.slice(0, 400)}`,
        choix: ["A", "B", "C", "D"],
        reponse: 0,
        explication: `Explication ${i} — ${user.slice(0, 200)}`,
      }));
      return JSON.stringify(arr);
    }
    const arr = Array.from({ length: n }, (_, i) => ({
      recto: `Recto${i}`,
      verso: `Verso ${i} — ${user.slice(0, 200)}`,
    }));
    return JSON.stringify(arr);
  };
}

function fakeDeps(ask: TuteurDeps["ask"] = fakeAsk()): TuteurDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    getDoc: () => undefined,
    putDoc: () => {},
    ask: async (s, u) => { calls.push(u); return ask(s, u); },
    img: { toBase64: async () => null, judge: async () => null, search: async () => [] },
    log: () => {},
    now: () => new Date("2026-07-05T00:00:00Z"),
    calls,
  };
}

async function run(): Promise<void> {
  // ---------------------------------------------------------------------------
  // PUR — groupWeaknessesByModule / buildSujetCible / mergeBankExt
  // ---------------------------------------------------------------------------
  {
    const diag: WeaknessDiagnosis[] = [
      { skillId: "expo.ouverture", mastery: 0.2, attempts: 4, recentConsecutiveErrors: 4 },
      { skillId: "inconnue.x", mastery: 0.1, attempts: 5, recentConsecutiveErrors: 5 },
    ];
    const groups = groupWeaknessesByModule(curriculum, diag);
    check("groupe : le module m1 (expo.ouverture) est retrouvé", [...groups.keys()].some((m) => m.id === "m1"));
    check("groupe : une faiblesse sans module correspondant n'apparaît dans aucun groupe", [...groups.entries()].every(([, ws]) => ws.every((w) => w.skillId !== "inconnue.x")));

    const mod = curriculum.modules[0];
    const sujet = buildSujetCible(curriculum.sujet, mod, diag.filter((d) => d.skillId === "expo.ouverture"));
    check("le sujet cite le skillId précis", sujet.includes("expo.ouverture"));
    check("le sujet cite le pourcentage de maîtrise mesuré", sujet.includes("20%"));
    check("le sujet cite le pattern d'erreur récurrent", /échecs consécutifs récents/.test(sujet));
    check("le sujet nomme le module et la formation", sujet.includes(mod.titre) && sujet.includes(curriculum.sujet));

    const itemA: Item = { id: "x-1", moduleId: "m1", skillIds: ["expo.ouverture"], difficulty: 2, type: "flashcard", recto: "r1", verso: "v1" };
    const itemB: Item = { id: "x-2", moduleId: "m1", skillIds: ["expo.ouverture"], difficulty: 2, type: "flashcard", recto: "r2", verso: "v2" };
    const merged1 = mergeBankExt(undefined, [itemA]);
    check("fusion sans existant : renvoie le nouveau lot", merged1.length === 1 && merged1[0].id === "x-1");
    const merged2 = mergeBankExt(merged1, [itemB]);
    check("fusion avec existant : concatène sans perdre l'ancien", merged2.length === 2);
    const merged3 = mergeBankExt(merged2, [{ ...itemA, verso: "v1-corrige" } as Item]);
    check("fusion : id dupliqué → le plus récent écrase l'ancien", merged3.length === 2 && (merged3.find((i) => i.id === "x-1") as { verso?: string } | undefined)?.verso === "v1-corrige");
    check("nom de collection : reproduit exactement COLLECTION du client (learner-store.ts)", sharedCollectionForMangoAppId("formation-photo-abc") === "formation-formation-photo-abc");
  }

  // ---------------------------------------------------------------------------
  // Cas 1 — faiblesse connue → le lot généré CIBLE la compétence
  // ---------------------------------------------------------------------------
  {
    const store = fakeStore();
    const collection = "formation-test";
    store.putDoc(collection, "learner", learnerAvecFaiblesse());
    const deps = fakeDeps();
    deps.getDoc = store.getDoc;
    deps.putDoc = store.putDoc;

    const res = await runTuteurSurFormation(collection, curriculum, deps);
    check("faiblesse connue : le Tuteur a tourné (ran=true)", res.ran === true);
    check("faiblesse connue : le module m1 a été traité", res.modulesTraites.includes("m1"));
    check("faiblesse connue : au moins un item écrit", res.itemsEcrits > 0);
    check("faiblesse connue : au moins un appel de génération a été fait", deps.calls.length > 0);
    check("faiblesse connue : le prompt envoyé cite bien le skillId faible", deps.calls.some((u) => u.includes("expo.ouverture")));
    check("faiblesse connue : le prompt NE cite PAS la compétence forte non concernée", !deps.calls.some((u) => u.includes("dev.chimie")));

    const bankExt = store.getDoc(collection, "bank-ext:m1") as Item[] | undefined;
    check("écriture réussie : bank-ext:m1 peuplé dans le store fake", Array.isArray(bankExt) && bankExt.length > 0);
    check("écriture réussie : les items écrits ciblent bien expo.ouverture", !!bankExt && bankExt.every((it) => it.skillIds.includes("expo.ouverture")));
    check("écriture réussie : le module m2 (sans faiblesse) n'a rien reçu", store.getDoc(collection, "bank-ext:m2") === undefined);
  }

  // ---------------------------------------------------------------------------
  // Cas 2 — pas de faiblesse → AUCUN lot généré (pas d'hallucination de travail)
  // ---------------------------------------------------------------------------
  {
    const store = fakeStore();
    const collection = "formation-test2";
    store.putDoc(collection, "learner", learnerSansFaiblesse());
    const deps = fakeDeps();
    deps.getDoc = store.getDoc;
    deps.putDoc = store.putDoc;

    const res = await runTuteurSurFormation(collection, curriculum, deps);
    check("pas de faiblesse : le Tuteur ne tourne PAS (ran=false)", res.ran === false);
    check("pas de faiblesse : aucun module traité", res.modulesTraites.length === 0);
    check("pas de faiblesse : aucun item écrit", res.itemsEcrits === 0);
    check("pas de faiblesse : AUCUN appel de génération (pas d'hallucination de travail)", deps.calls.length === 0);
    check("pas de faiblesse : rien n'a été écrit dans le store", store.raw.get(collection)?.has("bank-ext:m1") !== true);
  }

  // ---------------------------------------------------------------------------
  // Cas 3 — aucun modèle apprenant miroité → no-op propre
  // ---------------------------------------------------------------------------
  {
    const store = fakeStore();
    const deps = fakeDeps();
    deps.getDoc = store.getDoc;
    deps.putDoc = store.putDoc;
    const res = await runTuteurSurFormation("formation-vide", curriculum, deps);
    check("pas de modèle apprenant : no-op (ran=false)", res.ran === false && res.itemsEcrits === 0);
    check("pas de modèle apprenant : aucun appel de génération", deps.calls.length === 0);
  }

  // ---------------------------------------------------------------------------
  // Cycle multi-formations — fail-open : une formation en échec n'arrête pas les autres
  // ---------------------------------------------------------------------------
  {
    const storeOk = fakeStore();
    storeOk.putDoc("formation-ok", "learner", learnerAvecFaiblesse());
    const depsOk = fakeDeps();
    depsOk.getDoc = storeOk.getDoc;
    depsOk.putDoc = storeOk.putDoc;

    // Une formation dont getDoc LÈVE (simule un store en panne) : le cycle doit
    // continuer sur les autres formations (fail-open PAR formation).
    const depsCasse: TuteurDeps = {
      ...depsOk,
      getDoc: () => { throw new Error("store en panne (simulation)"); },
    };

    const result = await runTuteurCycle(
      depsOk, // deps par défaut pour la formation "ok" (le cycle appelle la même instance pour chaque formation — ici on veut surtout vérifier le comptage)
      {},
      [
        { projectDir: "/fake/casse", collection: "formation-casse", curriculum },
        { projectDir: "/fake/ok", collection: "formation-ok", curriculum },
      ],
    );
    // Note : les DEUX formations partagent `depsOk` ci-dessus (runTuteurCycle ne
    // permet qu'un seul jeu de deps) — on vérifie donc plutôt le comportement
    // fail-open via un getDoc qui lève SEULEMENT pour la clé "formation-casse".
    void depsCasse;
    check("cycle multi-formations : au moins une formation a tourné", result.ranFormations >= 1);
    check("cycle multi-formations : pas d'erreur remontée (fail-open, deps saines ici)", result.errors === 0);
  }
  {
    // Reprise du scénario fail-open avec un getDoc qui lève VRAIMENT sur une collection.
    const storeOk = fakeStore();
    storeOk.putDoc("formation-ok2", "learner", learnerAvecFaiblesse());
    const deps: TuteurDeps = {
      getDoc: (collection, key) => {
        if (collection === "formation-casse2") throw new Error("panne simulée");
        return storeOk.getDoc(collection, key);
      },
      putDoc: storeOk.putDoc,
      ask: fakeAsk(),
      img: { toBase64: async () => null, judge: async () => null, search: async () => [] },
      log: () => {},
      now: () => new Date("2026-07-05T00:00:00Z"),
    };
    const result = await runTuteurCycle(deps, {}, [
      { projectDir: "/fake/casse2", collection: "formation-casse2", curriculum },
      { projectDir: "/fake/ok2", collection: "formation-ok2", curriculum },
    ]);
    // Le fail-open est déjà absorbé à l'intérieur de runTuteurSurFormation (son
    // propre try/catch autour de getDoc) : la formation en panne remonte donc
    // en "ran=false" avec une raison, pas en erreur de cycle (double filet,
    // mais c'est le niveau le plus bas qui absorbe ici — c'est voulu).
    check("fail-open réel : la formation en panne n'a pas fait planter le cycle", result.errors === 0);
    check("fail-open réel : la formation saine tourne quand même", result.ranFormations === 1);
    check("fail-open réel : les items de la formation saine sont bien écrits", result.itemsEcrits > 0);
  }

  // ---------------------------------------------------------------------------
  // Gate OFF → aucun comportement (maybeRunTuteurCycle)
  // ---------------------------------------------------------------------------
  {
    let called: boolean = false;
    const ranWhenOff = await maybeRunTuteurCycle(false, async () => {
      called = true;
      return { ranFormations: 0, itemsEcrits: 0, errors: 0 };
    });
    check("gate OFF : maybeRunTuteurCycle renvoie false", ranWhenOff === false);
    check("gate OFF : le cycle réel n'est JAMAIS appelé (0 I/O)", called === false);

    let calledOn: boolean = false;
    const ranWhenOn = await maybeRunTuteurCycle(true, async () => {
      calledOn = true;
      return { ranFormations: 1, itemsEcrits: 6, errors: 0 };
    });
    check("gate ON : maybeRunTuteurCycle renvoie true", ranWhenOn === true);
    check("gate ON : le cycle réel est appelé", calledOn);

    const ranOnThrow = await maybeRunTuteurCycle(true, async () => { throw new Error("panne"); });
    check("gate ON + cycle qui lève : maybeRunTuteurCycle avale l'erreur (renvoie false, ne relance pas)", ranOnThrow === false);
  }

  console.log(`\n=== formation-tuteur : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
