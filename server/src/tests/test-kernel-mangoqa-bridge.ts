// Pure unit tests for kernel-mangoqa-bridge.ts — zero filesystem (appendLine
// is injected), deterministic.
//
// Run: npx tsx src/test-kernel-mangoqa-bridge.ts

import { KernelBus, type MangoEnvelope } from '../kernel/kernel-bus.js'
import {
  attachMangoQaBridge,
  installMangoQaBridge,
  uninstallMangoQaBridge,
  MANGOQA_OBSERVER,
} from '../kernel/kernel-mangoqa-bridge.js'

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

function detBus(): KernelBus {
  let n = 0
  return new KernelBus({ now: () => 1, genId: () => `e${++n}` })
}

async function main(): Promise<void> {
  line('═')
  console.log('bridge — exports every published envelope as a JSONL line')
  line()
  {
    const bus = detBus()
    const lines: string[] = []
    attachMangoQaBridge(bus, { appendLine: (l) => lines.push(l), now: () => 999 })
    await bus.publish({ type: 'agent.done', sender: 'app-builder', payload: { ok: true } })
    check('one line exported', lines.length === 1)
    const rec = JSON.parse(lines[0]) as MangoEnvelope & { exportedAt: number }
    check('envelope type preserved', rec.type === 'agent.done')
    check('sender preserved', rec.sender === 'app-builder')
    check('payload preserved', (rec.payload as { ok: boolean }).ok === true)
    check('exportedAt stamped', rec.exportedAt === 999)
    check('observer registered under bridge id', bus.subscriberCount('*') === 1)
  }

  line('═')
  console.log('bridge — observes EVERYTHING, including targeted messages')
  line()
  {
    const bus = detBus()
    const lines: string[] = []
    attachMangoQaBridge(bus, { appendLine: (l) => lines.push(l) })
    // a message targeted at someone else must still be observed (audit)
    await bus.publish({ type: 'task', sender: 'core', payload: {}, recipient: 'app-builder' })
    await bus.publish({ type: 'kernel.trace', sender: 'kernel', kind: 'progress', payload: { name: 's' } })
    check('targeted message observed', lines.length === 2)
    check('trace event observed', JSON.parse(lines[1]).type === 'kernel.trace')
  }

  line('═')
  console.log('bridge — filter excludes unwanted events')
  line()
  {
    const bus = detBus()
    const lines: string[] = []
    attachMangoQaBridge(bus, {
      appendLine: (l) => lines.push(l),
      filter: (env) => env.type !== 'noise',
    })
    await bus.publish({ type: 'noise', sender: 's', payload: {} })
    await bus.publish({ type: 'signal', sender: 's', payload: {} })
    check('filtered event excluded', lines.length === 1)
    check('kept event is the signal', JSON.parse(lines[0]).type === 'signal')
  }

  line('═')
  console.log('bridge — append failure never breaks the publish flow')
  line()
  {
    const bus = detBus()
    const others: string[] = []
    // a normal subscriber must still receive even if the bridge append throws
    bus.subscribe('x', 'consumer', () => {
      others.push('consumer-ran')
    })
    attachMangoQaBridge(bus, {
      appendLine: () => {
        throw new Error('disk full')
      },
    })
    let publishThrew = false
    try {
      await bus.publish({ type: 'x', sender: 's', payload: {} })
    } catch {
      publishThrew = true
    }
    check('publish did not throw despite append failure', publishThrew === false)
    check('the real consumer still ran', others.includes('consumer-ran'))
  }

  line('═')
  console.log('bridge — detach stops exporting')
  line()
  {
    const bus = detBus()
    const lines: string[] = []
    const detach = attachMangoQaBridge(bus, { appendLine: (l) => lines.push(l) })
    await bus.publish({ type: 'a', sender: 's', payload: {} })
    detach()
    await bus.publish({ type: 'a', sender: 's', payload: {} })
    check('exported once before detach', lines.length === 1)
    check('observer removed after detach', bus.subscriberCount('*') === 0)
  }

  line('═')
  console.log('install — idempotent, uninstall removes the observer')
  line()
  {
    const bus = detBus()
    uninstallMangoQaBridge() // clean slate
    installMangoQaBridge(bus, { appendLine: () => {} })
    installMangoQaBridge(bus, { appendLine: () => {} }) // second call is a no-op
    check('single observer after double install', bus.subscriberCount('*') === 1)
    uninstallMangoQaBridge()
    check('observer gone after uninstall', bus.subscriberCount('*') === 0)
    check('MANGOQA_OBSERVER id is stable', MANGOQA_OBSERVER === 'mangoqa-bridge')
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
