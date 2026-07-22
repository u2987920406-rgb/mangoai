// Tests de la boucle d'auto-évolution (self-evolution.ts) — couverture, dédup, store, statuts.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TMP = path.join(os.tmpdir(), `mango-gaps-${process.pid}.json`)
process.env.OPEN_GAPS_FILE = TMP

const {
  gapSignature, coversGap, recordUncoveredGap, loadGaps, listOpenGaps, markGap, getGap,
  evictOverflow, recordForgeAttempt, forgeAttemptsExhausted, gapValueScore,
} = await import("../self/self-evolution.js")

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const reset = () => { try { fs.rmSync(TMP, { force: true }) } catch { /* */ } }

// Agent forgé minimal pour tester la couverture.
const mkAgent = (over: Partial<{ lacune: string; tags: string[]; role: string; triggers: string }>) => ({
  id: "sa_x", name: "Agent", role: over.role ?? "rôle",
  lacune: over.lacune ?? "", systemPrompt: "Tu es un expert.", tools: [],
  triggers: over.triggers ?? "", examples: [], tags: over.tags ?? [],
  provider: "openai" as const, model: "glm-5.2:cloud", createdByAgent: "forgeron", createdAt: "",
})

console.log("[1] gapSignature")
{
  check("slug stable + accents retirés", gapSignature("plateau-iterations", "Extraction .xlsx fusionnée") === "plateau-iterations-extraction-xlsx-fusionnee")
  check("ne lève pas sur vide → 'gap'", gapSignature("", "") === "gap")
}

console.log("\n[2] coversGap")
{
  const xlsx = mkAgent({ lacune: "extraction xlsx classeur tableur", tags: ["xlsx", "classeur"] })
  check("blocage couvert (≥2 tokens communs) → agent", coversGap("extraction", "classeur xlsx fusionnees", [xlsx])?.id === "sa_x")
  check("blocage NON couvert → null", coversGap("websocket", "temps reel collaboratif", [xlsx]) === null)
  check("aucun agent → null", coversGap("extraction", "xlsx", []) === null)
  // anti-faux-positif : la TÂCHE ne doit PAS servir au matching (« page accueil » ≠ couverture)
  const seed = mkAgent({ lacune: "charger la page d'accueil une seule fois perf", role: "perf home" })
  check("tâche partage des mots mais blocage non couvert → null", coversGap("plateau-iterations", "plafond iterations atteint tache trop large", [seed]) === null)
}

console.log("\n[3] recordUncoveredGap")
{
  reset()
  const r1 = recordUncoveredGap({ blocker: "plateau-iterations", detail: "websocket temps reel", task: "chat collaboratif" }, { agents: [] })
  check("lacune NOUVELLE non couverte → recorded + isNew + proposed", r1.recorded && r1.isNew && r1.gap?.status === "proposed" && r1.gap?.hits === 1)
  const r2 = recordUncoveredGap({ blocker: "plateau-iterations", detail: "websocket temps reel", task: "chat collaboratif" }, { agents: [] })
  check("même lacune → pas isNew, hits incrémenté (dédup)", r2.recorded && !r2.isNew && r2.gap?.hits === 2 && loadGaps().length === 1)
  const covering = mkAgent({ lacune: "websocket temps reel collaboratif" })
  const r3 = recordUncoveredGap({ blocker: "websocket", detail: "temps reel collaboratif", task: "" }, { agents: [covering] })
  check("lacune DÉJÀ couverte par un agent → covered, non recordée", !r3.recorded && r3.covered && loadGaps().length === 1)
  // robustesse : entrée vide ne lève jamais
  const r4 = recordUncoveredGap({ blocker: "" }, { agents: [] })
  check("entrée minimale → ne lève pas", typeof r4.recorded === "boolean")
  reset()
}

console.log("\n[4] listOpenGaps + markGap")
{
  reset()
  const now = 1_700_000_000_000
  recordUncoveredGap({ blocker: "a-bloc", detail: "un", task: "t" }, { agents: [], now })
  recordUncoveredGap({ blocker: "b-bloc", detail: "deux", task: "t" }, { agents: [], now: now + 1 })
  recordUncoveredGap({ blocker: "b-bloc", detail: "deux", task: "t" }, { agents: [], now: now + 2 }) // b a 2 hits
  const open = listOpenGaps()
  check("tri par hits décroissant (b avant a)", open.length === 2 && open[0]!.blocker === "b-bloc")
  const bId = open[0]!.id
  check("markGap forged + agentId", markGap(bId, "forged", { agentId: "sa_new" })?.status === "forged")
  check("getGap reflète le statut", getGap(bId)?.agentId === "sa_new")
  check("forged sort de la liste ouverte", listOpenGaps().length === 1)
  check("markGap id inconnu → null", markGap("nope", "dismissed") === null)
  reset()
}

interface OpenGapLike {
  id: string; sig: string; title: string; blocker: string; detail: string; task: string
  status: "proposed" | "forging" | "forged" | "dismissed"; hits: number; forgeAttempts?: number
  createdAt: string; updatedAt: string
}

console.log("\n[5] evictOverflow — évince les CLOSES anciennes, jamais les nouvelles (revue Fable #8)")
{
  const mkGap = (over: Partial<OpenGapLike>): OpenGapLike => ({
    id: over.id ?? "g", sig: over.sig ?? over.id ?? "g", title: "t", blocker: "b", detail: "d", task: "",
    status: over.status ?? "proposed", hits: 1, forgeAttempts: 0,
    createdAt: over.updatedAt ?? "2026-01-01", updatedAt: over.updatedAt ?? "2026-01-01",
  })
  const list = [
    mkGap({ id: "old-closed", status: "forged", updatedAt: "2026-01-01" }),
    mkGap({ id: "mid-closed", status: "dismissed", updatedAt: "2026-01-02" }),
    mkGap({ id: "active-old", status: "proposed", updatedAt: "2026-01-03" }),
    mkGap({ id: "newest", status: "proposed", updatedAt: "2026-01-04" }),
  ]
  const kept = evictOverflow(list, 2)
  const keptIds = kept.map((g: OpenGapLike) => g.id)
  check("évince les CLOSED les plus anciennes d'abord (old-closed, mid-closed)", !keptIds.includes("old-closed") && !keptIds.includes("mid-closed"))
  check("garde les actives, y compris la plus récente", keptIds.includes("active-old") && keptIds.includes("newest"))
  check("sous le plafond → inchangé", evictOverflow(list, 10).length === 4)
  // Ancien bug (slice(0, max)) : si TOUT est actif, l'ancien code aurait jeté "newest" (la
  // plus récente). Le nouveau doit toujours garder la plus récente en dernier recours.
  const allActive = [
    mkGap({ id: "a1", updatedAt: "2026-01-01" }),
    mkGap({ id: "a2", updatedAt: "2026-01-02" }),
    mkGap({ id: "a3-newest", updatedAt: "2026-01-03" }),
  ]
  const keptActive = evictOverflow(allActive, 1).map((g: OpenGapLike) => g.id)
  check("tout actif, éviction forcée → garde la PLUS RÉCENTE (pas l'ancien bug inversé)", keptActive.includes("a3-newest"))
}

console.log("\n[6] recordForgeAttempt + forgeAttemptsExhausted (revue Fable #1)")
{
  reset()
  const r = recordUncoveredGap({ blocker: "x-bloc", detail: "detail x", task: "t" }, { agents: [] })
  const id = r.gap!.id
  check("forgeAttempts démarre à 0", r.gap!.forgeAttempts === 0)
  check("pas encore épuisé (0 < 3)", forgeAttemptsExhausted(r.gap!, 3) === false)
  recordForgeAttempt(id)
  recordForgeAttempt(id)
  const g2 = getGap(id)!
  check("2 tentatives comptabilisées", g2.forgeAttempts === 2)
  check("lastForgeAttemptAt renseigné", typeof g2.lastForgeAttemptAt === "string")
  check("toujours pas épuisé (2 < 3)", forgeAttemptsExhausted(g2, 3) === false)
  recordForgeAttempt(id)
  const g3 = getGap(id)!
  check("plafond atteint (3 >= 3) → épuisé", forgeAttemptsExhausted(g3, 3) === true)
  check("recordForgeAttempt id inconnu → null, ne lève pas", recordForgeAttempt("inconnu") === null)
  reset()
}

console.log("\n[7] gapValueScore (2026-07-22, demande de Raf — chiffrer si une lacune vaut le coup)")
{
  const NOW = 1_700_000_000_000 // référence fixe pour des calculs de fraîcheur déterministes
  const day = 86_400_000
  const mk = (over: Partial<OpenGapLike>): OpenGapLike => ({
    id: "g", sig: "g", title: "t", blocker: "b", detail: "d", task: "",
    status: "proposed", hits: 1, forgeAttempts: 0,
    createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
    ...over,
  })

  check("borné [0,100] : jamais négatif", gapValueScore(mk({ hits: 1, forgeAttempts: 5, updatedAt: new Date(NOW - 60 * day).toISOString() }), NOW) >= 0)
  check("borné [0,100] : jamais > 100", gapValueScore(mk({ hits: 99, forgeAttempts: 0 }), NOW) <= 100)
  check("récurrence : hits=1 fraîche → 20", gapValueScore(mk({ hits: 1, forgeAttempts: 0 }), NOW) === 20)
  check("récurrence plafonnée à 5 : hits=5 == hits=99", gapValueScore(mk({ hits: 5 }), NOW) === gapValueScore(mk({ hits: 99 }), NOW))
  check("plus de récurrence → score plus haut", gapValueScore(mk({ hits: 3 }), NOW) > gapValueScore(mk({ hits: 1 }), NOW))
  check("échecs déjà tentés → pénalité", gapValueScore(mk({ hits: 3, forgeAttempts: 2 }), NOW) < gapValueScore(mk({ hits: 3, forgeAttempts: 0 }), NOW))
  check(
    "staleness : vieille de 45j → moins bien notée que fraîche, à hits égal",
    gapValueScore(mk({ hits: 3, updatedAt: new Date(NOW - 45 * day).toISOString() }), NOW)
      < gapValueScore(mk({ hits: 3, updatedAt: new Date(NOW).toISOString() }), NOW),
  )
  check("ne lève pas sur updatedAt invalide", Number.isFinite(gapValueScore(mk({ updatedAt: "n'importe quoi" }), NOW)))

  console.log("\n[8] listOpenGaps trie par valeur, pas juste par fréquence")
  reset()
  // « fréquente-mais-tentée » : 5 hits mais 4 échecs déjà + vieille de 45j → basse valeur malgré le score brut de hits.
  recordUncoveredGap({ blocker: "frequente-mais-tentee", detail: "d1", task: "t" }, { agents: [], now: NOW - 45 * day })
  const gapA = getGap(loadGaps()[0]!.id)!
  for (let i = 0; i < 4; i++) recordForgeAttempt(gapA.id, NOW - 45 * day)
  // « fraiche-et-jamais-tentee » : 2 hits seulement mais fraîche et jamais retentée → devrait passer devant.
  recordUncoveredGap({ blocker: "fraiche-et-jamais-tentee", detail: "d2", task: "t" }, { agents: [], now: NOW })
  recordUncoveredGap({ blocker: "fraiche-et-jamais-tentee", detail: "d2", task: "t" }, { agents: [], now: NOW })
  const open = listOpenGaps(NOW)
  check("la lacune FRAÎCHE passe devant la lacune FRÉQUENTE-MAIS-ÉPUISÉE", open[0]!.blocker === "fraiche-et-jamais-tentee")
  reset()
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
