// MangoOS Kernel — Preuve d'efficacité de la curation orientée (#126).
//
// La « preuve de la preuve ». #125 oriente la récolte nocturne vers les familles
// au meilleur rendement mesuré (#124). Mais cette orientation FAIT-ELLE vraiment
// monter le rendement, nuit après nuit ? C'est une affirmation LONGITUDINALE : on
// ne peut pas la trancher sur un instantané. Il faut un HISTORIQUE horodaté de
// (ce qui a été priorisé) × (le rendement par famille), puis tester si les
// familles POUSSÉES une nuit voient leur rendement monter à la nuit suivante.
//
// Ce module est l'INSTRUMENT de preuve, pas une affirmation : il persiste un
// « ledger » (un échantillon par lot nocturne) et calcule l'effet par une
// différence-de-différences simple — le Δrendement moyen des familles poussées
// vs non poussées entre deux échantillons consécutifs. Tant que les données
// manquent, le verdict est honnêtement « insufficient ».
//
// HONNÊTETÉ ASSUMÉE : le rendement #124 est une moyenne CUMULÉE (remise à zéro au
// redémarrage du process). Le signal est donc directionnel et se renforce avec la
// durée d'observation ; un rendement fenêtré (par nuit) serait plus net — c'est un
// raffinement futur. On mesure ce qu'on peut mesurer, et on le dit.
import fs from 'node:fs'
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import type { ReuseKind } from './kernel-reuse-metrics.js'
import { getReuseImpactCollector } from './kernel-reuse-metrics.js'
import {
  rankFamiliesByYield,
  getCurationPriority,
  tuneKnobs,
  DEFAULT_KNOBS,
  type RankedFamily,
  type CurationPriority,
  type TuningKnobs,
} from './kernel-curation-priority.js'
import { atomicWriteFileSync } from '../safe-io.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const LEDGER_FILE = path.join(DATA_DIR, 'curation-ledger.json')
const TUNING_FILE = path.join(DATA_DIR, 'curation-tuning.json')
const MAX_SAMPLES = 400 // borne le fichier (≈ plus d'un an de nuits)

// Amortissement EMA (#130) : chaque nuit, les poids APPLIQUÉS ne bougent que
// d'une fraction α vers la cible interpolée (#129). α petit = inertie forte
// (anti-oscillation) mais réaction lente ; α=1 = réglage instantané (= #129 nu).
const DAMP_ALPHA = (() => {
  const a = Number(process.env.CURATION_DAMP_ALPHA)
  return Number.isFinite(a) && a > 0 && a <= 1 ? a : 0.4
})()
const round1 = (v: number): number => Math.round(v * 10) / 10
const round2 = (v: number): number => Math.round(v * 100) / 100

export interface FamilySample {
  kind: ReuseKind
  /** Scalaire de rendement mesuré (null si la famille n'est pas mesurable ici). */
  yieldScore: number | null
  /** La curation a-t-elle été ORIENTÉE vers cette famille à cet instant ? (traitement) */
  pushed: boolean
}

export interface CurationSample {
  ts: string
  families: FamilySample[]
}

/** Scalaire de rendement d'une famille : coût% + 1.5·succès_pts (même esprit que
 * le ranking #125 ; la durée, plus bruitée, est écartée du ledger). null si non
 * mesurée → la famille ne contribue à aucun Δ tant qu'elle n'a pas de rendement. */
export function familyYieldScore(f: Pick<RankedFamily, 'measured' | 'costSavingPct' | 'successRatePts'>): number | null {
  if (!f.measured) return null
  return (f.costSavingPct ?? 0) + 1.5 * (f.successRatePts ?? 0)
}

/** Construit un échantillon à partir du classement courant. Les familles poussées
 * = celles que la directive #125 retiendrait (top-2 non-deprioritize). Pur. */
export function buildCurationSample(ranked: RankedFamily[], ts: string): CurationSample {
  const pushed = new Set<ReuseKind>(
    ranked.filter((r) => r.reason !== 'deprioritize').slice(0, 2).map((r) => r.kind),
  )
  return {
    ts,
    families: ranked.map((f) => ({ kind: f.kind, yieldScore: familyYieldScore(f), pushed: pushed.has(f.kind) })),
  }
}

// ── Persistance du ledger ────────────────────────────────────────────────────
export function loadLedger(file: string = LEDGER_FILE): CurationSample[] {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as CurationSample[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export function appendCurationSample(sample: CurationSample, file: string = LEDGER_FILE): void {
  const ledger = loadLedger(file)
  ledger.push(sample)
  const trimmed = ledger.slice(-MAX_SAMPLES)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  atomicWriteFileSync(file, JSON.stringify(trimmed, null, 2))
}

// ── Amortissement du réglage (#130) : état persistant des poids APPLIQUÉS ────
//
// #129 saute pleinement à la cible chaque nuit → si le lift est bruité d'une nuit
// à l'autre, la politique oscille (overshoot/ringing). On amortit : les poids
// réellement appliqués suivent la cible par un filtre EMA (inertie). L'état (les
// derniers poids appliqués) est persisté, car il dépend de l'historique.

/** Interpole un EMA : prev + α·(target − prev), borné par α ∈ ]0, 1]. Pur. */
export function dampKnobs(prev: TuningKnobs, target: TuningKnobs, alpha: number = DAMP_ALPHA): TuningKnobs {
  const a = Math.max(0, Math.min(1, alpha))
  return {
    exploreBaseline: round1(prev.exploreBaseline + a * (target.exploreBaseline - prev.exploreBaseline)),
    exploitGain: round2(prev.exploitGain + a * (target.exploitGain - prev.exploitGain)),
  }
}

/** Derniers poids APPLIQUÉS (état d'amortissement). DEFAULT si rien encore. */
export function loadAppliedKnobs(file: string = TUNING_FILE): TuningKnobs {
  try {
    const k = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<TuningKnobs>
    if (typeof k.exploreBaseline === 'number' && typeof k.exploitGain === 'number') {
      return { exploreBaseline: k.exploreBaseline, exploitGain: k.exploitGain }
    }
  } catch {
    /* pas d'état → défaut */
  }
  return { ...DEFAULT_KNOBS }
}

function saveAppliedKnobs(knobs: TuningKnobs, file: string = TUNING_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  atomicWriteFileSync(file, JSON.stringify(knobs, null, 2))
}

/** Avance l'état d'amortissement d'UN pas : cible = poids interpolés sur le lift
 * courant (#129), puis EMA depuis les poids appliqués précédents. Persiste et
 * renvoie les nouveaux poids appliqués. Appelé une fois par nuit. */
export function advanceTuning(
  ledgerFile: string = LEDGER_FILE,
  tuningFile: string = TUNING_FILE,
  alpha: number = DAMP_ALPHA,
): TuningKnobs {
  const effect = analyzeCurationEffect(loadLedger(ledgerFile))
  const target = tuneKnobs(effect.verdict, effect.lift)
  const applied = dampKnobs(loadAppliedKnobs(tuningFile), target, alpha)
  saveAppliedKnobs(applied, tuningFile)
  return applied
}

/** Capture l'état courant dans le ledger ET avance l'amortissement du réglage.
 * Appelé une fois par lot nocturne. Le classement utilise les poids APPLIQUÉS
 * (amortis) → `pushed` reflète la politique réellement appliquée cette nuit.
 * Best-effort, ne lève jamais. */
export function recordCurationSample(
  now: () => string = () => new Date().toISOString(),
  file: string = LEDGER_FILE,
  tuningFile: string = TUNING_FILE,
): CurationSample | null {
  try {
    // Avance l'amortissement (#130) : un pas EMA vers la cible interpolée (#129)
    // sur rendement fenêtré (#128). Les poids appliqués sont persistés.
    const knobs = advanceTuning(file, tuningFile)
    const ranked = rankFamiliesByYield(getReuseImpactCollector().windowedSnapshot(), knobs)
    const sample = buildCurationSample(ranked, now())
    appendCurationSample(sample, file)
    return sample
  } catch {
    return null
  }
}

// ── Boucle auto-réglée (#127) + amortie (#130) ───────────────────────────────
export interface TunedCurationPriority extends CurationPriority {
  verdict: CurationVerdict
  /** Cible interpolée vers laquelle l'amortissement converge (#129/#130). */
  targetKnobs: TuningKnobs
}

/** Priorité de curation AUTO-RÉGLÉE et AMORTIE : classe avec les poids APPLIQUÉS
 * (état amorti #130), et expose la `targetKnobs` (cible vers laquelle on converge)
 * + le verdict. LECTURE SEULE — n'avance pas l'amortissement (seul recordCuration-
 * Sample, une fois par nuit, le fait). L'orchestration vit ici (dépend de priority)
 * pour éviter le cycle d'import. */
export function getTunedCurationPriority(
  file: string = LEDGER_FILE,
  tuningFile: string = TUNING_FILE,
): TunedCurationPriority {
  const effect = analyzeCurationEffect(loadLedger(file))
  const target = tuneKnobs(effect.verdict, effect.lift)
  const applied = loadAppliedKnobs(tuningFile)
  return { ...getCurationPriority(applied), verdict: effect.verdict, targetKnobs: target }
}

// ── Analyse de l'effet (différence-de-différences) ───────────────────────────
export type CurationVerdict = 'positive' | 'neutral' | 'negative' | 'insufficient'

export interface CurationEffect {
  samples: number
  /** Nb de couples (famille, transition t→t+1) où le rendement est mesuré aux deux bouts. */
  observations: number
  /** Δrendement moyen des familles POUSSÉES à l'instant t. */
  avgDeltaPushed: number | null
  /** Δrendement moyen des familles NON poussées. */
  avgDeltaOther: number | null
  /** Surcroît de progression des familles poussées (avgDeltaPushed − avgDeltaOther). */
  lift: number | null
  verdict: CurationVerdict
}

/** Teste si orienter la curation fait monter le rendement : pour chaque transition
 * entre deux échantillons consécutifs, compare le Δrendement des familles poussées
 * à l'instant t vs les autres. Un `lift` positif net = la curation orientée précède
 * une hausse de rendement plus forte sur les familles qu'elle a visées. Pur. */
export function analyzeCurationEffect(
  ledger: CurationSample[],
  opts: { minPushed?: number; minObservations?: number; margin?: number } = {},
): CurationEffect {
  const minPushed = opts.minPushed ?? 3
  const minObservations = opts.minObservations ?? 6
  const margin = opts.margin ?? 1
  const pushedDeltas: number[] = []
  const otherDeltas: number[] = []
  for (let i = 0; i < ledger.length - 1; i++) {
    const cur = ledger[i]
    const next = new Map(ledger[i + 1].families.map((f) => [f.kind, f]))
    for (const fa of cur.families) {
      const fb = next.get(fa.kind)
      if (!fb || fa.yieldScore === null || fb.yieldScore === null) continue // mesuré aux deux bouts
      const delta = fb.yieldScore - fa.yieldScore
      ;(fa.pushed ? pushedDeltas : otherDeltas).push(delta)
    }
  }
  const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const round1 = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10)
  const avgPushed = avg(pushedDeltas)
  const avgOther = avg(otherDeltas)
  const observations = pushedDeltas.length + otherDeltas.length
  const lift = avgPushed === null ? null : avgPushed - (avgOther ?? 0)

  let verdict: CurationVerdict
  if (pushedDeltas.length < minPushed || observations < minObservations || lift === null) {
    verdict = 'insufficient'
  } else if (lift > margin) {
    verdict = 'positive'
  } else if (lift < -margin) {
    verdict = 'negative'
  } else {
    verdict = 'neutral'
  }
  return {
    samples: ledger.length,
    observations,
    avgDeltaPushed: round1(avgPushed),
    avgDeltaOther: round1(avgOther),
    lift: round1(lift),
    verdict,
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerCurationEffectRoutes(app: Express): void {
  // Priorité de curation AUTO-RÉGLÉE (#127) — la route reflète la politique réelle
  // (poids ajustés par le verdict). Vit ici car la version réglée dépend de l'analyse.
  app.get('/api/curation/priority', (_req: Request, res: Response) => {
    res.json(getTunedCurationPriority())
  })
  app.get('/api/curation/effect', (_req: Request, res: Response) => {
    res.json(analyzeCurationEffect(loadLedger()))
  })
  // Capture manuelle d'un échantillon (utile pour amorcer/expérimenter sans
  // attendre une nuit). Renvoie l'échantillon écrit.
  app.post('/api/curation/sample', (_req: Request, res: Response) => {
    const sample = recordCurationSample()
    res.json({ ok: Boolean(sample), sample })
  })
}
