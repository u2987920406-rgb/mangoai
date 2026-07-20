// Tests de isMangoQaActive() (../mangoqa.js) — la détection de vivacité par
// sentinelle heartbeat qui a fait défaut à l'incident du 2026-07-14
// (cf. PRELAUNCH_CHECKLIST.md). Le code vérifie déjà la fraîcheur du
// heartbeat (pas seulement l'existence du fichier) mais n'avait aucun test
// dédié — ce fichier comble ce trou de couverture.
// Sauvegarde/restaure la vraie sentinelle du workspace pour ne pas polluer
// l'état partagé avec un vrai run MangoQA.
// Lancer : npx tsx src/tests/test-mangoqa-active.ts
import fs from "node:fs"
import path from "node:path"
import { WORKSPACE_DIR } from "../projects.js"

let pass = 0, fail = 0
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const SENTINEL = path.join(WORKSPACE_DIR, ".mangoqa-active")
const backup = fs.existsSync(SENTINEL) ? fs.readFileSync(SENTINEL, "utf8") : null

function writeSentinel(ageMs: number): void {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
  fs.writeFileSync(SENTINEL, JSON.stringify({ heartbeat: new Date(Date.now() - ageMs).toISOString() }), "utf8")
}

async function withEnv(value: string | undefined, fn: () => Promise<void> | void): Promise<void> {
  const prev = process.env.MANGOQA_ENABLED
  if (value === undefined) delete process.env.MANGOQA_ENABLED
  else process.env.MANGOQA_ENABLED = value
  try { await fn() } finally {
    if (prev === undefined) delete process.env.MANGOQA_ENABLED
    else process.env.MANGOQA_ENABLED = prev
  }
}

try {
  console.log("═".repeat(56))
  console.log("mangoqa — isMangoQaActive (détection de vivacité)")
  console.log("─".repeat(56))

  // Import dynamique APRÈS avoir posé l'état fichier, pour éviter tout cache module surprenant.
  const { isMangoQaActive } = await import("../mangoqa.js")

  await withEnv(undefined, () => {
    if (fs.existsSync(SENTINEL)) fs.unlinkSync(SENTINEL)
    check("sentinelle absente → false", isMangoQaActive() === false)
  })

  await withEnv(undefined, () => {
    writeSentinel(2_000) // 2s — frais
    check("heartbeat frais (2s) → true", isMangoQaActive() === true)
  })

  await withEnv(undefined, () => {
    writeSentinel(2 * 24 * 60 * 60 * 1000) // 2 jours — le cas réel de l'audit du 2026-07-19
    check("heartbeat périmé (2 jours) → false", isMangoQaActive() === false)
  })

  await withEnv(undefined, () => {
    writeSentinel(6 * 60 * 1000) // 6 min — juste au-dessus du seuil 5 min
    check("heartbeat périmé (6 min > seuil 5 min) → false", isMangoQaActive() === false)
  })

  await withEnv(undefined, () => {
    writeSentinel(4 * 60 * 1000) // 4 min — juste sous le seuil
    check("heartbeat encore frais (4 min < seuil 5 min) → true", isMangoQaActive() === true)
  })

  await withEnv(undefined, () => {
    fs.writeFileSync(SENTINEL, "{ pas du json valide", "utf8")
    check("sentinelle corrompue (JSON invalide) → false, pas d'exception", isMangoQaActive() === false)
  })

  await withEnv("false", () => {
    writeSentinel(2_000)
    check("MANGOQA_ENABLED=false force OFF même si heartbeat frais", isMangoQaActive() === false)
  })

  await withEnv("true", () => {
    if (fs.existsSync(SENTINEL)) fs.unlinkSync(SENTINEL)
    check("MANGOQA_ENABLED=true force ON même sans sentinelle", isMangoQaActive() === true)
  })
} finally {
  // Restaure l'état réel du workspace.
  if (backup === null) { if (fs.existsSync(SENTINEL)) fs.unlinkSync(SENTINEL) }
  else fs.writeFileSync(SENTINEL, backup, "utf8")
}

console.log("═".repeat(56))
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`)
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1) }
