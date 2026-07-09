// Tests déterministes du registre de profils modèle (sans réseau, sans Ollama).
// Vérifie : résolution Gemma, repli GENERIC (dont les anciens noms Qwen retirés),
// régime WRITE-ONLY de Gemma (pas de <edit> dans son system).
//
// Lancer :  npx tsx src/test-models.ts

import { resolveProfile } from "../models/profile.js";
import { gemmaProfile } from "../models/gemma.js";
import { GENERIC } from "../models/generic.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("models — test-models (Gemma #54 + non-régression)");
line();

// [1] Résolution famille Gemma
console.log("\n  [1] resolveProfile → famille gemma :");
check('gemma4:12b → gemma', resolveProfile("gemma4:12b").id === "gemma");
check('gemma4:e4b → gemma', resolveProfile("gemma4:e4b").id === "gemma");
check('gemma3:27b → gemma', resolveProfile("gemma3:27b").id === "gemma");

// [2] Qwen retiré → ses anciens noms retombent gracieusement sur GENERIC
console.log("\n  [2] Qwen retiré → fallback GENERIC :");
check('qwen2.5-coder:14b → generic', resolveProfile("qwen2.5-coder:14b").id === "generic");
check('qwen2.5-coder:7b → generic', resolveProfile("qwen2.5-coder:7b").id === "generic");

// [3] Fallback GENERIC
console.log("\n  [3] fallback → generic :");
check('deepseek-coder → generic', resolveProfile("deepseek-coder").id === "generic");
check('llama3 → generic', resolveProfile("llama3").id === "generic");

// [4] Gemma est WRITE-ONLY
console.log("\n  [4] Gemma — régime WRITE-ONLY :");
check('system contient <write', gemmaProfile.system.includes("<write"));
check('system NE contient PAS <edit', !gemmaProfile.system.includes("<edit"));
check('system porte la RÈGLE D\'OR (fichier complet)', /RÈGLE D'OR/.test(gemmaProfile.system) && /COMPLET/.test(gemmaProfile.system));

// [5] Gemma — axiomFiles
console.log("\n  [5] Gemma — axiomFiles :");
check('inclut .axioms.md', gemmaProfile.axiomFiles.includes(".axioms.md"));
check('inclut .axioms.gemma.md', gemmaProfile.axiomFiles.includes(".axioms.gemma.md"));

// [6] Gemma — caps (valeurs de départ #54)
console.log("\n  [6] Gemma — caps :");
check('axiomCap = 6', gemmaProfile.caps.axiomCap === 6);
check('fileBudget = 14000', gemmaProfile.caps.fileBudget === 14000);
check('fileMax = 3500', gemmaProfile.caps.fileMax === 3500);
check('maxAttempts = 2', gemmaProfile.caps.maxAttempts === 2);

// [7] Gemma — escalateAppendix route .axioms.gemma.md
console.log("\n  [7] Gemma — escalateAppendix :");
check('route vers .axioms.gemma.md', gemmaProfile.escalateAppendix.includes(".axioms.gemma.md"));
check('mentionne WRITE-ONLY', gemmaProfile.escalateAppendix.includes("WRITE-ONLY"));

line("═");
console.log(failures === 0
  ? "✅ Tous les checks sont verts (Gemma #54 + anciens noms Qwen → GENERIC)."
  : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
