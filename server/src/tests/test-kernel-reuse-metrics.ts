// Tests de la mesure de réutilisation effective (#121).
//   npx tsx src/test-kernel-reuse-metrics.ts
import { KernelBus } from '../kernel/kernel-bus.js'
import { CHAT_TURN_EVENT } from '../kernel/kernel-chat-bridge.js'
import { Blackboard } from '../kernel/kernel-blackboard.js'
import { ARTIFACT_SCOPE, type DesignArtifact } from '../kernel/kernel-artifacts.js'
import {
  detectArtifactReads,
  detectArtefactReuse,
  paletteOverlap,
  detectPaletteReuseAmong,
  detectPaletteReuse,
  ReuseCollector,
  ReuseImpactCollector,
  getReuseCollector,
  getReuseImpactCollector,
  installReuseCollector,
  uninstallReuseCollector,
  installReuseImpactCollector,
  uninstallReuseImpactCollector,
  publishReuse,
  REUSE_EVENT,
} from '../kernel/kernel-reuse-metrics.js'

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

// ── detectArtifactReads ──────────────────────────────────────────────────────
{
  const hits = detectArtifactReads([
    'D:/IA/workspace/.components/SearchBar/component.tsx',
    'D:\\IA\\workspace\\.skills\\paginate-table\\SKILL.md', // backslash Windows
    '/ws/.procedures/auth-flow/PROCEDURE.md',
    '/ws/proj/src/App.jsx', // hors bibliothèque → ignoré
  ])
  check('détecte composant', hits.some((h) => h.kind === 'component' && h.name === 'SearchBar'))
  check('détecte skill (backslash)', hits.some((h) => h.kind === 'skill' && h.name === 'paginate-table'))
  check('détecte procédure', hits.some((h) => h.kind === 'procedure' && h.name === 'auth-flow'))
  check('ignore les fichiers hors bibliothèque', hits.length === 3)

  // Dédup : lire deux fois le même artefact = 1.
  const dedup = detectArtifactReads([
    '/ws/.components/Modal/component.tsx',
    '/ws/.components/Modal/meta.json',
  ])
  check('dédup même artefact lu 2×', dedup.length === 1 && dedup[0].name === 'Modal')

  check('aucune lecture → []', detectArtifactReads([]).length === 0)
}

// ── detectArtefactReuse (#156 chercher_artefact, L29) ────────────────────────
{
  // Chaque provenance distincte servie ≠ projet courant = un artefact réutilisé.
  const hits = detectArtefactReuse(['mango-carnet', 'rust-lang.org', 'mango-carnet'], 'mango-courses')
  check('artefact reuse : dédup par provenance', hits.length === 2)
  check('artefact reuse : genre artifact', hits.every((h) => h.kind === 'artifact'))
  check('artefact reuse : palette + site captés', hits.some((h) => h.name === 'mango-carnet') && hits.some((h) => h.name === 'rust-lang.org'))

  // Exclut le projet courant (ne pas se compter soi-même) et les vides.
  const self = detectArtefactReuse(['moi', '', '  ', 'autre'], 'moi')
  check('artefact reuse : exclut projet courant + vides', self.length === 1 && self[0].name === 'autre')
  check('artefact reuse : rien servi → []', detectArtefactReuse([], 'p').length === 0)
}

// ── Réutilisation de PALETTE (recouvrement de couleurs) ──────────────────────
{
  // paletteOverlap : couleurs produites présentes dans la candidate (non-neutres).
  const o1 = paletteOverlap(['#ff0000', '#00ff00', '#0000ff'], ['#ff0000', '#00ff00', '#123456'])
  check('overlap 2/3', o1.shared === 2 && Math.abs(o1.ratio - 2 / 3) < 1e-9)

  // Canonisation 3 → 6 chiffres : #f00 == #ff0000.
  const o2 = paletteOverlap(['#f00', '#0f0'], ['#ff0000', '#00ff00'])
  check('overlap canonise 3↔6 chiffres', o2.shared === 2 && o2.ratio === 1)

  // Neutres purs ignorés : partager seulement #000/#fff ne compte pas.
  const o3 = paletteOverlap(['#000000', '#ffffff'], ['#000', '#fff'])
  check('neutres purs ignorés', o3.shared === 0 && o3.ratio === 0)

  // detectPaletteReuseAmong : au plus un hit (la mieux recouverte).
  const cands = [
    { project: 'projA', colors: ['#ff0000', '#00ff00', '#0000ff'] }, // recouvre tout
    { project: 'projB', colors: ['#ff0000', '#999999'] }, // recouvre 1
  ]
  const hits = detectPaletteReuseAmong(['#ff0000', '#00ff00', '#0000ff'], cands)
  check('palette reuse : un seul hit', hits.length === 1 && hits[0].kind === 'palette')
  check('palette reuse : meilleure candidate', hits[0].name === 'projA')

  // Sous le seuil de partage → aucun hit (1 seule couleur partagée).
  const none = detectPaletteReuseAmong(['#ff0000', '#abcdef', '#fedcba'], cands)
  check('palette reuse : sous minShared → aucun', none.length === 0)

  // detectPaletteReuse lit le Blackboard et exclut le projet courant.
  const bb = new Blackboard()
  const artA: DesignArtifact = { type: 'design.produced', project: 'projA', colors: ['#ff0000', '#00ff00', '#0000ff'], at: 1 }
  const artSelf: DesignArtifact = { type: 'design.produced', project: 'moi', colors: ['#ff0000', '#00ff00', '#0000ff'], at: 2 }
  bb.put(ARTIFACT_SCOPE, 'k:projA', artA, [])
  bb.put(ARTIFACT_SCOPE, 'k:moi', artSelf, [])
  const fromBb = detectPaletteReuse(['#ff0000', '#00ff00', '#0000ff'], { exclude: 'moi', bb })
  check('palette reuse (Blackboard) : exclut le projet courant', fromBb.length === 1 && fromBb[0].name === 'projA')
  check('palette reuse : aucune couleur → []', detectPaletteReuse([], { exclude: 'moi', bb }).length === 0)
}

// ── ReuseCollector ───────────────────────────────────────────────────────────
{
  const c = new ReuseCollector()
  c.recordTurn()
  c.recordTurn()
  c.recordTurn()
  c.recordReuse([{ kind: 'component', name: 'SearchBar' }, { kind: 'skill', name: 'auth' }])
  c.recordReuse([{ kind: 'component', name: 'SearchBar' }]) // 2e tour, réutilise SearchBar
  c.recordReuse([]) // tour sans réutilisation → ignoré

  const s = c.snapshot()
  check('totalTurns = 3', s.totalTurns === 3)
  check('reuseTurns = 2', s.reuseTurns === 2)
  check('reuseRatePct = 67', s.reuseRatePct === 67) // 2/3
  check('totalReuses = 3', s.totalReuses === 3)
  check('byKind component = 2', s.byKind.component === 2)
  check('byKind skill = 1', s.byKind.skill === 1)
  check('topReused : SearchBar en tête', s.topReused[0].key === 'component:SearchBar' && s.topReused[0].count === 2)

  c.reset()
  check('reset', c.snapshot().totalTurns === 0 && c.snapshot().totalReuses === 0)
}

// ── Branchement Bus ──────────────────────────────────────────────────────────
{
  getReuseCollector().reset()
  uninstallReuseCollector()
  const bus = new KernelBus()
  installReuseCollector(bus)
  installReuseCollector(bus) // idempotent

  await bus.publish({ type: CHAT_TURN_EVENT, sender: 'demo', kind: 'success', payload: { project: 'demo' } })
  await bus.publish({ type: CHAT_TURN_EVENT, sender: 'demo', kind: 'success', payload: { project: 'demo' } })
  publishReuse('demo', [{ kind: 'component', name: 'SearchBar' }], bus)
  publishReuse('demo', [], bus) // rien publié

  const s = getReuseCollector().snapshot()
  check('bus : 2 tours comptés', s.totalTurns === 2)
  check('bus : 1 tour avec réutilisation', s.reuseTurns === 1)
  check('bus : taux 50%', s.reuseRatePct === 50)
  check('bus : idempotent (pas de double abonnement)', s.totalReuses === 1)

  uninstallReuseCollector()
  getReuseCollector().reset()
}

// ── ReuseImpactCollector : corrélation coût/qualité (#123) ───────────────────
{
  const c = new ReuseImpactCollector()
  // Tour réutilisateur (marqué) : pas cher, rapide, réussi.
  c.markReuse('p')
  c.recordTurn('p', { costUsd: 0.01, durationMs: 1000, agentTurns: 2, success: true })
  // Un marquage ne sert qu'une fois : ce 2e tour n'est PAS réutilisateur.
  c.recordTurn('p', { costUsd: 0.05, durationMs: 3000, agentTurns: 6, success: false })

  const s = c.snapshot()
  check('impact : 1 tour avec réutilisation', s.reuse.turns === 1)
  check('impact : 1 tour sans', s.noReuse.turns === 1)
  check('impact : marquage consommé une seule fois', s.reuse.avgCostUsd === 0.01)
  check('impact : coût moyen sans = 0.05', s.noReuse.avgCostUsd === 0.05)
  check('impact : économie coût 80%', s.delta.costSavingPct === 80) // (.05-.01)/.05
  check('impact : succès +100 pts', s.delta.successRatePts === 100) // 100% vs 0%
  check('impact : échantillon insuffisant (<3 chacun)', s.sampleSufficient === false)

  // Un seau vide → deltas null (pas de comparaison possible).
  const only = new ReuseImpactCollector()
  only.markReuse('x')
  only.recordTurn('x', { costUsd: 0.02, durationMs: 500, agentTurns: 1, success: true })
  const so = only.snapshot()
  check('impact : delta null si un seau vide', so.delta.costSavingPct === null && so.delta.successRatePts === null)

  c.reset()
  check('impact : reset', c.snapshot().reuse.turns === 0 && c.snapshot().noReuse.turns === 0)
}

// ── Segmentation de l'impact PAR FAMILLE (#124) ──────────────────────────────
{
  const c = new ReuseImpactCollector()
  // Tour A : réutilise un COMPOSANT — pas cher, réussi.
  c.markReuse('p', ['component'])
  c.recordTurn('p', { costUsd: 0.01, durationMs: 1000, agentTurns: 2, success: true })
  // Tour B : réutilise une PALETTE — cher, échoue (palette ne « sauve » rien ici).
  c.markReuse('p', ['palette'])
  c.recordTurn('p', { costUsd: 0.08, durationMs: 5000, agentTurns: 9, success: false })
  // Tour C : aucune réutilisation — coût moyen, réussi.
  c.recordTurn('p', { costUsd: 0.04, durationMs: 2000, agentTurns: 4, success: true })

  const s = c.snapshot()
  const byKind = Object.fromEntries(s.byKind.map((f) => [f.kind, f]))
  // Le seau « avec composant » = tour A seul ; « sans composant » = B et C.
  check('famille : composant a 1 tour avec', byKind.component.with.turns === 1)
  check('famille : composant a 2 tours sans (B+C)', byKind.component.without.turns === 2)
  check('famille : composant avgCost avec = 0.01', byKind.component.with.avgCostUsd === 0.01)
  check('famille : composant avgCost sans = 0.06', byKind.component.without.avgCostUsd === 0.06) // (.08+.04)/2
  check('famille : composant économise le coût', byKind.component.delta.costSavingPct === 83) // (.06-.01)/.06
  // La palette ici est le tour le plus cher → économie NÉGATIVE (segmentation honnête).
  check('famille : palette a 1 tour avec', byKind.palette.with.turns === 1)
  check('famille : palette ne fait pas économiser', (byKind.palette.delta.costSavingPct ?? 0) < 0)
  // Familles jamais réutilisées : 0 tour « avec », delta null.
  check('famille : skill jamais réutilisé', byKind.skill.with.turns === 0 && byKind.skill.delta.costSavingPct === null)
  check('famille : les 5 familles présentes (+ artifact)', s.byKind.length === 5 && byKind.artifact !== undefined)
  // La vue globale reste cohérente : 2 tours avec réutilisation, 1 sans.
  check('famille : vue globale intacte', s.reuse.turns === 2 && s.noReuse.turns === 1)
}

// ── Rendement FENÊTRÉ (#128) : ne regarde que les N derniers tours ───────────
{
  const c = new ReuseImpactCollector()
  // 8 vieux tours « avec composant » BON marché + 8 « sans » chers : le composant
  // a l'air très rentable au CUMUL (et les anciens dominent en nombre).
  for (let i = 0; i < 8; i++) {
    c.markReuse('p', ['component'])
    c.recordTurn('p', { costUsd: 0.01, durationMs: 100, agentTurns: 1, success: true })
  }
  for (let i = 0; i < 8; i++) c.recordTurn('p', { costUsd: 0.1, durationMs: 100, agentTurns: 1, success: true })
  // RÉCEMMENT (3+3), le composant devient CHER : son rendement récent s'effondre.
  for (let i = 0; i < 3; i++) {
    c.markReuse('p', ['component'])
    c.recordTurn('p', { costUsd: 0.2, durationMs: 100, agentTurns: 1, success: true })
  }
  for (let i = 0; i < 3; i++) c.recordTurn('p', { costUsd: 0.05, durationMs: 100, agentTurns: 1, success: true })

  const cum = c.snapshot()
  const win = c.windowedSnapshot(6) // 6 derniers tours seulement
  const cumComp = cum.byKind.find((f) => f.kind === 'component')!
  const winComp = win.byKind.find((f) => f.kind === 'component')!
  check('fenêtré : historySize compte tous les tours', c.historySize() === 22)
  check('fenêtré : le cumulé voit le composant rentable', (cumComp.delta.costSavingPct ?? 0) > 0)
  check('fenêtré : la fenêtre voit le composant DEVENU cher', (winComp.delta.costSavingPct ?? 0) < 0)
  check('fenêtré : la fenêtre ne compte que 6 tours', winComp.with.turns + winComp.without.turns === 6)

  // window <= 0 → tout l'historique (équivaut au cumulé).
  check('fenêtré : window 0 → tout', c.windowedSnapshot(0).reuse.turns === cum.reuse.turns)
  // reset vide aussi l'historique.
  c.reset()
  check('fenêtré : reset vide l\'historique', c.historySize() === 0)
}

// ── Branchement Bus de l'impact (appariement reuse → chat.turn) ──────────────
{
  getReuseImpactCollector().reset()
  uninstallReuseImpactCollector()
  const bus = new KernelBus()
  installReuseImpactCollector(bus)
  installReuseImpactCollector(bus) // idempotent

  // Tour 1 : réutilise (artifact.reuse AVANT chat.turn, comme en prod).
  publishReuse('demo', [{ kind: 'palette', name: 'projX' }], bus)
  await bus.publish({
    type: CHAT_TURN_EVENT, sender: 'demo', kind: 'success',
    payload: { project: 'demo', costUsd: 0.02, durationMs: 1200, turns: 3 },
  })
  // Tour 2 : pas de réutilisation.
  await bus.publish({
    type: CHAT_TURN_EVENT, sender: 'demo', kind: 'error',
    payload: { project: 'demo', costUsd: 0.06, durationMs: 4000, turns: 8 },
  })

  const s = getReuseImpactCollector().snapshot()
  check('impact bus : tour réutilisateur apparié', s.reuse.turns === 1 && s.reuse.avgCostUsd === 0.02)
  check('impact bus : tour non-réutilisateur rangé', s.noReuse.turns === 1 && s.noReuse.successRatePct === 0)
  check('impact bus : économie de coût mesurée', s.delta.costSavingPct === 67) // (.06-.02)/.06
  // Le kind du hit (palette) remonte jusqu'à la segmentation par famille.
  const palette = s.byKind.find((f) => f.kind === 'palette')
  check('impact bus : famille palette créditée du tour', palette?.with.turns === 1)

  uninstallReuseImpactCollector()
  getReuseImpactCollector().reset()
}

console.log(`\n[reuse-metrics] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
