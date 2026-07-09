// T0 — ORACLE de non-régression des DEUX chaînes de résolution d'endpoint
// openai-compat de MangoOS. But : figer, AVANT toute consolidation (chantier
// #2 « point d'entrée cerveau unique »), l'URL finale + l'en-tête Authorization
// (ou son absence) réellement émis par chacun des deux chemins parallèles :
//
//   • famille 'engine' → llm-engine.ts : askLLM → askOpenAI
//     (résolveurs resolvePresetEndpoint / resolveLitellmEndpoint + repli inline).
//     Cette famille INCLUT LLM_OPENAI_URL / LLM_OPENAI_KEY dans ses replis.
//   • famille 'eleve'  → eleve.ts : chatEleve → askEleveOpenAI → openAiEndpoint.
//     Cette famille N'INCLUT PAS LLM_OPENAI_URL / LLM_OPENAI_KEY, et IGNORE le
//     baseUrl override pour les presets deepseek/mistral/groq.
//
// Ces divergences (le « piège » décisif du plan) sont capturées ici sur le fil :
// un FAUX serveur http.createServer reçoit les requêtes des combos routables et
// note (url, Authorization) réellement envoyés ; les combos preset non-routables
// (base codée en dur) sont capturés au niveau du résolveur exporté. Le tout est
// figé en golden byte-identique. T1 (refactor de plomberie pur) DOIT le laisser
// intact — la moindre différence = régression, pas une mise à jour de golden.
//
// 100 % offline, déterministe : aucun vrai LLM, aucun réseau sortant.
// Lancer :  npx tsx src/test-llm-endpoint-oracle.ts
// Régénérer le golden (état de référence) :  UPDATE_ORACLE_GOLDEN=1 npx tsx src/test-llm-endpoint-oracle.ts

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(__dirname, "test-llm-endpoint-oracle.golden.json");

// ── 1. Faux serveur openai-compat : répond 200 à tout, note la dernière requête ──
let lastReq: { url: string; auth: string } | null = null;
const server = http.createServer((req, res) => {
  lastReq = { url: req.url ?? "", auth: (req.headers["authorization"] as string) ?? "(aucun en-tête Authorization)" };
  // Draine le corps puis répond un payload openai-compat minimal valide (les deux
  // transports lisent choices[0].message.content).
  req.on("data", () => {});
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const HOST = `127.0.0.1:${port}`;
const base = (seg: string) => `http://${HOST}/${seg}/v1`;

// ── 2. ENV déterministe, posé AVANT le premier import (eleve.ts fige
//        ELEVE_API_URL / ELEVE_API_KEY en const au chargement du module). Chaque
//        source d'URL vise le MÊME faux serveur mais par un CHEMIN distinct : le
//        chemin capturé révèle donc quelle source de repli chaque famille a prise.
//        Chaque clé porte une valeur sentinelle distincte : l'Authorization
//        capturé révèle quelle chaîne de clé a été prise. ──────────────────────
for (const k of ["DEEPSEEK_API_KEY", "MISTRAL_API_KEY", "GROQ_API_KEY", "LLM_OPENAI_URL", "LLM_OPENAI_KEY",
  "ELEVE_API_URL", "ELEVE_API_KEY", "LITELLM_BASE_URL", "LITELLM_API_KEY", "LLM_PROVIDER", "ELEVE_PROVIDER",
  "CUSTOM_KEY_X", "ABSENT_VAR"]) delete process.env[k];

process.env.LLM_OPENAI_URL = base("src-LLM_OPENAI_URL");
process.env.LLM_OPENAI_KEY = "k-LLM_OPENAI_KEY";
process.env.ELEVE_API_URL = base("src-ELEVE_API_URL");
process.env.ELEVE_API_KEY = "k-ELEVE_API_KEY";
process.env.LITELLM_BASE_URL = base("src-LITELLM_BASE_URL");
process.env.LITELLM_API_KEY = "k-LITELLM_API_KEY";
process.env.DEEPSEEK_API_KEY = "k-DEEPSEEK_API_KEY";
process.env.MISTRAL_API_KEY = "k-MISTRAL_API_KEY";
process.env.GROQ_API_KEY = "k-GROQ_API_KEY";
process.env.CUSTOM_KEY_X = "k-CUSTOM_KEY_X";
// ABSENT_VAR volontairement JAMAIS posée (teste le repli fail-open).

const { askLLM } = await import("../llm/llm-engine.js");
const { resolvePresetEndpoint, resolveLitellmEndpoint } = await import("../llm/llm-engine.js");
const { chatEleve, openAiEndpoint, completionsUrl } = await import("../eleve.js");

type LLMProvider = "claude" | "ollama" | "openai" | "deepseek" | "mistral" | "groq" | "litellm";
type Override = { baseUrl?: string; apiKeyEnv?: string };
const OVR_BASE = base("ovr-baseUrl");

// Normalise l'URL capturée : le port est aléatoire à chaque run → on le remplace
// par un token stable pour un golden reproductible.
const norm = (u: string) => u.replaceAll(HOST, "FAUX_HOST");

type Row = { id: string; family: "engine" | "eleve"; provider: string; override: string; capture: string; url: string; authorization: string };
const rows: Row[] = [];

// ── 3a. Combos ROUTABLES : on PILOTE le vrai transport, le faux serveur capture
//        l'URL + l'Authorization réellement émis sur le fil. ─────────────────────
async function driveEngine(id: string, provider: LLMProvider, ovr: Override, label: string) {
  lastReq = null;
  try {
    await askLLM("sys", "usr", { provider, model: "m", maxTokens: 8, timeoutMs: 10_000, baseUrl: ovr.baseUrl, apiKeyEnv: ovr.apiKeyEnv });
  } catch (e) {
    rows.push({ id, family: "engine", provider, override: label, capture: "throw", url: "(aucune requête)", authorization: `(absente — le transport lève : ${(e as Error).message})` });
    return;
  }
  rows.push({ id, family: "engine", provider, override: label, capture: "faux-serveur", url: norm(lastReq!.url), authorization: lastReq!.auth });
}

async function driveEleve(id: string, provider: LLMProvider, ovr: Override, label: string) {
  lastReq = null;
  try {
    await chatEleve("sys", "usr", "m", provider, { baseUrl: ovr.baseUrl, apiKeyEnv: ovr.apiKeyEnv });
  } catch (e) {
    rows.push({ id, family: "eleve", provider, override: label, capture: "throw", url: "(aucune requête)", authorization: `(absente — le transport lève : ${(e as Error).message})` });
    return;
  }
  rows.push({ id, family: "eleve", provider, override: label, capture: "faux-serveur", url: norm(lastReq!.url), authorization: lastReq!.auth });
}

// ENGINE (askLLM → askOpenAI). openai/litellm routables via replis ; presets via baseUrl override.
await driveEngine("E1", "openai", {}, "aucun override");
await driveEngine("E2", "openai", { baseUrl: OVR_BASE }, "baseUrl=ovr");
await driveEngine("E3", "openai", { apiKeyEnv: "CUSTOM_KEY_X" }, "apiKeyEnv=CUSTOM_KEY_X");
await driveEngine("E4", "openai", { apiKeyEnv: "ABSENT_VAR" }, "apiKeyEnv=ABSENT_VAR (fail-open)");
await driveEngine("E5", "deepseek", { baseUrl: OVR_BASE }, "baseUrl=ovr");
await driveEngine("E6", "deepseek", { baseUrl: OVR_BASE, apiKeyEnv: "CUSTOM_KEY_X" }, "baseUrl=ovr + apiKeyEnv=CUSTOM_KEY_X");
await driveEngine("E7", "litellm", {}, "aucun override");
await driveEngine("E8", "litellm", { baseUrl: OVR_BASE }, "baseUrl=ovr");

// ELEVE (chatEleve → askEleveOpenAI). openai/litellm routables ; presets NON (base codée en dur).
await driveEleve("V1", "openai", {}, "aucun override");
await driveEleve("V2", "openai", { baseUrl: OVR_BASE }, "baseUrl=ovr");
await driveEleve("V3", "openai", { apiKeyEnv: "CUSTOM_KEY_X" }, "apiKeyEnv=CUSTOM_KEY_X");
await driveEleve("V4", "openai", { apiKeyEnv: "ABSENT_VAR" }, "apiKeyEnv=ABSENT_VAR (fail-open)");
await driveEleve("V5", "litellm", {}, "aucun override");

// ── 3b. Combos PRESET non-routables (base codée en dur → on ne pilote PAS de vraie
//        requête vers un hôte réel) : capture au niveau du résolveur exporté.
//        L'URL finale = même normalisation que le transport (completionsUrl est
//        byte-identique à la normalisation inline d'askOpenAI). ─────────────────
function fromResolver(id: string, family: "engine" | "eleve", provider: LLMProvider, ovr: Override, label: string, r: { url: string; key: string }) {
  rows.push({ id, family, provider, override: label, capture: "résolveur", url: norm(r.url), authorization: r.key ? `Bearer ${r.key}` : "(absente — clé vide)" });
}
const engPreset = (p: "deepseek" | "mistral" | "groq", ovr: Override) => {
  const { baseURL, key } = resolvePresetEndpoint(p, ovr);
  return { url: completionsUrl(baseURL), key };
};
fromResolver("E9", "engine", "deepseek", {}, "aucun override", engPreset("deepseek", {}));
fromResolver("E10", "engine", "mistral", {}, "aucun override", engPreset("mistral", {}));
fromResolver("E11", "engine", "groq", {}, "aucun override", engPreset("groq", {}));
{
  const { baseURL, key } = resolveLitellmEndpoint({});
  fromResolver("E12", "engine", "litellm", {}, "aucun override (résolveur direct)", { url: completionsUrl(baseURL), key });
}

fromResolver("V6", "eleve", "deepseek", {}, "aucun override", openAiEndpoint("deepseek"));
fromResolver("V7", "eleve", "deepseek", { baseUrl: OVR_BASE }, "baseUrl=ovr (ignoré par les presets Élève)", openAiEndpoint("deepseek", { baseUrl: OVR_BASE }));
fromResolver("V8", "eleve", "mistral", {}, "aucun override", openAiEndpoint("mistral"));
fromResolver("V9", "eleve", "groq", {}, "aucun override", openAiEndpoint("groq"));

// ── 3c. ABSENCE d'Authorization : clé vide côté engine (lecture d'env au moment
//        de l'appel → save/delete/restore local, déterministe). Le transport lève
//        AVANT tout envoi → aucune requête, donc aucun Authorization. ────────────
{
  const saved = { a: process.env.LLM_OPENAI_KEY, b: process.env.ELEVE_API_KEY };
  delete process.env.LLM_OPENAI_KEY;
  delete process.env.ELEVE_API_KEY;
  await driveEngine("A1", "openai", {}, "aucune clé résoluble (LLM_OPENAI_KEY+ELEVE_API_KEY absentes)");
  process.env.LLM_OPENAI_KEY = saved.a;
  process.env.ELEVE_API_KEY = saved.b;
}

// ── 4. Arrêt propre puis golden byte-identique ───────────────────────────────
// On NE fait PAS process.exit() : sur Windows, le tear-down forcé des sockets
// keep-alive d'undici (fetch) déclenche une assertion libuv (async.c). On ferme
// proprement le faux serveur + le dispatcher undici, on pose process.exitCode et
// on laisse la boucle se vider — sortie nette, code de sortie fiable.
async function shutdown(code: number) {
  process.exitCode = code;
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
  try {
    const disp = (globalThis as Record<symbol, unknown>)[Symbol.for("undici.globalDispatcher.1")] as
      | { close?: () => Promise<void> }
      | undefined;
    await disp?.close?.();
  } catch { /* best-effort : rien à fermer */ }
}

const actual = JSON.stringify(rows, null, 2) + "\n";

if (process.env.UPDATE_ORACLE_GOLDEN === "1" || !fs.existsSync(GOLDEN_PATH)) {
  fs.writeFileSync(GOLDEN_PATH, actual);
  console.log(`\n📌 Golden oracle (ré)écrit : ${path.basename(GOLDEN_PATH)} — ${rows.length} combinaisons figées.`);
  console.log("   (relancer sans UPDATE_ORACLE_GOLDEN pour valider la non-régression)");
  await shutdown(0);
} else {

// Normalise les fins de ligne à la lecture : core.autocrlf peut restituer le
// golden en CRLF au checkout ; le comparatif porte sur le CONTENU (URL/clés),
// pas sur le style de saut de ligne.
const golden = fs.readFileSync(GOLDEN_PATH, "utf8").replace(/\r\n/g, "\n");
console.log("═".repeat(78));
console.log(`Oracle endpoints openai-compat — ${rows.length} combinaisons (engine ↔ eleve)`);
console.log("═".repeat(78));
for (const r of rows) {
  console.log(`  ${r.id.padEnd(4)} ${r.family.padEnd(6)} ${r.provider.padEnd(9)} [${r.override}]`);
  console.log(`       → ${r.url}`);
  console.log(`       → ${r.authorization}   (${r.capture})`);
}
console.log("═".repeat(78));

if (actual === golden) {
  console.log(`✅ Oracle vert : ${rows.length} combinaisons byte-identiques au golden (aucune régression).`);
  await shutdown(0);
} else {
  console.error("❌ RÉGRESSION : la sortie diffère du golden figé. Diff (golden ≠ actuel) :");
  const gl = golden.split("\n");
  const al = actual.split("\n");
  for (let i = 0; i < Math.max(gl.length, al.length); i++) {
    if (gl[i] !== al[i]) {
      console.error(`  ligne ${i + 1}:`);
      console.error(`    golden : ${gl[i] ?? "(absent)"}`);
      console.error(`    actuel : ${al[i] ?? "(absent)"}`);
    }
  }
  await shutdown(1);
}

}
