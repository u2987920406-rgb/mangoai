// Pure unit tests for kernel-bus.ts (Event Bus) — zero network, deterministic.
// Injected now/genId make sealed envelopes reproducible.
//
// Run: npx tsx src/test-kernel-bus.ts

import {
  KernelBus,
  WILDCARD,
  getBus,
  setBus,
  resetBus,
  type MangoEnvelope,
} from '../kernel/kernel-bus.js'

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

/** Deterministic bus: monotonic ids + fixed clock. */
function detBus(onError?: (e: unknown, env: MangoEnvelope) => void): KernelBus {
  let n = 0
  return new KernelBus({ now: () => 1000, genId: () => `id-${++n}`, onError })
}

async function main(): Promise<void> {
  line('═')
  console.log('seal — envelope v1 defaults & injected id/ts')
  line()
  {
    const bus = detBus()
    const env = await bus.publish({ type: 't.a', sender: 'vision', payload: { x: 1 } })
    check("protocol = 'v1'", env.protocol === 'v1')
    check('id from injected genId', env.id === 'id-1')
    check('ts from injected now', env.ts === 1000)
    check("default kind = 'success'", env.kind === 'success')
    check("default payloadType = 'json'", env.payloadType === 'json')
    check('payload preserved', (env.payload as { x: number }).x === 1)
    check('sender preserved', env.sender === 'vision')
  }

  line('═')
  console.log('subscribe / publish — type routing')
  line()
  {
    const bus = detBus()
    const got: string[] = []
    bus.subscribe('design.tokens', 'design', (e) => {
      got.push(`design:${(e.payload as { c: string }).c}`)
    })
    bus.subscribe('other.event', 'x', () => {
      got.push('SHOULD-NOT-FIRE')
    })
    await bus.publish({ type: 'design.tokens', sender: 'vision', payload: { c: 'navy' } })
    check('matching subscriber receives', got.includes('design:navy'))
    check('non-matching subscriber stays silent', !got.includes('SHOULD-NOT-FIRE'))
    check('subscriberCount reflects subs', bus.subscriberCount('design.tokens') === 1)
  }

  line('═')
  console.log('recipient — targeted vs broadcast')
  line()
  {
    const bus = detBus()
    const seen: string[] = []
    bus.subscribe('task', 'A', () => {
      seen.push('A')
    })
    bus.subscribe('task', 'B', () => {
      seen.push('B')
    })

    await bus.publish({ type: 'task', sender: 'core', payload: {}, recipient: 'A' })
    check('targeted to A → only A', seen.length === 1 && seen[0] === 'A')

    seen.length = 0
    await bus.publish({ type: 'task', sender: 'core', payload: {} })
    check('broadcast → both A and B', seen.includes('A') && seen.includes('B') && seen.length === 2)
  }

  line('═')
  console.log('wildcard observer — sees everything (audit / MangoQA)')
  line()
  {
    const bus = detBus()
    const observed: string[] = []
    bus.subscribe(WILDCARD, 'mangoqa', (e) => {
      observed.push(e.type)
    })
    bus.subscribe('a', 'x', () => {})
    await bus.publish({ type: 'a', sender: 's', payload: {} })
    await bus.publish({ type: 'b', sender: 's', payload: {} })
    // even a targeted message must be observed by the wildcard watcher
    await bus.publish({ type: 'c', sender: 's', payload: {}, recipient: 'someone' })
    check('observer saw type a', observed.includes('a'))
    check('observer saw type b (no subscriber otherwise)', observed.includes('b'))
    check('observer saw targeted type c despite recipient', observed.includes('c'))
    check('observer saw exactly 3 events', observed.length === 3)
  }

  line('═')
  console.log('error isolation — a failing handler does not break others')
  line()
  {
    const errors: MangoEnvelope[] = []
    const bus = detBus((_e, env) => errors.push(env))
    const ok: string[] = []
    bus.subscribe('e', 'bad', () => {
      throw new Error('boom')
    })
    bus.subscribe('e', 'good', () => {
      ok.push('good-ran')
    })
    await bus.publish({ type: 'e', sender: 's', payload: {} })
    check('onError received the envelope', errors.length === 1)
    check('the other handler still ran', ok.includes('good-ran'))
  }

  line('═')
  console.log('async — publish awaits async handlers')
  line()
  {
    const bus = detBus()
    const state = { done: false }
    bus.subscribe('slow', 'a', async () => {
      await Promise.resolve()
      state.done = true
    })
    await bus.publish({ type: 'slow', sender: 's', payload: {} })
    check('async handler completed before publish resolved', state.done === true)
  }

  line('═')
  console.log('unsubscribe — handler stops receiving')
  line()
  {
    const bus = detBus()
    let count = 0
    const off = bus.subscribe('u', 'a', () => {
      count++
    })
    await bus.publish({ type: 'u', sender: 's', payload: {} })
    off()
    await bus.publish({ type: 'u', sender: 's', payload: {} })
    check('received once before unsubscribe', count === 1)
    check('subscriberCount drops to 0 after unsubscribe', bus.subscriberCount('u') === 0)
  }

  line('═')
  console.log('singleton — getBus / setBus / resetBus')
  line()
  {
    resetBus()
    const a = getBus()
    check('getBus returns stable singleton', a === getBus())
    const custom = detBus()
    setBus(custom)
    check('setBus swaps the current bus', getBus() === custom)
    resetBus()
    check('resetBus forces a fresh bus', getBus() !== custom)
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
