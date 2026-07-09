// Moteur LLM LOCAL via Ollama — pour les tâches internes de MangoOS ($0,
// souverain, hors crédits API Anthropic). Réutilise le serveur Ollama de
// l'Élève (voir askEleveOllama dans eleve.ts) : même endpoint /api/chat, même
// modèle par défaut. Sert de moteur de résumé pour l'index multi-projets, et
// peut être réutilisé par toute autre feature qui doit passer « en interne ».

import { ollamaChat } from './llm-transport.js'

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434'
// Modèle par défaut : celui de l'Élève (un modèle de code, idéal pour résumer
// du code). Surchargeable sans toucher au code via OLLAMA_SUMMARY_MODEL.
const DEFAULT_MODEL =
  process.env.OLLAMA_SUMMARY_MODEL ?? process.env.ELEVE_MODEL ?? 'gemma4:12b'

export interface OllamaOptions {
  model?: string
  /** Garde-fou : le 1er appel (cold start, chargement du modèle) peut durer
   * ~2 min ; les suivants ~quelques secondes. */
  timeoutMs?: number
  /** Image en base64 pour les modèles vision (ex. Gemma 4). */
  imageBase64?: string
  /** Endpoint Ollama custom (ex. instance distante). Absent → OLLAMA_URL (env)
   * → défaut localhost, comme aujourd'hui. Pris en compte par askOllama
   * uniquement (C1-P1, overrides baseUrl/apiKeyEnv d'askLLM). */
  baseUrl?: string
}

/** Résout l'URL de base Ollama : override explicite > OLLAMA_URL (env, lu à
 * l'appel — pas au chargement du module, pour rester testable) > défaut local.
 * Fonction pure, zéro effet de bord — sert aussi de brique testée isolément. */
export function resolveOllamaBaseUrl(baseUrlOverride?: string): string {
  return baseUrlOverride ?? process.env.OLLAMA_URL ?? 'http://localhost:11434'
}

/** Un appel chat non-streamé à Ollama. Renvoie le texte de la réponse (trim).
 * Lève si Ollama est injoignable, renvoie une erreur HTTP, ou dépasse le délai.
 *
 * Délègue au transport partagé `ollamaChat` (llm-transport.ts) — socle /api/chat
 * unique. Divergences propres à la famille A préservées via ses options :
 *   • keep_alive:'10m' (garde le modèle chaud → évite le cold start ~2 min entre
 *     fichiers d'un run d'indexation) → keepAlive.
 *   • trim de la réponse (ollamaChat renvoie le texte brut) → .trim() ici.
 *   • image VL (champ `images`) → imageBase64. */
export async function askOllama(
  system: string,
  user: string,
  opts: OllamaOptions = {},
): Promise<string> {
  const text = await ollamaChat(system, user, {
    baseUrl: resolveOllamaBaseUrl(opts.baseUrl),
    model: opts.model ?? DEFAULT_MODEL,
    timeoutMs: opts.timeoutMs ?? 180_000,
    keepAlive: '10m',
    imageBase64: opts.imageBase64,
  })
  return text.trim()
}

// Modèle d'embeddings local (différent d'un modèle de chat) — à pull une fois
// (`ollama pull nomic-embed-text`). Surchargeable via NOTES_EMBED_MODEL.
const DEFAULT_EMBED_MODEL = process.env.NOTES_EMBED_MODEL ?? 'nomic-embed-text'

/** Vecteur d'embedding d'un texte via Ollama `/api/embeddings`. Lève si Ollama
 * est injoignable, renvoie une erreur HTTP (ex. modèle d'embedding absent), ou
 * dépasse le délai — l'appelant décide du repli (recherche par mots-clés). */
export async function embedOllama(text: string, opts: OllamaOptions = {}): Promise<number[]> {
  const model = opts.model ?? DEFAULT_EMBED_MODEL
  const timeoutMs = opts.timeoutMs ?? 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text, keep_alive: '10m' }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama embeddings HTTP ${res.status}`)
    const data = (await res.json()) as { embedding?: number[] }
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Ollama embeddings: empty vector')
    }
    return data.embedding
  } finally {
    clearTimeout(timer)
  }
}
