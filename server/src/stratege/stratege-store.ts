// #176-global — Stratège GLOBAL proactif : PERSISTANCE cross-session (É3).
//
// Store JSON atomique dédié `data/strategist-state.json` — le JUMEAU EXACT du
// store d'auto-évolution (`self-evolution.ts`, #168) : mêmes disciplines
// (chemin surchargeable pour les tests, écriture atomique tmp+rename via
// `atomicWriteFileSync`, dédup par `sig` déjà assurée en amont par
// `advanceState` de `stratege-global.ts` — CE module ne fait QUE charger/écrire
// et borner la taille, il ne réimplémente jamais la logique de synthèse/dédup).
//
// Contrat (D3, D2) :
//  - `loadStrategistState` NE LÈVE JAMAIS : fichier absent → état vide initial
//    (bootstrap propre) ; fichier corrompu/invalide → repli état vide + warning
//    loggé (jamais throw, jamais crash du process appelant).
//  - `saveStrategistState` écrit ATOMIQUEMENT (tmp+rename, `atomicWriteFileSync`),
//    et borne la taille AVANT d'écrire (`pruneStrategistState`) pour que le
//    fichier ne grossisse jamais indéfiniment (cap d'items + TTL par ancienneté,
//    même esprit que `MAX_GAPS`/`.slice()` de `self-evolution.ts` et le ledger
//    borné en fenêtre de `nocturnal-budget.ts`).

import fs from "node:fs"
import path from "node:path"
import { atomicWriteFileSync } from "../safe-io.js"
import {
  emptyStrategistState,
  normalizeState,
  type BriefingItem,
  type SeenSignal,
  type StrategistState,
} from "./stratege-global-model.js"

/** Chemin du store, surchargeable par env (testabilité — patron `OPEN_GAPS_FILE`).
 *  Résolu paresseusement (pas au chargement du module) pour que les tests
 *  puissent fixer `STRATEGIST_STATE_FILE` avant le premier appel. */
export function strategistStateFile(): string {
  return process.env.STRATEGIST_STATE_FILE ?? path.join(import.meta.dirname, "..", "data", "strategist-state.json")
}

// ————————————————————————————————————————————————————————————————
// Bornage anti-croissance (cap + TTL) — appliqué AVANT chaque écriture.
// ————————————————————————————————————————————————————————————————

export interface PruneOptions {
  /** Nombre max d'items conservés (les plus « chauds » d'abord : hits ↓, updatedAt ↓). */
  maxItems?: number
  /** Nombre max d'entrées de journal conservées (les plus récentes). */
  maxJournal?: number
  /** Nombre max de `sig` dans `seen` (les plus récemment vus d'abord). */
  maxSeen?: number
  /** TTL (ms) : un item `accepte`/`rejete` plus vieux que `now - ttlMs` est purgé
   *  (les items `pending`/`reporte` ne sont jamais purgés par TTL — Raf doit
   *  encore statuer dessus ; seul le cap les borne). Défaut 90 jours. */
  ttlMs?: number
  /** `now` injectable (tests). */
  now?: number
}

const PRUNE_DEFAULTS: Required<PruneOptions> = {
  maxItems: 200,
  maxJournal: 100,
  maxSeen: 500,
  ttlMs: 90 * 24 * 60 * 60 * 1000,
  now: Date.now(),
}

function itemAge(item: BriefingItem, now: number): number {
  const t = Date.parse(item.updatedAt || item.createdAt || "")
  return Number.isFinite(t) ? now - t : 0
}

/** Borne un état (cap + TTL) — PUR, ne lève jamais, renvoie un NOUVEL état.
 *  Règles :
 *   - items `accepte`/`rejete` plus vieux que `ttlMs` → purgés (statut définitif,
 *     déjà traité par Raf, plus besoin de le garder indéfiniment).
 *   - le reste est trié (hits ↓ puis updatedAt ↓) et tronqué à `maxItems`.
 *   - `seen` : borné à `maxSeen` entrées les plus récentes (par `lastSeen`).
 *   - `journal` : les `maxJournal` entrées les plus récentes. */
export function pruneStrategistState(state: StrategistState, options: PruneOptions = {}): StrategistState {
  const opts: Required<PruneOptions> = { ...PRUNE_DEFAULTS, now: Date.now(), ...options }
  const safe = normalizeState(state)

  const items = safe.items
    .filter((i) => {
      const settled = i.status === "accepte" || i.status === "rejete"
      if (!settled) return true
      return itemAge(i, opts.now) < opts.ttlMs
    })
    .sort((a, b) => b.hits - a.hits || (b.updatedAt < a.updatedAt ? -1 : 1))
    .slice(0, opts.maxItems)

  const seenEntries = Object.entries(safe.seen)
    .sort(([, a], [, b]) => (b.lastSeen < a.lastSeen ? -1 : 1))
    .slice(0, opts.maxSeen)
  const seen: Record<string, SeenSignal> = {}
  for (const [k, v] of seenEntries) seen[k] = v

  const journal = safe.journal.slice(-opts.maxJournal)

  return {
    version: safe.version,
    items,
    seen,
    lastRunAt: safe.lastRunAt,
    windowFrom: safe.windowFrom,
    journal,
  }
}

// ————————————————————————————————————————————————————————————————
// I/O — charge / écrit le fichier (fail-open, ne lève jamais).
// ————————————————————————————————————————————————————————————————

/**
 * Charge l'état persisté. Ne lève JAMAIS :
 *  - fichier absent → état vide initial (bootstrap propre, silencieux).
 *  - JSON invalide / structure inattendue → repli état vide + warning loggé.
 * `file` surchargeable (env `STRATEGIST_STATE_FILE` par défaut, ou paramètre —
 * utile pour les tests qui veulent un chemin explicite sans toucher process.env).
 */
export function loadStrategistState(file: string = strategistStateFile()): StrategistState {
  try {
    if (!fs.existsSync(file)) return emptyStrategistState()
    const raw = fs.readFileSync(file, "utf8")
    const parsed = JSON.parse(raw)
    return normalizeState(parsed)
  } catch (err) {
    console.warn(`[stratege-store] état illisible/corrompu (${file}), repli état vide :`, (err as Error)?.message ?? err)
    return emptyStrategistState()
  }
}

/**
 * Persiste l'état (écriture ATOMIQUE tmp+rename via `atomicWriteFileSync`),
 * après l'avoir BORNÉ (`pruneStrategistState`) pour que le fichier ne grossisse
 * jamais indéfiniment. Best-effort : une panne d'I/O ici ne doit jamais faire
 * planter l'appelant (même discipline que `writeGlobalBudgetState`).
 */
export function saveStrategistState(
  state: StrategistState,
  file: string = strategistStateFile(),
  pruneOptions: PruneOptions = {},
): void {
  try {
    const bounded = pruneStrategistState(normalizeState(state), pruneOptions)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    atomicWriteFileSync(file, JSON.stringify(bounded, null, 2))
  } catch (err) {
    console.warn(`[stratege-store] échec écriture (${file}), état non persisté :`, (err as Error)?.message ?? err)
  }
}
