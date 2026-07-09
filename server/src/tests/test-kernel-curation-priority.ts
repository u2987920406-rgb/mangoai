// Tests de la priorité de curation pondérée par le rendement (#125).
//   npx tsx src/test-kernel-curation-priority.ts
import type { ReuseImpactSnapshot, ReuseImpactComparison, ReuseKind } from '../kernel/kernel-reuse-metrics.js'
import { rankFamiliesByYield, curationDirective, tuneKnobs, tuneKnobsFromLift, DEFAULT_KNOBS } from '../kernel/kernel-curation-priority.js'

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

// Fabrique un comparatif de famille avec les deltas voulus.
function fam(
  kind: ReuseKind,
  delta: { cost: number | null; succ: number | null; dur?: number | null },
): { kind: ReuseKind } & ReuseImpactComparison {
  const bucket = { turns: 0, avgCostUsd: 0, avgDurationMs: 0, avgAgentTurns: 0, successRatePct: 0 }
  return {
    kind,
    with: bucket,
    without: bucket,
    delta: { costSavingPct: delta.cost, durationSavingPct: delta.dur ?? null, successRatePts: delta.succ },
    sampleSufficient: false,
  }
}

function snap(families: Array<{ kind: ReuseKind } & ReuseImpactComparison>): ReuseImpactSnapshot {
  const bucket = { turns: 0, avgCostUsd: 0, avgDurationMs: 0, avgAgentTurns: 0, successRatePct: 0 }
  return {
    reuse: bucket,
    noReuse: bucket,
    delta: { costSavingPct: null, durationSavingPct: null, successRatePts: null },
    sampleSufficient: false,
    byKind: families,
  }
}

// ── rankFamiliesByYield ──────────────────────────────────────────────────────
{
  const ranked = rankFamiliesByYield(
    snap([
      fam('component', { cost: 80, succ: 20 }), // gagnant net → exploit
      fam('skill', { cost: null, succ: null }), // non mesuré → explore
      fam('procedure', { cost: -30, succ: -10 }), // perdant net → deprioritize
      fam('palette', { cost: 10, succ: 0 }), // gagnant faible → exploit mais < explore
    ]),
  )
  const order = ranked.map((f) => f.kind)
  check('exploit net en tête', order[0] === 'component')
  check('explore avant gagnant faible', order.indexOf('skill') < order.indexOf('palette'))
  check('deprioritize en queue', order[order.length - 1] === 'procedure')

  const byKind = Object.fromEntries(ranked.map((f) => [f.kind, f]))
  check('raison exploit', byKind.component.reason === 'exploit')
  check('raison explore (non mesuré)', byKind.skill.reason === 'explore' && byKind.skill.measured === false)
  check('raison deprioritize', byKind.procedure.reason === 'deprioritize')
  check('score composant = 80*1 + 20*1.5 = 110', byKind.component.score === 110)

  // Snapshot vide → liste vide, pas de crash.
  check('snapshot vide → []', rankFamiliesByYield(snap([])).length === 0)
}

// ── curationDirective ────────────────────────────────────────────────────────
{
  const ranked = rankFamiliesByYield(
    snap([
      fam('component', { cost: 80, succ: 20 }),
      fam('skill', { cost: null, succ: null }),
      fam('procedure', { cost: -30, succ: -10 }),
    ]),
  )
  const d = curationDirective(ranked)
  check('directive : non vide', d.length > 0)
  check('directive : nomme les composants (top)', d.includes('composants'))
  check('directive : mentionne le rendement mesuré', d.includes('économie de coût 80%'))
  check('directive : exclut la famille à rendement négatif', !d.includes('procédures'))
  check('directive : limite à 2 par défaut', d.includes('1.') && d.includes('2.') && !d.includes('3.'))

  // Tout négatif → aucune directive (on ne pousse jamais vers un dud prouvé).
  const allBad = rankFamiliesByYield(
    snap([fam('component', { cost: -10, succ: -5 }), fam('palette', { cost: -20, succ: 0 })]),
  )
  check('directive : "" si tout négatif', curationDirective(allBad) === '')

  // Non mesuré → directive d'exploration.
  const unknown = rankFamiliesByYield(snap([fam('component', { cost: null, succ: null })]))
  const du = curationDirective(unknown)
  check('directive : exploration si non mesuré', du.includes('à explorer'))
}

// ── tuneKnobs : repli DISCRET quand le lift n'est pas fourni (#127) ──────────
{
  check('tune positive (sans lift) → palier discret', tuneKnobs('positive').exploreBaseline === 8 && tuneKnobs('positive').exploitGain === 1.3)
  check('tune negative (sans lift) → palier discret', tuneKnobs('negative').exploreBaseline === 25 && tuneKnobs('negative').exploitGain === 0.7)
  check('tune neutral (sans lift) → léger penchant exploration', tuneKnobs('neutral').exploreBaseline === 18)
  check('tune insufficient → défaut', tuneKnobs('insufficient').exploreBaseline === DEFAULT_KNOBS.exploreBaseline)
}

// ── tuneKnobsFromLift : réglage CONTINU interpolé sur le lift (#129) ─────────
{
  check('lift 0 → centre (explore 16, gain 1)', tuneKnobsFromLift(0).exploreBaseline === 16 && tuneKnobsFromLift(0).exploitGain === 1)
  check('lift +10 → exploite (explore 11, gain 1.18)', tuneKnobsFromLift(10).exploreBaseline === 11 && tuneKnobsFromLift(10).exploitGain === 1.18)
  check('lift -10 → explore (explore 21, gain 0.83)', tuneKnobsFromLift(-10).exploreBaseline === 21 && tuneKnobsFromLift(-10).exploitGain === 0.83)
  // Saturation aux bornes (|lift| ≥ LIFT_SCALE=20).
  check('lift +100 saturé → explore 6, gain 1.35', tuneKnobsFromLift(100).exploreBaseline === 6 && tuneKnobsFromLift(100).exploitGain === 1.35)
  check('lift -100 saturé → explore 26, gain 0.65', tuneKnobsFromLift(-100).exploreBaseline === 26 && tuneKnobsFromLift(-100).exploitGain === 0.65)
  // Monotonie : plus le lift monte, plus on exploite (explore ↓, gain ↑).
  check('monotonie : lift croissant → explore décroissant', tuneKnobsFromLift(5).exploreBaseline > tuneKnobsFromLift(15).exploreBaseline)
  check('monotonie : lift croissant → gain croissant', tuneKnobsFromLift(5).exploitGain < tuneKnobsFromLift(15).exploitGain)
}

// ── tuneKnobs(verdict, lift) : le continu s'active quand le lift est fourni ──
{
  // Avec un lift fourni et un verdict conclusif → interpolation (≠ palier discret).
  check('continu : positive + lift 10 → interpolé (explore 11, pas 8)', tuneKnobs('positive', 10).exploreBaseline === 11)
  check('continu : negative + lift -10 → interpolé (explore 21, pas 25)', tuneKnobs('negative', -10).exploreBaseline === 21)
  // insufficient reste un GARDE : même avec un lift, on ne bouge pas du défaut.
  check('continu : insufficient + lift → défaut (garde)', tuneKnobs('insufficient', 10).exploreBaseline === DEFAULT_KNOBS.exploreBaseline)
  // lift null → repli discret.
  check('continu : lift null → repli discret', tuneKnobs('positive', null).exploreBaseline === 8)
}

// ── rankFamiliesByYield avec knobs : effet concret du réglage ────────────────
{
  // exploitGain amplifie le score mesuré ; exploreBaseline déplace les non-mesurées.
  const s = snap([fam('component', { cost: 80, succ: 20 }), fam('skill', { cost: null, succ: null })])
  const base = Object.fromEntries(rankFamiliesByYield(s).map((f) => [f.kind, f]))
  const tuned = Object.fromEntries(rankFamiliesByYield(s, { exploreBaseline: 8, exploitGain: 1.3 }).map((f) => [f.kind, f]))
  check('knobs : gain amplifie le score mesuré (110·1.3=143)', Math.abs(tuned.component.score - 143) < 1e-9)
  check('knobs : exploreBaseline déplace le non-mesuré', tuned.skill.score === 8 && base.skill.score === 15)
  check('knobs : positive sépare plus exploit de explore', tuned.component.score - tuned.skill.score > base.component.score - base.skill.score)

  // exploitGain ne change PAS le signe → un dud reste un dud (exploit/deprioritize préservés).
  const dud = rankFamiliesByYield(snap([fam('procedure', { cost: -30, succ: -10 })]), { exploreBaseline: 8, exploitGain: 1.3 })
  check('knobs : gain ne ressuscite pas un dud', dud[0].reason === 'deprioritize')
}

console.log(`\n[curation-priority] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
