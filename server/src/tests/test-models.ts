// Tests déterministes du registre de profils modèle (sans réseau, sans Ollama).
// Vérifie : résolution Gemma, repli GENERIC (dont les anciens noms Qwen retirés),
// régime WRITE-ONLY de Gemma (pas de <edit> dans son system).
//
// Lancer :  npx tsx src/test-models.ts

import { resolveProfile } from "../models/profile.js";
import { gemmaProfile } from "../models/gemma.js";
import { qwythosProfile } from "../models/qwythos.js";
import { qwythosToolsProfile } from "../models/qwythos-tools.js";
import { qwen3Profile } from "../models/qwen3.js";
import { llama3GroqToolUseProfile } from "../models/llama3-groq-tool-use.js";
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

// [8] Qwythos — résolution (2026-07-14, trouvé en testant "3 apps complexes")
console.log("\n  [8] resolveProfile → famille qwythos :");
check('hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K → qwythos', resolveProfile("hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K").id === "qwythos");
check('hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q8_0 → qwythos', resolveProfile("hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q8_0").id === "qwythos");
check('qwen2.5-coder:14b reste generic (pas de faux-positif "qwen")', resolveProfile("qwen2.5-coder:14b").id === "generic");
check('qwen3-vl:8b reste generic (modèle vision, pas Qwythos)', resolveProfile("qwen3-vl:8b").id === "generic");

// [9] Qwythos — le prompt n'invente AUCUN outil absent du chemin contrat
console.log("\n  [9] Qwythos — prompt honnête (pas de faux outils) :");
check('système offre <write>', qwythosProfile.system.includes("<write"));
check('système offre <edit>', qwythosProfile.system.includes("<edit"));
check('système offre <run>', qwythosProfile.system.includes("<run"));
check("système INTERDIT explicitement chercher_image/list_files/planifier/teste_parcours via <run>",
  /N'essaie JAMAIS d'invoquer un nom d'outil/.test(qwythosProfile.system) &&
  qwythosProfile.system.includes("chercher_image") && qwythosProfile.system.includes("list_files"));
check('système clarifie la commande EXACTE de build (npm run build, pas "vite" nu)',
  qwythosProfile.system.includes("<run>npm run build</run>") && qwythosProfile.system.includes('jamais "vite" seul'));
check('système autorise des URLs Pexels directes (réparées après coup)', qwythosProfile.system.includes("pexels"));

// [10] Qwythos — caps relevés (2 → 6, une tâche ambitieuse a besoin de marge)
console.log("\n  [10] Qwythos — caps :");
check('maxAttempts = 6 (relevé depuis le défaut GENERIC=2)', qwythosProfile.caps.maxAttempts === 6);
check('axiomFiles inclut .axioms.qwythos.md', qwythosProfile.axiomFiles.includes(".axioms.qwythos.md"));

// [11] Qwen3 officiel + Llama3-Groq-Tool-Use (2026-07-14, comparaison agentique)
console.log("\n  [11] resolveProfile → qwen3 / llama3-groq-tool-use :");
check('qwen3:8b → qwen3', resolveProfile("qwen3:8b").id === "qwen3");
check('qwen3:14b → qwen3', resolveProfile("qwen3:14b").id === "qwen3");
check('qwen3-vl:8b (vision) reste generic — pas de collision', resolveProfile("qwen3-vl:8b").id === "generic");
check('qwen3.5:cloud reste generic — pas de collision avec Qwythos', resolveProfile("qwen3.5:cloud").id === "generic");
check('llama3-groq-tool-use:8b → llama3-groq-tool-use', resolveProfile("llama3-groq-tool-use:8b").id === "llama3-groq-tool-use");

console.log("\n  [12] Qwen3 / Llama3-Groq — agentic:true (contrairement à Qwythos) :");
check('qwen3Profile.agentic === true', qwen3Profile.agentic === true);
check('llama3GroqToolUseProfile.agentic === true', llama3GroqToolUseProfile.agentic === true);
check('qwythosProfile.agentic reste falsy (chemin contrat, pas de tools natifs)', !qwythosProfile.agentic);

// [13] Qwythos-tools (2026-07-14) — mêmes poids que Qwythos, template Qwen3.5
// corrigé (ChatML + <tool_call>) : Ollama annonce alors "tools" (vérifié en réel via
// `ollama show qwythos-tools:q6`). L'ORDRE dans PROFILES est ce qui garantit que
// "qwythos-tools:q6" ne retombe pas sur qwythosProfile (/qwythos/i le matcherait
// aussi) — testé explicitement ici pour ne jamais régresser silencieusement.
console.log("\n  [13] resolveProfile → qwythos-tools (priorité sur qwythosProfile) :");
check('qwythos-tools:q6 → qwythos-tools (PAS qwythos)', resolveProfile("qwythos-tools:q6").id === "qwythos-tools");
check('qwythosToolsProfile.agentic === true', qwythosToolsProfile.agentic === true);
check('hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K reste qwythos (chemin contrat, non affecté)', resolveProfile("hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K").id === "qwythos");

line("═");
console.log(failures === 0
  ? "✅ Tous les checks sont verts (Gemma #54 + Qwythos(-tools) + Qwen3/Llama3-Groq + anciens noms Qwen → GENERIC)."
  : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
