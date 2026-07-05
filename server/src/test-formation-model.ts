// Suite de preuve du spine pur du moteur pédagogique (#181 É1).
// Patron `check(label, cond)` calqué sur les autres `test-*.ts` du repo
// (ex. `test-eleve-bricks.ts`) : compteur pass/fail, exit code 1 si échec.
import {
  validateCurriculum,
  validateItem,
  validateItems,
  validateLearnerModel,
  validateManifest,
  type Curriculum,
  type Item,
  type AppariementItem,
  type LearnerModel,
  type FormationManifest,
} from "./formation-model.js";
import {
  estimateMastery,
  adjustDifficulty,
  selectNextItem,
  diagnoseWeaknesses,
} from "./formation-adaptive.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validCurriculum: Curriculum = {
  sujet: "La photographie argentique",
  langue: "fr",
  niveau: "débutant",
  modules: [
    { id: "m1", titre: "Les bases", skillIds: ["expo.base"], prerequis: [], typesAttendus: ["lecon", "qcm"] },
    { id: "m2", titre: "Le développement", skillIds: ["dev.chimie"], prerequis: ["m1"], typesAttendus: ["lecon", "flashcard"] },
  ],
};

const validLecon: Item = {
  id: "i-lecon-1", moduleId: "m1", skillIds: ["expo.base"], difficulty: 2,
  type: "lecon", titre: "L'exposition", contenu: "Le triangle d'exposition règle la lumière...",
  sources: ["https://example.com/expo"],
};

const validQcm: Item = {
  id: "i-qcm-1", moduleId: "m1", skillIds: ["expo.base"], difficulty: 3,
  type: "qcm", question: "Quel réglage contrôle la profondeur de champ ?",
  choix: ["Ouverture", "ISO", "Vitesse"], reponse: 0, explication: "L'ouverture du diaphragme règle la profondeur de champ.",
};

const validFlashcard: Item = {
  id: "i-fc-1", moduleId: "m2", skillIds: ["dev.chimie"], difficulty: 1,
  type: "flashcard", recto: "Révélateur", verso: "Produit qui développe l'image latente.",
};

const validTexteATrous: Item = {
  id: "i-tt-1", moduleId: "m1", skillIds: ["expo.base"], difficulty: 2,
  type: "texte-a-trous", texte: "L'___ contrôle l'entrée de lumière.", reponses: ["ouverture"],
};

const validAppariement: AppariementItem = {
  id: "i-ap-1", moduleId: "m2", skillIds: ["dev.chimie"], difficulty: 2,
  type: "appariement", paires: [
    { gauche: "Révélateur", droite: "Développe" },
    { gauche: "Fixateur", droite: "Fixe" },
  ],
};

function baseLearner(): LearnerModel {
  return {
    mastery: {},
    moduleCourant: "m1",
    modulesValides: [],
    historique: [],
    fsrs: {},
  };
}

const validManifest: FormationManifest = {
  sujet: "La photographie argentique",
  curriculum: validCurriculum,
  etatModules: { m1: "genere", m2: "a_faire" },
  decisions: { palette: ["#1a1a1a", "#e0a020"], typesItemsRetenus: ["lecon", "qcm", "flashcard"], sourcesMaitresses: ["https://example.com"] },
};

async function run() {
  console.log("[1] validateCurriculum");
  check("curriculum valide accepté", validateCurriculum(validCurriculum).valid);
  check("curriculum sans modules rejeté", !validateCurriculum({ ...validCurriculum, modules: [] }).valid);
  check("module id dupliqué rejeté", !validateCurriculum({
    ...validCurriculum,
    modules: [validCurriculum.modules[0], { ...validCurriculum.modules[0] }],
  }).valid);
  check("prérequis inconnu rejeté", !validateCurriculum({
    ...validCurriculum,
    modules: [{ ...validCurriculum.modules[0], prerequis: ["m-inconnu"] }],
  }).valid);

  console.log("\n[2] validateItem — qcm");
  check("qcm valide accepté", validateItem(validQcm).valid);
  check("qcm réponse hors bornes rejeté", !validateItem({ ...validQcm, reponse: 9 }).valid);
  check("qcm choix dupliqués rejeté", !validateItem({ ...validQcm, choix: ["A", "A"], reponse: 0 }).valid);
  check("qcm un seul choix rejeté (min 2)", !validateItem({ ...validQcm, choix: ["A"], reponse: 0 }).valid);
  check("qcm difficulté hors bornes rejeté", !validateItem({ ...validQcm, difficulty: 9 }).valid);

  console.log("\n[3] validateItem — autres types");
  check("flashcard valide acceptée", validateItem(validFlashcard).valid);
  check("flashcard sans verso rejetée", !validateItem({ ...validFlashcard, verso: "" }).valid);
  check("texte-à-trous valide accepté", validateItem(validTexteATrous).valid);
  check("texte-à-trous sans trou rejeté", !validateItem({ ...validTexteATrous, texte: "Pas de trou ici." }).valid);
  check("appariement valide accepté", validateItem(validAppariement).valid);
  check("appariement une seule paire rejeté (min 2)", !validateItem({ ...validAppariement, paires: [validAppariement.paires[0]] }).valid);
  check("leçon valide acceptée (sources non vides)", validateItem(validLecon).valid);
  check("leçon sans sources rejetée", !validateItem({ ...validLecon, sources: [] }).valid);
  check("type d'item inconnu rejeté", !validateItem({ ...validQcm, type: "video" }).valid);

  console.log("\n[4] validateItems — lot mixte");
  {
    const r = validateItems([validQcm, validLecon, { ...validQcm, reponse: 99 }, validFlashcard]);
    check("lot mixte : 3 valides sur 4", r.validCount === 3 && r.total === 4 && !r.valid);
    const rAllGood = validateItems([validQcm, validLecon]);
    check("lot tout valide : valid=true", rAllGood.valid && rAllGood.validCount === 2);
  }

  console.log("\n[5] validateLearnerModel / validateManifest");
  check("learner model vide valide", validateLearnerModel(baseLearner()).valid);
  check("learner model avec mastery hors [0,1] rejeté", !validateLearnerModel({ ...baseLearner(), mastery: { x: 1.5 } }).valid);
  check("manifest valide accepté", validateManifest(validManifest).valid);
  check("manifest avec module absent de etatModules rejeté", !validateManifest({
    ...validManifest,
    etatModules: { m1: "genere" }, // m2 manquant
  }).valid);
  check("manifest avec état de module invalide rejeté", !validateManifest({
    ...validManifest,
    etatModules: { m1: "genere", m2: "termine" },
  }).valid);

  console.log("\n[6] estimateMastery — convergence EWMA");
  {
    const allCorrect = Array.from({ length: 20 }, () => ({ correct: true, difficulty: 3 }));
    const mAfterCorrect = estimateMastery(allCorrect, { priorMastery: 0.5 });
    check("séquence de réussites → maîtrise > 0.85", mAfterCorrect > 0.85);

    const allWrong = Array.from({ length: 20 }, () => ({ correct: false, difficulty: 3 }));
    const mAfterWrong = estimateMastery(allWrong, { priorMastery: 0.5 });
    check("séquence d'échecs → maîtrise < 0.15", mAfterWrong < 0.15);

    check("aucune réponse → renvoie le prior tel quel", estimateMastery([], { priorMastery: 0.42 }) === 0.42);
    check("maîtrise toujours dans [0,1]", mAfterCorrect <= 1 && mAfterWrong >= 0);

    const hardCorrect = estimateMastery([{ correct: true, difficulty: 5 }], { priorMastery: 0.5 });
    const easyCorrect = estimateMastery([{ correct: true, difficulty: 1 }], { priorMastery: 0.5 });
    check("réussite difficile pousse plus qu'une réussite facile", hardCorrect > easyCorrect);
  }

  console.log("\n[7] adjustDifficulty");
  check("maîtrise haute → difficulté +1", adjustDifficulty(2, 0.9) === 3);
  check("maîtrise basse → difficulté -1", adjustDifficulty(3, 0.2) === 2);
  check("maîtrise moyenne → difficulté inchangée", adjustDifficulty(3, 0.6) === 3);
  check("borne haute respectée (5 reste 5)", adjustDifficulty(5, 0.95) === 5);
  check("borne basse respectée (1 reste 1)", adjustDifficulty(1, 0.1) === 1);

  console.log("\n[8] selectNextItem — déterminisme et priorités");
  {
    const items: Item[] = [validQcm, validLecon, validFlashcard, validTexteATrous];
    const now = new Date("2026-07-05T10:00:00Z");
    const learner = baseLearner();
    learner.fsrs[validFlashcard.id] = { itemId: validFlashcard.id, due: "2026-07-01T00:00:00Z", stability: 1, difficulty: 5, reps: 1, lapses: 0 };

    const r1 = selectNextItem(items, learner, now);
    const r2 = selectNextItem(items, learner, now);
    check("sélection déterministe (même entrée → même sortie)", r1?.id === r2?.id);
    check("item FSRS échu priorisé sur tout le reste", r1?.id === validFlashcard.id);

    const learnerWeak = baseLearner();
    learnerWeak.mastery = { "expo.base": 0.1 };
    const r3 = selectNextItem(items, learnerWeak, now);
    check("sans item échu, compétence faible du module courant priorisée", r3?.id === validLecon.id || r3?.id === validQcm.id);

    const learnerProg = baseLearner();
    learnerProg.mastery = { "expo.base": 0.9 };
    learnerProg.historique = [{ itemId: validLecon.id, skillIds: ["expo.base"], difficulty: 2, correct: true, at: now.toISOString() }];
    const r4 = selectNextItem(items, learnerProg, now);
    check("sans faiblesse, progression prend le premier item non répondu du module", r4?.id === validQcm.id);

    check("liste vide → null", selectNextItem([], baseLearner(), now) === null);
  }

  console.log("\n[9] diagnoseWeaknesses");
  {
    const learner = baseLearner();
    learner.mastery = { "expo.base": 0.2, "dev.chimie": 0.9, "cadrage": 0.1 };
    learner.historique = [
      { itemId: "a", skillIds: ["expo.base"], difficulty: 2, correct: false, at: "2026-07-01T00:00:00Z" },
      { itemId: "b", skillIds: ["expo.base"], difficulty: 2, correct: false, at: "2026-07-02T00:00:00Z" },
      { itemId: "c", skillIds: ["expo.base"], difficulty: 2, correct: false, at: "2026-07-03T00:00:00Z" },
      { itemId: "d", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-01T00:00:00Z" },
      { itemId: "e", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-02T00:00:00Z" },
      { itemId: "f", skillIds: ["dev.chimie"], difficulty: 2, correct: true, at: "2026-07-03T00:00:00Z" },
      { itemId: "g", skillIds: ["cadrage"], difficulty: 2, correct: false, at: "2026-07-01T00:00:00Z" },
    ];
    const diag = diagnoseWeaknesses(learner, { minAttempts: 3 });
    check("compétence faible avec assez de tentatives détectée", diag.some((d) => d.skillId === "expo.base"));
    check("compétence forte non détectée", !diag.some((d) => d.skillId === "dev.chimie"));
    check("compétence faible avec trop peu de tentatives NON détectée", !diag.some((d) => d.skillId === "cadrage"));
    const expoBase = diag.find((d) => d.skillId === "expo.base")!;
    check("échecs consécutifs récents comptés (3)", expoBase.recentConsecutiveErrors === 3);
    check("tri par maîtrise ascendante", diag[0].mastery <= (diag[1]?.mastery ?? 1));
  }

  console.log(`\n=== formation-model : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
