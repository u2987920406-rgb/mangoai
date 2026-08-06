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

const { parseLacunes, parseForgedAgent, parseForgedAgents, pickFocusLacunes, forgeAgents, assignBrain, assignMode, forgeForGap, smokeTestSpec } = await import("../agent/agent-forge.js")
const { loadSpecialists } = await import("../specialist/specialist-agents.js")

// Mini-fabrique de spec pour tester assignBrain (champs minimaux).
const mkSpec = (over: Partial<{ name: string; role: string; lacune: string; tags: string[] }>) => ({
  id: "sa_x", name: over.name ?? "X", role: over.role ?? "rôle", lacune: over.lacune ?? "",
  systemPrompt: "Tu es un expert.", tools: [], triggers: "", examples: [], tags: over.tags ?? [],
  provider: "ollama" as const, model: "gemma4:12b", createdByAgent: "codeur", createdAt: "",
})

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
  // Rôle/lacune VRAIMENT distincts par agent (AUCUN mot ≥4 lettres partagé, même de
  // remplissage type "expert"/"lacune") — #5 dédup sémantique : coversGap tokenise en
  // ignorant les mots courts, donc le moindre mot-outil commun de ≥4 lettres suffit à
  // faire déborder le seuil ≥2 entre deux specs qui ne devraient pas se couvrir.
  const DOMAINES = [
    "cartographie xlsx tableur fusionne",
    "traduction images pexels bilingue",
    "orchestration websocket collaboratif",
  ]
  const ask = async () => {
    const idx = i
    i++
    return JSON.stringify({
      name: `Agent ${idx + 1}`, role: DOMAINES[idx], lacune: DOMAINES[idx],
      systemPrompt: "Tu es un expert pointu qui applique une méthode rigoureuse et rend un format clair.",
      tools: [{ name: "outil", desc: "fait un truc" }], triggers: "quand X",
      provider: "ollama", model: "gemma4:12b",
    })
  }
  const r = await forgeAgents(3, { ask })
  check("forge 3 agents, 0 échec", r.created.length === 3 && r.failures === 0)
  check("persiste les 3", r.persisted.length === 3 && loadSpecialists().length === 3)
  // L'auto-assignation a tranché : malgré "gemma4:12b" suggéré par le modèle, un agent
  // de raisonnement repart sur glm-5.2:cloud (jamais gemma seul).
  check("auto-assigne le cerveau (pas gemma)", r.created.every((a) => a.model !== "gemma4:12b"))
  check("raisonnement → glm-5.2:cloud", r.created[0]!.provider === "openai" && r.created[0]!.model === "glm-5.2:cloud")
  reset()
  const r2 = await forgeAgents(2, { ask: async () => "pas du json" })
  check("modèle qui déraille → 0 créés, 2 échecs, ne lève pas", r2.created.length === 0 && r2.failures === 2)
  reset()
}

console.log("\n[5] assignBrain (cerveau adapté à la compétence)")
{
  const v1 = assignBrain(mkSpec({ name: "Arbitre design convergent", lacune: "L1 — juge design" }))
  check("design → œil vision qwen3.5:cloud", v1.provider === "ollama" && v1.model === "qwen3.5:cloud")
  const v2 = assignBrain(mkSpec({ name: "Déchiffreur de PDF scannés", lacune: "L4 — PDF scanné" }))
  check("pdf/scan → œil vision", v2.provider === "ollama" && v2.model === "qwen3.5:cloud")
  const r1 = assignBrain(mkSpec({ name: "Anatomiste de classeurs", lacune: "L6 — xlsx" }))
  check("classeur → glm-5.2:cloud", r1.provider === "openai" && r1.model === "glm-5.2:cloud")
  const r2 = assignBrain(mkSpec({ name: "Iconographe bilingue", role: "requêtes d'images Pexels", lacune: "L15" }))
  check("iconographe (texte) → glm, PAS vision", r2.model === "glm-5.2:cloud")
  const r3 = assignBrain(mkSpec({ name: "Chambellan des clés", lacune: "L27 — endpoint" }))
  check("config → glm-5.2:cloud", r3.model === "glm-5.2:cloud")
  check("jamais gemma seul", [v1, v2, r1, r2, r3].every((b) => b.model !== "gemma4:12b"))
}

console.log("\n[6] forgeForGap (#168 — forge ciblée sur une lacune live)")
{
  reset()
  const ask = async () => JSON.stringify({
    name: "Combleur Websocket", role: "expert temps réel et synchronisation",
    lacune: "websocket", systemPrompt: "Tu es un expert du temps réel qui applique une méthode rigoureuse et rend un format clair.",
    tools: [{ name: "outil", desc: "fait un truc" }], triggers: "blocage websocket",
    provider: "ollama", model: "gemma4:12b",
  })
  const gap = {
    id: "gap_1", sig: "websocket", title: "websocket temps réel", blocker: "websocket",
    detail: "chat collaboratif temps réel", task: "app de chat", status: "proposed" as const,
    hits: 1, createdAt: "", updatedAt: "",
  }
  const r = await forgeForGap(gap, { ask })
  check("forge l'agent ciblé sur la lacune", r.agent?.name === "Combleur Websocket")
  check("cerveau auto-assigné (pas gemma) → glm", r.agent?.model === "glm-5.2:cloud")
  check("persisté dans le registre", loadSpecialists().some((a) => a.name === "Combleur Websocket"))
  const bad = await forgeForGap(gap, { ask: async () => "pas du json" })
  check("forge ratée → agent null + error, ne lève pas", bad.agent === null && typeof bad.error === "string")
  reset()
}

console.log("\n[7] assignMode — un juge ne reçoit JAMAIS write_file (revue Fable #6)")
{
  const arbitre = mkSpec({ name: "Arbitre du Score Design", role: "Juge design VISION déterministe qui convertit une capture en score", tags: ["vision", "juge-design", "score-numerique"] })
  check("Arbitre du Score Design → conseil (mot 'juge'/'score')", assignMode(arbitre as never).mode === "conseil")
  const jugeAdequation = mkSpec({ name: "Juge d'Adéquation", role: "Vérificateur qui statue, preuve à l'appui, rend un verdict", tags: ["verdict", "qa"] })
  check("Juge d'Adéquation → conseil (mot 'verdict'/'qa')", assignMode(jugeAdequation as never).mode === "conseil")
  const contremaitre = mkSpec({ name: "Contremaître local", role: "Orchestrateur qui génère des micro-tâches et les exécute pour réparer la boucle agentique", tags: ["orchestration", "local"] })
  check("Contremaître local (pas un juge) → reste action", assignMode(contremaitre as never).mode === "action")
  const conseilPur = mkSpec({ name: "Iconographe", role: "trouve des images pertinentes", tags: ["images"] })
  check("agent sans verbe d'action ni mot juge → conseil", assignMode(conseilPur as never).mode === "conseil")
}

console.log("\n[8] forgeForGap — dédup SÉMANTIQUE (revue Fable #5), pas seulement le nom")
{
  reset()
  const gap = {
    id: "gap_2", sig: "sync", title: "sync temps réel", blocker: "sync",
    detail: "synchronisation temps réel", task: "app collab", status: "proposed" as const,
    hits: 1, createdAt: "", updatedAt: "",
  }
  // Une première forge légitime.
  const r1 = await forgeForGap(gap, {
    ask: async () => JSON.stringify({
      name: "Synchroniseur", role: "expert synchronisation temps réel websocket",
      lacune: "synchronisation temps reel websocket", systemPrompt: "Tu es un expert du temps réel, méthode rigoureuse.",
      tools: [], triggers: "sync", provider: "ollama", model: "gemma4:12b",
    }),
  })
  check("1re forge légitime réussit", r1.agent?.name === "Synchroniseur")
  // Une 2e forge sous un NOM différent mais qui cible la MÊME lacune (recouvrement de tokens).
  const r2 = await forgeForGap(gap, {
    ask: async () => JSON.stringify({
      name: "Agent Bis", role: "expert synchronisation temps réel websocket",
      lacune: "synchronisation temps reel websocket", systemPrompt: "Tu es un autre expert du temps réel, méthode rigoureuse.",
      tools: [], triggers: "sync", provider: "ollama", model: "gemma4:12b",
    }),
  })
  check("doublon FONCTIONNEL (nom différent) → rejeté", r2.agent === null && (r2.error ?? "").includes("doublon fonctionnel"))
  check("le registre garde 1 seul agent pour cette lacune", loadSpecialists().filter((a) => a.name === "Synchroniseur" || a.name === "Agent Bis").length === 1)
  reset()
}

console.log("\n[9] smokeTestSpec — la spec doit répondre correctement à SON PROPRE exemple (revue Fable #7)")
{
  const specJson = mkSpec({ name: "X" })
  specJson.systemPrompt = "Réponds STRICTEMENT en JSON : {\"score\": <0-100>}."
  const specWithExample = { ...specJson, examples: ["Note ceci."] }
  const r1 = await smokeTestSpec(specWithExample as never, { ask: async () => '{"score": 80}' })
  check("réponse JSON conforme → ok", r1.ok === true)
  const r2 = await smokeTestSpec(specWithExample as never, { ask: async () => "Je ne peux pas répondre." })
  check("format JSON annoncé mais absent → échec", r2.ok === false && (r2.reason ?? "").includes("JSON"))
  const r3 = await smokeTestSpec(specWithExample as never, { ask: async () => "" })
  check("réponse vide → échec", r3.ok === false && (r3.reason ?? "").includes("vide"))
  const specSansExemple = { ...specJson, examples: [] }
  const r4 = await smokeTestSpec(specSansExemple as never, { ask: async () => { throw new Error("ne devrait jamais être appelé") } })
  check("aucun exemple → laisse passer sans appeler le cerveau", r4.ok === true)
}

try { fs.rmSync(LIM, { force: true }) } catch { /* */ }
console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
