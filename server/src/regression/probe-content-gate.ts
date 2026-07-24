// Sonde EN RÉEL du volet CONTENU (#196 fault-finding, plan cohérence de contenu,
// 2026-07-24) — VRAI appel au juge LLM (dispatch("juge", ...), pas de mock), même
// discipline que probe-fault-corpus.ts (MangoQA, nuit précédente) : la preuve, pas
// la théorie. Rejoue la fixture EXACTE « quiz-toujours-a » de cette sonde-là contre
// le nouveau checkContent(), et les 2 formes (per-entry vs table nommée) de la
// fixture « constante-physique-fausse » contre checkConstants() (déterministe, 0 LLM)
// pour documenter honnêtement la limite trouvée en construisant la Partie 1.
//
// Exécution : npx tsx src/regression/probe-content-gate.ts (PAS `npm test` — vrai
// réseau/LLM, coûte du temps, non déterministe par nature du juge).
import { checkContent, realContentDeps, type DataFile } from "../eleve-gate-content.js";
import { checkConstants } from "../eleve-gate-constants.js";

// Réutilise le VRAI judge exporté (realContentDeps.judge) — PAS une réimplémentation
// locale : ce dernier porte le timeout étendu (90s, cf. eleve-gate-content.ts) trouvé
// nécessaire en vérifiant CETTE sonde en réel (1er essai à 45s → sautee=true, timeout).
const dispatchReel = realContentDeps.judge;

// Fixture IDENTIQUE à `quiz-toujours-a` dans MangoQA (D:\IA\MangoQA\tests\manual\
// fault-corpus-data.ts) — MISSED cette nuit par les 6 branches MangoQA (aucune n'a
// vocation à vérifier la correction sémantique d'une donnée).
const QUIZ_TOUJOURS_A: DataFile = {
  path: "src/data/quiz-questions.ts",
  content: `export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { question: "Quelle est la capitale de la France ?", options: ["Paris", "Lyon", "Marseille", "Nice"], correctIndex: 0 },
  { question: "Combien font 2 + 2 ?", options: ["3", "5", "4", "6"], correctIndex: 0 },
  { question: "Quel est le plus grand océan ?", options: ["Atlantique", "Indien", "Arctique", "Pacifique"], correctIndex: 0 },
  { question: "Qui a peint la Joconde ?", options: ["Van Gogh", "Picasso", "Monet", "Léonard de Vinci"], correctIndex: 0 },
  { question: "Quelle planète est la plus proche du Soleil ?", options: ["Vénus", "Terre", "Mercure", "Mars"], correctIndex: 0 },
];`,
};

// Fixture IDENTIQUE (valeur) à `constante-physique-fausse` MangoQA — forme TABLE
// NOMMÉE (Record<Planète, number>, unité seulement dans le nom de la constante).
const PERIODE_FAUSSE_TABLE = `export const ORBITAL_PERIOD_DAYS = {
  Mercure: 88, Venus: 225, Terre: 365, Mars: 687,
  Jupiter: 4333, Saturne: 29, Uranus: 30687, Neptune: 60190,
};`;

// Même valeur fausse, forme PER-ENTRY (mot "période" physiquement adjacent au nom
// de la planète) — la forme que le détecteur déterministe PEUT voir par construction.
const PERIODE_FAUSSE_PER_ENTRY = `const saturne = { nom: "Saturne", periodeJours: 29 };`;

async function main(): Promise<void> {
  console.log("═".repeat(72));
  console.log("Sonde volet CONTENU — avant/après le gap trouvé la nuit précédente");
  console.log("═".repeat(72));

  let overallPass = true;

  console.log("\n▶ quiz-toujours-a (checkContent, VRAI juge LLM)");
  const contentVerdict = await checkContent([QUIZ_TOUJOURS_A], dispatchReel);
  console.log(`  applicable=${contentVerdict.applicable} ok=${contentVerdict.ok} sautee=${contentVerdict.sautee}`);
  if (contentVerdict.raisons.length) console.log(`  raison : ${contentVerdict.raisons[0]}`);
  const contentCaught = contentVerdict.applicable && !contentVerdict.sautee && !contentVerdict.ok;
  console.log(`  ${contentCaught ? "✅ CAUGHT" : "❌ MISSED"} — AVANT ce plan : MISSED (0/6 branches MangoQA, prouvé cette nuit).`);
  overallPass &&= contentCaught;

  console.log("\n▶ constante-physique-fausse — forme PER-ENTRY (checkConstants, déterministe)");
  const perEntry = checkConstants(PERIODE_FAUSSE_PER_ENTRY);
  console.log(`  applicable=${perEntry.applicable} ok=${perEntry.ok}`);
  if (perEntry.raisons.length) console.log(`  raison : ${perEntry.raisons[0]}`);
  const perEntryCaught = perEntry.applicable && !perEntry.ok;
  console.log(`  ${perEntryCaught ? "✅ CAUGHT" : "❌ MISSED"} — AVANT la Partie 1 : MISSED (seule la vitesse était couverte, pas la période).`);
  overallPass &&= perEntryCaught;

  console.log("\n▶ constante-physique-fausse — forme TABLE NOMMÉE (checkConstants, déterministe)");
  const table = checkConstants(PERIODE_FAUSSE_TABLE);
  console.log(`  applicable=${table.applicable} ok=${table.ok}`);
  const tableMissed = !table.applicable || table.ok;
  console.log(`  ${tableMissed ? "⚠️  MISSED (limite honnête assumée)" : "✅ CAUGHT (mieux que prévu)"}`);
  console.log(
    "  Limite documentée (Partie 1, eleve-gate-constants.ts) : le détecteur PUR cherche un mot « période/vitesse »\n" +
      "  PHYSIQUEMENT ADJACENT au nom de la planète — une table nommée UNE FOIS au niveau de la déclaration\n" +
      "  (le nom de variable seul porte l'unité) reste un angle mort ASSUMÉ de ce détecteur déterministe étroit.\n" +
      "  C'est exactement le cas que le volet CONTENU (juge LLM lisant le fichier entier) couvre à sa place.",
  );

  console.log(`\n${"═".repeat(72)}`);
  console.log(
    overallPass
      ? "✅ Sonde : le volet CONTENU + la période per-entry ferment les 2 cas visés (table nommée = limite honnête documentée, pas un échec de ce plan)."
      : "❌ Sonde : au moins un cas visé par le plan n'est PAS attrapé.",
  );
  console.log("═".repeat(72));

  // exitCode (pas process.exit direct) : laisse Node fermer proprement les handles
  // async encore en vol (fetch/AbortController du dispatch LLM) — un exit() abrupt ici
  // a provoqué un crash natif libuv sur Windows en vérification (assertion UV_HANDLE_
  // CLOSING), inoffensif pour le résultat déjà imprimé mais évitable proprement.
  process.exitCode = overallPass ? 0 : 1;
}

main().catch((err) => {
  console.error("[probe-content-gate] erreur fatale :", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
