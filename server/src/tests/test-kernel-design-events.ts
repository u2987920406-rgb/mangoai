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
  DESIGN_REFERENCE_EVENT,
  DESIGN_PRODUCED_EVENT,
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

// ── Fire-and-forget : bus qui lève ───────────────────────────────────────────
{
  const explosive = { publish: () => { throw new Error('down') } } as unknown as KernelBus
  let threw = false
  try {
    publishDesignReference({ project: 'd', palette: ['#fff'], source: 's' }, { bus: explosive })
    publishDesignProduced({ project: 'd', files: [{ path: 'a.css', content: '.x{color:#fff;background:#000}' }] }, { bus: explosive })
  } catch {
    threw = true
  }
  check('publish qui lève → ne propage jamais', threw === false)
}

console.log(`\n[design-events] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
