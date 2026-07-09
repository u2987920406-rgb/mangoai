// Tests purs (askLLM mocké) du moteur d'apprentissage tutoriel (#56 Chantier C).
// Lancer : npx tsx src/test-tutorial-feedback.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processTutorialFeedback, loadTutorialAxioms } from "../tutorial-feedback.js";
import { AXIOMS_FILE_NAME } from "../axioms.js";

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
function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mango-tutfb-"));
}
function readAxioms(ws: string): string {
  try {
    return fs.readFileSync(path.join(ws, AXIOMS_FILE_NAME), "utf8");
  } catch {
    return "";
  }
}

// Un faux "cerveau" qui renvoie un axiome conforme, en répercutant le tag reçu.
function fakeAsk(returnText: (user: string) => string) {
  return { ask: async (_s: string, user: string) => returnText(user) };
}

console.log("═".repeat(60));
console.log("tutorial-feedback — extraction d'axiome tagué");
console.log("─".repeat(60));

// 👍 → catégorie UX, tag validé-utilisateur + [tutoriel-N]
{
  const ws = tmp();
  await processTutorialFeedback(
    ws,
    { tutorialId: 2, stepId: "t2-feedback", rating: "like", comment: "j'aime les couleurs chaudes" },
    fakeAsk(() => "AXIOME-UX-XX [candidat] [validé-utilisateur] [tutoriel-2]\n- Contexte: cadrage\n- Piège: gris froid\n- Règle d'or: privilégier des tons chauds\n- Source: 👍 tutoriel 2"),
  );
  const ax = readAxioms(ws);
  check("👍 : axiome écrit dans .axioms.md", ax.includes("AXIOME-UX-XX"));
  check("👍 : tag [tutoriel-2] présent", ax.includes("[tutoriel-2]"));
  check("👍 : tag [validé-utilisateur] présent", ax.includes("[validé-utilisateur]"));
  fs.rmSync(ws, { recursive: true, force: true });
}

// 👎 → catégorie AVOID
{
  const ws = tmp();
  await processTutorialFeedback(
    ws,
    { tutorialId: 3, stepId: "t3-x", rating: "dislike", comment: "trop chargé" },
    fakeAsk(() => "AXIOME-AVOID-XX [candidat] [à-éviter] [tutoriel-3]\n- Contexte: layout\n- Piège: surcharge\n- Règle d'or: aérer\n- Source: 👎 tutoriel 3"),
  );
  const ax = readAxioms(ws);
  check("👎 : axiome AVOID écrit", ax.includes("AXIOME-AVOID-XX") && ax.includes("[tutoriel-3]"));
  fs.rmSync(ws, { recursive: true, force: true });
}

// Garde-fou : si le modèle oublie le tag tutoriel, on le ré-injecte
{
  const ws = tmp();
  await processTutorialFeedback(
    ws,
    { tutorialId: 4, stepId: "s", rating: "like" },
    fakeAsk(() => "AXIOME-UX-XX [candidat] [validé-utilisateur]\n- Contexte: x\n- Règle d'or: y\n- Source: 👍 tutoriel 4"),
  );
  check("tag tutoriel ré-injecté si oublié par le modèle", readAxioms(ws).includes("[tutoriel-4]"));
  fs.rmSync(ws, { recursive: true, force: true });
}

// Réponse non conforme (ne commence pas par AXIOME-) → rien écrit
{
  const ws = tmp();
  await processTutorialFeedback(ws, { tutorialId: 1, stepId: "s", rating: "like" }, fakeAsk(() => "Bonjour, voici mon analyse…"));
  check("réponse non conforme → aucun axiome écrit", readAxioms(ws) === "");
  fs.rmSync(ws, { recursive: true, force: true });
}

// Entrée invalide → no-op, jamais de throw
{
  const ws = tmp();
  await processTutorialFeedback(ws, { tutorialId: 0, stepId: "", rating: "like" }, fakeAsk(() => "AXIOME-UX-XX [tutoriel-0]"));
  check("entrée invalide → no-op", readAxioms(ws) === "");
  fs.rmSync(ws, { recursive: true, force: true });
}

// deps qui throw → avalé, pas d'exception
{
  const ws = tmp();
  let threw = false;
  try {
    await processTutorialFeedback(ws, { tutorialId: 1, stepId: "s", rating: "like" }, { ask: async () => { throw new Error("réseau"); } });
  } catch {
    threw = true;
  }
  check("erreur de synthèse avalée (ne throw pas)", !threw && readAxioms(ws) === "");
  fs.rmSync(ws, { recursive: true, force: true });
}

console.log("─".repeat(60));
console.log("loadTutorialAxioms — ne renvoie que les axiomes tutoriel");
console.log("─".repeat(60));

{
  const ws = tmp();
  const content = [
    "AXIOME-UX-01 [confirmé] [validé-utilisateur]\n- Règle d'or: règle non-tutoriel",
    "AXIOME-UX-02 [candidat] [validé-utilisateur] [tutoriel-2]\n- Règle d'or: tons chauds au cadrage",
    "AXIOME-AVOID-03 [candidat] [à-éviter] [tutoriel-3]\n- Contexte: layout\n- Piège: surcharge",
  ].join("\n\n");
  fs.writeFileSync(path.join(ws, AXIOMS_FILE_NAME), content + "\n");
  const learned = loadTutorialAxioms(ws);
  check("2 axiomes tutoriel extraits (l'axiome non-tutoriel exclu)", learned.length === 2);
  check("la Règle d'or est privilégiée quand présente", learned.includes("tons chauds au cadrage"));
  check("fallback en-tête quand pas de Règle d'or", learned.some((l) => l.includes("[tutoriel-3]")));
  check("axiome non-tutoriel jamais inclus", !learned.some((l) => l.includes("non-tutoriel")));
  fs.rmSync(ws, { recursive: true, force: true });
}

check("workspace vierge → []", loadTutorialAxioms(tmp()).length === 0);

console.log("═".repeat(60));
if (fail === 0) {
  console.log(`✅ All ${pass}/${pass} checks passed.`);
} else {
  console.log(`❌ ${fail} check(s) failed (${pass} passed).`);
  process.exit(1);
}
