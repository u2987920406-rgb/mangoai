// MangoOS Kernel — Tracing / OpenTelemetry (pilier 5, cf. fondation.md).
//
// La traçabilité du Kernel : chaque opération (appel cerveau, publication bus,
// verrou, invocation d'outil) peut être enveloppée dans un SPAN. Le but premier :
// MangoQA LIT les traces, il ne relit pas le code.
//
// Choix d'implémentation (assumé) : on adopte le MODÈLE et le FORMAT OpenTelemetry
// (span = traceId / spanId / parentSpanId / attributes / events / status / timing)
// SANS tirer le SDK Node OTel — celui-ci suppose un collector OTLP, que MangoOS
// (local-first) n'a pas. À la place, les spans terminés sont exportés via un hook
// `onEnd`, branché sur l'Event Bus (type 'kernel.trace') → MangoQA observe via '*'.
// Le format étant OTel-compatible, brancher un vrai exporter OTLP plus tard
// (dashboard) sera une simple migration. Même logique « mémoire d'abord » que le
// Blackboard.

import { getBus, type KernelBus } from './kernel-bus.js'

export type SpanStatus = 'unset' | 'ok' | 'error'

export interface SpanEvent {
  name: string
  time: number
  attributes?: Record<string, unknown>
}

/** Données d'un span, au format OpenTelemetry (export/inspection). */
export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startTime: number
  endTime?: number
  durationMs?: number
  attributes: Record<string, unknown>
  events: SpanEvent[]
  status: SpanStatus
}

/** Type d'événement bus émis pour chaque span terminé. */
export const TRACE_EVENT = 'kernel.trace'

export interface Span {
  readonly data: SpanData
  setAttribute(key: string, value: unknown): this
  addEvent(name: string, attributes?: Record<string, unknown>): this
  setStatus(status: SpanStatus): this
  /** Finalise le span (endTime + durationMs) et l'exporte. Idempotent. */
  end(): SpanData
}

export interface StartSpanOptions {
  parent?: Span | SpanData
  attributes?: Record<string, unknown>
}

export interface TraceDeps {
  now?: () => number
  genId?: () => string
  /** Exporteur : appelé une fois quand un span se termine. */
  onEnd?: (span: SpanData) => void
}

function parentData(parent?: Span | SpanData): SpanData | undefined {
  if (!parent) return undefined
  return 'data' in parent ? (parent as Span).data : (parent as SpanData)
}

class SpanImpl implements Span {
  readonly data: SpanData
  private ended = false
  private readonly now: () => number
  private readonly onEnd?: (span: SpanData) => void

  constructor(data: SpanData, now: () => number, onEnd?: (span: SpanData) => void) {
    this.data = data
    this.now = now
    this.onEnd = onEnd
  }

  setAttribute(key: string, value: unknown): this {
    this.data.attributes[key] = value
    return this
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.data.events.push({ name, time: this.now(), attributes })
    return this
  }

  setStatus(status: SpanStatus): this {
    this.data.status = status
    return this
  }

  end(): SpanData {
    if (this.ended) return this.data
    this.ended = true
    this.data.endTime = this.now()
    this.data.durationMs = this.data.endTime - this.data.startTime
    this.onEnd?.(this.data)
    return this.data
  }
}

export class KernelTracer {
  private counter = 0
  private readonly now: () => number
  private readonly genId: () => string
  private readonly onEnd?: (span: SpanData) => void

  constructor(deps: TraceDeps = {}) {
    this.now = deps.now ?? (() => Date.now())
    this.genId = deps.genId ?? (() => `k${++this.counter}`)
    this.onEnd = deps.onEnd
  }

  /** Démarre un span. Sans parent → nouvelle trace ; avec parent → même traceId. */
  startSpan(name: string, opts: StartSpanOptions = {}): Span {
    const p = parentData(opts.parent)
    const data: SpanData = {
      traceId: p ? p.traceId : this.genId(),
      spanId: this.genId(),
      parentSpanId: p ? p.spanId : undefined,
      name,
      startTime: this.now(),
      attributes: { ...(opts.attributes ?? {}) },
      events: [],
      status: 'unset',
    }
    return new SpanImpl(data, this.now, this.onEnd)
  }

  /** Exécute `fn` sous un span : statut 'ok' au succès, 'error' (+ message) si
   * `fn` lève, span terminé dans tous les cas. Renvoie le résultat de `fn`. */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    opts: StartSpanOptions = {},
  ): Promise<T> {
    const span = this.startSpan(name, opts)
    try {
      const r = await fn(span)
      span.setStatus('ok')
      return r
    } catch (error) {
      span.setStatus('error').setAttribute('error.message', String(error))
      throw error
    } finally {
      span.end()
    }
  }
}

// ── Tracer par défaut du Kernel (singleton, exporte sur l'Event Bus) ──────────
let current: KernelTracer | null = null

/** Construit un tracer dont chaque span terminé est publié sur le bus
 * (type 'kernel.trace', kind 'progress') — c'est ainsi que MangoQA, abonné '*',
 * lira les traces sans faire partie du système. */
export function createBusTracer(bus: KernelBus = getBus(), deps: TraceDeps = {}): KernelTracer {
  return new KernelTracer({
    ...deps,
    onEnd: (span) => {
      deps.onEnd?.(span)
      // fire-and-forget : le tracing ne doit jamais bloquer ni casser le flux.
      void bus.publish({ type: TRACE_EVENT, sender: 'kernel', kind: 'progress', payload: span })
    },
  })
}

export function getTracer(): KernelTracer {
  if (current === null) current = createBusTracer()
  return current
}

export function setTracer(tracer: KernelTracer): void {
  current = tracer
}

export function resetTracer(): void {
  current = null
}
