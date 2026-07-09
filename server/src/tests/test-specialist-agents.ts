// Tests du registre des agents spécialisés (specialist-agents.ts) — store + validation + invocation.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TMP = path.join(os.tmpdir(), `mango-specialists-${process.pid}.json`)
process.env.SPECIALIST_AGENTS_FILE = TMP

const {
  validateSpec, saveSpecialists, loadSpecialists, upsertSpecialists,
  getSpecialist, removeSpecialist, runSpecialist,
  recordSpecialistConsulted, recordSpecialistWin,
} = await import("../specialist/specialist-agents.js")

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const reset = () => { try { fs.rmSync(TMP, { force: true }) } catch { /* */ } }

const baseRaw = {
  name: "Gardien des régressions",
  role: "Détecte les régressions introduites par un édit",
  lacune: "L35 — sur-exploration",
  systemPrompt: "Tu es un expert anti-régression. Tu vérifies que les modifications n'ont rien cassé d'existant.",
  tools: [{ name: "diff_check", desc: "compare avant/après" }],
  triggers: "après un édit sur une app riche",
  examples: ["vérifie que le bouton marche toujours"],
  tags: ["régression", "qa"],
  provider: "ollama",
  model: "gemma4:12b",
}

console.log("[1] validateSpec")
{
  const s = validateSpec(baseRaw, { now: 1000, seq: 2 })
  check("normalise un objet valide", !!s && s.name === "Gardien des régressions" && s.provider === "ollama" && s.tools.length === 1)
  check("id préfixé sa_", !!s && /^sa_/.test(s.id))
  check("rejette sans nom", validateSpec({ ...baseRaw, name: "" }) === null)
  check("rejette sans rôle", validateSpec({ ...baseRaw, role: "" }) === null)
  check("rejette prompt trop court", validateSpec({ ...baseRaw, systemPrompt: "court" }) === null)
  check("rejette null / non-objet", validateSpec(null) === null && validateSpec("nope") === null)
  check("provider invalide → défaut", validateSpec({ ...baseRaw, provider: "x" }, { defaultProvider: "openai" })?.provider === "openai")
  const t = validateSpec({ ...baseRaw, tools: [{ desc: "sans nom" }, { name: "ok", desc: "x" }] })
  check("écarte les outils sans nom", !!t && t.tools.length === 1 && t.tools[0]!.name === "ok")
}

console.log("\n[2] store roundtrip")
{
  reset()
  check("load sur fichier absent → []", loadSpecialists().length === 0)
  const a = validateSpec(baseRaw)!
  saveSpecialists([a])
  const back = loadSpecialists()
  check("save puis load rend l'agent", back.length === 1 && back[0]!.name === a.name)
  const a2 = validateSpec({ ...baseRaw, name: "gardien des régressions", role: "rôle modifié assez long pour passer" })!
  const merged = upsertSpecialists([a2])
  check("upsert déduplique par nom (casse)", merged.length === 1 && merged[0]!.role.includes("modifié"))
  check("get par id rend l'agent fusionné", getSpecialist(merged[0]!.id)?.id === merged[0]!.id)
  check("remove existant → true", removeSpecialist(merged[0]!.id) === true)
  check("remove inconnu → false", removeSpecialist("inconnu") === false)
  check("registre vidé", loadSpecialists().length === 0)
}

console.log("\n[3] runSpecialist")
{
  reset()
  const a = validateSpec(baseRaw)!
  saveSpecialists([a])
  const r = await runSpecialist(a.id, "voici mon code", { ask: async (sys, user) => `SYS:${sys.slice(0, 5)}|USER:${user}` })
  check("invoque avec transport injecté", r.ok && r.text.includes("voici mon code") && r.agent?.name === a.name)
  const r2 = await runSpecialist("sa_inconnu", "x")
  check("id inconnu → ok:false", r2.ok === false)
  const r3 = await runSpecialist(a.id, "x", { ask: async () => { throw new Error("boom") } })
  check("transport qui lève → ok:false, ne propage pas", r3.ok === false && r3.text.includes("boom"))
  reset()
}

console.log("\n[4] scorecard — recordSpecialistConsulted / recordSpecialistWin (revue Fable #3)")
{
  reset()
  const a = validateSpec(baseRaw)!
  saveSpecialists([a])
  check("pas encore consulté → stats absentes", loadSpecialists()[0]!.stats === undefined)
  recordSpecialistConsulted(a.id)
  check("1re consultation : consulted=1, wins=0", loadSpecialists()[0]!.stats?.consulted === 1 && loadSpecialists()[0]!.stats?.wins === 0)
  recordSpecialistWin(a.id)
  check("win après consultation : consulted=1, wins=1", loadSpecialists()[0]!.stats?.consulted === 1 && loadSpecialists()[0]!.stats?.wins === 1)
  recordSpecialistConsulted(a.id)
  check("2e consultation sans win : consulted=2, wins=1", loadSpecialists()[0]!.stats?.consulted === 2 && loadSpecialists()[0]!.stats?.wins === 1)
  check("id inconnu → null, ne lève pas", recordSpecialistConsulted("inconnu") === null && recordSpecialistWin("inconnu") === null)
  // stats DOIT survivre à une re-validation (upsertSpecialists ré-écrit TOUT le registre).
  const other = validateSpec({ ...baseRaw, name: "Un autre agent", role: "un autre rôle assez long" })!
  upsertSpecialists([other])
  const survived = loadSpecialists().find((s) => s.id === a.id)
  check("stats survit à l'upsert d'un AUTRE agent", survived?.stats?.consulted === 2 && survived?.stats?.wins === 1)
  reset()
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
