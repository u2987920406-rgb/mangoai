// Moteur LLM LOCAL via Ollama — pour les tâches internes de MangoOS ($0,
// souverain, hors crédits API Anthropic). Réutilise le serveur Ollama de
// l'Élève (voir askEleveOllama dans eleve.ts) : même endpoint /api/chat, même
// modèle par défaut. Sert de moteur de résumé pour l'index multi-projets, et
// peut être réutilisé par toute autre feature qui doit passer « en interne ».

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
}

/** Un appel chat non-streamé à Ollama. Renvoie le texte de la réponse (trim).
 * Lève si Ollama est injoignable, renvoie une erreur HTTP, ou dépasse le délai. */
export async function askOllama(
  system: string,
  user: string,
  opts: OllamaOptions = {},
): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? 180_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0 },
        // Garde le modèle chargé entre deux fichiers → évite de repayer le
        // cold start (~2 min) à chaque appel d'un run d'indexation.
        keep_alive: '10m',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: user,
            ...(opts.imageBase64 ? { images: [opts.imageBase64] } : {}),
          },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
    const data = (await res.json()) as { message?: { content?: string } }
    return (data.message?.content ?? '').trim()
  } finally {
    clearTimeout(timer)
  }
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
