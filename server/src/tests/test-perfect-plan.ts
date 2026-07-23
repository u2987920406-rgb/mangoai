// Lancer : npx tsx src/test-perfect-plan.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PERFECT_PLAN_QUESTIONS,
  hasContract,
  loadContract,
  saveContract,
  deleteContract,
  perfectPlanSection,
  parseQuestionIds,
  selectRelevantQuestions,
} from "../perfect-plan.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pp-test-"));
}

console.log("─".repeat(60));
console.log("test-perfect-plan");
console.log("─".repeat(60));

// 1. Structure des questions (15 Perfect Plan + 15 Gros chantier = 30)
check("30 questions définies", PERFECT_PLAN_QUESTIONS.length === 30);
check("première question = type", PERFECT_PLAN_QUESTIONS[0]?.id === "type");
check("ids uniques", new Set(PERFECT_PLAN_QUESTIONS.map((q) => q.id)).size === PERFECT_PLAN_QUESTIONS.length);
for (const q of PERFECT_PLAN_QUESTIONS) {
  check(`${q.id} — au moins 2 options`, q.options.length >= 2);
}

// 2. hasContract — absent par défaut
const dir1 = tmpDir();
check("hasContract false quand absent", !hasContract(dir1));
check("loadContract null quand absent", loadContract(dir1) === null);
fs.rmSync(dir1, { recursive: true });

// 3. saveContract + hasContract + loadContract
const dir2 = tmpDir();
saveContract(dir2, {
  answers: [{ id: "type", value: "webapp", label: "App web" }],
  refs: [],
});
check("hasContract true après save", hasContract(dir2));
const c2 = loadContract(dir2)!;
check("loadContract retourne les answers", c2.answers[0].value === "webapp");
check("loadContract ajoute createdAt", Boolean(c2.createdAt));
check("refs vide quand non fourni", Array.isArray(c2.refs) && c2.refs.length === 0);
check("kind absent quand non fourni (rétrocompat)", c2.kind === undefined);
fs.rmSync(dir2, { recursive: true });

// 3b. kind « perfect » / « chantier » persiste
const dirK = tmpDir();
saveContract(dirK, { answers: [{ id: "type", value: "webapp", label: "App web" }], refs: [], kind: "chantier" });
check("kind chantier persiste", loadContract(dirK)?.kind === "chantier");
saveContract(dirK, { answers: [{ id: "type", value: "webapp", label: "App web" }], refs: [], kind: "perfect" });
check("kind perfect persiste", loadContract(dirK)?.kind === "perfect");
fs.rmSync(dirK, { recursive: true });

// 4. deleteContract
const dir3 = tmpDir();
saveContract(dir3, { answers: [{ id: "style", value: "epure", label: "Épuré" }], refs: [] });
assert.ok(hasContract(dir3));
deleteContract(dir3);
check("deleteContract supprime le fichier", !hasContract(dir3));
deleteContract(dir3); // idempotent — ne doit pas jeter
check("deleteContract idempotent", true);
fs.rmSync(dir3, { recursive: true });

// 5. perfectPlanSection — vide sans contrat
const dir4 = tmpDir();
check("section vide sans contrat", perfectPlanSection(dir4) === "");
fs.rmSync(dir4, { recursive: true });

// 6. perfectPlanSection — contient les réponses
const dir5 = tmpDir();
saveContract(dir5, {
  answers: [
    { id: "type", value: "webapp", label: "App web" },
    { id: "style", value: "epure", label: "Épuré & minimaliste" },
  ],
  refs: [],
});
const s5 = perfectPlanSection(dir5);
check("section contient PERFECT PLAN", s5.includes("PERFECT PLAN"));
check("section contient App web", s5.includes("App web"));
check("section contient la valeur webapp", s5.includes("webapp"));
check("section contient Épuré", s5.includes("Épuré"));
fs.rmSync(dir5, { recursive: true });

// 7. perfectPlanSection — refs présentes
const dir6 = tmpDir();
saveContract(dir6, {
  answers: [{ id: "type", value: "vitrine", label: "Site vitrine" }],
  refs: [
    { kind: "url", value: "https://apple.com", label: "référence" },
    { kind: "palette", value: "#000000, #ffffff" },
    { kind: "note", value: "très épuré" },
  ],
});
const s6 = perfectPlanSection(dir6);
check("section contient apple.com", s6.includes("apple.com"));
check("section mentionne sharingan_url", s6.includes("sharingan_url"));
check("section contient la palette", s6.includes("#000000"));
check("section contient la contrainte note", s6.includes("très épuré"));
fs.rmSync(dir6, { recursive: true });

// 8. perfectPlanSection — refs vides filtrées
const dir7 = tmpDir();
saveContract(dir7, {
  answers: [{ id: "ambiance", value: "tech", label: "Moderne" }],
  refs: [{ kind: "url", value: "   " }],
});
const s7 = perfectPlanSection(dir7);
check("refs vides filtrées (pas de section Références)", !s7.includes("Références imposées"));
fs.rmSync(dir7, { recursive: true });

// 9. perfectPlanSection — règle clarification présente
const dir8 = tmpDir();
saveContract(dir8, {
  answers: [{ id: "data", value: "memory", label: "En mémoire" }],
  refs: [],
});
const s8 = perfectPlanSection(dir8);
check("règle clarification présente", s8.includes("clarification"));
check("règle d'application présente", s8.includes("Règles d'application"));
fs.rmSync(dir8, { recursive: true });

// 10. saveContract crée le répertoire si absent
const dir9 = path.join(os.tmpdir(), `pp-newdir-${Date.now()}`);
saveContract(dir9, { answers: [{ id: "type", value: "jeu", label: "Jeu" }], refs: [] });
check("saveContract crée le répertoire", hasContract(dir9));
fs.rmSync(dir9, { recursive: true });

console.log("─".repeat(60));
console.log("test-perfect-plan — #196 partie B : sélection ciblée (parseQuestionIds/selectRelevantQuestions)");
console.log("─".repeat(60));

// 11. parseQuestionIds — extraction tolérante, ids valides du catalogue
{
  const ids = parseQuestionIds('```json\n["type","objectif","style"]\n```');
  check("parseQuestionIds extrait les ids valides", ids.length === 3 && ids.includes("style"));
}
{
  // id hors catalogue ("inexistant") écarté, id valide conservé
  const ids = parseQuestionIds('["type","inexistant","objectif"]');
  check("parseQuestionIds écarte les ids hors catalogue", ids.length === 2 && !ids.includes("inexistant"));
}
{
  // doublons dédupliqués
  const ids = parseQuestionIds('["type","type","objectif"]');
  check("parseQuestionIds déduplique", ids.length === 2);
}
{
  // plafonné à maxCount
  const ids = parseQuestionIds(JSON.stringify(PERFECT_PLAN_QUESTIONS.map((q) => q.id)), 5);
  check("parseQuestionIds plafonne à maxCount", ids.length === 5);
}
{
  check("parseQuestionIds hors-format → []", parseQuestionIds("pas du JSON du tout").length === 0);
  check("parseQuestionIds objet (pas un tableau) → []", parseQuestionIds('{"a":1}').length === 0);
}

// 12. selectRelevantQuestions — ask injecté (patron generateLayoutVariants), jamais de vrai appel réseau
{
  const ask = async () => JSON.stringify(["type", "objectif", "audience", "data", "backend", "paiement", "recherche"]);
  const ids = await selectRelevantQuestions("une boutique e-commerce avec paiement et recherche produits", 8, { ask });
  check("e-commerce sélectionne paiement", ids.includes("paiement"));
  check("e-commerce sélectionne recherche", ids.includes("recherche"));
}
{
  const ask = async () => JSON.stringify(["type", "objectif", "audience", "style", "data", "priorite"]);
  const ids = await selectRelevantQuestions("une todo-list simple, liste + ajout + coche fait", 8, { ask });
  check("todo-list n'inclut pas paiement", !ids.includes("paiement"));
  check("todo-list n'inclut pas i18n", !ids.includes("i18n"));
}
{
  // Échec réseau → repli honnête (jamais un throw, jamais un gate bloqué)
  const ask = async (): Promise<string> => { throw new Error("injoignable"); };
  const ids = await selectRelevantQuestions("app quelconque", 8, { ask });
  check("échec réseau → repli sur DEFAULT_QUESTION_IDS", ids.length > 0 && ids.every((id) => PERFECT_PLAN_QUESTIONS.some((q) => q.id === id)));
}
{
  // Réponse toujours hors-format → repli honnête, jamais un tableau vide bloquant
  const ask = async (): Promise<string> => "n'importe quoi";
  const ids = await selectRelevantQuestions("app quelconque", 8, { ask });
  check("hors-format → repli non-vide", ids.length > 0);
}
{
  // Réponse avec uniquement des ids invalides → filtrée à vide → repli honnête (pas [])
  const ask = async () => JSON.stringify(["bidon1", "bidon2"]);
  const ids = await selectRelevantQuestions("app quelconque", 8, { ask });
  check("uniquement ids invalides → repli non-vide", ids.length > 0);
}
{
  // jamais plus de maxCount ids renvoyés, même si l'ask en renvoie davantage
  const ask = async () => JSON.stringify(PERFECT_PLAN_QUESTIONS.map((q) => q.id));
  const ids = await selectRelevantQuestions("app quelconque", 6, { ask });
  check("jamais plus de maxCount ids", ids.length <= 6);
}

console.log("─".repeat(60));
if (failures === 0) {
  console.log(`✅ ${PERFECT_PLAN_QUESTIONS.length + 27 + 14} vérifications passées`);
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec`);
  process.exit(1);
}
