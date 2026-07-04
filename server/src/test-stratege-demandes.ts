// Tests du capteur « remise en question de la DEMANDE » (#176-global, É6).
// PUR, déterministe : deps injectées (historique de chat FAKE, préférences fake,
// état fake), aucun vrai fichier, aucun réseau. Vérifie la corrélation
// déterministe, le verrou anti-re-question, le bornage, le gate, et le non-
// faux-positif à N=1.
import { collectDemandes, collectDemandesGated, type CollectDemandesDeps } from "./stratege-demandes.js"
import { synthesize } from "./stratege-global.js"
import { emptyStrategistState, type StrategistState } from "./stratege-global-model.js"
import type { ChatEntry } from "./history.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const NOW = Date.UTC(2026, 6, 4, 12, 0, 0) // 2026-07-04T12:00:00Z
const day = (d: number): string => new Date(Date.UTC(2026, 6, d, 9, 0, 0)).toISOString()

const u = (text: string, ts: string): ChatEntry => ({ role: "user", text, ts })
const err = (text: string, ts: string): ChatEntry => ({ role: "error", text, ts })
const agent = (text: string, ts: string): ChatEntry => ({ role: "agent", text, ts })

/** Fabrique des deps avec un historique par projet, préfs et état injectés. */
function deps(histories: Record<string, ChatEntry[]>, extra: Partial<CollectDemandesDeps> = {}): CollectDemandesDeps {
  return {
    listProjects: () => Object.keys(histories),
    projectDir: (name) => name, // identité : le "dir" EST le nom (loadHistory fake s'en sert comme clé)
    loadHistory: (dir) => histories[dir] ?? [],
    loadPreferences: () => "",
    loadState: () => emptyStrategistState(),
    now: () => NOW,
    ...extra,
  }
}

// ————————————————————————————————————————————————————————————————
console.log("[1] 2 échecs corrélés sur un même TYPE de demande → 1 question sourcée citant les 2 runs")
{
  const histA: ChatEntry[] = [
    u("génère une image de chat réaliste", day(1)),
    err("échec : provider image indisponible", day(1)),
  ]
  const histB: ChatEntry[] = [
    u("génère une image de chien réaliste", day(2)),
    agent("désolé, ça a raté encore une fois", day(2)),
  ]
  const signals = collectDemandes(deps({ projA: histA, projB: histB }))
  check("un seul signal agrégé émis (1 type corrélé)", signals.length === 1)
  const s = signals[0]!
  check("le signal est de source 'demandes'", s.source === "demandes")
  check("sig stable 'demandes:<slug>'", s.sig.startsWith("demandes:"))
  check("value = nombre d'occurrences (2)", s.value === 2)
  check("poids ≥ seuil du spine (0.5)", s.poids >= 0.5)
  check("détail cite le run projA", (s.detail ?? "").includes("projA"))
  check("détail cite le run projB", (s.detail ?? "").includes("projB"))
  check("détail formulé en question ouverte (Œil Design)", /voulu|variante|approche/i.test(s.detail ?? ""))

  // Passé dans le spine → exactement 1 question-demande sourcée.
  const b = synthesize(signals, null, NOW)
  check("le spine en fait 1 question-demande", b.questions.length === 1)
  check("la question porte le champ 'demande'", typeof b.questions[0]!.demande === "string")
  check("la question 'demande' cite les 2 runs", /projA/.test(b.questions[0]!.demande ?? "") && /projB/.test(b.questions[0]!.demande ?? ""))
  check("aucune alerte/proposition parasite", b.alertes.length === 0 && b.propositions.length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[2] Demande déjà tranchée par Raf (sig 'rejete') → JAMAIS re-questionnée")
{
  const histA: ChatEntry[] = [u("génère une image de chat", day(1)), err("échec", day(1))]
  const histB: ChatEntry[] = [u("génère une image de chien", day(2)), err("échec", day(2))]
  // On calcule d'abord le sig produit, puis on l'injecte comme rejete dans l'état.
  const probe = collectDemandes(deps({ projA: histA, projB: histB }))
  const theSig = probe[0]!.sig
  const rejected: StrategistState = {
    ...emptyStrategistState(),
    items: [{
      id: "r", sig: theSig, kind: "question-demande", titre: "t", corps: "c", sources: [],
      status: "rejete", hits: 3, saillance: 1, createdAt: "x", updatedAt: "x",
    }],
  }
  const signals = collectDemandes(deps({ projA: histA, projB: histB }, { loadState: () => rejected }))
  check("verrou (a) capteur : aucun signal émis pour un sig rejeté", signals.length === 0)

  // Verrou (b) spine : même si le capteur émettait, le spine sauterait le sig rejeté.
  const bSpine = synthesize(probe, rejected, NOW)
  check("verrou (b) spine : aucune question pour un sig rejeté", bSpine.questions.length === 0)

  // Un sig ACCEPTÉ (Raf a validé « oui c'est voulu ») est aussi ignoré.
  const accepted: StrategistState = {
    ...emptyStrategistState(),
    items: [{ ...rejected.items[0]!, status: "accepte" }],
  }
  check("un sig accepté n'est pas re-questionné", collectDemandes(deps({ projA: histA, projB: histB }, { loadState: () => accepted })).length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[3] Jamais > 2 questions par briefing, même si le signal en produirait davantage")
{
  const histories: Record<string, ChatEntry[]> = {}
  // 4 types distincts, chacun corrélé (2 échecs) → 4 signaux demandes.
  for (const t of ["alpha", "beta", "gamma", "delta"]) {
    histories[`${t}1`] = [u(`fais un truc ${t} maintenant stp`, day(1)), err("échec", day(1))]
    histories[`${t}2`] = [u(`fais un truc ${t} encore une fois`, day(2)), err("échec", day(2))]
  }
  const signals = collectDemandes(deps(histories))
  check("le capteur émet bien > 2 signaux (4 types)", signals.length === 4)
  const b = synthesize(signals, null, NOW)
  check("le briefing borne à ≤ 2 questions", b.questions.length <= 2)
  check("exactement 2 questions retenues (les plus saillantes)", b.questions.length === 2)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[4] Gate STRATEGE_QUESTION_DEMANDE OFF (même si STRATEGE_GLOBAL ON) → aucune question")
{
  const histA: ChatEntry[] = [u("génère une image de chat", day(1)), err("échec", day(1))]
  const histB: ChatEntry[] = [u("génère une image de chien", day(2)), err("échec", day(2))]
  const d = deps({ projA: histA, projB: histB })

  process.env.STRATEGE_GLOBAL = "on"
  process.env.STRATEGE_QUESTION_DEMANDE = "off"
  const off = collectDemandesGated(d)
  check("gate OFF → collectDemandesGated renvoie [] (aucune question)", off.length === 0)
  check("gate OFF → briefing sans question", synthesize(off, null, NOW).questions.length === 0)

  process.env.STRATEGE_QUESTION_DEMANDE = "on"
  const on = collectDemandesGated(d)
  check("gate ON (avec STRATEGE_GLOBAL ON) → le capteur émet", on.length === 1)
  check("gate ON → 1 question dans le briefing", synthesize(on, null, NOW).questions.length === 1)

  delete process.env.STRATEGE_GLOBAL
  delete process.env.STRATEGE_QUESTION_DEMANDE
}

// ————————————————————————————————————————————————————————————————
console.log("\n[5] Un seul échec (N=1, sous le seuil N≥2) → aucune question (pas de faux positif)")
{
  const histA: ChatEntry[] = [u("génère une image de chat", day(1)), err("échec", day(1))]
  const signals = collectDemandes(deps({ projA: histA }))
  check("N=1 → aucun signal émis", signals.length === 0)
  check("N=1 → aucune question dans le briefing", synthesize(signals, null, NOW).questions.length === 0)

  // Une demande RÉUSSIE (aucune issue d'échec) ne compte pas non plus.
  const histOk: ChatEntry[] = [
    u("génère une image de chat", day(1)), agent("voici l'image, c'est parfait", day(1)),
    u("génère une image de chien", day(2)), agent("voici, livré", day(2)),
  ]
  check("2 demandes RÉUSSIES du même type → aucune corrélation-problème", collectDemandes(deps({ projOk: histOk })).length === 0)
}

// ————————————————————————————————————————————————————————————————
console.log("\n[6] Contradiction avec une préférence apprise (magasin .preferences.md)")
{
  // Deux demandes qui touchent un token INTERDIT par les préférences → 2 occurrences.
  const prefs = "# Préférences apprises\n- jamais carousel dans les interfaces\n- évite serif pour les titres"
  const histA: ChatEntry[] = [u("ajoute un carousel maintenant en haut", day(1)), agent("ok livré", day(1))]
  const histB: ChatEntry[] = [u("ajoute un carousel maintenant dans le hero", day(2)), agent("ok livré", day(2))]
  const signals = collectDemandes(deps({ projA: histA, projB: histB }, { loadPreferences: () => prefs }))
  check("2 demandes contredisant une préférence → 1 signal", signals.length === 1)
  check("le détail signale la contradiction de préférence", /préférence/i.test(signals[0]!.detail ?? ""))
}

// ————————————————————————————————————————————————————————————————
console.log("\n[7] Fail-open : deps qui lèvent / historiques corrompus → jamais de throw, []")
{
  let threw = false
  try {
    check("listProjects qui lève → []", collectDemandes({ listProjects: () => { throw new Error("boom") } }).length === 0)
    check("loadHistory qui lève → []", collectDemandes(deps({ p: [] }, { loadHistory: () => { throw new Error("boom") } })).length === 0)
    check("historique non-tableau → []", collectDemandes(deps({}, { listProjects: () => ["x"], loadHistory: () => (null as unknown as ChatEntry[]) })).length === 0)
    check("loadState qui lève → détection continue (pas de throw)", collectDemandes(deps({ projA: [u("génère une image de chat", day(1)), err("échec", day(1))], projB: [u("génère une image de chien", day(2)), err("échec", day(2))] }, { loadState: () => { throw new Error("boom") } })).length === 1)
  } catch {
    threw = true
  }
  check("aucune exception levée sur deps dégradées", threw === false)
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-demandes : ${pass} ok, ${fail} ko`)
if (fail > 0) process.exit(1)
