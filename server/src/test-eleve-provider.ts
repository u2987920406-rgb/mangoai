// Preuve déterministe du sélecteur de provider de l'Élève (« Élève turbo »).
// Les appels réseau (Ollama / API OpenAI) ne sont pas testés ici ; on verrouille
// les deux helpers PURS qui décident où va l'Élève : normalizeEleveProvider et
// completionsUrl (tolérance base/endpoint).
//
// Lancer :  npx tsx src/test-eleve-provider.ts

import { normalizeEleveProvider, completionsUrl } from "./eleve.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("eleve — sélecteur de provider (turbo)");
line();

console.log("\n  [1] normalizeEleveProvider :");
check("'openai' → openai", normalizeEleveProvider("openai") === "openai");
check("'OpenAI ' (casse/espaces) → openai", normalizeEleveProvider("OpenAI ") === "openai");
check("'ollama' → ollama", normalizeEleveProvider("ollama") === "ollama");
check("undefined → ollama (défaut sûr)", normalizeEleveProvider(undefined) === "ollama");
check("valeur inconnue → ollama (défaut sûr)", normalizeEleveProvider("deepseek") === "ollama");

console.log("\n  [2] completionsUrl :");
check("base /v1 → +/chat/completions", completionsUrl("https://api.deepseek.com/v1") === "https://api.deepseek.com/v1/chat/completions");
check("slash final toléré", completionsUrl("https://api.deepseek.com/v1/") === "https://api.deepseek.com/v1/chat/completions");
check("endpoint complet inchangé", completionsUrl("https://x.ai/v1/chat/completions") === "https://x.ai/v1/chat/completions");

line("═");
console.log(failures === 0 ? "✅ Sélecteur de provider prouvé (défaut ollama sûr)." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
