// Tests de la forge (agent-forge.ts) — parsing des lacunes, parsing JSON, forge injectée.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const TMP = path.join(os.tmpdir(), `mango-forge-store-${process.pid}.json`)
const LIM = path.join(os.tmpdir(), `mango-forge-limites-${process.pid}.md`)
process.env.SPECIALIST_AGENTS_FILE = TMP
process.env.LIMITES_FILE = LIM

const LIMITES_MD = `# Registre
| # | Limite | Chantier | Opération bloquée | Pourquoi | Piste | Codable | Modèle | Effort | Statut |
|---|--------|----------|-------------------|----------|-------|---------|--------|--------|--------|
| L1 | Juge bruité | #152 | Convergence du score | variance | moyenner | 🟢 | ⚖️ | M | 🟡 Ouvert |
| L3 | Résolu déjà | #156 | rien | n/a | n/a | 🟢 | ⚖️ | S | ✅ Résolu 2026-06-26 |
| L17 | Rappel plan | #160 | Re-rappeler le plan | closure | code | 🟢 | ⚖️ | S | ✅ Résolu |
| L35 | Sur-exploration | #161 | Appeler finish proprement | tâche riche | stratège | 🟢 | 🧠 | M | 🟡 Amélioré |
`
fs.writeFileSync(LIM, LIMITES_MD)

const { parseLacunes, parseForgedAgent, parseForgedAgents, pickFocusLacunes, forgeAgents } = await import("./agent-forge.js")
const { loadSpecialists } = await import("./specialist-agents.js")

let pass = 0, fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const reset = () => { try { fs.rmSync(TMP, { force: true }) } catch { /* */ } }

console.log("[1] parseLacunes")
{
  const ls = parseLacunes(LIMITES_MD)
  const ids = ls.map((l) => l.id)
  check("garde L1 et L35 (ouverts 🟡)", ids.includes("L1") && ids.includes("L35"))
  check("écarte L3 et L17 (✅ Résolu)", !ids.includes("L3") && !ids.includes("L17"))
  const l1 = ls.find((l) => l.id === "L1")!
  check("extrait titre + opération bloquée", l1.titre.includes("Juge bruité") && l1.bloque.includes("Convergence"))
  check("ne lève pas sur du vide", parseLacunes("").length === 0)
}

console.log("\n[2] pickFocusLacunes")
{
  check("[] → N nulls", JSON.stringify(pickFocusLacunes([], 3)) === JSON.stringify([null, null, null]))
  check("N entrées", pickFocusLacunes(parseLacunes(LIMITES_MD), 5).length === 5)
}

console.log("\n[3] parseForgedAgent / parseForgedAgents")
{
  const raw = "```json\n{ \"name\": \"Test\", \"role\": \"un rôle clair\", \"systemPrompt\": \"Tu es un expert qui fait des choses précises et utiles.\" }\n```"
  check("objet avec fences", parseForgedAgent(raw)?.name === "Test")
  check("JSON tronqué → null", parseForgedAgent('{ "name": "X", "systemPrompt": "Tu es') === null)
  check("texte sans objet → null", parseForgedAgent("désolé je ne peux pas") === null)
  const arr = parseForgedAgents('[{"name":"A","role":"rôle assez long ici","systemPrompt":"Tu es un expert capable de faire des choses."},{"name":"","role":"x","systemPrompt":"trop court"}]')
  check("tableau : ne garde que le valide", arr.length === 1 && arr[0]!.name === "A")
}

console.log("\n[4] forgeAgents (transport injecté)")
{
  reset()
  let i = 0
  const ask = async () => {
    i++
    return JSON.stringify({
      name: `Agent ${i}`, role: "un rôle spécialisé et précis", lacune: "L1",
      systemPrompt: "Tu es un expert pointu qui applique une méthode rigoureuse et rend un format clair.",
      tools: [{ name: "outil", desc: "fait un truc" }], triggers: "quand X",
      provider: "ollama", model: "gemma4:12b",
    })
  }
  const r = await forgeAgents(3, { ask })
  check("forge 3 agents, 0 échec", r.created.length === 3 && r.failures === 0)
  check("persiste les 3", r.persisted.length === 3 && loadSpecialists().length === 3)
  reset()
  const r2 = await forgeAgents(2, { ask: async () => "pas du json" })
  check("modèle qui déraille → 0 créés, 2 échecs, ne lève pas", r2.created.length === 0 && r2.failures === 2)
  reset()
}

try { fs.rmSync(LIM, { force: true }) } catch { /* */ }
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
