// Pure unit tests for kernel-blackboard.ts — zero network/IO, deterministic.
//
// Run: npx tsx src/test-kernel-blackboard.ts

import {
  Blackboard,
  getBlackboard,
  setBlackboard,
  resetBlackboard,
} from '../kernel/kernel-blackboard.js'

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

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

async function main(): Promise<void> {
  line('═')
  console.log('locks — withLock serializes same resource')
  line()
  {
    const bb = new Blackboard()
    const events: string[] = []
    // Two critical sections on the same resource must not interleave.
    const a = bb.withLock('proj', async () => {
      events.push('A-start')
      await tick()
      events.push('A-end')
    })
    const b = bb.withLock('proj', async () => {
      events.push('B-start')
      await tick()
      events.push('B-end')
    })
    await Promise.all([a, b])
    check(
      'A fully completes before B starts',
      events.join(',') === 'A-start,A-end,B-start,B-end',
    )
  }

  line('═')
  console.log('locks — FIFO order across 3 waiters')
  line()
  {
    const bb = new Blackboard()
    const order: number[] = []
    const release1 = await bb.acquire('r')
    // 2 and 3 queue up behind the held lock, in order.
    const p2 = bb.acquire('r').then((rel) => {
      order.push(2)
      rel()
    })
    const p3 = bb.acquire('r').then((rel) => {
      order.push(3)
      rel()
    })
    order.push(1)
    release1()
    await Promise.all([p2, p3])
    check('order is 1,2,3 (FIFO)', order.join(',') === '1,2,3')
  }

  line('═')
  console.log('locks — different resources run concurrently')
  line()
  {
    const bb = new Blackboard()
    const relX = await bb.acquire('X')
    // Y is a different resource → must not block on X.
    const flags = { gotY: false }
    const pY = bb.acquire('Y').then((rel) => {
      flags.gotY = true
      rel()
    })
    await tick()
    check('lock on Y acquired while X still held', flags.gotY === true)
    relX()
    await pY
  }

  line('═')
  console.log('locks — withLock releases even when fn throws')
  line()
  {
    const bb = new Blackboard()
    let threw = false
    try {
      await bb.withLock('z', () => {
        throw new Error('boom')
      })
    } catch {
      threw = true
    }
    check('error propagated to caller', threw === true)
    // If the lock leaked, this second acquire would hang forever.
    const rel = await bb.acquire('z')
    check('lock was released despite the throw', true)
    rel()
    check('resource is free after release', bb.isLocked('z') === false)
  }

  line('═')
  console.log('store — put / get / has / delete / keys')
  line()
  {
    const bb = new Blackboard()
    const ref = bb.put('proj1', 'tokens', { navy: '#0a1f44' })
    check('put returns a ref {scope,key}', ref.scope === 'proj1' && ref.key === 'tokens')
    check('get reads the value', (bb.get<{ navy: string }>('proj1', 'tokens'))?.navy === '#0a1f44')
    check('deref resolves the ref', (bb.deref<{ navy: string }>(ref))?.navy === '#0a1f44')
    check('has is true for present key', bb.has('proj1', 'tokens') === true)
    check('get missing → undefined', bb.get('proj1', 'nope') === undefined)

    bb.put('proj1', 'layout', { cols: 12 })
    check('keys lists all artifacts of a scope', bb.keys('proj1').sort().join(',') === 'layout,tokens')

    check('delete removes the key', bb.delete('proj1', 'tokens') === true)
    check('has is false after delete', bb.has('proj1', 'tokens') === false)
    check('delete missing → false', bb.delete('proj1', 'tokens') === false)
  }

  line('═')
  console.log('store — scope isolation')
  line()
  {
    const bb = new Blackboard()
    bb.put('A', 'k', 'va')
    bb.put('B', 'k', 'vb')
    check('same key isolated per scope', bb.get('A', 'k') === 'va' && bb.get('B', 'k') === 'vb')
    check('keys are scope-local', bb.keys('A').join() === 'k' && bb.keys('B').join() === 'k')
    check('keys of unknown scope → empty', bb.keys('Z').length === 0)
  }

  line('═')
  console.log('singleton — getBlackboard / setBlackboard / resetBlackboard')
  line()
  {
    resetBlackboard()
    const a = getBlackboard()
    check('getBlackboard returns stable singleton', a === getBlackboard())
    const custom = new Blackboard()
    setBlackboard(custom)
    check('setBlackboard swaps the current board', getBlackboard() === custom)
    resetBlackboard()
    check('resetBlackboard forces a fresh board', getBlackboard() !== custom)
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
