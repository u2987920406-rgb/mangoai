// MangoOS Kernel — Backend de stockage du Blackboard (pilier 3, cf. fondation.md).
//
// Le store d'artefacts du Blackboard est abstrait derrière cette interface : le
// Blackboard délègue le STOCKAGE (les verrous, eux, restent en mémoire — ils sont
// éphémères, persister un verrou n'a aucun sens). Deux implémentations :
//   • MemoryStore  — défaut, zéro dépendance, toujours disponible (comportement
//                    historique du Blackboard).
//   • SqliteStore  — persistance disque réelle via node:sqlite (intégré au
//                    runtime Node, aucun build natif), dans kernel-blackboard-sqlite.ts.
//
// La recherche sémantique (le « vec » de SQLite-vec) se fait par COSINUS sur des
// embeddings fournis par l'appelant (comme notes-rag : MangoOS embarque déjà
// nomic-embed-text via Ollama). Le store ne calcule pas les embeddings — il les
// range et les compare. L'extension native sqlite-vec pourra accélérer ce même
// `search` plus tard (ANN) sans changer l'interface.

/** Un résultat de recherche sémantique : clé + similarité cosinus + valeur. */
export interface SearchHit {
  key: string
  score: number
  value: unknown
}

/** Backend de stockage du store d'artefacts. Synchrone (le Blackboard l'est). */
export interface BlackboardStore {
  put(scope: string, key: string, value: unknown, embedding?: number[]): void
  get(scope: string, key: string): unknown | undefined
  has(scope: string, key: string): boolean
  delete(scope: string, key: string): boolean
  keys(scope: string): string[]
  /** k plus proches voisins (cosinus) parmi les artefacts du scope ayant un embedding. */
  search(scope: string, queryEmbedding: number[], k: number): SearchHit[]
  /** Libère les ressources (no-op en mémoire ; ferme la base en SQLite). */
  close(): void
  /**
   * OPTIONNELLE (tous les backends n'ont pas de notion d'âge — MemoryStore ne
   * l'implémente pas). Purge du scope selon âge (`olderThanMs`) et/ou volume
   * (`maxEntries`, garde les plus récents). Retourne le nombre supprimé.
   * Outil de maintenance : jamais appelé automatiquement, réservé à un job
   * nocturne gaté BLACKBOARD_TTL (cf. flags.ts).
   */
  prune?(scope: string, opts: { olderThanMs?: number; maxEntries?: number }): number
}

/** Similarité cosinus entre deux vecteurs (0 si l'un est nul). Pur. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** Classe les artefacts (clé→{value,embedding}) par cosinus décroissant, top-k. */
export function rankByCosine(
  entries: Array<{ key: string; value: unknown; embedding?: number[] }>,
  query: number[],
  k: number,
): SearchHit[] {
  const hits: SearchHit[] = []
  for (const e of entries) {
    if (!e.embedding || e.embedding.length === 0) continue
    hits.push({ key: e.key, score: cosine(query, e.embedding), value: e.value })
  }
  hits.sort((x, y) => y.score - x.score)
  return hits.slice(0, Math.max(0, k))
}

// ── Backend par défaut : en mémoire (comportement historique) ────────────────
interface MemEntry {
  value: unknown
  embedding?: number[]
}

export class MemoryStore implements BlackboardStore {
  private store = new Map<string, Map<string, MemEntry>>()

  put(scope: string, key: string, value: unknown, embedding?: number[]): void {
    let bucket = this.store.get(scope)
    if (!bucket) {
      bucket = new Map<string, MemEntry>()
      this.store.set(scope, bucket)
    }
    bucket.set(key, { value, embedding })
  }

  get(scope: string, key: string): unknown | undefined {
    return this.store.get(scope)?.get(key)?.value
  }

  has(scope: string, key: string): boolean {
    return this.store.get(scope)?.has(key) ?? false
  }

  delete(scope: string, key: string): boolean {
    const bucket = this.store.get(scope)
    if (!bucket) return false
    const had = bucket.delete(key)
    if (bucket.size === 0) this.store.delete(scope)
    return had
  }

  keys(scope: string): string[] {
    return [...(this.store.get(scope)?.keys() ?? [])]
  }

  search(scope: string, queryEmbedding: number[], k: number): SearchHit[] {
    const bucket = this.store.get(scope)
    if (!bucket) return []
    const entries = [...bucket.entries()].map(([key, e]) => ({ key, value: e.value, embedding: e.embedding }))
    return rankByCosine(entries, queryEmbedding, k)
  }

  close(): void {
    // rien à libérer en mémoire
  }
}
