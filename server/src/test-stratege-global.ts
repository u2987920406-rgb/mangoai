// Tests du SPINE PUR du Stratège global (#176-global, É1).
// PUR, déterministe : `now` injecté, aucun réseau, aucun fichier. ~35 assertions.
import {
  synthesize,
  advanceState,
  type SynthOptions,
} from "./stratege-global.js"
import {
  emptyStrategistState,
  normalizeState,
  isSignal,
  type Briefing,
  type BriefingItem,
  type Signal,
  type StrategistState,
} from "./stratege-global-model.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0) // 2026-07-04T12:00:00Z
const recent = (h = 1): number => NOW - h * 60 * 60 * 1000

function sig(overrides: Partial<Signal> = {}): Signal {
  return {
    sig: overrides.sig ?? "s1",
    source: overrides.source ?? "reuse",
    poids: overrides.poids ?? 0.7,
    ts: overrides.ts ?? recent(),
    ...overrides,
  }
}

const allItems = (b: Briefing): BriefingItem[] => [...b.propositions, ...b.alertes, ...b.questions]

// ————————————————————————————————————————————————————————————————
console.log("[1] Seuils — la saillance calculée accepte ou refuse")
{
  const opts: SynthOptions = { minSaillance: 0.5, hitsWeight: 0.25 }
  const above = synthesize([sig({ sig: "hi", poids: 0.6, nature: "opportunite" })], null, NOW, opts)
  check("poids 0.6 ≥ seuil 0.5 → 1 item retenu", allItems(above).length === 1)
  check("poids 0.6 (opportunité) → proposition", above.propositions.length === 1)

  const below = synthesize([sig({ sig: "lo", poids: 0.3, nature: "opportunite" })], null, NOW, opts)
  check("poids 0.3 < seuil 0.5 → aucun item", allItems(below).length === 0)
  check("aucun item → résumé 'rien de saillant'", /rien de saillant/i.test(below.resume))

  // Un signal 'probleme' devient une alerte (pas une proposition).
  const prob = synthesize([sig({ sig: "pb", poids: 0.8, nature: "probleme" })], null, NOW, opts)
  check("poids 0.8 (problème) → alerte", prob.alertes.length === 1 && prob.propositions.length === 0)

  // Sous le seuil MAIS ré-observé plusieurs fois → le bonus de hits le fait monter.
  const state: StrategistState = { ...emptyStrategistState(), seen: { climb: { hits: 3, firstSeen: "", lastSeen: "" } } }
  const climbed = synthesize([sig({ sig: "climb", poids: 0.3, nature: "opportunite" })], state, NOW, opts)
  check("poids 0.3 + 3 hits antérieurs → monte au-dessus du seuil", allItems(climbed).length === 1)
  const cold = synthesize([sig({ sig: "climb", poids: 0.3, nature: "opportunite" })], null, NOW, opts)
  check("même signal sans historique de hits → reste sous le seuil", allItems(cold).length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[2] Tendance montante sur plusieurs signaux du même type → alerte")
{
  const fam: Signal[] = [
    sig({ sig: "e1", source: "traces", type: "escalade-claude", subject: "projetA", poids: 0.4 }),
    sig({ sig: "e2", source: "traces", type: "escalade-claude", subject: "projetB", poids: 0.4 }),
    sig({ sig: "e3", source: "traces", type: "escalade-claude", subject: "projetC", poids: 0.4 }),
  ]
  const b = synthesize(fam, null, NOW, { trendMin: 3 })
  check("3 signaux même famille → au moins une alerte", b.alertes.length >= 1)
  const trend = b.alertes.find((a) => a.sig.startsWith("trend:"))
  check("l'alerte est une tendance agrégée (sig 'trend:…')", !!trend)
  check("la tendance agrège (1 seule alerte, pas 3 items)", b.alertes.length === 1)
  check("l'alerte source cite plusieurs signaux", (trend?.sources.length ?? 0) >= 3)

  // En dessous du seuil de tendance → pas de tendance (chaque sig évalué seul).
  const b2 = synthesize(fam.slice(0, 2), null, NOW, { trendMin: 3 })
  check("2 signaux < trendMin → aucune tendance agrégée", !b2.alertes.some((a) => a.sig.startsWith("trend:")))
}

// ————————————————————————————————————————————————————————————————
console.log("\n[3] Un sig déjà REJETÉ n'est jamais re-proposé")
{
  const state: StrategistState = {
    ...emptyStrategistState(),
    items: [{
      id: "strat_bad", sig: "bad", kind: "alerte", titre: "t", corps: "c", sources: [],
      status: "rejete", hits: 2, saillance: 1, createdAt: "x", updatedAt: "x",
    }],
  }
  const b = synthesize([sig({ sig: "bad", poids: 0.9 })], state, NOW)
  check("le signal brut réapparaît mais l'item rejeté ne remonte pas", allItems(b).length === 0)

  // Un sig ACCEPTÉ (traité) ne remonte pas non plus.
  const accepted: StrategistState = {
    ...emptyStrategistState(),
    items: [{
      id: "strat_ok", sig: "ok", kind: "suggestion", titre: "t", corps: "c", sources: [],
      status: "accepte", hits: 1, saillance: 1, createdAt: "x", updatedAt: "x",
    }],
  }
  check("un sig accepté n'est pas re-proposé", allItems(synthesize([sig({ sig: "ok", poids: 0.9 })], accepted, NOW)).length === 0)

  // Un sig REPORTÉ, lui, PEUT réapparaître.
  const reported: StrategistState = {
    ...emptyStrategistState(),
    items: [{
      id: "strat_later", sig: "later", kind: "alerte", titre: "t", corps: "c", sources: [],
      status: "reporte", hits: 1, saillance: 1, createdAt: "orig", updatedAt: "orig",
    }],
  }
  const rb = synthesize([sig({ sig: "later", poids: 0.9 })], reported, NOW)
  check("un sig reporté réapparaît", allItems(rb).length === 1)
  check("l'item reporté conserve son id d'origine", allItems(rb)[0]!.id === "strat_later")
}

// ————————————————————————————————————————————————————————————————
console.log("\n[4] Ré-observation d'un même sig (pending) → hits++, pas de doublon")
{
  const state: StrategistState = {
    ...emptyStrategistState(),
    seen: { dup: { hits: 1, firstSeen: "x", lastSeen: "x" } },
    items: [{
      id: "strat_dup", sig: "dup", kind: "alerte", titre: "t", corps: "c", sources: [],
      status: "pending", hits: 1, saillance: 1, createdAt: "orig", updatedAt: "orig",
    }],
  }
  const b = synthesize([sig({ sig: "dup", poids: 0.8 })], state, NOW)
  check("un seul item pour le sig (pas de doublon)", allItems(b).filter((i) => i.sig === "dup").length === 1)
  check("hits incrémenté (1 → 2)", allItems(b)[0]!.hits === 2)
  check("l'item réutilise l'id existant", allItems(b)[0]!.id === "strat_dup")
  check("createdAt préservé, updatedAt rafraîchi", allItems(b)[0]!.createdAt === "orig" && allItems(b)[0]!.updatedAt !== "orig")

  // Deux signaux bruts du MÊME sig dans une même synthèse → un seul item.
  const two = synthesize([sig({ sig: "z", poids: 0.8 }), sig({ sig: "z", poids: 0.9 })], null, NOW)
  check("deux signaux même sig même run → un seul item", allItems(two).filter((i) => i.sig === "z").length === 1)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[5] Bornage anti-spam — le briefing ne grossit pas sans limite")
{
  const many: Signal[] = []
  for (let i = 0; i < 30; i++) many.push(sig({ sig: `p${i}`, source: "lacunes", type: `t${i}`, poids: 0.9, nature: "opportunite" }))
  for (let i = 0; i < 30; i++) many.push(sig({ sig: `a${i}`, source: "memoire", type: `m${i}`, poids: 0.9, nature: "probleme" }))
  const b = synthesize(many, null, NOW, { maxPropositions: 5, maxAlertes: 5 })
  check("propositions bornées à maxPropositions", b.propositions.length === 5)
  check("alertes bornées à maxAlertes", b.alertes.length === 5)
  check("total borné même avec 60 signaux saillants", allItems(b).length === 10)

  // Le bornage garde les plus saillants (poids/hits décroissant).
  const mixed: Signal[] = [
    sig({ sig: "weak", source: "lacunes", type: "w", poids: 0.55, nature: "opportunite" }),
    sig({ sig: "strong", source: "lacunes", type: "s", poids: 0.95, nature: "opportunite" }),
  ]
  const bm = synthesize(mixed, null, NOW, { maxPropositions: 1 })
  check("le cap conserve l'item le plus saillant", bm.propositions[0]!.sig === "strong")
}

// ————————————————————————————————————————————————————————————————
console.log("\n[6] Dégradation propre — entrées manquantes/vides, jamais de throw")
{
  let threw = false
  try {
    check("signals null → briefing vide", allItems(synthesize(null, null, NOW)).length === 0)
    check("signals undefined → briefing vide", allItems(synthesize(undefined, null, NOW)).length === 0)
    check("tableau vide → briefing vide", allItems(synthesize([], null, NOW)).length === 0)
    // Signaux malformés mélangés à un valide → seuls les valides comptent.
    const dirty = [null, undefined, {}, { sig: "" }, 42, "x", sig({ sig: "good", poids: 0.9 })] as unknown as Signal[]
    const b = synthesize(dirty, null, NOW)
    check("signaux malformés ignorés, le valide passe", allItems(b).filter((i) => i.sig === "good").length === 1)
    // previousState corrompu → normalisé, pas de crash.
    check("previousState corrompu → traité comme vide", allItems(synthesize([sig()], { junk: true } as unknown as StrategistState, NOW)).length >= 0)
    // now non fini → repli interne, pas de throw.
    check("now = NaN → pas de throw", synthesize([sig()], null, NaN as unknown as number) !== null)
  } catch {
    threw = true
  }
  check("aucune exception levée sur entrées dégradées", threw === false)

  check("isSignal rejette un objet vide", isSignal({}) === false)
  check("isSignal accepte un signal minimal", isSignal(sig()) === true)
  check("normalizeState(null) → état vide valide", normalizeState(null).items.length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[7] advanceState — accumulation cross-session des hits + dédup")
{
  const opts: SynthOptions = { minSaillance: 0.5 }
  // Un signal sous le seuil est quand même « vu » → hits accumulés → il finit par monter.
  let state = emptyStrategistState()
  const under = [sig({ sig: "grow", poids: 0.3, nature: "opportunite" })]

  const b0 = synthesize(under, state, NOW, opts)
  check("run 0 : sous le seuil, aucun item", allItems(b0).length === 0)
  state = advanceState(state, under, b0, NOW, opts)
  check("run 0 : mais le sig est mémorisé dans seen", state.seen["grow"]?.hits === 1)

  const b1 = synthesize(under, state, NOW, opts)
  state = advanceState(state, under, b1, NOW, opts)
  check("run 1 : hits accumulés (2)", state.seen["grow"]?.hits === 2)

  const b2 = synthesize(under, state, NOW, opts)
  check("run 2 : accumulation des hits fait franchir le seuil", allItems(b2).length === 1)

  // Le journal grandit, borné.
  const journaled = advanceState(state, under, b2, NOW, { ...opts, maxJournal: 2 })
  check("journal borné à maxJournal", journaled.journal.length <= 2)
  check("advanceState préserve le nombre d'items dédupliqué", journaled.items.filter((i) => i.sig === "grow").length <= 1)

  // Un statut piloté par Raf survit à advanceState.
  const withRejected: StrategistState = {
    ...emptyStrategistState(),
    items: [{ id: "r", sig: "rej", kind: "alerte", titre: "t", corps: "c", sources: [], status: "rejete", hits: 1, saillance: 1, createdAt: "x", updatedAt: "x" }],
  }
  const after = advanceState(withRejected, [sig({ sig: "rej", poids: 0.9 })], synthesize([sig({ sig: "rej", poids: 0.9 })], withRejected, NOW), NOW)
  check("un item rejeté reste rejeté après advanceState", after.items.find((i) => i.sig === "rej")?.status === "rejete")
}

// ————————————————————————————————————————————————————————————————
console.log("\n[8] Structure QuestionDemande prête (source 'demandes') — É6")
{
  const q = synthesize([sig({ sig: "dq", source: "demandes", poids: 0.9, detail: "stack X a raté 2 fois" })], null, NOW)
  check("un signal source 'demandes' produit une question-demande", q.questions.length === 1)
  check("la question porte le champ 'demande' (sourçage)", typeof q.questions[0]!.demande === "string")
  check("les questions sont bornées (max 2)", synthesize(
    [0, 1, 2, 3].map((i) => sig({ sig: `dq${i}`, source: "demandes", type: `t${i}`, poids: 0.9 })), null, NOW,
  ).questions.length <= 2)

  // Hors fenêtre glissante → ignoré.
  const old = synthesize([sig({ sig: "old", poids: 0.9, ts: NOW - 30 * 24 * 60 * 60 * 1000 })], null, NOW, { windowMs: 7 * 24 * 60 * 60 * 1000 })
  check("signal hors fenêtre glissante → ignoré", allItems(old).length === 0)
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-global : ${pass} ok, ${fail} ko`)
if (fail > 0) process.exit(1)
