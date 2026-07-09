// Tests du store de persistance cross-session du Stratège global (#176-global, É3).
// Round-trip, dédup (via advanceState + save/load), robustesse fichier absent/corrompu, prune.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TMP = path.join(os.tmpdir(), `mango-stratege-state-${process.pid}.json`)

const { loadStrategistState, saveStrategistState, pruneStrategistState } = await import("../stratege/stratege-store.js")
const { synthesize, advanceState } = await import("../stratege/stratege-global.js")
const { emptyStrategistState } = await import("../stratege/stratege-global-model.js")
import type { BriefingItem as BriefingItemType, Signal, StrategistState } from "../stratege/stratege-global-model.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const reset = () => { try { fs.rmSync(TMP, { force: true }) } catch { /* */ } }

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0)

function mkItem(overrides: Partial<BriefingItemType> = {}): BriefingItemType {
  return {
    id: overrides.id ?? "strat_x",
    sig: overrides.sig ?? "sig-x",
    kind: overrides.kind ?? "alerte",
    titre: overrides.titre ?? "Titre",
    corps: overrides.corps ?? "Corps",
    sources: overrides.sources ?? [],
    status: overrides.status ?? "pending",
    hits: overrides.hits ?? 1,
    saillance: overrides.saillance ?? 0.8,
    createdAt: overrides.createdAt ?? new Date(NOW).toISOString(),
    updatedAt: overrides.updatedAt ?? new Date(NOW).toISOString(),
  } as BriefingItemType
}

// ————————————————————————————————————————————————————————————————
console.log("[1] Round-trip write/read")
{
  reset()
  const state: StrategistState = {
    version: 1,
    items: [mkItem({ sig: "a" }), mkItem({ sig: "b", hits: 3 })],
    seen: { a: { hits: 1, firstSeen: "2026-07-01T00:00:00.000Z", lastSeen: "2026-07-04T00:00:00.000Z" } },
    lastRunAt: new Date(NOW).toISOString(),
    windowFrom: new Date(NOW - 1000).toISOString(),
    journal: [{ at: new Date(NOW).toISOString(), propositions: 0, alertes: 1, questions: 0, resume: "test" }],
  }
  saveStrategistState(state, TMP)
  const loaded = loadStrategistState(TMP)
  check("fichier créé", fs.existsSync(TMP))
  check("items identiques (2)", loaded.items.length === 2)
  check("sig 'a' et 'b' présents", !!loaded.items.find((i) => i.sig === "a") && !!loaded.items.find((i) => i.sig === "b"))
  check("seen préservé", loaded.seen["a"]?.hits === 1)
  check("journal préservé", loaded.journal.length === 1 && loaded.journal[0]!.resume === "test")
  reset()
}

console.log("\n[2] Dédup — même sig écrit deux fois → hits++, pas de doublon")
{
  reset()
  const sig = (over: Partial<Signal> = {}): Signal => ({
    sig: over.sig ?? "s1", source: over.source ?? "reuse", poids: over.poids ?? 0.9, ts: over.ts ?? NOW, ...over,
  })
  let state = emptyStrategistState()
  const b1 = synthesize([sig()], state, NOW)
  state = advanceState(state, [sig()], b1, NOW)
  saveStrategistState(state, TMP)

  let loaded = loadStrategistState(TMP)
  const b2 = synthesize([sig()], loaded, NOW + 1000)
  loaded = advanceState(loaded, [sig()], b2, NOW + 1000)
  saveStrategistState(loaded, TMP)

  const final = loadStrategistState(TMP)
  const matching = final.items.filter((i) => i.sig === "s1")
  check("un seul item pour le sig répété (pas de doublon)", matching.length === 1)
  check("hits a augmenté", (matching[0]?.hits ?? 0) >= 2)
  reset()
}

console.log("\n[3] Survit à un fichier absent (bootstrap propre)")
{
  reset()
  let threw = false
  let loaded: StrategistState | null = null
  try { loaded = loadStrategistState(TMP) } catch { threw = true }
  check("ne lève jamais", !threw)
  check("état vide initial", !!loaded && loaded.items.length === 0 && loaded.journal.length === 0 && Object.keys(loaded.seen).length === 0)
}

console.log("\n[4] Survit à un fichier corrompu (JSON invalide)")
{
  reset()
  fs.writeFileSync(TMP, "{ ceci n'est pas du JSON valide ///")
  let threw = false
  let loaded: StrategistState | null = null
  try { loaded = loadStrategistState(TMP) } catch { threw = true }
  check("ne lève jamais sur JSON invalide", !threw)
  check("repli sur état vide", !!loaded && loaded.items.length === 0)

  // Structure inattendue (pas un objet StrategistState) → repli aussi.
  fs.writeFileSync(TMP, JSON.stringify([1, 2, 3]))
  let loaded2: StrategistState | null = null
  try { loaded2 = loadStrategistState(TMP) } catch { threw = true }
  check("repli aussi sur structure inattendue", !!loaded2 && loaded2.items.length === 0)
  reset()
}

console.log("\n[5] Le prune borne effectivement la taille")
{
  reset()
  const many = Array.from({ length: 250 }, (_, i) => mkItem({ id: `strat_${i}`, sig: `sig-${i}`, hits: i }))
  const state: StrategistState = {
    version: 1,
    items: many,
    seen: Object.fromEntries(
      Array.from({ length: 600 }, (_, i) => [
        `sig-${i}`,
        { hits: 1, firstSeen: new Date(NOW).toISOString(), lastSeen: new Date(NOW + i).toISOString() },
      ]),
    ),
    journal: Array.from({ length: 150 }, (_, i) => ({
      at: new Date(NOW + i).toISOString(), propositions: 0, alertes: 0, questions: 0, resume: `j${i}`,
    })),
  }
  const pruned = pruneStrategistState(state, { now: NOW })
  check("items capé à 200", pruned.items.length <= 200)
  check("seen capé à 500", Object.keys(pruned.seen).length <= 500)
  check("journal capé à 100", pruned.journal.length <= 100)
  check("items les plus 'hits' conservés (le item hits=249 survit)", !!pruned.items.find((i) => i.hits === 249))

  saveStrategistState(state, TMP)
  const loaded = loadStrategistState(TMP)
  check("après save/load, la taille reste bornée sur disque", loaded.items.length <= 200 && Object.keys(loaded.seen).length <= 500 && loaded.journal.length <= 100)
  reset()
}

console.log("\n[6] TTL — un item accepte/rejete ancien est purgé, pending/reporte survit")
{
  reset()
  const OLD = NOW - 200 * 24 * 60 * 60 * 1000 // 200 jours avant NOW (> TTL 90j)
  const state: StrategistState = {
    version: 1,
    items: [
      mkItem({ sig: "old-accepte", status: "accepte", updatedAt: new Date(OLD).toISOString() }),
      mkItem({ sig: "old-rejete", status: "rejete", updatedAt: new Date(OLD).toISOString() }),
      mkItem({ sig: "old-pending", status: "pending", updatedAt: new Date(OLD).toISOString() }),
      mkItem({ sig: "recent-accepte", status: "accepte", updatedAt: new Date(NOW).toISOString() }),
    ],
    seen: {},
    journal: [],
  }
  const pruned = pruneStrategistState(state, { now: NOW })
  check("vieux item accepte purgé", !pruned.items.find((i) => i.sig === "old-accepte"))
  check("vieux item rejete purgé", !pruned.items.find((i) => i.sig === "old-rejete"))
  check("vieux item pending survit (jamais purgé par TTL)", !!pruned.items.find((i) => i.sig === "old-pending"))
  check("item accepte récent survit", !!pruned.items.find((i) => i.sig === "recent-accepte"))
  reset()
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
