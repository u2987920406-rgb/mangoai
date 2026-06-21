import type { HistoryEntry, Idea, Status } from './types'
import { SEED } from './seed'

const KEY = 'mango.command-center.v1'
const HISTORY_KEY = 'mango.command-center.history.v1'

// --- Validation defensive (un localStorage corrompu ne doit jamais planter l'app) ---

const STATUS_SET = new Set<Status>(['idea', 'doing', 'blocked', 'done'])
const MODEL_SET = new Set(['haiku', 'sonnet', 'opus', 'none'])
const EFFORT_SET = new Set(['XS', 'S', 'M', 'L', 'XL', 'none'])

function isValidIdea(x: unknown): x is Idea {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'number' &&
    typeof o.title === 'string' &&
    typeof o.status === 'string' &&
    STATUS_SET.has(o.status as Status) &&
    typeof o.model === 'string' &&
    MODEL_SET.has(o.model) &&
    typeof o.effort === 'string' &&
    EFFORT_SET.has(o.effort) &&
    Array.isArray(o.tags) &&
    Array.isArray(o.deps) &&
    typeof o.notes === 'string' &&
    typeof o.updatedAt === 'number'
  )
}

function sanitize(arr: unknown): Idea[] {
  if (!Array.isArray(arr)) return []
  return arr.filter(isValidIdea).map((i) => ({
    ...i,
    tags: i.tags.map(String),
    deps: i.deps.filter((d) => typeof d === 'number'),
  }))
}

// --- Lecture / ecriture ---

export function load(): Idea[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) {
      // 1er lancement : on seed et on persiste.
      save(SEED)
      return clone(SEED)
    }
    const parsed = sanitize(JSON.parse(raw))
    return parsed.length ? parsed : clone(SEED)
  } catch {
    return clone(SEED)
  }
}

export function save(ideas: Idea[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ideas))
  } catch {
    // quota / mode prive : on echoue silencieusement (rien de critique a perdre cote outil perso).
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (e): e is HistoryEntry =>
        e &&
        typeof e.id === 'number' &&
        STATUS_SET.has(e.from) &&
        STATUS_SET.has(e.to) &&
        typeof e.ts === 'number',
    )
  } catch {
    return []
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    // On borne le journal pour ne pas faire enfler le stockage indefiniment.
    const capped = entries.slice(-500)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(capped))
  } catch {
    /* ignore */
  }
}

// --- Export / Import / Reset ---

export interface Backup {
  app: 'mango-command-center'
  version: 1
  exportedAt: number
  ideas: Idea[]
  history: HistoryEntry[]
}

export function exportJson(ideas: Idea[], history: HistoryEntry[]): string {
  const backup: Backup = {
    app: 'mango-command-center',
    version: 1,
    exportedAt: Date.now(),
    ideas,
    history,
  }
  return JSON.stringify(backup, null, 2)
}

export interface ImportResult {
  ok: boolean
  ideas?: Idea[]
  history?: HistoryEntry[]
  error?: string
}

export function importJson(raw: string): ImportResult {
  try {
    const data = JSON.parse(raw)
    // On accepte soit un Backup complet, soit un simple tableau d'idees.
    const rawIdeas = Array.isArray(data) ? data : data?.ideas
    const ideas = sanitize(rawIdeas)
    if (!ideas.length) return { ok: false, error: 'Aucune idee valide trouvee dans le fichier.' }
    const history: HistoryEntry[] = Array.isArray(data?.history)
      ? data.history.filter(
          (e: unknown): e is HistoryEntry =>
            !!e &&
            typeof (e as HistoryEntry).id === 'number' &&
            STATUS_SET.has((e as HistoryEntry).from) &&
            STATUS_SET.has((e as HistoryEntry).to) &&
            typeof (e as HistoryEntry).ts === 'number',
        )
      : []
    return { ok: true, ideas, history }
  } catch {
    return { ok: false, error: 'Fichier JSON illisible.' }
  }
}

export function resetToSeed(): Idea[] {
  save(SEED)
  saveHistory([])
  return clone(SEED)
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}
