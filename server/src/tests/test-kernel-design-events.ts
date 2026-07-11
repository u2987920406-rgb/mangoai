// Tests des événements design sur le Bus. Exécution :
//   npx tsx src/test-kernel-design-events.ts
// Déterministe, zéro réseau : bus réel en mémoire.
import { KernelBus, type MangoEnvelope } from '../kernel/kernel-bus.js'
import {
  extractCssColors,
  extractDeclaredPalette,
  extractContrastPairs,
  buildProducedDesign,
  paletteFromContract,
  publishDesignReference,
  publishDesignProduced,
  publishRenderIntegrity,
  publishParcoursResult,
  publishGateVerdict,
  DESIGN_REFERENCE_EVENT,
  DESIGN_PRODUCED_EVENT,
  RENDER_INTEGRITY_EVENT,
  PARCOURS_RESULT_EVENT,
  GATE_VERDICT_EVENT,
} from '../kernel/kernel-design-events.js'
import type { PerfectPlanContract } from '../perfect-plan.js'

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

function captureBus(): { bus: KernelBus; seen: MangoEnvelope[] } {
  const bus = new KernelBus({ now: () => 1000 })
  const seen: MangoEnvelope[] = []
  bus.subscribe('*', 'observer', (env) => {
    seen.push(env)
  })
  return { bus, seen }
}

const CSS = `
  :root { --bg: #0B0B12; --accent: #7C5CFF; }
  .btn { color: #ffffff; background-color: #7c5cff; font-size: 16px; }
  .hero { color: #999; background: #aaa; font-size: 28px; font-weight: 700; }
`

// ── Extracteurs ──────────────────────────────────────────────────────────────
{
  const colors = extractCssColors(CSS)
  check('extractCssColors normalise en minuscules', colors.includes('#0b0b12') && colors.includes('#7c5cff'))
  check('extractCssColors déduplique', colors.filter((c) => c === '#7c5cff').length === 1)

  check('extractDeclaredPalette = variables CSS', JSON.stringify(extractDeclaredPalette(CSS)) === JSON.stringify(['#0b0b12', '#7c5cff']))

  const pairs = extractContrastPairs(CSS)
  check('extractContrastPairs : 2 paires', pairs.length === 2)
  const btn = pairs.find((p) => p.where?.includes('.btn'))!
  check('paire .btn fg/bg (minuscule)', btn.fg === '#ffffff' && btn.bg === '#7c5cff')
  check('paire .btn taille 16', btn.fontPx === 16 && btn.bold === false)
  const hero = pairs.find((p) => p.where?.includes('.hero'))!
  check('paire .hero gras + grand', hero.bold === true && hero.fontPx === 28)
}

// ── buildProducedDesign : fichiers de style uniquement ───────────────────────
{
  const files = [
    { path: 'src/index.css', content: CSS },
    { path: 'README.md', content: 'ignoré #abcdef' },
  ]
  const d = buildProducedDesign(files)
  check('buildProducedDesign : palette déclarée', d.palette.includes('#7c5cff'))
  check('buildProducedDesign : README ignoré', !d.usedColors.includes('#abcdef'))
  check('buildProducedDesign : paires extraites', d.pairs.length === 2)
}

// ── paletteFromContract ──────────────────────────────────────────────────────
{
  const contract: PerfectPlanContract = {
    answers: [],
    refs: [
      { kind: 'url', value: 'https://stripe.com' },
      { kind: 'palette', value: 'primaire #7C5CFF, fond #0b0b12' },
      { kind: 'note', value: 'épuré' },
    ],
    createdAt: 'now',
  }
  check('paletteFromContract extrait les hex de la ref palette', JSON.stringify(paletteFromContract(contract)) === JSON.stringify(['#7c5cff', '#0b0b12']))
  check('paletteFromContract : null → []', paletteFromContract(null).length === 0)
  check('paletteFromContract : pas de ref palette → []', paletteFromContract({ answers: [], refs: [{ kind: 'url', value: 'x' }], createdAt: 'now' }).length === 0)
}

// ── publishDesignReference ───────────────────────────────────────────────────
{
  const { bus, seen } = captureBus()
  const published = publishDesignReference({ project: 'demo', palette: ['#7c5cff', '#0b0b12'], source: 'perfect-plan' }, { bus })
  check('reference publiée → true', published === true)
  const env = seen.find((e) => e.type === DESIGN_REFERENCE_EVENT)!
  check('reference : enveloppe présente', !!env)
  check('reference : sender = projet', env.sender === 'demo')
  check('reference : kind progress', env.kind === 'progress')
  const p = env.payload as Record<string, unknown>
  check('reference : palette dans le payload', JSON.stringify(p.palette) === JSON.stringify(['#7c5cff', '#0b0b12']))
  check('reference : source', p.source === 'perfect-plan')

  // Palette vide → rien publié.
  const { bus: b2, seen: s2 } = captureBus()
  const none = publishDesignReference({ project: 'demo', palette: [], source: 'perfect-plan' }, { bus: b2 })
  check('reference vide → false, rien publié', none === false && s2.length === 0)
}

// ── publishDesignProduced ────────────────────────────────────────────────────
{
  const { bus, seen } = captureBus()
  const files = [{ path: 'a.css', content: CSS }]
  const published = publishDesignProduced({ project: 'demo', files }, { bus })
  check('produced publié → true', published === true)
  const env = seen.find((e) => e.type === DESIGN_PRODUCED_EVENT)!
  check('produced : enveloppe présente', !!env)
  const p = env.payload as Record<string, unknown>
  check('produced : palette', Array.isArray(p.palette) && (p.palette as string[]).includes('#7c5cff'))
  check('produced : usedColors', Array.isArray(p.usedColors))
  check('produced : pairs', Array.isArray(p.pairs) && (p.pairs as unknown[]).length === 2)

  // Fichier sans couleur → rien publié.
  const { bus: b2, seen: s2 } = captureBus()
  const none = publishDesignProduced({ project: 'demo', files: [{ path: 'a.js', content: 'const x = 1' }] }, { bus: b2 })
  check('produced sans couleur → false', none === false && s2.length === 0)
}

// ── publishRenderIntegrity (2026-07-11, casse visuelle déterministe) ─────────
{
  const { bus, seen } = captureBus()
  const published = publishRenderIntegrity({ project: 'demo', broken: true, faults: ['débordement horizontal (1400px pour 1280px)'] }, { bus })
  check('render.integrity publié → true', published === true)
  const env = seen.find((e) => e.type === RENDER_INTEGRITY_EVENT)
  check('render.integrity : enveloppe présente', !!env)
  check('render.integrity : sender = projet', env?.sender === 'demo')
  check('render.integrity : kind error si broken', env?.kind === 'error')
  const p = env?.payload as { project: string; broken: boolean; faults: string[] }
  check('render.integrity : broken transmis', p.broken === true)
  check('render.integrity : faults transmis', Array.isArray(p.faults) && p.faults.length === 1)

  const { bus: b2, seen: s2 } = captureBus()
  const clean = publishRenderIntegrity({ project: 'demo', broken: false, faults: [] }, { bus: b2 })
  check('render.integrity non-cassé → publié quand même (true)', clean === true)
  const env2 = s2.find((e) => e.type === RENDER_INTEGRITY_EVENT)
  check('render.integrity : kind progress si non-cassé', env2?.kind === 'progress')
}

// ── publishParcoursResult (2026-07-11, résultat RÉEL de teste_parcours) ──────
{
  const { bus, seen } = captureBus()
  const published = publishParcoursResult({ project: 'demo', ok: false, etapesOk: 1, etapesTotal: 3, consoleErrors: ['TypeError: x is undefined'] }, { bus })
  check('parcours.result publié → true', published === true)
  const env = seen.find((e) => e.type === PARCOURS_RESULT_EVENT)
  check('parcours.result : enveloppe présente', !!env)
  check('parcours.result : sender = projet', env?.sender === 'demo')
  check('parcours.result : kind error si échec', env?.kind === 'error')
  const p = env?.payload as { ok: boolean; etapesOk: number; etapesTotal: number; consoleErrors: string[] }
  check('parcours.result : ok transmis', p.ok === false)
  check('parcours.result : etapesOk/Total transmis', p.etapesOk === 1 && p.etapesTotal === 3)
  check('parcours.result : consoleErrors transmis', p.consoleErrors.length === 1)

  const { bus: b2, seen: s2 } = captureBus()
  publishParcoursResult({ project: 'demo', ok: true, etapesOk: 3, etapesTotal: 3, consoleErrors: [] }, { bus: b2 })
  const env2 = s2.find((e) => e.type === PARCOURS_RESULT_EVENT)
  check('parcours.result : kind success si réussi', env2?.kind === 'success')
}

// ── publishGateVerdict (2026-07-11, verdict complet du Gardien) ─────────────
{
  const { bus, seen } = captureBus()
  const info = { project: 'demo', ok: false, intentOk: true, wcagOk: false, balanceOk: true, placeholdersOk: true, testsOk: true, tasteScored: true, tasteOverall: 62 }
  const published = publishGateVerdict(info, { bus })
  check('gate.verdict publié → true', published === true)
  const env = seen.find((e) => e.type === GATE_VERDICT_EVENT)
  check('gate.verdict : enveloppe présente', !!env)
  check('gate.verdict : sender = projet', env?.sender === 'demo')
  check('gate.verdict : kind error si ok=false', env?.kind === 'error')
  const p = env?.payload as typeof info
  check('gate.verdict : tous les booléens transmis', p.intentOk === true && p.wcagOk === false && p.balanceOk === true && p.placeholdersOk === true && p.testsOk === true)
  check('gate.verdict : score de goût transmis', p.tasteScored === true && p.tasteOverall === 62)

  const { bus: b2, seen: s2 } = captureBus()
  publishGateVerdict({ ...info, ok: true }, { bus: b2 })
  const env2 = s2.find((e) => e.type === GATE_VERDICT_EVENT)
  check('gate.verdict : kind success si ok=true', env2?.kind === 'success')
}

// ── Fire-and-forget : bus qui lève ───────────────────────────────────────────
{
  const explosive = { publish: () => { throw new Error('down') } } as unknown as KernelBus
  let threw = false
  try {
    publishDesignReference({ project: 'd', palette: ['#fff'], source: 's' }, { bus: explosive })
    publishDesignProduced({ project: 'd', files: [{ path: 'a.css', content: '.x{color:#fff;background:#000}' }] }, { bus: explosive })
    publishRenderIntegrity({ project: 'd', broken: true, faults: ['x'] }, { bus: explosive })
    publishParcoursResult({ project: 'd', ok: false, etapesOk: 0, etapesTotal: 1, consoleErrors: [] }, { bus: explosive })
    publishGateVerdict({ project: 'd', ok: false, intentOk: false, wcagOk: false, balanceOk: false, placeholdersOk: false, testsOk: false, tasteScored: false, tasteOverall: null }, { bus: explosive })
  } catch {
    threw = true
  }
  check('publish qui lève → ne propage jamais', threw === false)
}

console.log(`\n[design-events] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
