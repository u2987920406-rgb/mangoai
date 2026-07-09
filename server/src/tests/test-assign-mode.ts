// Tests #175 P2 : assignMode (forgeron) — conseil par défaut, action sur un rôle qui AGIT,
// toolPolicy scellée RESTRICTIVE dérivée du domaine. PUR, déterministe, sans réseau.

import { assignMode } from "../agent/agent-forge.js"
import type { SpecialistAgent } from "../specialist/specialist-agents.js"

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const base = (over: Partial<SpecialistAgent>): SpecialistAgent => ({
  id: "sa_x", name: "", role: "", lacune: "", systemPrompt: "x".repeat(30),
  tools: [], triggers: "", examples: [], tags: [], provider: "openai",
  createdByAgent: "test", createdAt: "2026-01-01", ...over,
})

// ---- conseil (analyse) : comportement historique, zéro régression ----
{
  const m = assignMode(base({ name: "Juge des régressions", role: "évalue et diagnostique les régressions", tags: ["audit"] }))
  check("analyse (évalue/diagnostique) → conseil, pas de toolPolicy", m.mode === "conseil" && !m.toolPolicy)
}

// ---- action : refactor de code ----
{
  const m = assignMode(base({ name: "Refactoreur", role: "corrige et refactor le code dupliqué" }))
  const a = m.toolPolicy?.allowedTools ?? []
  check("refactor → action", m.mode === "action")
  check("refactor : allowRun false (jamais de shell libre)", m.toolPolicy?.allowRun === false)
  check("refactor : edit_file/check_build autorisés", a.includes("edit_file") && a.includes("check_build"))
  check("refactor : run_command / add_dependency / réseau EXCLUS",
    !a.includes("run_command") && !a.includes("add_dependency") && !a.includes("requete_web") && !a.includes("chercher_web"))
}

// ---- action : PDF / OCR ----
{
  const m = assignMode(base({ name: "Déchiffreur de PDF scannés", role: "extrait et corrige le texte de PDF scannés (OCR)" }))
  const a = m.toolPolicy?.allowedTools ?? []
  check("PDF → action + lire_document/lire_archive", m.mode === "action" && a.includes("lire_document") && a.includes("lire_archive"))
  check("PDF : toujours pas de run_command", !a.includes("run_command"))
}

// ---- action : contenu / images ----
{
  const m = assignMode(base({ name: "Illustrateur", role: "génère du contenu et cherche des images pertinentes" }))
  const a = m.toolPolicy?.allowedTools ?? []
  check("contenu → action + chercher_image", m.mode === "action" && a.includes("chercher_image"))
}

// ---- allowlist propre (pas de doublon, finish toujours présent) ----
{
  const m = assignMode(base({ name: "Réparateur", role: "corrige et génère des images dans des documents pdf" }))
  const a = m.toolPolicy?.allowedTools ?? []
  check("allowlist sans doublon", a.length === new Set(a).size)
  check("finish toujours dans l'allowlist", a.includes("finish"))
}

console.log(`\nassign-mode (#175) : ${pass}/${pass + fail}`)
if (fail > 0) process.exit(1)
