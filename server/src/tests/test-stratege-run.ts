// Tests du DÉCLENCHEUR proactif du Stratège global (#176-global, É4).
//   1. Gate OFF → maybeRunStrategistCycle n'appelle JAMAIS le cycle (0 I/O) — la
//      non-régression la plus importante (lot nocturne byte-identique).
//   2. Gate ON, signaux simulés (deps injectées) → strategist-state.json (store
//      injecté) peuplé d'un briefing cohérent (≥1 item quand les signaux le justifient).
//   3. Relance avec le MÊME état persistant, mêmes signaux → pas de doublon (dédup É1/É3).
//   4. Un collecteur qui throw → le cycle continue avec les signaux des autres
//      (fail-open par capteur, jamais de throw remonté).
// Deps injectées → zéro I/O réel sur le vrai workspace, zéro réseau.
// Lancer : npx tsx src/test-stratege-run.ts
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const { runStrategistCycle, maybeRunStrategistCycle, gatherSignals, shouldRunPeriodicCycle, periodicIntervalMs } = await import("../stratege/stratege-run.js")
const { loadStrategistState, saveStrategistState } = await import("../stratege/stratege-store.js")
import type { Signal, StrategistState } from "../stratege/stratege-global-model.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0)

/** Un signal « chaud » (poids élevé) qui doit franchir le seuil de saillance. */
function hotSignal(over: Partial<Signal> = {}): Signal {
  return {
    sig: over.sig ?? "reuse:rate-global",
    source: over.source ?? "reuse",
    poids: over.poids ?? 0.9,
    ts: over.ts ?? NOW,
    type: over.type ?? "taux-reutilisation",
    nature: over.nature ?? "probleme",
    subject: over.subject ?? "réutilisation globale",
    detail: over.detail ?? "12% (bas)",
    ...over,
  }
}

// ────────────────────────────────────────────────────────────────────
console.log("[1] Gate OFF → le cycle n'est JAMAIS appelé (byte-identique, 0 I/O)")
{
  let calls = 0
  const ran = await maybeRunStrategistCycle(false, async () => { calls++ })
  check("maybeRunStrategistCycle(false) retourne false", ran === false)
  check("le cycle n'a pas été appelé (0 appel)", calls === 0)
}

console.log("\n[1b] Gate ON → le cycle EST appelé, un throw interne est avalé (fail-open)")
{
  let calls = 0
  const ran = await maybeRunStrategistCycle(true, async () => { calls++ }, () => {})
  check("gate ON → cycle appelé 1×", calls === 1)
  check("retourne true quand le cycle réussit", ran === true)

  let ran2: boolean | undefined
  let threw = false
  try {
    ran2 = await maybeRunStrategistCycle(true, async () => { throw new Error("boom") }, () => {})
  } catch { threw = true }
  check("un throw du cycle NE remonte jamais (jamais de throw)", threw === false)
  check("retourne false quand le cycle échoue (fail-open)", ran2 === false)
}

console.log("\n[2] Gate ON, signaux simulés → state peuplé d'un briefing cohérent")
{
  const TMP = path.join(os.tmpdir(), `mango-run-state-${process.pid}-2.json`)
  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }

  const res = await runStrategistCycle({
    collectors: [() => [hotSignal()]],
    load: () => loadStrategistState(TMP),
    save: (s: StrategistState) => saveStrategistState(s, TMP),
    now: () => NOW,
  })
  check("collecteur simulé → 1 signal collecté", res.signals.length === 1)
  check("briefing produit ≥ 1 item (le signal chaud franchit le seuil)",
    res.briefing.alertes.length + res.briefing.propositions.length + res.briefing.questions.length >= 1)
  check("état persisté sur disque (store injecté)", fs.existsSync(TMP))

  const onDisk = loadStrategistState(TMP)
  check("state.items peuplé (≥1)", onDisk.items.length >= 1)
  check("l'item porte le sig du signal", onDisk.items.some((i) => i.sig === "reuse:rate-global"))
  check("seen accumule le sig observé", (onDisk.seen["reuse:rate-global"]?.hits ?? 0) >= 1)
  check("journal a une entrée", onDisk.journal.length === 1)

  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }
}

console.log("\n[3] Relance avec le MÊME état + mêmes signaux → pas de doublon (dédup)")
{
  const TMP = path.join(os.tmpdir(), `mango-run-state-${process.pid}-3.json`)
  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }

  const deps = {
    collectors: [() => [hotSignal()]],
    load: () => loadStrategistState(TMP),
    save: (s: StrategistState) => saveStrategistState(s, TMP),
  }
  await runStrategistCycle({ ...deps, now: () => NOW })
  const after1 = loadStrategistState(TMP)
  const count1 = after1.items.filter((i) => i.sig === "reuse:rate-global").length

  await runStrategistCycle({ ...deps, now: () => NOW + 60_000 })
  const after2 = loadStrategistState(TMP)
  const matching = after2.items.filter((i) => i.sig === "reuse:rate-global")

  check("un seul item pour le sig répété après 1er cycle", count1 === 1)
  check("toujours UN seul item après relance (pas de doublon)", matching.length === 1)
  check("hits a augmenté à la ré-observation (accumulation cross-session)",
    (matching[0]?.hits ?? 0) >= 2)

  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }
}

console.log("\n[4] Un collecteur throw → les autres survivent (fail-open par capteur)")
{
  const okA = () => [hotSignal({ sig: "reuse:rate-global" })]
  const boom = (): Signal[] => { throw new Error("capteur mort") }
  const okB = () => [hotSignal({ sig: "blocages:wandering", source: "blocages", type: "blocage-recurrent", subject: "wandering" })]

  const gathered = gatherSignals([okA, boom, okB], () => {})
  check("gatherSignals ne lève jamais", true) // atteindre cette ligne suffit
  check("les 2 collecteurs sains ont produit leurs signaux", gathered.signals.length === 2)
  check("le collecteur en échec est compté (1 erreur)", gathered.errors === 1)
  check("signal du collecteur AVANT le throw présent", gathered.signals.some((s) => s.sig === "reuse:rate-global"))
  check("signal du collecteur APRÈS le throw présent (le throw n'a pas interrompu)",
    gathered.signals.some((s) => s.sig === "blocages:wandering"))

  const TMP = path.join(os.tmpdir(), `mango-run-state-${process.pid}-4.json`)
  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }
  let threw = false
  let res: Awaited<ReturnType<typeof runStrategistCycle>> | null = null
  try {
    res = await runStrategistCycle({
      collectors: [okA, boom, okB],
      load: () => loadStrategistState(TMP),
      save: (s: StrategistState) => saveStrategistState(s, TMP),
      now: () => NOW,
      log: () => {},
    })
  } catch { threw = true }
  check("runStrategistCycle ne remonte jamais le throw d'un collecteur", threw === false)
  check("le cycle a quand même 2 signaux (des collecteurs sains)", (res?.signals.length ?? 0) === 2)
  check("collectorErrors = 1 remonté dans le résultat", res?.collectorErrors === 1)
  try { fs.rmSync(TMP, { force: true }) } catch { /* */ }
}

console.log("\n[5] shouldRunPeriodicCycle — greffe périodique (évaluation portage Atlas, 2026-07-20)")
{
  check("les 2 gates OFF → jamais", shouldRunPeriodicCycle(NOW, 0, 60_000, false, false) === false)
  check("STRATEGE_PERIODIC OFF seul → jamais (même si STRATEGE_GLOBAL ON)",
    shouldRunPeriodicCycle(NOW, 0, 60_000, false, true) === false)
  check("STRATEGE_GLOBAL OFF seul → jamais (dépendance de gates, comme collectDemandesGated)",
    shouldRunPeriodicCycle(NOW, 0, 60_000, true, false) === false)
  check("les 2 gates ON, jamais tourné (lastRun=0) → tourne immédiatement (pas d'attente au 1er tick)",
    shouldRunPeriodicCycle(NOW, 0, 60_000, true, true) === true)
  check("les 2 gates ON, intervalle pas écoulé → pas encore",
    shouldRunPeriodicCycle(NOW, NOW - 30_000, 60_000, true, true) === false)
  check("les 2 gates ON, intervalle tout juste écoulé → tourne",
    shouldRunPeriodicCycle(NOW, NOW - 60_000, 60_000, true, true) === true)
  check("les 2 gates ON, largement dépassé → tourne",
    shouldRunPeriodicCycle(NOW, NOW - 3_600_000, 60_000, true, true) === true)

  check("periodicIntervalMs — défaut 25 min sans override", periodicIntervalMs({}) === 25 * 60 * 1000)
  check("periodicIntervalMs — override valide honoré", periodicIntervalMs({ STRATEGE_PERIODIC_INTERVAL_MS: "600000" }) === 600_000)
  check("periodicIntervalMs — override sous le plancher 60s → ignoré, repli défaut",
    periodicIntervalMs({ STRATEGE_PERIODIC_INTERVAL_MS: "1000" }) === 25 * 60 * 1000)
  check("periodicIntervalMs — override non numérique → ignoré, repli défaut",
    periodicIntervalMs({ STRATEGE_PERIODIC_INTERVAL_MS: "pas-un-nombre" }) === 25 * 60 * 1000)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
