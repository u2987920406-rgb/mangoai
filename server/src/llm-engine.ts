// Routeur de moteur LLM — le MOTEUR des appels one-shot de MangoOS. Le routage
// par provider vit ici ; le moteur réel se choisit dans `.env`, sans toucher au
// code. Généralise le askEleveDispatch de l'Élève.
//
// NOTE (Kernel) : les features n'appellent plus askLLM() directement — elles
// passent par `getBrain().complete()` (kernel.ts), qui enveloppe askLLM pour
// ajouter l'observabilité (chaque appel = un span sur le Bus, lu par MangoQA) et
// préparer retry/fallback centralisés. askLLM reste la porte de routage dessous,
// et le Brain lui transmet provider/model à l'identique (sur-ensemble strict).
//
//   - 'claude'   → query() via l'ABONNEMENT Claude Code (qualité, pas de crédits API)
//   - 'ollama'   → modèle local (Gemma) — $0, souverain
//   - 'openai'   → endpoint compatible OpenAI générique (LLM_OPENAI_URL / LLM_OPENAI_KEY)
//   - 'deepseek' → DeepSeek API (OpenAI-compat) — DEEPSEEK_API_KEY
//   - 'mistral'  → Mistral API (OpenAI-compat) — MISTRAL_API_KEY
//   - 'groq'     → Groq API (OpenAI-compat)    — GROQ_API_KEY
//   - 'litellm'  → proxy LiteLLM (OpenAI-compat) ouvrant 100+ modèles d'un coup
//                  via un seul endpoint — LITELLM_BASE_URL (défaut localhost:4000),
//                  LITELLM_MODEL, LITELLM_API_KEY. Le proxy gère le routage et le
//                  fallback ; côté MangoOS c'est un provider OpenAI-compat de plus.
//                  (Note : le cerveau Claude reste via 'claude'/query() à $0 — le
//                   proxy LiteLLM ne sait pas faire l'abonnement Claude Code.)
//
// Réglage par feature : <FEATURE>_PROVIDER dans .env (ex. SUPERAGENT_PROVIDER),
// sinon LLM_PROVIDER global, sinon le défaut passé par la feature.
import { query } from '@anthropic-ai/claude-agent-sdk'
import { askOllama } from './ollama.js'

export type LLMProvider = 'claude' | 'ollama' | 'openai' | 'deepseek' | 'mistral' | 'groq' | 'litellm'

export interface AskLLMOptions {
  provider?: LLMProvider
  model?: string
  maxTokens?: number
  timeoutMs?: number
  /** Image en base64 pour les modèles vision (GLM-4V, Gemma 4…).
   *  Ignoré si le provider ne supporte pas la vision. */
  imageBase64?: string
  /** Type MIME de l'image — défaut 'image/jpeg'. */
  imageMimeType?: string
}

interface ProviderPreset {
  baseURL: string
  defaultModel: string
  apiKeyEnv: string
}

/** Presets OpenAI-compat pour deepseek / mistral / groq. */
export const PROVIDER_PRESETS: Record<'deepseek' | 'mistral' | 'groq', ProviderPreset> = {
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  mistral: {
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    apiKeyEnv: 'MISTRAL_API_KEY',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    apiKeyEnv: 'GROQ_API_KEY',
  },
}

/** Résout un provider depuis une valeur .env (ou le défaut global), borné aux
 * 6 valeurs valides. `envValue` = la variable dédiée d'une feature. */
export function resolveProvider(envValue?: string, fallback: LLMProvider = 'claude'): LLMProvider {
  const raw = (envValue ?? process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  const valid: LLMProvider[] = ['claude', 'ollama', 'openai', 'deepseek', 'mistral', 'groq', 'litellm']
  return (valid.includes(raw as LLMProvider) ? raw : fallback) as LLMProvider
}

function defaultModel(provider: LLMProvider): string {
  if (provider === 'claude') return process.env.LLM_CLAUDE_MODEL ?? 'sonnet'
  if (provider === 'ollama') return process.env.OLLAMA_SUMMARY_MODEL ?? process.env.ELEVE_MODEL ?? 'gemma4:12b'
  if (provider === 'deepseek' || provider === 'mistral' || provider === 'groq') {
    return PROVIDER_PRESETS[provider].defaultModel
  }
  if (provider === 'litellm') return process.env.LITELLM_MODEL ?? 'gpt-4o-mini'
  // openai generic
  return process.env.LLM_OPENAI_MODEL ?? process.env.ELEVE_MODEL ?? 'deepseek-chat'
}

// ── Abonnement vs crédits API : le garde-fou central ─────────────────────────
// CRUCIAL : query() utilise l'ABONNEMENT Claude Code UNIQUEMENT si
// ANTHROPIC_API_KEY est absente de l'env. Une clé (même sans crédit) le détourne
// silencieusement vers les crédits API PAYANTS. Tout appel à query() qui veut
// l'abonnement DOIT passer cet env nettoyé (askClaude, claudeWebResearch,
// runAgent dans agent.ts, le Lab dans promptlab.ts). Centralisé ici pour qu'un
// seul endroit porte la règle.
export function subscriptionEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  return env
}

// ── Provider claude : query() via l'ABONNEMENT ───────────────────────────────
async function askClaude(system: string, user: string, model: string): Promise<string> {
  const env = subscriptionEnv()
  const q = query({
    prompt: user,
    options: {
      model,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: system },
      maxTurns: 5,
      allowedTools: [],
      env,
    },
  })
  let text = ''
  for await (const m of q) {
    if (m.type === 'assistant') {
      const content = (m as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content ?? []
      for (const b of content) if (b.type === 'text' && b.text) text += b.text
    }
  }
  return text.trim()
}

// ── Recherche web via l'ABONNEMENT (query + outil WebSearch, multi-tours) ────
// claude-only : WebSearch est un outil Claude Code (ni Ollama ni OpenAI-compat
// ne l'ont nativement). Renvoie la synthèse texte ("" si rien). Plus lent
// (~1 min) car c'est une vraie recherche web. Comme askClaude, on neutralise
// ANTHROPIC_API_KEY pour forcer l'abonnement.
export async function claudeWebResearch(
  prompt: string,
  opts: { model?: string; maxTurns?: number } = {},
): Promise<string> {
  const env = subscriptionEnv()
  const q = query({
    prompt,
    options: {
      model: opts.model ?? process.env.LLM_CLAUDE_MODEL ?? 'sonnet',
      allowedTools: ['WebSearch'],
      maxTurns: opts.maxTurns ?? 6,
      env,
    },
  })
  let text = ''
  for await (const m of q) {
    if (m.type === 'assistant') {
      const content = (m as { message?: { content?: Array<{ type: string; text?: string }> } }).message?.content ?? []
      for (const b of content) if (b.type === 'text' && b.text) text += b.text + '\n'
    }
  }
  return text.trim()
}

// ── Provider openai-compatible (generic + deepseek / mistral / groq) ─────────
// `baseURL` and `apiKey` are optional: when provided they override env lookups
// (used for preset providers). For the plain 'openai' provider they fall back
// to LLM_OPENAI_URL / LLM_OPENAI_KEY / ELEVE_API_KEY as before.
async function askOpenAI(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  timeoutMs: number,
  baseURLOverride?: string,
  apiKeyOverride?: string,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<string> {
  const rawBase = (baseURLOverride ?? process.env.LLM_OPENAI_URL ?? process.env.ELEVE_API_URL ?? 'https://api.deepseek.com/v1')
    .trim()
    .replace(/\/+$/, '')
  const url = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`
  const key = (apiKeyOverride ?? process.env.LLM_OPENAI_KEY ?? process.env.ELEVE_API_KEY ?? '').trim()
  if (!key) throw new Error('Clé OpenAI-compatible manquante (LLM_OPENAI_KEY ou ELEVE_API_KEY dans server/.env).')
  const mime = imageMimeType ?? 'image/jpeg'
  const userContent = imageBase64
    ? [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${imageBase64}` } },
      ]
    : user
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`OpenAI-compat HTTP ${res.status}`)
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return (data.choices?.[0]?.message?.content ?? '').trim()
  } finally {
    clearTimeout(timer)
  }
}

/** Porte d'entrée unique : (system, user) → texte. Lève si le provider échoue ;
 * l'appelant décide du fallback (ex. dégradé). */
export async function askLLM(system: string, user: string, opts: AskLLMOptions = {}): Promise<string> {
  const provider = opts.provider ?? resolveProvider()
  const model = opts.model ?? defaultModel(provider)
  const maxTokens = opts.maxTokens ?? 1024
  const timeoutMs = opts.timeoutMs ?? 180_000
  const { imageBase64, imageMimeType } = opts
  if (provider === 'ollama') return askOllama(system, user, { model, timeoutMs, imageBase64 })
  if (provider === 'deepseek' || provider === 'mistral' || provider === 'groq') {
    const preset = PROVIDER_PRESETS[provider]
    const key = (process.env[preset.apiKeyEnv] ?? process.env.LLM_OPENAI_KEY ?? process.env.ELEVE_API_KEY ?? '').trim()
    if (!key) throw new Error(`Clé manquante pour le provider "${provider}" (${preset.apiKeyEnv} dans server/.env).`)
    return askOpenAI(system, user, model, maxTokens, timeoutMs, preset.baseURL, key, imageBase64, imageMimeType)
  }
  if (provider === 'litellm') {
    // Proxy LiteLLM = endpoint OpenAI-compat unique vers 100+ modèles. Le proxy
    // local n'exige souvent pas d'auth ; on passe une clé placeholder que le
    // proxy ignore (sa propre master-key gère l'accès s'il en a une).
    const baseURL = (process.env.LITELLM_BASE_URL ?? 'http://localhost:4000/v1').trim()
    const key = (process.env.LITELLM_API_KEY ?? 'sk-litellm-local').trim()
    return askOpenAI(system, user, model, maxTokens, timeoutMs, baseURL, key, imageBase64, imageMimeType)
  }
  if (provider === 'openai') return askOpenAI(system, user, model, maxTokens, timeoutMs, undefined, undefined, imageBase64, imageMimeType)
  return askClaude(system, user, model)
}
