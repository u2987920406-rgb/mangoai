// Pure unit tests for kernel-trace.ts — deterministic (injected now/genId).
//
// Run: npx tsx src/test-kernel-trace.ts

import {
  KernelTracer,
  createBusTracer,
  getTracer,
  setTracer,
  resetTracer,
  TRACE_EVENT,
  type SpanData,
} from '../kernel/kernel-trace.js'
import { KernelBus, WILDCARD, type MangoEnvelope } from '../kernel/kernel-bus.js'

const line = (c = '─') => console.log(c.repeat(64))
let pass = 0
let fail = 0

function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}`)
    fail++
  }
}

/** Deterministic tracer: clock advances by 5ms per read, ids monotonic. */
function detTracer(onEnd?: (s: SpanData) => void): KernelTracer {
  let t = 100
  let n = 0
  return new KernelTracer({
    now: () => {
      const v = t
      t += 5
      return v
    },
    genId: () => `id-${++n}`,
    onEnd,
  })
}

async function main(): Promise<void> {
  line('═')
  console.log('span — lifecycle, attributes, events, timing')
  line()
  {
    const ended: SpanData[] = []
    const tr = detTracer((s) => ended.push(s))
    const span = tr.startSpan('op', { attributes: { a: 1 } })
    span.setAttribute('b', 2).addEvent('step', { i: 0 }).setStatus('ok')
    const data = span.end()
    check('traceId assigned', data.traceId === 'id-1')
    check('spanId assigned', data.spanId === 'id-2')
    check('no parent for root span', data.parentSpanId === undefined)
    check('initial attribute kept', data.attributes.a === 1)
    check('added attribute kept', data.attributes.b === 2)
    check('event recorded', data.events.length === 1 && data.events[0].name === 'step')
    check('status set to ok', data.status === 'ok')
    check('durationMs computed', typeof data.durationMs === 'number' && data.durationMs! > 0)
    check('onEnd called once', ended.length === 1)
  }

  line('═')
  console.log('span — end is idempotent')
  line()
  {
    const ended: SpanData[] = []
    const tr = detTracer((s) => ended.push(s))
    const span = tr.startSpan('once')
    span.end()
    span.end()
    check('onEnd fired exactly once despite double end', ended.length === 1)
  }

  line('═')
  console.log('span — parent/child share traceId')
  line()
  {
    const tr = detTracer()
    const root = tr.startSpan('root')
    const child = tr.startSpan('child', { parent: root })
    check('child inherits traceId', child.data.traceId === root.data.traceId)
    check('child has its own spanId', child.data.spanId !== root.data.spanId)
    check('child parentSpanId = root spanId', child.data.parentSpanId === root.data.spanId)
  }

  line('═')
  console.log('withSpan — ok path and error path')
  line()
  {
    const ended: SpanData[] = []
    const tr = detTracer((s) => ended.push(s))
    const out = await tr.withSpan('work', () => 42)
    check('withSpan returns fn result', out === 42)
    check('ok span status = ok', ended[0].status === 'ok')

    let threw = false
    try {
      await tr.withSpan('boom', () => {
        throw new Error('kaboom')
      })
    } catch {
      threw = true
    }
    check('withSpan rethrows', threw === true)
    const errSpan = ended[1]
    check('error span status = error', errSpan.status === 'error')
    check('error message captured', String(errSpan.attributes['error.message']).includes('kaboom'))
    check('error span still ended', typeof errSpan.durationMs === 'number')
  }

  line('═')
  console.log('createBusTracer — ended spans flow onto the Event Bus')
  line()
  {
    const bus = new KernelBus({ now: () => 1, genId: () => 'env' })
    const traces: MangoEnvelope[] = []
    bus.subscribe(WILDCARD, 'mangoqa', (e) => {
      if (e.type === TRACE_EVENT) traces.push(e)
    })
    const tr = createBusTracer(bus, { now: () => 7, genId: () => 's' })
    await tr.withSpan('audited-op', () => 'done')
    // allow the fire-and-forget publish microtask to settle
    await Promise.resolve()
    await Promise.resolve()
    check('one trace published to the bus', traces.length === 1)
    check('trace event type is kernel.trace', traces[0]?.type === TRACE_EVENT)
    check('payload is the span data', (traces[0]?.payload as SpanData)?.name === 'audited-op')
    check('observed span status ok', (traces[0]?.payload as SpanData)?.status === 'ok')
  }

  line('═')
  console.log('singleton — get / set / reset')
  line()
  {
    resetTracer()
    const a = getTracer()
    check('getTracer stable singleton', a === getTracer())
    const custom = detTracer()
    setTracer(custom)
    check('setTracer swaps', getTracer() === custom)
    resetTracer()
    check('resetTracer forces fresh', getTracer() !== custom)
  }

  line('═')
  const total = pass + fail
  if (fail === 0) {
    console.log(`✅ All ${total}/${total} checks passed.`)
    process.exit(0)
  } else {
    console.log(`❌ ${fail}/${total} check(s) failed.`)
    process.exit(1)
  }
}

void main()
