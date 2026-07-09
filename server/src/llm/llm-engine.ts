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
import { askOllama } from '../ollama.js'
// Résolution d'endpoint openai-compat UNIQUE (T1) : les deux chaînes de repli de
// MangoOS délèguent désormais à resolveEndpoint (famille 'engine' ici). PROVIDER_PRESETS
// vit dans le module leaf llm-endpoint et est ré-exporté ici (API publique inchangée).
import { PROVIDER_PRESETS, normalizeCompletionsUrl, resolveEndpoint } from './llm-endpoint.js'
export { PROVIDER_PRESETS } from './llm-endpoint.js'
// Couche transport UNIQUE (T2) : askClaude/claudeWebResearch/askOpenAI délèguent aux
// briques partagées. subscriptionEnv (garde-fou abonnement) est désormais SOURCÉ ici et
// ré-exporté — les importeurs (agent.ts, promptlab.ts, index.ts) restent inchangés.
import { claudeQuery, openAiChat, CLAUDE_QUERY_TIMEOUT_MS } from './llm-transport.js'
export { subscriptionEnv } from './llm-transport.js'

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
  /** Endpoint custom (ex. Zhipu "https://open.bigmodel.cn/api/paas/v4", ou un
   *  Ollama distant). Pris en compte par TOUS les providers HTTP — 'openai',
   *  'ollama', 'deepseek'/'mistral'/'groq' (prime sur le preset), 'litellm'
   *  (prime sur LITELLM_BASE_URL). Absent → résolution historique inchangée
   *  (C1-P1). Ignoré par 'claude' (query() ne passe pas par HTTP). */
  baseUrl?: string
  /** Nom de la variable d'env qui contient la clé API (ex. "ZHIPU_API_KEY").
   *  Lu dans process.env AU DERNIER MOMENT (jamais stocké en clair) ; pris en
   *  compte par 'openai', 'deepseek'/'mistral'/'groq', 'litellm'. Si la variable
   *  nommée est absente de l'env, repli fail-open sur la résolution historique
   *  (jamais de crash). Sans objet pour 'ollama' (pas d'auth). */
  apiKeyEnv?: string
}

// PROVIDER_PRESETS (deepseek / mistral / groq) : source unique dans llm-endpoint,
// importé + ré-exporté en tête de fichier. (Ancienne définition inline supprimée en T1.)

/** Résout un provider depuis une valeur .env (ou le défaut global), borné aux
 * 6 valeurs valides. `envValue` = la variable dédiée d'une feature. */
export function resolveProvider(envValue?: string, fallback: LLMProvider = 'claude'): LLMProvider {
  const raw = (envValue ?? process.env.LLM_PROVIDER ?? '').trim().toLowerCase()
  const valid: LLMProvider[] = ['claude', 'ollama', 'openai', 'deepseek', 'mistral', 'groq', 'litellm']
  return (valid.includes(raw as LLMProvider) ? raw : fallback) as LLMProvider
}

// ── C1-P1 : résolution pure d'endpoint par provider (override baseUrl/apiKeyEnv) ──
// Extrait de askLLM pour être testable sans réseau. RÈGLE ABSOLUE : quand
// opts.baseUrl / opts.apiKeyEnv sont absents, résultat STRICTEMENT identique à la
// résolution historique (mêmes replis d'env, dans le même ordre). apiKeyEnv est un
// NOM de variable, jamais une clé en clair — résolue via process.env[...] ici,
// au dernier moment, jamais stockée ni loguée ailleurs.
export interface EndpointOverrides {
  baseUrl?: string
  apiKeyEnv?: string
}

/** Résolution pour les presets OpenAI-compat deepseek / mistral / groq.
 * Sans override : baseURL = preset.baseURL, clé = repli historique
 * (preset.apiKeyEnv → LLM_OPENAI_KEY → ELEVE_API_KEY). Avec override : baseUrl
 * prime sur preset.baseURL ; apiKeyEnv prime sur la clé SI la variable nommée
 * est bien présente dans l'env — sinon fail-open, on retombe sur le repli
 * historique (jamais de crash pour une var d'env absente). */
export function resolvePresetEndpoint(
  provider: 'deepseek' | 'mistral' | 'groq',
  overrides: EndpointOverrides = {},
): { baseURL: string; key: string } {
  // T1 : adaptateur mince → résolveur unique (famille 'engine'). url = base BRUTE
  // (askOpenAI applique /chat/completions ensuite), byte-identique à l'ancien code.
  const { url, key } = resolveEndpoint(provider, 'engine', overrides)
  return { baseURL: url, key }
}

/** Résolution pour le proxy litellm. Sans override : baseURL = LITELLM_BASE_URL
 * (ou défaut localhost:4000), clé = LITELLM_API_KEY (ou placeholder). Avec
 * override : mêmes règles de priorité / fail-open que resolvePresetEndpoint. */
export function resolveLitellmEndpoint(overrides: EndpointOverrides = {}): { baseURL: string; key: string } {
  // T1 : adaptateur mince → résolveur unique (famille 'engine').
  const { url, key } = resolveEndpoint('litellm', 'engine', overrides)
  return { baseURL: url, key }
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

// subscriptionEnv (garde-fou abonnement) + CLAUDE_QUERY_TIMEOUT_MS + le drain/deadline
// du flux query() vivent désormais dans llm-transport.ts (couche unique, T2). Importés
// en tête ; subscriptionEnv est ré-exporté pour les importeurs historiques.

// ── Provider claude : query() via l'ABONNEMENT ───────────────────────────────
// T2 : délègue à claudeQuery (transport unique). systemAppend = system → systemPrompt
// preset ; separator '' ; deadline standard. Byte-identique à l'ancien askClaude.
async function askClaude(system: string, user: string, model: string): Promise<string> {
  return claudeQuery(user, {
    model,
    systemAppend: system,
    allowedTools: [],
    maxTurns: 5,
    timeoutMs: CLAUDE_QUERY_TIMEOUT_MS,
    label: 'askClaude',
  })
}

// ── Recherche web via l'ABONNEMENT (query + outil WebSearch, multi-tours) ────
// claude-only : WebSearch est un outil Claude Code (ni Ollama ni OpenAI-compat
// ne l'ont nativement). Renvoie la synthèse texte ("" si rien). Plus lent
// (~1 min) car c'est une vraie recherche web. Comme askClaude, on neutralise
// ANTHROPIC_API_KEY pour forcer l'abonnement. T2 : délègue à claudeQuery — PAS de
// systemAppend (aucun systemPrompt), separator '\n', deadline ×2. Byte-identique.
export async function claudeWebResearch(
  prompt: string,
  opts: { model?: string; maxTurns?: number } = {},
): Promise<string> {
  return claudeQuery(prompt, {
    model: opts.model ?? process.env.LLM_CLAUDE_MODEL ?? 'sonnet',
    allowedTools: ['WebSearch'],
    maxTurns: opts.maxTurns ?? 6,
    timeoutMs: CLAUDE_QUERY_TIMEOUT_MS * 2,
    label: 'claudeWebResearch',
    blockSeparator: '\n',
  })
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
  // T1 : normalisation d'URL déléguée au module d'endpoint unique (byte-identique
  // à l'ancien .trim().replace().endsWith(...)). Repli d'env inchangé pour le
  // provider 'openai' générique appelé sans base override.
  const url = normalizeCompletionsUrl(baseURLOverride ?? process.env.LLM_OPENAI_URL ?? process.env.ELEVE_API_URL ?? 'https://api.deepseek.com/v1')
  const key = (apiKeyOverride ?? process.env.LLM_OPENAI_KEY ?? process.env.ELEVE_API_KEY ?? '').trim()
  if (!key) throw new Error('Clé OpenAI-compatible manquante (LLM_OPENAI_KEY ou ELEVE_API_KEY dans server/.env).')
  // T2 : transport openai-compat délégué à la brique unique. Famille engine =
  // max_tokens présent + label 'OpenAI-compat' → byte-identique à l'ancien fetch inline.
  return openAiChat(system, user, { url, key, model, timeoutMs, maxTokens, imageBase64, imageMimeType, errorLabel: 'OpenAI-compat' })
}

/** Porte d'entrée unique : (system, user) → texte. Lève si le provider échoue ;
 * l'appelant décide du fallback (ex. dégradé). */
export async function askLLM(system: string, user: string, opts: AskLLMOptions = {}): Promise<string> {
  const provider = opts.provider ?? resolveProvider()
  const model = opts.model ?? defaultModel(provider)
  const maxTokens = opts.maxTokens ?? 1024
  const timeoutMs = opts.timeoutMs ?? 180_000
  const { imageBase64, imageMimeType } = opts
  if (provider === 'ollama') return askOllama(system, user, { model, timeoutMs, imageBase64, baseUrl: opts.baseUrl })
  if (provider === 'deepseek' || provider === 'mistral' || provider === 'groq') {
    const preset = PROVIDER_PRESETS[provider]
    const { baseURL, key } = resolvePresetEndpoint(provider, { baseUrl: opts.baseUrl, apiKeyEnv: opts.apiKeyEnv })
    if (!key) throw new Error(`Clé manquante pour le provider "${provider}" (${preset.apiKeyEnv} dans server/.env).`)
    return askOpenAI(system, user, model, maxTokens, timeoutMs, baseURL, key, imageBase64, imageMimeType)
  }
  if (provider === 'litellm') {
    // Proxy LiteLLM = endpoint OpenAI-compat unique vers 100+ modèles. Le proxy
    // local n'exige souvent pas d'auth ; on passe une clé placeholder que le
    // proxy ignore (sa propre master-key gère l'accès s'il en a une).
    const { baseURL, key } = resolveLitellmEndpoint({ baseUrl: opts.baseUrl, apiKeyEnv: opts.apiKeyEnv })
    return askOpenAI(system, user, model, maxTokens, timeoutMs, baseURL, key, imageBase64, imageMimeType)
  }
  if (provider === 'openai') {
    // Brain-Dispatch #150 : un BrainConfig peut router 'openai' vers un endpoint
    // OpenAI-compat custom (Zhipu, etc.) avec sa propre clé nommée par env.
    // T1 : résolution via le résolveur unique (famille 'engine' — inclut le repli
    // LLM_OPENAI_URL/KEY). url = base BRUTE, askOpenAI la normalise → byte-identique.
    const { url, key } = resolveEndpoint('openai', 'engine', { baseUrl: opts.baseUrl, apiKeyEnv: opts.apiKeyEnv })
    return askOpenAI(system, user, model, maxTokens, timeoutMs, url, key, imageBase64, imageMimeType)
  }
  return askClaude(system, user, model)
}
