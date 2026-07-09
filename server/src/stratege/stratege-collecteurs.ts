// #176-global — Stratège GLOBAL proactif : COLLECTEURS de signaux (É2).
//
// Sept adapters LECTURE SEULE, chacun FAIL-OPEN indépendamment (D4) : un capteur
// mort ne casse jamais la synthèse — il manque, c'est tout. Chaque fonction
// renvoie TOUJOURS un `Signal[]` (jamais ne lève), au format du spine pur
// (stratege-global-model.ts / stratege-global.ts, É1). On ne recalcule AUCUN
// capteur existant (D1/D4) : on LIT les rapports/stores déjà produits par
// d'autres modules (readObserverReport, kernel-reuse-metrics, trace-dashboard,
// self-evolution, axioms-drift/axioms-validation).
//
// Discipline reprise de `readObserverReport`/`readBreakerVerdict` (mangoqa.ts) :
//   - fichier/route absent → [] (jamais de throw)
//   - fichier trop gros/corrompu → neutre (mêmes gardes, [] ou entrée ignorée)
//   - fichier valide → signaux normalisés vers le type `Signal` d'É1
//
// Toutes les deps sont injectables (chemins de fichiers / lecteurs fake) pour
// des tests déterministes, zéro I/O réseau, zéro dépendance à un vrai workspace.

import fs from "node:fs"
import path from "node:path"
import { WORKSPACE_DIR } from "../projects.js"
import { readObserverReport, type ObserverReportResult } from "../mangoqa.js"
import { getReuseCollector, type ReuseSnapshot } from "../kernel/kernel-reuse-metrics.js"
import { getTraceCollector, type TraceSnapshot, type TraceRow } from "../trace-dashboard.js"
import { loadGaps as loadGapsReal, type OpenGap } from "../self/self-evolution.js"
import { loadQuarantine as loadQuarantineReal, type QuarantineEntry } from "../axioms-validation.js"
import { ATOMS_CONFLICTS_FILE_NAME } from "../axioms-drift.js"
import type { Signal } from "./stratege-global-model.js"

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s.trim().slice(0, n) : "")
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

// ————————————————————————————————————————————————————————————————
// 1. QA ← readObserverReport (patterns d'échec, déjà calculés par le fantôme).
// ————————————————————————————————————————————————————————————————

export interface CollectQaDeps {
  /** Injectable pour les tests (défaut : readObserverReport réel). */
  readReport?: (workspaceDir?: string) => ObserverReportResult
  workspaceDir?: string
}

/** Transforme les patterns de l'Observateur-Conseil en Signal[] (source "qa").
 *  Ne recalcule RIEN (D1) : lit le rapport déjà produit. Fail-open total. */
export function collectQA(deps: CollectQaDeps = {}): Signal[] {
  try {
    const readReport = deps.readReport ?? readObserverReport
    const result = readReport(deps.workspaceDir)
    if (!result || result.available !== true) return []
    const ts = Date.parse(result.generatedAt)
    const tsResolved = Number.isFinite(ts) ? ts : Date.now()
    const patterns = Array.isArray(result.report?.patterns) ? result.report.patterns : []
    const out: Signal[] = []
    for (const p of patterns.slice(0, 50)) {
      if (!p || typeof p !== "object") continue
      const kind = clip(p.kind, 40) || "pattern"
      const subject = clip(p.subject, 60)
      const examples = Array.isArray(p.examples) ? p.examples.slice(0, 3).map((e) => clip(e, 80)) : []
      out.push({
        sig: `qa:${kind}:${subject || "?"}`,
        source: "qa",
        poids: clamp01(typeof p.share === "number" ? p.share : 0.5),
        ts: tsResolved,
        type: kind,
        nature: "probleme",
        subject: subject || kind,
        detail: examples.join(" · "),
        value: typeof p.count === "number" ? p.count : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 2. Bus ← bus-events.jsonl (chat.turn : cost/turns/duration).
// ————————————————————————————————————————————————————————————————

const BUS_EVENTS_MAX_BYTES = 5_000_000 // garde-fou — au-delà, on considère le fichier illisible (neutre)
const BUS_EVENTS_MAX_LINES = 500 // borne le coût de lecture/transformation

export interface CollectBusDeps {
  /** Chemin du fichier bus-events.jsonl. Défaut : <workspace>/.mangoqa/bus-events.jsonl. */
  file?: string
  maxBytes?: number
}

interface BusEnvelopeLite {
  id?: unknown
  type?: unknown
  ts?: unknown
  payload?: unknown
}

/** Lit bus-events.jsonl (export du pont Kernel→MangoQA) et transforme les
 *  événements `chat.turn` (cost/turns/durationMs) en Signal[] (source "bus").
 *  Fail-open : fichier absent → [] ; trop gros → [] (neutre) ; lignes corrompues
 *  ignorées individuellement (le reste du fichier reste exploitable). */
export function collectBus(deps: CollectBusDeps = {}): Signal[] {
  try {
    const file = deps.file ?? path.join(WORKSPACE_DIR, ".mangoqa", "bus-events.jsonl")
    const maxBytes = deps.maxBytes ?? BUS_EVENTS_MAX_BYTES
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      return [] // absent
    }
    if (stat.size > maxBytes) return [] // trop gros → neutre

    let raw: string
    try {
      raw = fs.readFileSync(file, "utf8")
    } catch {
      return []
    }

    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(-BUS_EVENTS_MAX_LINES)
    const out: Signal[] = []
    for (const line of lines) {
      let env: BusEnvelopeLite
      try {
        env = JSON.parse(line)
      } catch {
        continue // ligne corrompue individuelle → ignorée, le reste continue
      }
      if (!env || typeof env !== "object" || env.type !== "chat.turn") continue
      const payload = (env.payload ?? {}) as Record<string, unknown>
      const ts = typeof env.ts === "number" && Number.isFinite(env.ts) ? env.ts : Date.now()
      const project = clip(payload.project, 60) || "?"
      const costUsd = typeof payload.costUsd === "number" ? payload.costUsd : 0
      const turns = typeof payload.turns === "number" ? payload.turns : 0
      const durationMs = typeof payload.durationMs === "number" ? payload.durationMs : 0
      const id = typeof env.id === "string" && env.id ? env.id : `${project}:${ts}`
      out.push({
        sig: `bus:chat.turn:${id}`,
        source: "bus",
        // saillance de base : coût normalisé (1$ = saillance pleine), plancher léger
        poids: clamp01(costUsd / 1 || (turns >= 20 ? 0.6 : 0.2)),
        ts,
        type: "chat.turn",
        nature: "probleme",
        subject: project,
        detail: `coût $${costUsd.toFixed(2)}, ${turns} tour(s), ${durationMs}ms`,
        value: costUsd,
      })
    }
    return out
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 3. Traces ← trace-dashboard (escalades Claude, souveraineté).
// ————————————————————————————————————————————————————————————————

export interface CollectTracesDeps {
  /** Injectable : défaut = snapshot du singleton getTraceCollector(). */
  snapshot?: () => TraceSnapshot
}

/** Transforme les lignes de trace récentes en Signal[] (source "traces") — la
 *  matière de souveraineté (coût Claude réellement encouru = escalade). Fail-
 *  open : snapshot indisponible/throw → []. */
export function collectTraces(deps: CollectTracesDeps = {}): Signal[] {
  try {
    const snapshot = deps.snapshot ?? (() => getTraceCollector().snapshot())
    const snap = snapshot()
    if (!snap || !Array.isArray(snap.recent)) return []
    const out: Signal[] = []
    for (const row of snap.recent.slice(0, 200) as TraceRow[]) {
      if (!row || typeof row !== "object") continue
      const costUsd = typeof row.costUsd === "number" ? row.costUsd : undefined
      if (!costUsd || costUsd <= 0) continue // pas de coût Claude réel → pas une escalade
      out.push({
        sig: `traces:escalade:${row.project ?? "?"}:${row.ts}`,
        source: "traces",
        poids: clamp01(costUsd / 1),
        ts: Number.isFinite(row.ts) ? row.ts : Date.now(),
        type: "escalade-claude",
        nature: "probleme",
        subject: clip(row.project, 60) || row.name,
        detail: `${row.provider ?? "?"}/${row.model ?? "?"} — $${costUsd.toFixed(3)}, ${row.durationMs}ms`,
        value: costUsd,
      })
    }
    return out
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 4. Réutilisation ← kernel-reuse-metrics (reuseRatePct).
// ————————————————————————————————————————————————————————————————

export interface CollectReuseDeps {
  /** Injectable : défaut = snapshot du singleton getReuseCollector(). */
  snapshot?: () => ReuseSnapshot
  now?: () => number
  /** Sous ce seuil (%), la réutilisation est jugée un PROBLÈME (mémoire ne paie pas). */
  healthyThresholdPct?: number
}

/** Un seul signal agrégé (dédup stable "reuse:rate-global") représentant le
 *  taux de réutilisation courant — la spine le suit dans le temps (hits++ via
 *  ré-observation). Fail-open : pas de tours observés / snapshot KO → []. */
export function collectReuse(deps: CollectReuseDeps = {}): Signal[] {
  try {
    const snapshot = deps.snapshot ?? (() => getReuseCollector().snapshot())
    const now = deps.now ?? (() => Date.now())
    const threshold = deps.healthyThresholdPct ?? 30
    const snap = snapshot()
    if (!snap || typeof snap.totalTurns !== "number" || snap.totalTurns <= 0) return []
    const rate = typeof snap.reuseRatePct === "number" ? snap.reuseRatePct : 0
    const isProblem = rate < threshold
    return [
      {
        sig: "reuse:rate-global",
        source: "reuse",
        poids: clamp01(isProblem ? (threshold - rate) / threshold : 0.3),
        ts: now(),
        type: "taux-reutilisation",
        nature: isProblem ? "probleme" : "opportunite",
        subject: "réutilisation globale",
        detail: `${rate}% (${snap.reuseTurns}/${snap.totalTurns} tours réutilisent, ${snap.totalReuses} réutilisation(s))`,
        value: rate,
      },
    ]
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 5. Blocages ← classes de blocage #164 agrégées cross-run.
// ————————————————————————————————————————————————————————————————
// Précision (aucun log dédié n'existe pour CHAQUE occurrence de blocage) : la
// seule trace persistée cross-run des classes de blocage (`Diagnosis.blocker`,
// stratege-signals.ts) est `open-gaps.json` (#168, self-evolution.ts), où
// chaque OpenGap porte son `blocker` d'origine + un compteur `hits`. Ce
// collecteur AGRÈGE par CLASSE (somme des hits de tous les gaps qui partagent
// le même `blocker`, tous statuts confondus) — un signal "cette classe de
// blocage revient à travers les runs". `collectLacunes` (ci-dessous) lit la
// MÊME source mais à la granularité de la lacune individuelle actionnable
// (status "proposed") — les deux transformations sont disjointes, zéro
// recalcul d'un capteur qui n'existe pas déjà ailleurs (D1/D4).

export interface CollectBlocagesDeps {
  /** Injectable pour les tests (défaut : loadGaps réel, self-evolution.ts). */
  loadGaps?: () => OpenGap[]
  now?: () => number
}

export function collectBlocages(deps: CollectBlocagesDeps = {}): Signal[] {
  try {
    const load = deps.loadGaps ?? loadGapsReal
    const now = deps.now ?? (() => Date.now())
    const gaps = load()
    if (!Array.isArray(gaps) || gaps.length === 0) return []

    const byBlocker = new Map<string, { hits: number; examples: string[]; lastUpdatedAt: string }>()
    for (const g of gaps) {
      if (!g || typeof g !== "object" || typeof g.blocker !== "string" || !g.blocker) continue
      const cur = byBlocker.get(g.blocker) ?? { hits: 0, examples: [], lastUpdatedAt: g.updatedAt ?? "" }
      cur.hits += typeof g.hits === "number" ? g.hits : 1
      if (cur.examples.length < 3 && g.detail) cur.examples.push(clip(g.detail, 80))
      if (g.updatedAt && g.updatedAt > cur.lastUpdatedAt) cur.lastUpdatedAt = g.updatedAt
      byBlocker.set(g.blocker, cur)
    }

    const out: Signal[] = []
    for (const [blocker, agg] of byBlocker) {
      const ts = Date.parse(agg.lastUpdatedAt)
      out.push({
        sig: `blocages:${blocker}`,
        source: "blocages",
        poids: clamp01(agg.hits / 10),
        ts: Number.isFinite(ts) ? ts : now(),
        type: "blocage-recurrent",
        nature: "probleme",
        subject: blocker,
        detail: agg.examples.join(" · "),
        value: agg.hits,
      })
    }
    return out
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 6. Lacunes ← open-gaps.json (#168 : lacunes de capacité chroniques).
// ————————————————————————————————————————————————————————————————

export interface CollectLacunesDeps {
  loadGaps?: () => OpenGap[]
  now?: () => number
}

/** Une lacune ouverte (statut "proposed", pas encore forgée/écartée) devient
 *  une SUGGESTION (« je propose de forger un agent pour ça »). Fail-open :
 *  store absent/corrompu → loadGaps() renvoie déjà [] (self-evolution.ts). */
export function collectLacunes(deps: CollectLacunesDeps = {}): Signal[] {
  try {
    const load = deps.loadGaps ?? loadGapsReal
    const now = deps.now ?? (() => Date.now())
    const gaps = load()
    if (!Array.isArray(gaps) || gaps.length === 0) return []
    const out: Signal[] = []
    for (const g of gaps.slice(0, 100)) {
      if (!g || typeof g !== "object" || g.status !== "proposed") continue
      const ts = Date.parse(g.updatedAt ?? "")
      out.push({
        sig: `lacunes:${g.sig || g.id}`,
        source: "lacunes",
        poids: clamp01((typeof g.hits === "number" ? g.hits : 1) / 5),
        ts: Number.isFinite(ts) ? ts : now(),
        type: "lacune-capacite",
        nature: "opportunite",
        subject: clip(g.title, 80) || g.blocker,
        detail: clip(g.detail, 150),
        value: typeof g.hits === "number" ? g.hits : undefined,
      })
    }
    return out
  } catch {
    return []
  }
}

// ————————————————————————————————————————————————————————————————
// 7. Mémoire ← axioms-conflicts.md (dérive) + axioms-quarantine.json.
// ————————————————————————————————————————————————————————————————

const AXIOMS_CONFLICTS_MAX_BYTES = 2_000_000
const AXIOMS_QUARANTINE_MAX_BYTES = 2_000_000

export interface CollectMemoireDeps {
  workspaceDir?: string
  /** Injectable pour les tests (défaut : loadQuarantine réel, axioms-validation.ts). */
  loadQuarantine?: (workspaceDir: string) => QuarantineEntry[]
  now?: () => number
}

/** Compte les épisodes de dérive consignés dans .axioms-conflicts.md (un par
 *  en-tête "## Dérive détectée"). Fail-open : absent/trop gros/illisible → 0. */
function countConflictEpisodes(workspaceDir: string): number {
  try {
    const file = path.join(workspaceDir, ATOMS_CONFLICTS_FILE_NAME)
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      return 0 // absent
    }
    if (stat.size > AXIOMS_CONFLICTS_MAX_BYTES) return 0 // trop gros → neutre
    const raw = fs.readFileSync(file, "utf8")
    const matches = raw.match(/^## Dérive détectée/gm)
    return matches ? matches.length : 0
  } catch {
    return 0
  }
}

/** Hygiène mémoire (D4 canal #3) : conflits d'axiomes (dérive) + quarantaine
 *  (candidats pas encore promus). Fail-open TOTAL, deux sources indépendantes
 *  (une échouant ne bloque pas l'autre). */
export function collectMemoire(deps: CollectMemoireDeps = {}): Signal[] {
  const workspaceDir = deps.workspaceDir ?? WORKSPACE_DIR
  const now = deps.now ?? (() => Date.now())
  const out: Signal[] = []

  // Volet 1 — dérive (conflits d'axiomes).
  try {
    const episodes = countConflictEpisodes(workspaceDir)
    if (episodes > 0) {
      out.push({
        sig: "memoire:derive-axiomes",
        source: "memoire",
        poids: clamp01(episodes / 5),
        ts: now(),
        type: "derive-axiomes",
        nature: "probleme",
        subject: "conflits d'axiomes",
        detail: `${episodes} épisode(s) de dérive consigné(s) dans ${ATOMS_CONFLICTS_FILE_NAME}`,
        value: episodes,
      })
    }
  } catch {
    // fail-open : ce volet ne bloque pas l'autre
  }

  // Volet 2 — quarantaine (candidats non promus).
  try {
    let stat: fs.Stats | null = null
    try {
      stat = fs.statSync(path.join(workspaceDir, ".axioms-quarantine.json"))
    } catch {
      stat = null
    }
    if (stat && stat.size <= AXIOMS_QUARANTINE_MAX_BYTES) {
      const load = deps.loadQuarantine ?? loadQuarantineReal
      const entries = load(workspaceDir)
      for (const e of Array.isArray(entries) ? entries.slice(0, 50) : []) {
        if (!e || typeof e !== "object" || typeof e.text !== "string") continue
        const ts = Date.parse(e.lastSeen ?? "")
        out.push({
          sig: `memoire:quarantaine:${e.text.slice(0, 60)}`,
          source: "memoire",
          poids: clamp01((typeof e.seen === "number" ? e.seen : 1) / 3),
          ts: Number.isFinite(ts) ? ts : now(),
          type: "quarantaine-axiome",
          nature: "opportunite",
          subject: clip(e.text, 60),
          detail: `vu ${e.seen} fois, en attente de promotion`,
          value: e.seen,
        })
      }
    }
    // stat absent ou trop gros → volet neutre (aucun signal, jamais de throw)
  } catch {
    // fail-open : ce volet ne bloque pas l'autre
  }

  return out
}

// ————————————————————————————————————————————————————————————————
// Agrégat pratique — tous les collecteurs (hors "demandes", réservé É6).
// ————————————————————————————————————————————————————————————————

/** Lance les 7 collecteurs et concatène leurs Signal[]. Chacun est déjà
 *  fail-open individuellement : un capteur qui renvoie [] ne bloque pas les
 *  autres. Pratique pour l'orchestrateur (É4), pas requis par les tests unitaires
 *  (qui exercent chaque collecteur isolément avec ses propres deps). */
export function collectAll(): Signal[] {
  try {
    return [
      ...collectQA(),
      ...collectBus(),
      ...collectTraces(),
      ...collectReuse(),
      ...collectBlocages(),
      ...collectLacunes(),
      ...collectMemoire(),
    ]
  } catch {
    return []
  }
}
