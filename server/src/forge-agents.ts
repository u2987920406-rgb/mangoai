// CLI — fait FORGER N agents par Mango (via GLM). Usage :
//   cd server && npx tsx src/forge-agents.ts [n]
// Charge .env (ELEVE_API_URL/KEY) comme le backend. JAMAIS importé en prod.
import "dotenv/config"
import { forgeAgents } from "./agent/agent-forge.js"

const n = Number(process.argv[2] ?? 10) || 10

const main = async () => {
  console.log(`🔨 La Forge — Mango conçoit ${n} agents spécialisés via GLM (lit ses lacunes)…\n`)
  const r = await forgeAgents(n, { onProgress: (m) => console.log("  " + m) })
  console.log(`\nLacunes lues : ${r.lacunesCount} · agents rédigés : ${r.created.length} · échecs : ${r.failures} · persistés : ${r.persisted.length}\n`)
  if (r.created.length === 0) {
    console.log("⚠ Aucun agent valide produit.")
    return
  }
  for (const a of r.created) {
    console.log(`• ${a.name}  [${a.provider}/${a.model ?? "?"}]`)
    console.log(`   lacune : ${a.lacune}`)
    console.log(`   rôle   : ${a.role}`)
    console.log(`   outils : ${a.tools.map((t) => t.name).join(", ") || "(aucun)"}`)
    console.log("")
  }
  console.log(`✅ ${r.persisted.length} agents persistés dans data/specialist-agents.json`)
}

main().catch((e) => { console.error("forge-agents:", e); process.exit(1) })
