// Tests du tableau de bord des traces. npx tsx src/test-trace-dashboard.ts
// Déterministe : on fabrique des SpanData et on vérifie l'agrégat ; puis on publie
// des spans sur un KernelBus réel et on vérifie que le collecteur les absorbe.
import { KernelBus } from '../kernel/kernel-bus.js'
import { TRACE_EVENT, type SpanData } from '../kernel/kernel-trace.js'
import {
  TraceCollector,
  getTraceCollector,
  installTraceCollector,
  uninstallTraceCollector,
} from '../trace-dashboard.js'

let passed = 0
let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ❌ ${name}`)
  }
}

function span(name: string, opts: Partial<SpanData> & { attributes?: Record<string, unknown> } = {}): SpanData {
  return {
    traceId: 't',
    spanId: 's',
    name,
    startTime: opts.startTime ?? 0,
    endTime: opts.endTime ?? 100,
    durationMs: opts.durationMs ?? 100,
    attributes: opts.attributes ?? {},
    events: [],
    status: opts.status ?? 'ok',
  }
}

// ── Agrégats ─────────────────────────────────────────────────────────────────
{
  const c = new TraceCollector()
  c.ingest(span('chat.turn', { durationMs: 200, attributes: { project: 'demo', 'cost.usd': 0.5, turns: 3 } }))
  c.ingest(span('brain.complete', { durationMs: 100, attributes: { provider: 'claude', model: 'sonnet' } }))
  c.ingest(span('brain.complete', { durationMs: 50, attributes: { provider: 'ollama', model: 'gemma4:12b' } }))
  c.ingest(span('brain.complete', { durationMs: 50, status: 'error', attributes: { provider: 'claude' } }))

  const s = c.snapshot(999)
  check('total = 4', s.stats.total === 4)
  check('byName chat.turn = 1', s.stats.byName['chat.turn'] === 1)
  check('byName brain.complete = 3', s.stats.byName['brain.complete'] === 3)
  check('errors = 1', s.stats.errors === 1)
  check('totalCostUsd = 0.5', s.stats.totalCostUsd === 0.5)
  check('byProvider claude = 2', s.stats.byProvider['claude'] === 2)
  check('byProvider ollama = 1', s.stats.byProvider['ollama'] === 1)
  check('avgDurationMs = 100', s.stats.avgDurationMs === 100) // (200+100+50+50)/4
  check('collectedAt injecté', s.collectedAt === 999)

  // Ligne extraite correctement.
  const chatRow = s.recent.find((r) => r.name === 'chat.turn')!
  check('row chat.turn project', chatRow.project === 'demo')
  check('row chat.turn cost', chatRow.costUsd === 0.5)
  check('row chat.turn turns', chatRow.turns === 3)
  const brainRow = s.recent.find((r) => r.provider === 'ollama')!
  check('row brain.complete model', brainRow.model === 'gemma4:12b')
}

// ── Ordre : plus récents en tête ─────────────────────────────────────────────
{
  const c = new TraceCollector()
  c.ingest(span('a'))
  c.ingest(span('b'))
  c.ingest(span('c'))
  const s = c.snapshot()
  check('recent newest-first', s.recent[0].name === 'c' && s.recent[2].name === 'a')
}

// ── Défensif : payload malformé ignoré ───────────────────────────────────────
{
  const c = new TraceCollector()
  c.ingest(undefined)
  c.ingest({ } as unknown as SpanData)
  c.ingest(span('ok'))
  check('malformé ignoré, valide compté', c.snapshot().stats.total === 1)
}

// ── reset ────────────────────────────────────────────────────────────────────
{
  const c = new TraceCollector()
  c.ingest(span('x', { attributes: { 'cost.usd': 1 } }))
  c.reset()
  const s = c.snapshot()
  check('reset → total 0', s.stats.total === 0 && s.stats.totalCostUsd === 0 && s.recent.length === 0)
}

// ── Branchement sur le Bus ───────────────────────────────────────────────────
{
  getTraceCollector().reset()
  uninstallTraceCollector()
  const bus = new KernelBus()
  installTraceCollector(bus)
  // Idempotent : un second appel ne double pas l'abonnement.
  installTraceCollector(bus)

  await bus.publish({ type: TRACE_EVENT, sender: 'kernel', kind: 'progress', payload: span('chat.turn', { attributes: { 'cost.usd': 0.2 } }) })
  await bus.publish({ type: TRACE_EVENT, sender: 'kernel', kind: 'progress', payload: span('brain.complete', { attributes: { provider: 'claude' } }) })
  // Un autre type d'événement ne doit pas être collecté.
  await bus.publish({ type: 'chat.turn', sender: 'demo', kind: 'success', payload: { costUsd: 99 } })

  const s = getTraceCollector().snapshot()
  check('bus → 2 spans collectés (pas l’événement chat.turn brut)', s.stats.total === 2)
  check('bus → coût agrégé du span', s.stats.totalCostUsd === 0.2)
  check('bus → install idempotent (pas de double)', s.stats.byName['chat.turn'] === 1)

  uninstallTraceCollector()
  getTraceCollector().reset()
}

console.log(`\n[trace-dashboard] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
