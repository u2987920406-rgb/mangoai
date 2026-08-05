// Renommé depuis test-train.ts le 2026-08-05 (refonte v3, lot 1) : le moteur de diversité
// a été extrait de train-loop.ts vers nocturnal-prompts.ts, la couverture le suit. La section
// [4] decideOllamaCircuitStop est partie avec train-loop (circuit breaker de la boucle archivée).
// Preuve déterministe du moteur de diversité de la boucle d'entraînement
// (idée 32). La boucle elle-même est réseau/Ollama + temps ; on verrouille ici
// la partie pure : composeTask injecte fond+forme, les prompts sont UNIQUES, et
// l'espace combinatoire est assez large pour une nuit entière.
//
// Lancer :  npx tsx src/test-train.ts

import { DOMAINS, STYLES, TASK_KINDS, composeTask, generateUniquePrompts } from "../nocturnal-prompts.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("train-loop — moteur de diversité");
line();

// composeTask : injecte le domaine (fond) ET le style (forme/UX)
const d = "un fleuriste haut de gamme";
const s = "brutaliste, bordures épaisses, contrastes francs, monospace";
console.log("\n  [1] composeTask :");
for (const kind of TASK_KINDS) {
  const t = composeTask(kind, d, s);
  check(`${kind} : contient domaine + style, non vide`, t.includes(d) && t.includes(s) && t.length > 30);
}

// Espace combinatoire large (≥ 3000) → jamais à court pour une nuit
console.log("\n  [2] espace combinatoire :");
const combos = TASK_KINDS.length * DOMAINS.length * STYLES.length;
check(`${TASK_KINDS.length}×${DOMAINS.length}×${STYLES.length} = ${combos} ≥ 3000`, combos >= 3000);

// generateUniquePrompts : pas de doublon, projectType renseigné
console.log("\n  [3] generateUniquePrompts :");
const gen = generateUniquePrompts(300);
check("300 prompts demandés → 300 obtenus", gen.length === 300);
const keys = new Set(gen.map((p) => `${p.kind}|${p.domain}|${p.style}`));
check("tous uniques (fond × forme × UX)", keys.size === 300);
check("chaque prompt a un projectType", gen.every((p) => typeof p.projectType === "string" && p.projectType.length > 0));
check("plafonné au nb de combos si on demande trop", generateUniquePrompts(combos + 500).length === combos);

line("═");
console.log(failures === 0 ? "✅ Moteur de diversité prouvé (unique, large, fond+forme)." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
