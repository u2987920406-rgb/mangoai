// MangoOS — Tableau de bord des traces (lecture du flux OpenTelemetry du Kernel).
//
// Depuis l'activation du Kernel (#112→#115), tout le trafic coule sur l'Event Bus
// sous forme de spans `kernel.trace` : chaque tour de chat (`chat.turn`) ET chaque
// appel one-shot (`brain.complete`) y passent, avec durée, statut, coût, provider.
// Ce collecteur s'abonne au flux et tient un agrégat + un buffer récent borné, que
// l'UI lit via /api/traces. C'est la VUE de ce que MangoQA observe — côté MangoOS.
//
// Live (Bus), complémentaire de metrics-dashboard (fichier .metrics.jsonl) : ici on
// voit AUSSI les appels one-shot (juges, patrouilleurs, radar…), pas seulement les
// tours de chat. Tout en mémoire, déterministe, zéro I/O.
import type { Express, Request, Response } from 'express'
import { getBus, type KernelBus } from './kernel/kernel-bus.js'
import { TRACE_EVENT, type SpanData } from './kernel/kernel-trace.js'

/** Une ligne de trace condensée pour l'UI (extraite d'un span). */
export interface TraceRow {
  name: string
  status: string
  durationMs: number
  ts: number
  provider?: string
  model?: string
  project?: string
  costUsd?: number
  turns?: number
}

export interface TraceStats {
  total: number
  byName: Record<string, number>
  errors: number
  totalCostUsd: number
  byProvider: Record<string, number>
  avgDurationMs: number
}

export interface TraceSnapshot {
  recent: TraceRow[]
  stats: TraceStats
  collectedAt: number
}

const MAX_ROWS = 500

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

export class TraceCollector {
  private ring: TraceRow[] = []
  private total = 0
  private errors = 0
  private totalCostUsd = 0
  private durationSum = 0
  private byName = new Map<string, number>()
  private byProvider = new Map<string, number>()

  /** Absorbe un span. Défensif : un payload malformé est ignoré. */
  ingest(span: SpanData | undefined): void {
    if (!span || typeof span.name !== 'string') return
    const a = span.attributes ?? {}
    const row: TraceRow = {
      name: span.name,
      status: span.status,
      durationMs: num(span.durationMs) ?? 0,
      ts: num(span.endTime) ?? num(span.startTime) ?? 0,
      provider: str(a.provider),
      model: str(a.model),
      project: str(a.project),
      costUsd: num(a['cost.usd']),
      turns: num(a.turns),
    }
    this.ring.push(row)
    if (this.ring.length > MAX_ROWS) this.ring.shift()
    this.total++
    if (span.status === 'error') this.errors++
    if (row.costUsd) this.totalCostUsd += row.costUsd
    this.durationSum += row.durationMs
    this.byName.set(span.name, (this.byName.get(span.name) ?? 0) + 1)
    if (row.provider) this.byProvider.set(row.provider, (this.byProvider.get(row.provider) ?? 0) + 1)
  }

  snapshot(now = Date.now()): TraceSnapshot {
    return {
      recent: [...this.ring].reverse(), // plus récents en tête
      stats: {
        total: this.total,
        byName: Object.fromEntries(this.byName),
        errors: this.errors,
        totalCostUsd: Math.round(this.totalCostUsd * 1e6) / 1e6,
        byProvider: Object.fromEntries(this.byProvider),
        avgDurationMs: this.total ? Math.round(this.durationSum / this.total) : 0,
      },
      collectedAt: now,
    }
  }

  reset(): void {
    this.ring = []
    this.total = 0
    this.errors = 0
    this.totalCostUsd = 0
    this.durationSum = 0
    this.byName.clear()
    this.byProvider.clear()
  }
}

// ── Singleton + branchement sur le Bus ───────────────────────────────────────
let collector: TraceCollector | null = null
let unsub: (() => void) | null = null

export function getTraceCollector(): TraceCollector {
  if (!collector) collector = new TraceCollector()
  return collector
}

/** Branche le collecteur sur le Bus (abonné aux spans `kernel.trace`). Idempotent. */
export function installTraceCollector(bus: KernelBus = getBus()): void {
  if (unsub) return
  const c = getTraceCollector()
  unsub = bus.subscribe(TRACE_EVENT, 'trace-collector', (env) => {
    c.ingest(env.payload as SpanData)
  })
}

export function uninstallTraceCollector(): void {
  if (unsub) {
    unsub()
    unsub = null
  }
}

export function registerTraceRoutes(app: Express): void {
  app.get('/api/traces', (_req: Request, res: Response) => {
    res.json(getTraceCollector().snapshot())
  })
}
