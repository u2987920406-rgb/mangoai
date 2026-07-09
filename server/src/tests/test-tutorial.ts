// Tests purs (zéro réseau) du module tutorial.ts (#56, Chantier A).
// Lancer : npx tsx src/test-tutorial.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getAllTutorials,
  getTutorial,
  defaultProgress,
  loadProgress,
  saveProgress,
  markStepComplete,
  markTutorialComplete,
  nextTutorialId,
  TUTORIAL_COUNT,
  TUTORIAL_PROGRESS_FILE,
} from "../tutorial.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mango-tut-"));
}

console.log("═".repeat(60));
console.log("tutorial.ts — définitions");
console.log("─".repeat(60));

const metas = getAllTutorials();
check(`getAllTutorials() renvoie ${TUTORIAL_COUNT} tutoriels`, metas.length === TUTORIAL_COUNT);
check("ids 1..10 dans l'ordre", metas.every((m, i) => m.id === i + 1));
check("chaque méta a un titre non vide", metas.every((m) => m.title.length > 0));
check("liberté croît de 0 à 100", metas[0].freedomLevel === 0 && metas[9].freedomLevel === 100);

const t1 = getTutorial(1);
const t2 = getTutorial(2);
check("tuto 1 défini avec 15 étapes", !!t1 && t1.steps.length === 15);
check("tuto 2 défini avec des étapes", !!t2 && t2.steps.length > 0);
check("toutes les étapes du tuto 1 ont un id unique", !!t1 && new Set(t1.steps.map((s) => s.id)).size === t1.steps.length);
check("tuto 1 = freedom 0, tuto 2 = freedom 10", t1?.freedomLevel === 0 && t2?.freedomLevel === 10);
check("tuto 2 a un prompt pré-écrit (action send)", !!t2 && t2.steps.some((s) => s.action === "send" && !!s.prefilledPrompt));
check("getTutorial(99) → null", getTutorial(99) === null);
check("getAllTutorials n'expose pas les steps (stepCount à la place)", metas.every((m) => typeof m.stepCount === "number") && !("steps" in metas[0]));
check("tous les 10 tutoriels ont au moins 1 étape", getAllTutorials().every((m) => m.stepCount > 0));

console.log("─".repeat(60));
console.log("tutorial.ts — persistance");
console.log("─".repeat(60));

// defaultProgress
const dp = defaultProgress();
check("defaultProgress: currentTutorial = 1", dp.currentTutorial === 1);
check("defaultProgress: aucun tuto complété", dp.completedTutorials.length === 0);

// round-trip save/load
const ws1 = tmpWorkspace();
saveProgress(ws1, { ...dp, currentTutorial: 3, completedTutorials: [1, 2] });
const reloaded = loadProgress(ws1);
check("round-trip: currentTutorial conservé", reloaded.currentTutorial === 3);
check("round-trip: completedTutorials conservé", JSON.stringify(reloaded.completedTutorials) === "[1,2]");
check("le fichier de progression existe", fs.existsSync(path.join(ws1, TUTORIAL_PROGRESS_FILE)));

// load tolérant sur fichier corrompu
const ws2 = tmpWorkspace();
fs.writeFileSync(path.join(ws2, TUTORIAL_PROGRESS_FILE), "{ pas du json valide");
const recovered = loadProgress(ws2);
check("fichier corrompu → progression par défaut", recovered.currentTutorial === 1 && recovered.completedTutorials.length === 0);

// load sur workspace vierge
const ws3 = tmpWorkspace();
check("workspace vierge → progression par défaut", loadProgress(ws3).currentTutorial === 1);

// markStepComplete idempotent
const ws4 = tmpWorkspace();
markStepComplete(ws4, 1, "t1-welcome");
const afterTwice = markStepComplete(ws4, 1, "t1-welcome");
check("markStepComplete idempotent (pas de doublon)", afterTwice.steps["1"].length === 1);
markStepComplete(ws4, 1, "t1-prompt-card");
check("markStepComplete cumule les étapes distinctes", loadProgress(ws4).steps["1"].length === 2);

// markTutorialComplete idempotent + avance le curseur
const ws5 = tmpWorkspace();
markTutorialComplete(ws5, 1);
const afterDup = markTutorialComplete(ws5, 1);
check("markTutorialComplete idempotent", afterDup.completedTutorials.length === 1);
check("markTutorialComplete avance le curseur au tuto suivant", afterDup.currentTutorial === 2);

// nextTutorialId
const ws6 = tmpWorkspace();
check("nextTutorialId vierge = 1", nextTutorialId(loadProgress(ws6)) === 1);
markTutorialComplete(ws6, 1);
markTutorialComplete(ws6, 2);
check("nextTutorialId après 1&2 = 3", nextTutorialId(loadProgress(ws6)) === 3);
const allDone = { ...defaultProgress(), completedTutorials: Array.from({ length: TUTORIAL_COUNT }, (_, i) => i + 1) };
check("nextTutorialId tous terminés = null", nextTutorialId(allDone) === null);

// normalisation : valeurs hors bornes nettoyées
const ws7 = tmpWorkspace();
fs.writeFileSync(
  path.join(ws7, TUTORIAL_PROGRESS_FILE),
  JSON.stringify({ currentTutorial: 99, completedTutorials: [1, 1, 42, 2], steps: [] }),
);
const norm = loadProgress(ws7);
check("normalisation: currentTutorial hors borne → 1", norm.currentTutorial === 1);
check("normalisation: completedTutorials dédupliqués + bornés", JSON.stringify(norm.completedTutorials) === "[1,2]");
check("normalisation: steps tableau → objet vide", !Array.isArray(norm.steps) && typeof norm.steps === "object");

// cleanup
for (const ws of [ws1, ws2, ws3, ws4, ws5, ws6, ws7]) {
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

console.log("═".repeat(60));
if (fail === 0) {
  console.log(`✅ All ${pass}/${pass} checks passed.`);
} else {
  console.log(`❌ ${fail} check(s) failed (${pass} passed).`);
  process.exit(1);
}
