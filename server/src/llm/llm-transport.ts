// Couche transport LLM bas-niveau UNIQUE (chantier #2, tranche T2).
//
// MangoOS réimplémentait le MÊME transport LLM dans deux familles parallèles :
//   • famille 'engine' (llm-engine.ts) : askClaude / claudeWebResearch (query SDK),
//     askOpenAI (fetch openai-compat), ollama via ollama.ts.
//   • famille 'eleve' (eleve.ts) : askEleveOllama, askEleveOpenAI,
//     postEleveCompletions (tools), postEleveOllamaTools (tools locaux) + mappers.
//
// Ce module est le SOCLE partagé : chaque brique de transport vit ici UNE fois,
// paramétrée pour reproduire À L'OCTET le comportement des deux familles. Les
// divergences fines sont des OPTIONS explicites (jamais des branches implicites) :
//   • keep_alive:'10m' (famille A ollama) vs absent (famille B) → option `keepAlive`.
//   • max_tokens présent (askOpenAI) vs absent (askEleveOpenAI) → `maxTokens?`.
//   • systemPrompt preset (askClaude) vs absent (claudeWebResearch) → `systemAppend?`.
//   • séparateur de blocs '' (askClaude) vs '\n' (claudeWebResearch) → `blockSeparator`.
//
// Le retry HTTP 429/503 N'EST PAS ici en T2 : il est ajouté en OPT-IN à la tranche
// T3 (défaut = aucun retry, pour préserver les chemins qui n'en avaient pas).
//
// GARDE-FOU CENTRAL préservé ici : subscriptionEnv() neutralise ANTHROPIC_API_KEY
// pour que query() utilise l'ABONNEMENT Claude Code et NON les crédits API payants.

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { OpenAITool } from "../kernel/kernel-mcp.js";
import type { ChatMessage, ToolCall } from "../eleve-runtime.js";
import { fetchWithRetry, type RetryPolicy } from "../eleve-retry.js";

// ── Abonnement vs crédits API : le garde-fou central ─────────────────────────
// CRUCIAL : query() utilise l'ABONNEMENT Claude Code UNIQUEMENT si ANTHROPIC_API_KEY
// est absente de l'env. Une clé (même sans crédit) le détourne silencieusement vers
// les crédits API PAYANTS. Tout appel à query() qui veut l'abonnement DOIT passer cet
// env nettoyé (askClaude, claudeWebResearch, runAgent dans agent.ts, le Lab dans
// promptlab.ts). Centralisé ici pour qu'un seul endroit porte la règle.
export function subscriptionEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

// Deadline DURE sur les itérations query() : un stream SDK qui pend (réseau muet)
// gèlerait le juge nocturne, donc TOUT le batch de nuit. On interrompt proprement
// puis on lève (l'appelant a déjà ses catch : verdict neutre / repli — jamais un gel).
export const CLAUDE_QUERY_TIMEOUT_MS = Math.max(60_000, Number(process.env.CLAUDE_QUERY_TIMEOUT_MS ?? 300_000));

async function withQueryDeadline(
  q: { interrupt?: () => Promise<void> },
  work: Promise<string>,
  timeoutMs: number,
  label: string,
): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void q.interrupt?.().catch(() => undefined); // best-effort : libère le process SDK
      reject(new Error(`${label} : aucune réponse après ${Math.round(timeoutMs / 1000)} s (deadline)`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Draine un flux query() : concatène le TEXTE des messages assistant, `separator`
 *  après chaque bloc ('' pour askClaude, '\n' pour claudeWebResearch), puis trim.
 *  PUR (accepte n'importe quel AsyncIterable) → testable avec un flux synthétique. */
export async function drainAssistantText(q: AsyncIterable<unknown>, separator = ""): Promise<string> {
  let text = "";
  for await (const m of q as AsyncIterable<{ type: string; message?: { content?: Array<{ type: string; text?: string }> } }>) {
    if (m.type === "assistant") {
      const content = m.message?.content ?? [];
      for (const b of content) if (b.type === "text" && b.text) text += b.text + separator;
    }
  }
  return text.trim();
}

/** Options de claudeQuery — sur-ensemble paramétré de askClaude ET claudeWebResearch. */
export interface ClaudeQueryOptions {
  model: string;
  allowedTools: string[];
  maxTurns: number;
  timeoutMs: number;
  label: string;
  /** Append au systemPrompt preset 'claude_code'. Présent → askClaude ; ABSENT →
   *  aucun systemPrompt (claudeWebResearch). `undefined` ≠ '' (distinction préservée). */
  systemAppend?: string;
  /** Séparateur après chaque bloc de texte assistant : '' (askClaude) / '\n' (webResearch). */
  blockSeparator?: string;
}

/** Transport Claude UNIQUE via l'ABONNEMENT (query SDK). Reproduit à l'octet
 *  askClaude (systemAppend + separator '') ET claudeWebResearch (pas de systemPrompt,
 *  allowedTools ['WebSearch'], separator '\n'). Neutralise ANTHROPIC_API_KEY. */
export async function claudeQuery(prompt: string, opts: ClaudeQueryOptions): Promise<string> {
  const env = subscriptionEnv();
  const q = query({
    prompt,
    options: {
      model: opts.model,
      ...(opts.systemAppend !== undefined
        ? { systemPrompt: { type: "preset" as const, preset: "claude_code" as const, append: opts.systemAppend } }
        : {}),
      maxTurns: opts.maxTurns,
      allowedTools: opts.allowedTools,
      env,
    },
  });
  const drain = drainAssistantText(q, opts.blockSeparator ?? "");
  return withQueryDeadline(q, drain, opts.timeoutMs, opts.label);
}

// ── Transport Ollama /api/chat (texte simple) ────────────────────────────────
/** Un tour Ollama (system+user → texte brut, SANS trim — famille B eleve). `keepAlive`
 *  ('10m') maintient le modèle chaud entre appels (famille A) ; omis → payload
 *  byte-identique à l'ancien askEleveOllama. `imageBase64` (famille A askOllama, VL
 *  local) ajoute le champ `images` au message user ; absent → payload byte-identique
 *  à l'ancien askEleveOllama (spread conditionnel, comme openAiChat). */
export async function ollamaChat(
  system: string,
  user: string,
  opts: { baseUrl: string; model: string; timeoutMs: number; keepAlive?: string; imageBase64?: string },
): Promise<string> {
  const res = await fetch(`${opts.baseUrl}/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      // num_ctx explicite : sans lui, Ollama plafonne le contexte à 4096 tokens (défaut),
      // ce qui étouffe l'Élève (le prompt système Mango fait ~11k tokens). Configurable.
      options: { temperature: 0, num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 16384) },
      ...(opts.keepAlive ? { keep_alive: opts.keepAlive } : {}),
      // VL local « thinking » (qwen3-vl) : forcer la réponse dans `content` (sinon elle part
      // dans `thinking` et le juge de goût lit du vide → skin non noté). Ciblé sur le chemin
      // vision (imageBase64 présent) → payload TEXTE inchangé, byte-identique pour l'Élève.
      ...(opts.imageBase64 ? { think: false } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user, ...(opts.imageBase64 ? { images: [opts.imageBase64] } : {}) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
  // Repli « thinking » : un VL qui pense peut laisser `content` vide et mettre sa réponse
  // dans `thinking` — on la récupère plutôt que de renvoyer du vide. Cas normal (content
  // rempli) : retour inchangé, SANS trim (préservé).
  const content = data.message?.content ?? "";
  return content.trim() ? content : (data.message?.thinking ?? content);
}

// ── Transport openai-compat (texte simple) ───────────────────────────────────
/** Un tour openai-compat (system+user → texte). `url`/`key` DÉJÀ résolus par
 *  l'appelant (résolveur d'endpoint T1). `maxTokens` inclus seulement s'il est
 *  fourni (famille engine oui, famille eleve non). Support image optionnel. */
export async function openAiChat(
  system: string,
  user: string,
  opts: {
    url: string;
    key: string;
    model: string;
    timeoutMs: number;
    maxTokens?: number;
    imageBase64?: string;
    imageMimeType?: string;
    errorLabel?: string;
    /** Trim de la réponse. Défaut true (famille engine askOpenAI). La famille eleve
     *  (askEleveOpenAI) renvoyait le contenu BRUT → passe trim:false (byte-identique). */
    trim?: boolean;
  },
): Promise<string> {
  const mime = opts.imageMimeType ?? "image/jpeg";
  const userContent = opts.imageBase64
    ? [
        { type: "text", text: user },
        { type: "image_url", image_url: { url: `data:${mime};base64,${opts.imageBase64}` } },
      ]
    : user;
  const res = await fetch(opts.url, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      temperature: 0,
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${opts.errorLabel ?? "OpenAI-compat"} HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  return opts.trim === false ? content : content.trim();
}

// ── Transport openai-compat function-calling (tools) ─────────────────────────
/** Un tour openai-compat AVEC outils. Renvoie {content, toolCalls?}. `url`/`key`
 *  déjà résolus. `retry` OPT-IN (T3) : absent → un seul essai (byte-identique au
 *  fetch nu) ; fourni → retente 429/503 + réseau. Seul l'Élève passe une politique. */
export async function openAiChatTools(opts: {
  url: string;
  key: string;
  model: string;
  timeoutMs: number;
  messages: ChatMessage[];
  tools: OpenAITool[] | null;
  retry?: RetryPolicy;
}): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const payload = JSON.stringify({
    model: opts.model,
    stream: false,
    temperature: 0,
    messages: opts.messages,
    ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
  });
  const res = await fetchWithRetry(
    opts.url,
    () => ({
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.key}` },
      body: payload,
    }),
    opts.retry,
    {
      http: (status) => `API Élève HTTP ${status}`,
      network: (attempts, name) => `API Élève injoignable (${name}) après ${attempts} tentative(s)`,
    },
  );
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: ToolCall[] } }>;
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("réponse Élève vide");
  return { content: msg.content ?? "", toolCalls: msg.tool_calls };
}

// ── Transport function-calling LOCAL (Ollama /api/chat `tools`) ───────────────
// Ollama parle nativement `tools`/`tool_calls`, avec deux différences vs OpenAI :
// les arguments d'outil sont un OBJET (pas une string JSON) et il n'y a pas d'id
// de tool_call. La traduction est isolée dans des mappers PURS (testables sans réseau).
interface OllamaToolCall { function: { name: string; arguments: Record<string, unknown> | string } }
interface OllamaMessage { role: string; content: string; tool_calls?: OllamaToolCall[] }

function safeParseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw || "{}") as Record<string, unknown>; } catch { return {}; }
}

/** Nos ChatMessage → messages Ollama (arguments d'outil en OBJET). PUR. */
export function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant" && m.tool_calls?.length) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({ function: { name: tc.function.name, arguments: safeParseArgs(tc.function.arguments) } })),
      };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

/** Réponse Ollama → notre {content, toolCalls} (arguments re-stringifiés, id généré). PUR. */
export function fromOllamaResponse(
  data: { message?: { content?: string; tool_calls?: OllamaToolCall[] } },
): { content: string; toolCalls?: ToolCall[] } {
  const msg = data.message;
  const content = msg?.content ?? "";
  const tcs = msg?.tool_calls;
  if (!tcs?.length) return { content };
  const toolCalls: ToolCall[] = tcs.map((tc, i) => ({
    id: `ollama_${i}_${tc.function?.name ?? "tool"}`,
    function: {
      name: tc.function?.name ?? "",
      arguments: typeof tc.function?.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
    },
  }));
  return { content, toolCalls };
}

/** Un tour Ollama AVEC outils (function-calling local). `keepAlive` omis → payload
 *  byte-identique à l'ancien postEleveOllamaTools. */
export async function ollamaChatTools(opts: {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  messages: ChatMessage[];
  tools: OpenAITool[] | null;
  keepAlive?: string;
}): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const res = await fetch(`${opts.baseUrl}/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      // num_ctx explicite : sans lui, Ollama plafonne le contexte à 4096 tokens (défaut),
      // ce qui étouffe l'Élève (le prompt système Mango fait ~11k tokens). Configurable.
      options: { temperature: 0, num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 16384) },
      ...(opts.keepAlive ? { keep_alive: opts.keepAlive } : {}),
      messages: toOllamaMessages(opts.messages),
      ...(opts.tools ? { tools: opts.tools } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama tools HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return fromOllamaResponse((await res.json()) as { message?: { content?: string; tool_calls?: OllamaToolCall[] } });
}
