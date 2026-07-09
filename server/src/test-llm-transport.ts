// Tests de la couche transport LLM unique (llm-transport.ts, chantier #2 T2).
//
// Deux volets, tous sans réseau réel :
//   [A] drainAssistantText : le cœur PUR du drain de query() est prouvé sur un flux
//       assistant SYNTHÉTIQUE (mock du flux SDK Claude, demandé par le plan — les
//       vrais appels query() ne sont pas couverts offline).
//   [B] briques HTTP (openAiChat / openAiChatTools / ollamaChat / ollamaChatTools) :
//       un http.createServer local capture la requête émise et renvoie une réponse
//       canonique → on prouve URL, en-tête Authorization, corps (payload) et parsing.

import http from "node:http";
import {
  drainAssistantText,
  openAiChat,
  openAiChatTools,
  ollamaChat,
  ollamaChatTools,
} from "./llm-transport.js";
import { eleveRetryPolicy } from "./eleve-retry.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** Flux assistant synthétique (imite le flux d'objets de query()). */
async function* fakeStream(blocks: string[]): AsyncGenerator<unknown> {
  yield { type: "system" }; // ignoré par le drain
  for (const t of blocks) {
    yield { type: "assistant", message: { content: [{ type: "text", text: t }] } };
  }
  yield { type: "result", total_cost_usd: 0 };
}

interface Captured { url: string; auth: string | undefined; body: any }

/** Démarre un serveur qui capture 1 requête et répond `reply` (JSON). */
function withServer(reply: unknown): Promise<{ base: string; captured: Promise<Captured>; close: () => void }> {
  return new Promise((resolve) => {
    let resolveCap: (c: Captured) => void;
    const captured = new Promise<Captured>((r) => (resolveCap = r));
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        resolveCap({ url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ base: `http://127.0.0.1:${port}`, captured, close: () => server.close() });
    });
  });
}

async function run() {
  console.log("\n[A] drainAssistantText — drain PUR d'un flux query() synthétique");
  {
    const s1 = await drainAssistantText(fakeStream(["Bonjour", " monde"]), "");
    check("askClaude : blocs concaténés sans séparateur + trim", s1 === "Bonjour monde");
    const s2 = await drainAssistantText(fakeStream(["ligne1", "ligne2"]), "\n");
    check("claudeWebResearch : séparateur '\\n' entre blocs + trim final", s2 === "ligne1\nligne2");
    const s3 = await drainAssistantText(fakeStream([]), "");
    check("aucun bloc assistant → chaîne vide", s3 === "");
  }

  console.log("\n[B1] openAiChat — POST openai-compat texte (Authorization + payload)");
  {
    const srv = await withServer({ choices: [{ message: { content: "  réponse  " } }] });
    const out = await openAiChat("sys", "usr", { url: `${srv.base}/v1/chat/completions`, key: "sk-abc", model: "m1", timeoutMs: 5000, maxTokens: 42, errorLabel: "OpenAI-compat" });
    const c = await srv.captured; srv.close();
    check("Authorization: Bearer <clé>", c.auth === "Bearer sk-abc");
    check("payload : max_tokens présent (famille engine)", c.body.max_tokens === 42);
    check("payload : temperature 0 + stream false", c.body.temperature === 0 && c.body.stream === false);
    check("payload : messages [system,user]", c.body.messages[0].role === "system" && c.body.messages[1].content === "usr");
    check("réponse trimée", out === "réponse");
  }

  console.log("\n[B2] openAiChat — famille eleve : max_tokens ABSENT quand non fourni");
  {
    const srv = await withServer({ choices: [{ message: { content: "ok" } }] });
    await openAiChat("s", "u", { url: `${srv.base}/x`, key: "k", model: "m", timeoutMs: 5000, errorLabel: "API Élève" });
    const c = await srv.captured; srv.close();
    check("payload : pas de champ max_tokens", !("max_tokens" in c.body));
  }

  console.log("\n[B3] openAiChatTools — tools + tool_choice, parse content/toolCalls");
  {
    const srv = await withServer({ choices: [{ message: { content: "", tool_calls: [{ id: "t1", function: { name: "write_file", arguments: "{}" } }] } }] });
    const out = await openAiChatTools({ url: `${srv.base}/v1/chat/completions`, key: "sk-xyz", model: "m", timeoutMs: 5000, messages: [{ role: "user", content: "go" }], tools: [{ type: "function", function: { name: "write_file", description: "", parameters: {} } }] as any });
    const c = await srv.captured; srv.close();
    check("payload : tools + tool_choice auto", Array.isArray(c.body.tools) && c.body.tool_choice === "auto");
    check("toolCalls parsés", out.toolCalls?.[0].function.name === "write_file");
  }

  console.log("\n[B4] ollamaChat — /api/chat, keep_alive omis (famille B) puis présent (A)");
  {
    const srv = await withServer({ message: { content: "salut" } });
    const out = await ollamaChat("s", "u", { baseUrl: srv.base, model: "gemma", timeoutMs: 5000 });
    const c = await srv.captured; srv.close();
    check("endpoint /api/chat", c.url === "/api/chat");
    check("keep_alive ABSENT quand non demandé (famille eleve)", !("keep_alive" in c.body));
    check("options.temperature 0", c.body.options.temperature === 0);
    check("content brut (SANS trim côté eleve)", out === "salut");

    const srv2 = await withServer({ message: { content: "x" } });
    await ollamaChat("s", "u", { baseUrl: srv2.base, model: "g", timeoutMs: 5000, keepAlive: "10m" });
    const c2 = await srv2.captured; srv2.close();
    check("keep_alive '10m' présent quand demandé (famille A)", c2.body.keep_alive === "10m");
  }

  console.log("\n[B5] ollamaChatTools — tools + mappers, réponse Ollama → notre forme");
  {
    const srv = await withServer({ message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "a" } } }] } });
    const out = await ollamaChatTools({ baseUrl: srv.base, model: "g", timeoutMs: 5000, messages: [{ role: "user", content: "go" }], tools: [{ type: "function", function: { name: "read_file", description: "", parameters: {} } }] as any });
    const c = await srv.captured; srv.close();
    check("tools transmis", Array.isArray(c.body.tools));
    check("toolCalls remontés (id généré, args re-stringifiés)", out.toolCalls?.[0].function.name === "read_file" && out.toolCalls?.[0].function.arguments === '{"path":"a"}');
  }

  console.log("\n[C] openAiChatTools — retry OPT-IN (T3) : défaut aucun retry, policy = 429/503");
  {
    // Sans policy : un 500 lève IMMÉDIATEMENT (aucune tentative supplémentaire).
    let hits = 0;
    const s500 = http.createServer((_req, res) => { hits++; res.writeHead(500); res.end("boom"); });
    await new Promise<void>((r) => s500.listen(0, "127.0.0.1", () => r()));
    const p500 = (s500.address() as any).port;
    let threw = false;
    try {
      await openAiChatTools({ url: `http://127.0.0.1:${p500}/x`, key: "k", model: "m", timeoutMs: 5000, messages: [{ role: "user", content: "go" }], tools: null });
    } catch { threw = true; }
    s500.close();
    check("sans policy : 500 → throw immédiat", threw);
    check("sans policy : une SEULE requête émise (pas de retry)", hits === 1);

    // Avec policy Élève : un 503 puis un 200 → succès après retry (respect Retry-After: 0).
    let n = 0;
    const sFlaky = http.createServer((_req, res) => {
      n++;
      if (n === 1) { res.writeHead(503, { "Retry-After": "0" }); res.end("busy"); }
      else { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: "enfin" } }] })); }
    });
    await new Promise<void>((r) => sFlaky.listen(0, "127.0.0.1", () => r()));
    const pFlaky = (sFlaky.address() as any).port;
    const out = await openAiChatTools({ url: `http://127.0.0.1:${pFlaky}/x`, key: "k", model: "m", timeoutMs: 5000, messages: [{ role: "user", content: "go" }], tools: null, retry: eleveRetryPolicy() });
    sFlaky.close();
    check("avec policy : 503 retenté puis 200 (2 requêtes)", n === 2);
    check("avec policy : réponse finale récupérée après retry", out.content === "enfin");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} llm-transport : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
