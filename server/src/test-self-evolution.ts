// Tests de la boucle d'auto-évolution (self-evolution.ts) — couverture, dédup, store, statuts.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TMP = path.join(os.tmpdir(), `mango-gaps-${process.pid}.json`)
process.env.OPEN_GAPS_FILE = TMP

const {
  gapSignature, coversGap, recordUncoveredGap, loadGaps, listOpenGaps, markGap, getGap,
} = await import("./self-evolution.js")

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
  check("blocage couvert (≥2 tokens communs) → agent", coversGap("extraction", "classeur xlsx fusionnees", "lire un classeur", [xlsx])?.id === "sa_x")
  check("blocage NON couvert → null", coversGap("websocket", "temps reel collaboratif", "chat live", [xlsx]) === null)
  check("aucun agent → null", coversGap("extraction", "xlsx", "", []) === null)
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

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
