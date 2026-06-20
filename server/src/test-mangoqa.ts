// Tests purs du surfaçage asynchrone du verdict Mango QA (#105 — latence audit).
// buildVerdictMessage et surfaceVerdict sont testés sans I/O ni vrai audit
// (deps injectées). Le polling fichier de waitForVerdict reste couvert par le
// run réel, comme l'attente l'a toujours été.
// Lancer : npx tsx src/test-mangoqa.ts
import { buildVerdictMessage, surfaceVerdict, type QAVerdict, type VerdictWatcherDeps } from "./mangoqa.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const redVerdict: QAVerdict = {
  verdict: "red",
  rejection: {
    rejection_id: "a11y-missing-label",
    corrective_action: "Ajoute un label au champ email",
    rule_ref: "WCAG-1.3.1",
    branch: "♿ Accessibilité",
    retry_count: 0,
  },
  branches: {},
}
const greenVerdict: QAVerdict = { verdict: "green", rejection: null, branches: {} }

console.log("═".repeat(56))
console.log("mangoqa — buildVerdictMessage (#105 surfaçage async)")
console.log("─".repeat(56))

{
  const msg = buildVerdictMessage(redVerdict)
  check("red → message de Feu Rouge", !!msg && msg.includes("Feu Rouge"))
  check("red → contient l'action corrective", !!msg && msg.includes("Ajoute un label"))
  check("red → contient la branche", !!msg && msg.includes("♿ Accessibilité"))
}
check("green → message de Feu Vert", buildVerdictMessage(greenVerdict) === "✅ Mango QA — Feu Vert")
check("red sans rejection → null (rien à dire)", buildVerdictMessage({ verdict: "red", rejection: null, branches: {} }) === null)

console.log("═".repeat(56))
console.log("mangoqa — surfaceVerdict (fire-and-forget, deps injectées)")
console.log("─".repeat(56))

// Fabrique des deps fakes qui enregistrent les appends.
function mkDeps(verdict: QAVerdict | null): { deps: VerdictWatcherDeps; appended: { dir: string; text: string }[] } {
  const appended: { dir: string; text: string }[] = []
  return {
    appended,
    deps: {
      wait: async () => verdict,
      append: (dir, text) => { appended.push({ dir, text }) },
    },
  }
}

{
  const { deps, appended } = mkDeps(redVerdict)
  const msg = await surfaceVerdict("proj", "/h/proj", deps, 1000)
  check("red → message renvoyé", !!msg && msg.includes("Feu Rouge"))
  check("red → écrit UNE entrée dans l'historique", appended.length === 1)
  check("red → écrit dans le bon dossier d'historique", appended[0]?.dir === "/h/proj")
}

{
  const { deps, appended } = mkDeps(greenVerdict)
  const msg = await surfaceVerdict("proj", "/h/proj", deps, 1000)
  check("green → Feu Vert surfacé", msg === "✅ Mango QA — Feu Vert" && appended.length === 1)
}

{
  // Timeout (Mango QA trop lent / absent) → wait renvoie null.
  const { deps, appended } = mkDeps(null)
  const msg = await surfaceVerdict("proj", "/h/proj", deps, 1000)
  check("timeout → rien renvoyé", msg === null)
  check("timeout → AUCUNE écriture dans l'historique", appended.length === 0)
}

console.log("═".repeat(56))
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`)
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1) }
