// Tests du SURFAÇAGE PUSH + boucle fermée du Stratège global (#176-global, É5).
// Backend seulement, style « check() maison » du repo (pas de jest). Couvre :
//  - GET/POST via les fonctions pures sous-jacentes (applyItemStatus) plutôt que
//    de monter un vrai serveur Express — la logique de mutation/persistance EST
//    la partie à tester, les routes ne sont qu'un mince wrapper HTTP.
//  - round-trip load/save (store réel, fichier de test dédié via env override).
//  - un item `rejete` puis une nouvelle synthèse (stratege-global.ts, É1) avec
//    le même `sig` → reste absent (déjà couvert par test-stratege-global.ts,
//    section [3] ; ici on vérifie juste que LE STATUT persiste correctement
//    après la mutation de route, ce qui est la responsabilité de ce module).
//  - gate OFF → aucune injection de briefing au démarrage de session.
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { applyItemStatus, buildBriefingInjectionMessage, maybeInjectStrategeBriefing } from "../stratege/stratege-routes.js"
import { loadStrategistState, saveStrategistState } from "../stratege/stratege-store.js"
import { emptyStrategistState, type BriefingItem, type StrategistState } from "../stratege/stratege-global-model.js"
import { synthesize } from "../stratege/stratege-global.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0)

function item(overrides: Partial<BriefingItem> = {}): BriefingItem {
  return {
    id: overrides.id ?? "strat_1",
    sig: overrides.sig ?? "s1",
    kind: overrides.kind ?? "alerte",
    titre: overrides.titre ?? "Titre test",
    corps: overrides.corps ?? "Corps test",
    sources: overrides.sources ?? [],
    status: overrides.status ?? "pending",
    hits: overrides.hits ?? 1,
    saillance: overrides.saillance ?? 0.8,
    createdAt: overrides.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
  } as BriefingItem
}

// ————————————————————————————————————————————————————————————————
console.log("[1] applyItemStatus — mute le statut ET persiste (round-trip)")
{
  const tmpFile = path.join(os.tmpdir(), `stratege-test-${Date.now()}-1.json`)
  const initial: StrategistState = { ...emptyStrategistState(), items: [item({ id: "a", sig: "sig-a" })] }
  let stored: StrategistState = initial
  const load = () => stored
  const save = (s: StrategistState) => { stored = s; fs.writeFileSync(tmpFile, JSON.stringify(s)) }

  const afterAccept = applyItemStatus("a", "accepte", () => NOW, load, save)
  check("accepte : mutation renvoyée", afterAccept?.items.find(i => i.id === "a")?.status === "accepte")
  check("accepte : persisté (relire = accepté)", JSON.parse(fs.readFileSync(tmpFile, "utf8")).items[0].status === "accepte")
  check("accepte : updatedAt rafraîchi", afterAccept?.items[0]!.updatedAt === new Date(NOW).toISOString())

  const afterReject = applyItemStatus("a", "rejete", () => NOW + 1000, load, save)
  check("rejette : mutation renvoyée (valeur modèle 'rejete')", afterReject?.items.find(i => i.id === "a")?.status === "rejete")

  const afterReport = applyItemStatus("a", "reporte", () => NOW + 2000, load, save)
  check("reporte : mutation renvoyée", afterReport?.items.find(i => i.id === "a")?.status === "reporte")

  const missing = applyItemStatus("does-not-exist", "accepte", () => NOW, load, save)
  check("id inconnu → null (404 côté route)", missing === null)

  try { fs.unlinkSync(tmpFile) } catch { /* best-effort cleanup */ }
}

// ————————————————————————————————————————————————————————————————
console.log("\n[2] GET équivalent — loadStrategistState renvoie l'état persisté (fichier réel)")
{
  const tmpFile = path.join(os.tmpdir(), `stratege-test-${Date.now()}-2.json`)
  const state: StrategistState = { ...emptyStrategistState(), items: [item({ id: "b", sig: "sig-b", titre: "Persisté réellement" })] }
  saveStrategistState(state, tmpFile)
  const reloaded = loadStrategistState(tmpFile)
  check("round-trip fichier réel : item retrouvé", reloaded.items.some(i => i.id === "b" && i.titre === "Persisté réellement"))
  try { fs.unlinkSync(tmpFile) } catch { /* best-effort cleanup */ }
}

// ————————————————————————————————————————————————————————————————
console.log("\n[3] Un item REJETÉ ne réapparaît jamais dans une future synthèse (couvert par É1, vérifié ici bout-en-bout)")
{
  const rejectedState: StrategistState = {
    ...emptyStrategistState(),
    items: [item({ id: "strat_rej", sig: "rej-sig", status: "rejete" })],
  }
  const briefing = synthesize(
    [{ sig: "rej-sig", source: "reuse", poids: 0.95, ts: NOW }],
    rejectedState,
    NOW,
  )
  const all = [...briefing.propositions, ...briefing.alertes, ...briefing.questions]
  check("sig rejeté (même après mutation de route) n'est jamais re-proposé", all.length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[4] buildBriefingInjectionMessage — résumé court, seulement si des items pending existent")
{
  const empty = emptyStrategistState()
  check("état vide → aucun message", buildBriefingInjectionMessage(empty) === null)

  const onlySettled: StrategistState = { ...emptyStrategistState(), items: [item({ status: "accepte" }), item({ id: "x2", status: "rejete" })] }
  check("aucun item pending → aucun message (déjà traités)", buildBriefingInjectionMessage(onlySettled) === null)

  const withOpen: StrategistState = {
    ...emptyStrategistState(),
    items: [
      item({ id: "o1", kind: "alerte", titre: "Coût en hausse", saillance: 0.9 }),
      item({ id: "o2", kind: "suggestion", titre: "Réutiliser le composant X", saillance: 0.5 }),
    ],
  }
  const msg = buildBriefingInjectionMessage(withOpen)
  check("des items pending → un message court est produit", typeof msg === "string" && msg.length > 0)
  check("message court (≤ 4 lignes)", (msg?.split("\n").length ?? 99) <= 4)
  check("le message cite l'item le plus saillant", !!msg && msg.includes("Coût en hausse"))
}

// ————————————————————————————————————————————————————————————————
console.log("\n[5] maybeInjectStrategeBriefing — gate OFF ⇒ AUCUNE injection")
{
  const withOpen: StrategistState = { ...emptyStrategistState(), items: [item({ id: "g1", titre: "Alerte gate" })] }
  let appended = 0
  maybeInjectStrategeBriefing("dummy-dir", {
    gateOn: () => false,
    load: () => withOpen,
    append: () => { appended++ },
  })
  check("gate OFF → append jamais appelé", appended === 0)

  maybeInjectStrategeBriefing("dummy-dir", {
    gateOn: () => true,
    load: () => withOpen,
    append: () => { appended++ },
  })
  check("gate ON + briefing non vide → append appelé une fois", appended === 1)

  maybeInjectStrategeBriefing("dummy-dir", {
    gateOn: () => true,
    load: () => emptyStrategistState(),
    append: () => { appended++ },
  })
  check("gate ON + briefing VIDE → append jamais appelé (pas de spam)", appended === 1)

  // Robustesse : un load() qui lève ne doit jamais remonter (fire-and-forget).
  let threw = false
  try {
    maybeInjectStrategeBriefing("dummy-dir", {
      gateOn: () => true,
      load: () => { throw new Error("boom") },
      append: () => { appended++ },
    })
  } catch { threw = true }
  check("une erreur interne est avalée (jamais un throw ne remonte)", threw === false)
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-routes : ${pass} ok, ${fail} ko`)
if (fail > 0) process.exit(1)
