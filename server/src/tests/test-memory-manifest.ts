// Preuve déterministe de A0.2 — manifest des magasins fichiers (.memory-manifest.json).
//   npx tsx src/test-memory-manifest.ts
// Couvre : absence (défaut sans création, gate off) ; ensureManifest gate ON
// (fichier écrit) ; présent → lu ; schemaVersion future → warn sans throw ;
// JSON corrompu → défaut.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CURRENT_MANIFEST_VERSION, MANIFEST_FILE_NAME, ensureManifest, loadManifest } from '../memory-manifest.js'

let passed = 0
let failed = 0
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`  ❌ ${name}`)
  }
}

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-manifest-'))
}

// ── absent, gate OFF → défaut, AUCUN fichier créé (loadManifest est une lecture pure) ─
{
  delete process.env.MEMORY_MANIFEST
  const dir = tmpWorkspace()
  const m = loadManifest(dir)
  check('absent : schemaVersion = CURRENT_MANIFEST_VERSION', m.schemaVersion === CURRENT_MANIFEST_VERSION)
  check('absent : stores.axioms = 1 par défaut', m.stores.axioms === 1)
  check('absent : stores.skills = 1 par défaut', m.stores.skills === 1)
  check('loadManifest ne crée AUCUN fichier', !fs.existsSync(path.join(dir, MANIFEST_FILE_NAME)))

  // ensureManifest avec le gate OFF (défaut) : no-op, rien n'est écrit.
  ensureManifest(dir)
  check('ensureManifest gate OFF : no-op, rien créé', !fs.existsSync(path.join(dir, MANIFEST_FILE_NAME)))
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── ensureManifest gate ON → fichier écrit ────────────────────────────────────
{
  process.env.MEMORY_MANIFEST = 'on'
  const dir = tmpWorkspace()
  ensureManifest(dir)
  const file = path.join(dir, MANIFEST_FILE_NAME)
  check('ensureManifest gate ON : fichier écrit', fs.existsSync(file))
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
  check('fichier écrit : schemaVersion = CURRENT_MANIFEST_VERSION', onDisk.schemaVersion === CURRENT_MANIFEST_VERSION)
  check('fichier écrit : tous les magasins connus présents', ['axioms', 'preferences', 'references', 'procedures', 'lexique', 'skills'].every((k) => onDisk.stores[k] === 1))

  // Idempotence : un manifest déjà présent n'est jamais écrasé par ensureManifest.
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, stores: { axioms: 7 } }))
  ensureManifest(dir)
  const stillCustom = JSON.parse(fs.readFileSync(file, 'utf8'))
  check('ensureManifest ne réécrit jamais un manifest déjà présent', stillCustom.stores.axioms === 7)

  delete process.env.MEMORY_MANIFEST
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── présent → lu tel quel (fusionné avec les défauts pour les clés manquantes) ──
{
  const dir = tmpWorkspace()
  const file = path.join(dir, MANIFEST_FILE_NAME)
  fs.writeFileSync(
    file,
    JSON.stringify({ schemaVersion: 1, stores: { axioms: 3, preferences: 1, references: 1, procedures: 1, lexique: 1, skills: 1 } }),
  )
  const m = loadManifest(dir)
  check('présent : valeur custom lue (axioms=3)', m.stores.axioms === 3)
  check('présent : schemaVersion lu', m.schemaVersion === 1)
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── schemaVersion FUTURE (99) → warn sans throw, manifest quand même retourné ───
{
  const dir = tmpWorkspace()
  const file = path.join(dir, MANIFEST_FILE_NAME)
  fs.writeFileSync(
    file,
    JSON.stringify({ schemaVersion: 99, stores: { axioms: 1, preferences: 1, references: 1, procedures: 1, lexique: 1, skills: 1 } }),
  )
  const originalWarn = console.warn
  let warned = false
  console.warn = (...args: unknown[]) => {
    warned = true
    originalWarn(...args)
  }
  let threw = false
  let m: ReturnType<typeof loadManifest> | undefined
  try {
    m = loadManifest(dir)
  } catch {
    threw = true
  }
  console.warn = originalWarn
  check('schemaVersion future : ne throw jamais', !threw)
  check('schemaVersion future : warn émis', warned)
  check('schemaVersion future : manifest quand même retourné (99)', m?.schemaVersion === 99)
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── JSON corrompu → défaut (fail-open, pas de throw) ─────────────────────────
{
  const dir = tmpWorkspace()
  const file = path.join(dir, MANIFEST_FILE_NAME)
  fs.writeFileSync(file, '{ ceci nest pas du json valide ///')
  let threw = false
  let m: ReturnType<typeof loadManifest> | undefined
  try {
    m = loadManifest(dir)
  } catch {
    threw = true
  }
  check('JSON corrompu : ne throw jamais', !threw)
  check('JSON corrompu : défaut retourné', m?.schemaVersion === CURRENT_MANIFEST_VERSION && m?.stores.axioms === 1)
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(`\n[memory-manifest] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
