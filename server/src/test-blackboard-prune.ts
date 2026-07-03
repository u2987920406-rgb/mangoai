// Preuve déterministe de A0.3 — bornage temporel du Blackboard SQLite (migration
// v2 : created_at/updated_at) + purge/TTL (SqliteStore.prune).
//   npx tsx src/test-blackboard-prune.ts
// (a) put() renseigne created_at/updated_at ; un UPDATE (clé déjà présente) ne
//     touche QUE updated_at, created_at reste intact.
// (b) prune(olderThanMs) supprime les artefacts trop vieux d'un scope.
// (c) prune(maxEntries) garde les N plus récents (par updated_at), supprime le
//     reste.
// (d) les deux critères se combinent (une seule passe de prune, deux DELETE).
// Les âges sont simulés en réécrivant updated_at par SQL brut — les tests
// doivent rester déterministes, pas dépendre d'un vrai sleep().
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { SqliteStore } from './kernel-blackboard-sqlite.js'

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-prune-'))
const dbPath = path.join(dir, 'prune.db')

// ── (a) put() renseigne created_at/updated_at ; update préserve created_at ──────
{
  const store = new SqliteStore(dbPath)
  store.put('proj', 'a', 'A')
  store.put('proj', 'b', 'B')
  store.put('proj', 'c', 'C')
  store.put('proj', 'd', 'D')
  store.put('proj', 'e', 'E')
  store.close()

  const raw = new DatabaseSync(dbPath)
  const rows = raw.prepare('SELECT key, created_at, updated_at FROM artifacts WHERE scope = ?').all('proj') as Array<{
    key: string
    created_at: number
    updated_at: number
  }>
  check('5 artefacts insérés', rows.length === 5)
  check('created_at renseigné pour tous', rows.every((r) => typeof r.created_at === 'number' && r.created_at > 0))
  check('updated_at renseigné pour tous', rows.every((r) => typeof r.updated_at === 'number' && r.updated_at > 0))
  check('created_at === updated_at à l’insertion', rows.every((r) => r.created_at === r.updated_at))
  raw.close()

  // Fige created_at/updated_at de 'a' à une valeur passée (1000), pour prouver
  // sans ambiguïté qu'un put() ultérieur (update) laisse created_at intact et
  // avance updated_at.
  const raw2 = new DatabaseSync(dbPath)
  raw2.prepare('UPDATE artifacts SET created_at = ?, updated_at = ? WHERE scope = ? AND key = ?').run(1000, 1000, 'proj', 'a')
  raw2.close()

  const store2 = new SqliteStore(dbPath)
  store2.put('proj', 'a', 'A-modifié')
  check('update : valeur bien remplacée', store2.get('proj', 'a') === 'A-modifié')
  store2.close()

  const raw3 = new DatabaseSync(dbPath)
  const rowA = raw3.prepare('SELECT created_at, updated_at FROM artifacts WHERE scope = ? AND key = ?').get('proj', 'a') as
    | { created_at: number; updated_at: number }
    | undefined
  check('update : created_at préservé (reste 1000)', rowA?.created_at === 1000)
  check('update : updated_at avancé (> 1000)', (rowA?.updated_at ?? 0) > 1000)
  raw3.close()
}

// ── (b) prune(olderThanMs) supprime les vieux ────────────────────────────────
{
  const store = new SqliteStore(dbPath)
  store.put('age', 'old1', 1)
  store.put('age', 'old2', 2)
  store.put('age', 'new1', 3)
  store.close()

  const nowSec = Math.floor(Date.now() / 1000)
  const raw = new DatabaseSync(dbPath)
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 1000, 'age', 'old1')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 900, 'age', 'old2')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec, 'age', 'new1')
  raw.close()

  const store2 = new SqliteStore(dbPath)
  // Cutoff à 500s : old1 (-1000s) et old2 (-900s) sont plus vieux, new1 (0s) survit.
  const deleted = store2.prune('age', { olderThanMs: 500_000 })
  check('prune(olderThanMs) retourne 2 (nombre supprimé)', deleted === 2)
  check('prune(olderThanMs) : new1 survit', store2.has('age', 'new1') === true)
  check('prune(olderThanMs) : old1 supprimé', store2.has('age', 'old1') === false)
  check('prune(olderThanMs) : old2 supprimé', store2.has('age', 'old2') === false)
  store2.close()
}

// ── (c) prune(maxEntries) garde les N plus récents ───────────────────────────
{
  const store = new SqliteStore(dbPath)
  store.put('vol', 'k1', 1)
  store.put('vol', 'k2', 2)
  store.put('vol', 'k3', 3)
  store.close()

  const raw = new DatabaseSync(dbPath)
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(100, 'vol', 'k1')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(200, 'vol', 'k2')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(300, 'vol', 'k3')
  raw.close()

  const store2 = new SqliteStore(dbPath)
  const deleted = store2.prune('vol', { maxEntries: 2 })
  check('prune(maxEntries:2) retourne 1 (nombre supprimé)', deleted === 1)
  check('prune(maxEntries) garde les 2 plus récents (k2, k3)', store2.has('vol', 'k2') === true && store2.has('vol', 'k3') === true)
  check('prune(maxEntries) supprime le plus vieux (k1)', store2.has('vol', 'k1') === false)
  store2.close()
}

// ── (d) combinaison olderThanMs + maxEntries en une seule passe ──────────────
{
  const store = new SqliteStore(dbPath)
  store.put('combo', 'c1', 1)
  store.put('combo', 'c2', 2)
  store.put('combo', 'c3', 3)
  store.put('combo', 'c4', 4)
  store.close()

  const nowSec = Math.floor(Date.now() / 1000)
  const raw = new DatabaseSync(dbPath)
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 1000, 'combo', 'c1') // trop vieux
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 30, 'combo', 'c2')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 20, 'combo', 'c3')
  raw.prepare('UPDATE artifacts SET updated_at = ? WHERE scope = ? AND key = ?').run(nowSec - 10, 'combo', 'c4')
  raw.close()

  const store2 = new SqliteStore(dbPath)
  // olderThanMs (500s) supprime c1. Parmi les 3 restants, maxEntries:2 garde les
  // 2 plus récents (c3, c4) et supprime c2.
  const deleted = store2.prune('combo', { olderThanMs: 500_000, maxEntries: 2 })
  check('prune combiné : total supprimé = 2 (c1 par âge + c2 par volume)', deleted === 2)
  check('prune combiné : c3, c4 survivent', store2.has('combo', 'c3') === true && store2.has('combo', 'c4') === true)
  check('prune combiné : c1, c2 supprimés', store2.has('combo', 'c1') === false && store2.has('combo', 'c2') === false)
  store2.close()
}

fs.rmSync(dir, { recursive: true, force: true })

console.log(`\n[blackboard-prune] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
