// Tests du pont Chat → Kernel (activation). Exécution :
//   npx tsx src/test-kernel-chat-bridge.ts
// Déterministe, zéro réseau : bus et tracer réels mais en mémoire.
import { KernelBus, type MangoEnvelope } from '../kernel/kernel-bus.js'
import { KernelTracer, type SpanData } from '../kernel/kernel-trace.js'
import { startChatTurn, finishChatTurn, CHAT_TURN_EVENT } from '../kernel/kernel-chat-bridge.js'

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

/** Bus de test : capture toutes les enveloppes via l'observateur '*'. */
function captureBus(): { bus: KernelBus; seen: MangoEnvelope[] } {
  const bus = new KernelBus({ now: () => 1000 })
  const seen: MangoEnvelope[] = []
  bus.subscribe('*', 'test-observer', (env) => {
    seen.push(env)
  })
  return { bus, seen }
}

/** Tracer de test : capture les spans terminés (onEnd), horloge figée. */
function captureTracer(): { tracer: KernelTracer; ended: SpanData[] } {
  const ended: SpanData[] = []
  let t = 0
  const tracer = new KernelTracer({ now: () => ++t, genId: (() => { let n = 0; return () => `s${++n}` })(), onEnd: (s) => ended.push(s) })
  return { tracer, ended }
}

// ── startChatTurn ────────────────────────────────────────────────────────────
{
  const { tracer } = captureTracer()
  const span = startChatTurn({ project: 'demo', mode: 'elite', model: 'sonnet' }, { tracer })
  check('startChatTurn → span non null', span !== null)
  check('startChatTurn → attributs portés', span!.data.attributes.project === 'demo' && span!.data.attributes.mode === 'elite')
  check('startChatTurn → nom = chat.turn', span!.data.name === CHAT_TURN_EVENT)
}

// ── finishChatTurn : succès ──────────────────────────────────────────────────
{
  const { bus, seen } = captureBus()
  const { tracer, ended } = captureTracer()
  const span = startChatTurn({ project: 'demo', mode: 'elite', model: 'sonnet' }, { tracer })
  finishChatTurn(span, {
    project: 'demo',
    mode: 'elite',
    model: 'sonnet',
    ok: true,
    costUsd: 0.42,
    numTurns: 3,
    durationMs: 1500,
    contextTokens: 12000,
  }, { bus })

  check('succès → span terminé', ended.length === 1)
  check('succès → statut ok', ended[0].status === 'ok')
  check('succès → attribut cost.usd', ended[0].attributes['cost.usd'] === 0.42)

  const env = seen.find((e) => e.type === CHAT_TURN_EVENT)!
  check('succès → enveloppe publiée', !!env)
  check('succès → kind success', env.kind === 'success')
  check('succès → sender = projet', env.sender === 'demo')
  const p = env.payload as Record<string, unknown>
  // Noms de champs EXACTEMENT ceux que lit le Disjoncteur (costUsd/turns/durationMs).
  check('succès → payload.costUsd', p.costUsd === 0.42)
  check('succès → payload.turns', p.turns === 3)
  check('succès → payload.durationMs', p.durationMs === 1500)
  check('succès → payload.contextTokens informatif', p.contextTokens === 12000)
}

// ── finishChatTurn : échec ───────────────────────────────────────────────────
{
  const { bus, seen } = captureBus()
  const { tracer, ended } = captureTracer()
  const span = startChatTurn({ project: 'demo', mode: 'mvp', model: 'sonnet' }, { tracer })
  finishChatTurn(span, { project: 'demo', mode: 'mvp', model: 'sonnet', ok: false, error: 'boom' }, { bus })

  check('échec → statut error', ended[0].status === 'error')
  check('échec → attribut error.message', ended[0].attributes['error.message'] === 'boom')
  const env = seen.find((e) => e.type === CHAT_TURN_EVENT)!
  check('échec → kind error', env.kind === 'error')
  check('échec → payload.error', (env.payload as Record<string, unknown>).error === 'boom')
}

// ── Cas Élève (resolvedBy) ───────────────────────────────────────────────────
{
  const { bus, seen } = captureBus()
  finishChatTurn(null, { project: 'demo', mode: 'elite', model: 'eleve', ok: true, resolvedBy: 'eleve', costUsd: 0 }, { bus })
  const env = seen.find((e) => e.type === CHAT_TURN_EVENT)!
  check('élève → resolvedBy dans le payload', (env.payload as Record<string, unknown>).resolvedBy === 'eleve')
  check('span null toléré (pas de crash)', true)
}

// ── Fire-and-forget : un bus qui lève ne casse jamais le tour ─────────────────
{
  const explosiveBus = {
    publish: () => {
      throw new Error('bus down')
    },
  } as unknown as KernelBus
  let threw = false
  try {
    finishChatTurn(null, { project: 'demo', mode: 'elite', model: 'sonnet', ok: true }, { bus: explosiveBus })
  } catch {
    threw = true
  }
  check('publish qui lève → finishChatTurn ne propage pas', threw === false)
}

// ── Valeurs par défaut quand les métriques manquent ──────────────────────────
{
  const { bus, seen } = captureBus()
  finishChatTurn(null, { project: 'demo', mode: 'elite', model: 'sonnet', ok: true }, { bus })
  const p = seen.find((e) => e.type === CHAT_TURN_EVENT)!.payload as Record<string, unknown>
  check('défauts → costUsd 0', p.costUsd === 0)
  check('défauts → turns 0', p.turns === 0)
  check('défauts → durationMs 0', p.durationMs === 0)
}

console.log(`\n[chat-bridge] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
