// Pure unit tests for kernel.ts (Brain Adapter) — zero network calls.
// A fake `ask` captures what complete() forwards to llm-engine, so we test the
// routing/config without hitting any provider.
//
// Run: npx tsx src/test-kernel.ts

import {
  createBrain,
  resolveBrainConfig,
  resolveBrainFallbackConfig,
  getBrain,
  setBrain,
  resetBrain,
  type MangosBrain,
  type BrainDeps,
} from '../kernel.js'
import type { AskLLMOptions } from '../llm/llm-engine.js'
import { KernelTracer, type SpanData } from '../kernel/kernel-trace.js'

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

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>): void | Promise<void> {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
  try {
    const r = fn()
    if (r instanceof Promise) return r.finally(restore)
    restore()
  } catch (e) {
    restore()
    throw e
  }
}

/** Fake ask that records the last call and returns a canned reply. */
function spyDeps(): { deps: BrainDeps; last: () => { system: string; user: string; opts?: AskLLMOptions } | null } {
  let captured: { system: string; user: string; opts?: AskLLMOptions } | null = null
  const deps: BrainDeps = {
    ask: async (system, user, opts) => {
      captured = { system, user, opts }
      return `ECHO:${user}`
    },
  }
  return { deps, last: () => captured }
}

/** Fake ask scripté (C2-P1 — repli) : chaque appel consomme une entrée de
 * `plan` ("throw" = échec, sinon = réponse) et enregistre les opts reçus, pour
 * vérifier le nombre d'appels et quel provider/model a été visé. */
function scriptedDeps(plan: Array<'throw' | string>): { deps: BrainDeps; calls: () => AskLLMOptions[] } {
  const seen: AskLLMOptions[] = []
  let i = 0
  const deps: BrainDeps = {
    ask: async (_system, _user, opts) => {
      seen.push(opts ?? {})
      const step = plan[Math.min(i, plan.length - 1)]
      i++
      if (step === 'throw') throw new Error(`échec principal/repli #${i}`)
      return step
    },
  }
  return { deps, calls: () => seen }
}

async function main(): Promise<void> {
  line('═')
  console.log('resolveBrainConfig — env reading')
  line()

  await withEnv({ BRAIN_PROVIDER: undefined, BRAIN_MODEL: undefined, LLM_PROVIDER: undefined }, () => {
    const c = resolveBrainConfig()
    check("no BRAIN_PROVIDER → provider 'claude'", c.provider === 'claude')
    check('no BRAIN_MODEL → model ""', c.model === '')
  })

  await withEnv({ BRAIN_PROVIDER: 'litellm', BRAIN_MODEL: 'qwen2.5:72b' }, () => {
    const c = resolveBrainConfig()
    check("BRAIN_PROVIDER=litellm → provider 'litellm'", c.provider === 'litellm')
    check('BRAIN_MODEL is read', c.model === 'qwen2.5:72b')
  })

  await withEnv({ BRAIN_PROVIDER: 'banana' }, () => {
    const c = resolveBrainConfig()
    check("invalid BRAIN_PROVIDER → fallback 'claude'", c.provider === 'claude')
  })

  line('═')
  console.log('createBrain — config + describe')
  line()

  await withEnv({ BRAIN_PROVIDER: undefined, BRAIN_MODEL: undefined }, () => {
    const b = createBrain()
    check("default brain provider = 'claude'", b.provider === 'claude')
    check('default brain model = "" (let engine choose)', b.model === '')
    check('describe() shows default', b.describe() === 'MangosBrain(provider=claude, model=default)')
  })

  {
    const b = createBrain({ provider: 'ollama', model: 'gemma4:12b' })
    check("explicit config provider = 'ollama'", b.provider === 'ollama')
    check('explicit config model is kept', b.model === 'gemma4:12b')
    check('describe() shows explicit model', b.describe() === 'MangosBrain(provider=ollama, model=gemma4:12b)')
  }

  line('═')
  console.log('complete — forwards correct provider/model/opts to ask')
  line()

  {
    const { deps, last } = spyDeps()
    const b = createBrain({ provider: 'litellm', model: 'gpt-4o-mini' }, deps)
    const out = await b.complete('SYS', 'hello')
    check('complete returns the ask result', out === 'ECHO:hello')
    const c = last()
    check('ask received system + user', c?.system === 'SYS' && c?.user === 'hello')
    check("ask received provider 'litellm'", c?.opts?.provider === 'litellm')
    check('ask received configured model', c?.opts?.model === 'gpt-4o-mini')
  }

  {
    // Empty model must become undefined so llm-engine picks its own default.
    const { deps, last } = spyDeps()
    const b = createBrain({ provider: 'claude', model: '' }, deps)
    await b.complete('S', 'U')
    check('empty model → forwarded as undefined', last()?.opts?.model === undefined)
  }

  {
    // Per-call model override wins over the brain's default model.
    const { deps, last } = spyDeps()
    const b = createBrain({ provider: 'claude', model: 'sonnet' }, deps)
    await b.complete('S', 'U', { model: 'opus', maxTokens: 42, timeoutMs: 1234 })
    check('per-call model override applied', last()?.opts?.model === 'opus')
    check('per-call maxTokens forwarded', last()?.opts?.maxTokens === 42)
    check('per-call timeoutMs forwarded', last()?.opts?.timeoutMs === 1234)
  }

  line('═')
  console.log('complete — per-call provider override (préserve le routage feature)')
  line()

  {
    // Un appel qui surcharge le provider doit le transmettre ET laisser le
    // modèle au défaut de CE provider (model undefined), comme askLLM — pas le
    // BRAIN_MODEL d'un autre provider.
    const { deps, last } = spyDeps()
    const b = createBrain({ provider: 'claude', model: 'sonnet' }, deps)
    await b.complete('S', 'U', { provider: 'ollama' })
    check('per-call provider override forwarded', last()?.opts?.provider === 'ollama')
    check('provider override → model laissé au défaut (undefined)', last()?.opts?.model === undefined)
  }

  {
    // provider ET model surchargés par appel : les deux passent.
    const { deps, last } = spyDeps()
    const b = createBrain({ provider: 'claude' }, deps)
    await b.complete('S', 'U', { provider: 'litellm', model: 'qwen2.5:72b' })
    check('override provider+model : provider', last()?.opts?.provider === 'litellm')
    check('override provider+model : model', last()?.opts?.model === 'qwen2.5:72b')
  }

  line('═')
  console.log('complete — traçage (span sur le Bus) quand un tracer est fourni')
  line()

  {
    const ended: SpanData[] = []
    const tracer = new KernelTracer({ onEnd: (s) => ended.push(s) })
    const { deps } = spyDeps()
    const b = createBrain({ provider: 'litellm', model: 'gpt-4o-mini' }, { ...deps, tracer })
    const out = await b.complete('S', 'U')
    check('résultat inchangé avec traçage', out === 'ECHO:U')
    check('un span brain.complete terminé', ended.length === 1 && ended[0].name === 'brain.complete')
    check('span statut ok', ended[0].status === 'ok')
    check('span attribut provider', ended[0].attributes.provider === 'litellm')
  }

  {
    // Sans tracer, createBrain reste pur (aucun span, aucun effet de bord).
    const { deps } = spyDeps()
    const b = createBrain({ provider: 'claude' }, deps)
    const out = await b.complete('S', 'U')
    check('sans tracer → résultat normal', out === 'ECHO:U')
  }

  {
    // Une erreur de ask est propagée (span passe en error) — sémantique inchangée.
    const ended: SpanData[] = []
    const tracer = new KernelTracer({ onEnd: (s) => ended.push(s) })
    const failing: BrainDeps = { ask: async () => { throw new Error('provider down') }, tracer }
    const b = createBrain({ provider: 'claude' }, failing)
    let threw = false
    try {
      await b.complete('S', 'U')
    } catch {
      threw = true
    }
    check('ask qui lève → complete propage l’erreur', threw === true)
    check('span passé en error', ended.length === 1 && ended[0].status === 'error')
  }

  line('═')
  console.log('resolveBrainFallbackConfig — env reading (C2-P1)')
  line()

  await withEnv({ BRAIN_FALLBACK_PROVIDER: undefined, BRAIN_FALLBACK_MODEL: undefined }, () => {
    check('pas de BRAIN_FALLBACK_PROVIDER → null (pas de repli)', resolveBrainFallbackConfig() === null)
  })

  await withEnv({ BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' }, () => {
    const fb = resolveBrainFallbackConfig()
    check('BRAIN_FALLBACK_PROVIDER lu', fb?.provider === 'ollama')
    check('BRAIN_FALLBACK_MODEL lu', fb?.model === 'gemma4:12b')
  })

  await withEnv({ BRAIN_FALLBACK_PROVIDER: 'banana' }, () => {
    const fb = resolveBrainFallbackConfig()
    check("provider de repli invalide → borné à 'claude'", fb?.provider === 'claude')
  })

  line('═')
  console.log('complete — repli inter-providers (C2-P1, gate BRAIN_FALLBACK)')
  line()

  {
    // Gate OFF + repli défini dans l'env → AUCUN repli : le principal échoue,
    // complete() lève, exactement comme avant C2-P1.
    const { deps, calls } = scriptedDeps(['throw'])
    let threw: unknown = null
    await withEnv(
      { BRAIN_FALLBACK: undefined, BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' },
      async () => {
        const b = createBrain({ provider: 'claude' }, deps)
        try {
          await b.complete('S', 'U')
        } catch (e) {
          threw = e
        }
      },
    )
    check('gate off → complete lève comme aujourd’hui', threw instanceof Error)
    check('gate off → message = erreur du principal', threw instanceof Error && threw.message === 'échec principal/repli #1')
  }

  {
    // Gate ON mais BRAIN_FALLBACK_PROVIDER absent → pas de chaîne déclarée →
    // aucun repli : le principal échoue, complete() lève.
    const { deps, calls } = scriptedDeps(['throw'])
    let threw: unknown = null
    await withEnv(
      { BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: undefined, BRAIN_FALLBACK_MODEL: undefined },
      async () => {
        const b = createBrain({ provider: 'claude' }, deps)
        try {
          await b.complete('S', 'U')
        } catch (e) {
          threw = e
        }
      },
    )
    check('gate on + repli absent → un seul appel', calls().length === 1)
    check('gate on + repli absent → complete lève quand même', threw instanceof Error)
  }

  {
    // Gate ON + repli défini : le principal échoue, le repli réussit → le
    // résultat du repli est retourné, DEUX appels, et le 2e vise bien le repli.
    const { deps, calls } = scriptedDeps(['throw', 'RESULTAT-REPLI'])
    let out: string | null = null
    let threw = false
    await withEnv(
      { BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' },
      async () => {
        const b = createBrain({ provider: 'claude' }, deps)
        try {
          out = await b.complete('S', 'U')
        } catch {
          threw = true
        }
      },
    )
    check('repli réussit → pas de levée', threw === false)
    check('repli réussit → résultat du repli retourné', out === 'RESULTAT-REPLI')
    check('deux appels (principal + repli)', calls().length === 2)
    check('le 2e appel vise le repli (provider)', calls()[1].provider === 'ollama')
    check('le 2e appel vise le repli (model)', calls()[1].model === 'gemma4:12b')
  }

  {
    // Gate ON + repli défini + traceur : le repli réussi est annoté fallback:true.
    const ended: SpanData[] = []
    const tracer = new KernelTracer({ onEnd: (s) => ended.push(s) })
    const { deps } = scriptedDeps(['throw', 'RESULTAT-REPLI'])
    await withEnv(
      { BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' },
      async () => {
        const b = createBrain({ provider: 'claude' }, { ...deps, tracer })
        await b.complete('S', 'U')
      },
    )
    check('deux spans (principal error + repli ok)', ended.length === 2)
    check('span principal en erreur', ended[0].status === 'error')
    check('span repli en succès', ended[1].status === 'ok')
    check('span repli annoté fallback:true', ended[1].attributes.fallback === true)
  }

  {
    // Gate ON + repli défini : principal ET repli échouent → complete() relève
    // l'erreur ORIGINALE du principal (pas celle du repli).
    const { deps, calls } = scriptedDeps(['throw', 'throw'])
    let threw: unknown = null
    await withEnv(
      { BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' },
      async () => {
        const b = createBrain({ provider: 'claude' }, deps)
        try {
          await b.complete('S', 'U')
        } catch (e) {
          threw = e
        }
      },
    )
    check('principal + repli échouent → deux appels', calls().length === 2)
    check('complete lève quand même', threw instanceof Error)
    check(
      'erreur relevée = erreur ORIGINALE du principal (pas celle du repli)',
      threw instanceof Error && threw.message === 'échec principal/repli #1',
    )
  }

  {
    // Principal réussit → un seul appel, jamais de repli, même gate ON + repli défini.
    const { deps, calls } = scriptedDeps(['RESULTAT-PRINCIPAL'])
    let out: string | null = null
    await withEnv(
      { BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: 'ollama', BRAIN_FALLBACK_MODEL: 'gemma4:12b' },
      async () => {
        const b = createBrain({ provider: 'claude' }, deps)
        out = await b.complete('S', 'U')
      },
    )
    check('principal réussit → résultat du principal', out === 'RESULTAT-PRINCIPAL')
    check('principal réussit → un seul appel (jamais de repli)', calls().length === 1)
  }

  line('═')
  console.log('complete — rideau de fer BRAIN_LOCAL_ONLY couvre aussi le repli (Un, U3)')
  line()

  {
    // BRAIN_LOCAL_ONLY=on + repli claude (non-ollama) déclaré + gate BRAIN_FALLBACK
    // on : le repli ne doit JAMAIS être tenté — un seul appel, erreur ORIGINALE levée.
    const { deps, calls } = scriptedDeps(['throw', 'ne-devrait-jamais-être-utilisé'])
    let threw: unknown = null
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')) }
    await withEnv(
      {
        BRAIN_LOCAL_ONLY: 'on',
        BRAIN_FALLBACK: 'on',
        BRAIN_FALLBACK_PROVIDER: 'claude',
        BRAIN_FALLBACK_MODEL: 'sonnet',
      },
      async () => {
        const b = createBrain({ provider: 'ollama', model: 'gemma4:12b' }, deps)
        try {
          await b.complete('S', 'U')
        } catch (e) {
          threw = e
        }
      },
    )
    console.warn = originalWarn
    check('BRAIN_LOCAL_ONLY + repli non-ollama → un seul appel (repli jamais tenté)', calls().length === 1)
    check('BRAIN_LOCAL_ONLY + repli non-ollama → erreur ORIGINALE relevée', threw instanceof Error && threw.message === 'échec principal/repli #1')
    check('BRAIN_LOCAL_ONLY + repli non-ollama → warn "REFUSÉ"', warnings.some((w) => w.includes('REFUSÉ') && w.includes('BRAIN_LOCAL_ONLY')))
  }

  {
    // Même flag, mais le repli EST ollama : autorisé, comportement C2-P1 normal.
    const { deps, calls } = scriptedDeps(['throw', 'RESULTAT-REPLI-OLLAMA'])
    let out: string | null = null
    await withEnv(
      {
        BRAIN_LOCAL_ONLY: 'on',
        BRAIN_FALLBACK: 'on',
        BRAIN_FALLBACK_PROVIDER: 'ollama',
        BRAIN_FALLBACK_MODEL: 'gemma4:12b',
      },
      async () => {
        const b = createBrain({ provider: 'ollama' }, deps)
        out = await b.complete('S', 'U')
      },
    )
    check('BRAIN_LOCAL_ONLY + repli ollama → autorisé, résultat du repli', out === 'RESULTAT-REPLI-OLLAMA')
    check('BRAIN_LOCAL_ONLY + repli ollama → deux appels', calls().length === 2)
  }

  {
    // Flag OFF (défaut) : comportement IDENTIQUE à avant U3, même avec un repli
    // non-ollama déclaré — le repli est tenté normalement (non-régression C2-P1).
    const { deps, calls } = scriptedDeps(['throw', 'RESULTAT-REPLI'])
    let out: string | null = null
    await withEnv(
      { BRAIN_LOCAL_ONLY: undefined, BRAIN_FALLBACK: 'on', BRAIN_FALLBACK_PROVIDER: 'claude', BRAIN_FALLBACK_MODEL: 'sonnet' },
      async () => {
        const b = createBrain({ provider: 'ollama' }, deps)
        out = await b.complete('S', 'U')
      },
    )
    check('BRAIN_LOCAL_ONLY off → repli non-ollama tenté normalement (inchangé)', out === 'RESULTAT-REPLI')
    check('BRAIN_LOCAL_ONLY off → deux appels (inchangé)', calls().length === 2)
  }

  line('═')
  console.log('singleton — getBrain / setBrain / resetBrain')
  line()

  await withEnv({ BRAIN_PROVIDER: undefined }, () => {
    resetBrain()
    const a = getBrain()
    const b = getBrain()
    check('getBrain returns a stable singleton', a === b)

    const fake: MangosBrain = {
      provider: 'ollama',
      model: 'fake',
      async complete() {
        return 'FAKE'
      },
      describe() {
        return 'fake-brain'
      },
    }
    setBrain(fake)
    check('setBrain swaps the current brain', getBrain() === fake)

    resetBrain()
    check('resetBrain forces a fresh brain', getBrain() !== fake)
  })

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
