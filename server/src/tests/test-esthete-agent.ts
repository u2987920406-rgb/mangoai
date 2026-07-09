// Tests de l'agent système « Esthète » (esthete-agent.ts) : seed idempotent,
// toolPolicy scellée (jamais run_command), vois_ecran toujours présent même
// sans ELEVE_VISION=on. Déterministe, sans réseau (registre pointé sur un fichier
// temporaire via SPECIALIST_AGENTS_FILE — jamais le vrai registre).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// Isole le registre AVANT tout import de specialist-agents.js (registryFile() lit l'env
// à l'appel, mais on fixe quand même avant import par prudence/lisibilité).
const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "esthete-test-")), "specialist-agents.json")
process.env.SPECIALIST_AGENTS_FILE = tmpFile
delete process.env.ELEVE_VISION // le test doit prouver que vois_ecran survit SANS ce gate

const { loadSpecialists } = await import("../specialist/specialist-agents.js")
const { ensureEstheteAgent, buildEstheteTools, ESTHETE_AGENT_ID, ESTHETE_TOOL_POLICY } = await import("../esthete-agent.js")

console.log("─".repeat(60))
console.log("test-esthete-agent")
console.log("─".repeat(60))

// ---- Seed idempotent ----
{
  ensureEstheteAgent()
  const after1 = loadSpecialists()
  check("agent présent après 1er seed", after1.some((a) => a.id === ESTHETE_AGENT_ID))
  check("1 seule entrée après 1er seed", after1.filter((a) => a.name === "Esthète").length === 1)

  ensureEstheteAgent()
  ensureEstheteAgent()
  const after3 = loadSpecialists()
  check("toujours 1 seule entrée après 3 seeds (idempotent, dédup par nom)", after3.filter((a) => a.name === "Esthète").length === 1)
  check("id stable entre les seeds", after3.find((a) => a.name === "Esthète")?.id === ESTHETE_AGENT_ID)
}

// ---- toolPolicy scellée ----
{
  const agent = loadSpecialists().find((a) => a.id === ESTHETE_AGENT_ID)
  check("mode action", agent?.mode === "action")
  check("allowRun=false (jamais de shell libre)", agent?.toolPolicy?.allowRun === false)
  check("run_command absent de l'allowlist", !(agent?.toolPolicy?.allowedTools ?? []).includes("run_command"))
}

// ---- buildEstheteTools : registre réel ----
{
  const DIR = "/tmp/esthete-fake-project" // jamais lu — inspection de COMPOSITION seulement
  const reg = buildEstheteTools(DIR, ESTHETE_TOOL_POLICY)
  check("run_command ABSENT du registre construit", !reg.has("run_command"))
  check("vois_ecran PRÉSENT même sans ELEVE_VISION=on", reg.has("vois_ecran"))
  check("write_file présent (édition autorisée)", reg.has("write_file"))
  check("edit_file présent (édition autorisée)", reg.has("edit_file"))
  check("finish toujours présent (terminaison)", reg.has("finish"))
}

console.log(`\nesthete-agent : ${pass}/${pass + fail}`)
if (fail > 0) process.exit(1)
