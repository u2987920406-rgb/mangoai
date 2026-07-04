// MangoOS Kernel — Blackboard (pilier 3, cf. fondation.md).
//
// L'état partagé du Kernel, gardé par MangoOS. Deux rôles :
//
//   1. VERROUS (mutex par ressource) — résout le problème #2 (cohérence d'état).
//      Quand deux agents veulent toucher le même projet, MangoOS sérialise :
//      le second attend que le premier ait fini son commit. Strictement FIFO.
//
//   2. STORE d'artefacts — les agents ne s'échangent pas de données lourdes via
//      le Bus ; ils les déposent ici et passent une RÉFÉRENCE (le `file_pointer`
//      de l'Enveloppe). Le store est désormais un BACKEND ENFICHABLE
//      (kernel-blackboard-store.ts) : MemoryStore par défaut (zéro dépendance),
//      ou SqliteStore (persistance disque via node:sqlite + recherche sémantique
//      par cosinus). Les VERROUS restent en mémoire — ils sont éphémères.
//
// Les verrous sont déterministes et testables sans réseau ni I/O ; le store
// l'est aussi avec le MemoryStore par défaut.
import { MemoryStore, type BlackboardStore, type SearchHit } from './kernel-blackboard-store.js'

/** Pointeur logique vers une valeur du store (l'analogue du file_pointer). */
export interface BlackboardRef {
  scope: string
  key: string
}

export class Blackboard {
  // Verrous : une chaîne de promesses par ressource garantit l'ordre FIFO.
  private tails = new Map<string, Promise<void>>()
  // Store d'artefacts : backend enfichable (mémoire par défaut).
  private readonly store: BlackboardStore

  /** `store` optionnel : MemoryStore par défaut, SqliteStore pour la persistance. */
  constructor(store: BlackboardStore = new MemoryStore()) {
    this.store = store
  }

  // ── Verrous ────────────────────────────────────────────────────────────────
  /** Acquiert le verrou d'une ressource. Renvoie la fonction de libération.
   * Les acquisitions concurrentes sur la même ressource sont sérialisées FIFO. */
  async acquire(resource: string): Promise<() => void> {
    const previous = this.tails.get(resource) ?? Promise.resolve()
    let release!: () => void
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => done)
    this.tails.set(resource, tail)
    await previous // attend que le détenteur précédent libère
    let released = false
    return () => {
      if (released) return
      released = true
      release()
      // Nettoyage : si personne ne s'est enchaîné après nous, on retire l'entrée.
      if (this.tails.get(resource) === tail) this.tails.delete(resource)
    }
  }

  /** Exécute `fn` sous verrou — libère TOUJOURS, même si `fn` lève. */
  async withLock<T>(resource: string, fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire(resource)
    try {
      return await fn()
    } finally {
      release()
    }
  }

  /** Y a-t-il un verrou en cours sur cette ressource ? (diagnostic/test). */
  isLocked(resource: string): boolean {
    return this.tails.has(resource)
  }

  // ── Store d'artefacts (délégué au backend) ───────────────────────────────────
  /** Dépose une valeur (+ embedding optionnel pour la recherche sémantique) et
   * renvoie sa référence (à passer dans une enveloppe). */
  put<T>(scope: string, key: string, value: T, embedding?: number[]): BlackboardRef {
    this.store.put(scope, key, value, embedding)
    return { scope, key }
  }

  /** Lit une valeur (undefined si absente). */
  get<T>(scope: string, key: string): T | undefined {
    return this.store.get(scope, key) as T | undefined
  }

  /** Résout une référence vers sa valeur. */
  deref<T>(ref: BlackboardRef): T | undefined {
    return this.get<T>(ref.scope, ref.key)
  }

  has(scope: string, key: string): boolean {
    return this.store.has(scope, key)
  }

  delete(scope: string, key: string): boolean {
    return this.store.delete(scope, key)
  }

  /** Clés présentes dans un scope (ex. tous les artefacts d'un projet). */
  keys(scope: string): string[] {
    return this.store.keys(scope)
  }

  /** Recherche sémantique : les k artefacts du scope les plus proches (cosinus)
   * de `queryEmbedding`, parmi ceux qui ont été déposés AVEC un embedding. */
  search(scope: string, queryEmbedding: number[], k = 5): SearchHit[] {
    return this.store.search(scope, queryEmbedding, k)
  }

  /** Ferme le backend (persistance) — à appeler à l'arrêt propre. No-op en mémoire. */
  close(): void {
    this.store.close()
  }

  /** Purge (TTL et/ou volume) d'un scope — délègue au backend. No-op (retourne 0)
   *  si le backend ne supporte pas `prune` (ex. MemoryStore) : fail-open, jamais
   *  bloquant. Réservé aux jobs de maintenance (cf. BLACKBOARD_TTL, llm-cache.ts). */
  prune(scope: string, opts: { olderThanMs?: number; maxEntries?: number }): number {
    return this.store.prune?.(scope, opts) ?? 0
  }
}

// ── Blackboard par défaut du Kernel (singleton) ──────────────────────────────
let current: Blackboard | null = null

export function getBlackboard(): Blackboard {
  if (current === null) current = new Blackboard()
  return current
}

export function setBlackboard(bb: Blackboard): void {
  current = bb
}

export function resetBlackboard(): void {
  current = null
}
