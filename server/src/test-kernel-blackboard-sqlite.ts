// Tests de la persistance du Blackboard (store enfichable + SQLite réel).
//   npx tsx src/test-kernel-blackboard-sqlite.ts
// node:sqlite est intégré au runtime → vraie base sur disque temporaire, fermée
// et rouverte pour prouver la SURVIE au redémarrage. Recherche par cosinus.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MemoryStore, cosine, rankByCosine } from './kernel-blackboard-store.js'
import { SqliteStore } from './kernel-blackboard-sqlite.js'
import { Blackboard } from './kernel-blackboard.js'

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

// ── cosinus / rankByCosine (purs) ────────────────────────────────────────────
{
  check('cosinus identique = 1', Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9)
  check('cosinus orthogonal = 0', Math.abs(cosine([1, 0], [0, 1])) < 1e-9)
  check('cosinus vecteur nul = 0', cosine([0, 0], [1, 1]) === 0)
  const ranked = rankByCosine(
    [
      { key: 'a', value: 1, embedding: [1, 0] },
      { key: 'b', value: 2, embedding: [0, 1] },
      { key: 'c', value: 3 }, // sans embedding → ignoré
      { key: 'd', value: 4, embedding: [0.9, 0.1] },
    ],
    [1, 0],
    2,
  )
  check('rankByCosine top-2', ranked.length === 2)
  check('rankByCosine meilleur = a', ranked[0].key === 'a')
  check('rankByCosine 2e = d', ranked[1].key === 'd')
  check('rankByCosine ignore sans embedding', !ranked.some((h) => h.key === 'c'))
}

// ── MemoryStore : CRUD + recherche ───────────────────────────────────────────
{
  const m = new MemoryStore()
  m.put('proj', 'tokens', { color: '#fff' })
  check('mem get', JSON.stringify(m.get('proj', 'tokens')) === JSON.stringify({ color: '#fff' }))
  check('mem has', m.has('proj', 'tokens') === true)
  check('mem keys', JSON.stringify(m.keys('proj')) === JSON.stringify(['tokens']))
  check('mem delete', m.delete('proj', 'tokens') === true && m.has('proj', 'tokens') === false)
  m.put('proj', 'x', 'X', [1, 0])
  m.put('proj', 'y', 'Y', [0, 1])
  const hits = m.search('proj', [1, 0], 1)
  check('mem search top-1 = x', hits.length === 1 && hits[0].key === 'x')
}

// ── SqliteStore : persistance réelle sur disque ──────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-bb-'))
  const dbPath = path.join(dir, 'blackboard.db')

  // Session 1 : on écrit, puis on FERME (simule un arrêt du serveur).
  {
    const s = new SqliteStore(dbPath)
    s.put('proj', 'tokens', { palette: ['#7c5cff', '#0b0b12'] })
    s.put('proj', 'note', 'texte')
    s.put('proj', 'vecA', 'A', [1, 0, 0])
    s.put('proj', 'vecB', 'B', [0, 1, 0])
    check('sqlite get (avant fermeture)', JSON.stringify(s.get('proj', 'tokens')) === JSON.stringify({ palette: ['#7c5cff', '#0b0b12'] }))
    check('sqlite has', s.has('proj', 'note') === true)
    check('sqlite keys', s.keys('proj').sort().join(',') === 'note,tokens,vecA,vecB')
    s.close()
  }

  // Session 2 : NOUVELLE instance sur le même fichier → les données ont survécu.
  {
    const s2 = new SqliteStore(dbPath)
    check('sqlite SURVIE au redémarrage', JSON.stringify(s2.get('proj', 'tokens')) === JSON.stringify({ palette: ['#7c5cff', '#0b0b12'] }))
    check('sqlite note survit', s2.get('proj', 'note') === 'texte')

    // Recherche sémantique sur les vecteurs persistés.
    const hits = s2.search('proj', [1, 0, 0], 2)
    check('sqlite search meilleur = vecA', hits[0].key === 'vecA')
    check('sqlite search ignore non-vectorisés', !hits.some((h) => h.key === 'tokens' || h.key === 'note'))

    // Overwrite (ON CONFLICT).
    s2.put('proj', 'note', 'remplacé')
    check('sqlite overwrite', s2.get('proj', 'note') === 'remplacé')

    // Delete.
    check('sqlite delete', s2.delete('proj', 'note') === true && s2.has('proj', 'note') === false)
    check('sqlite delete absent → false', s2.delete('proj', 'inexistant') === false)
    s2.close()
  }

  fs.rmSync(dir, { recursive: true, force: true })
}

// ── Blackboard branché sur SqliteStore ───────────────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-bb2-'))
  const dbPath = path.join(dir, 'bb.db')
  const bb = new Blackboard(new SqliteStore(dbPath))

  const ref = bb.put('p', 'art', { ok: true }, [1, 0])
  check('bb.put renvoie une ref', ref.scope === 'p' && ref.key === 'art')
  check('bb.deref', JSON.stringify(bb.deref(ref)) === JSON.stringify({ ok: true }))
  bb.put('p', 'autre', { ok: false }, [0, 1])
  const found = bb.search('p', [1, 0], 1)
  check('bb.search via SQLite', found.length === 1 && found[0].key === 'art')

  // Les verrous restent en mémoire et fonctionnent même avec un store persistant.
  let order = ''
  await Promise.all([
    bb.withLock('p', async () => { order += '1' }),
    bb.withLock('p', async () => { order += '2' }),
  ])
  check('verrous FIFO avec store SQLite', order === '12')

  bb.close()
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── Migration REPORTÉE si le backup échoue (Un, 2026-07-03 — U2) ────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-bb-migrate-'))
  const dbPath = path.join(dir, 'legacy.db')

  // Base LEGACY v1 (sans colonnes timestamps), estampillée user_version=1 —
  // exactement le schéma d'avant A0.3, celui qui doit passer par la migration v2.
  {
    const raw = new DatabaseSync(dbPath)
    raw.exec(
      `CREATE TABLE artifacts (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, embedding TEXT, PRIMARY KEY (scope, key))`,
    )
    raw.exec("INSERT INTO artifacts (scope, key, value) VALUES ('p', 'k', '\"data-intacte\"')")
    raw.exec('PRAGMA user_version = 1')
    raw.close()
  }

  // Fait échouer copyFileSync : un DOSSIER occupe déjà le chemin `.bak-v1` attendu.
  fs.mkdirSync(`${dbPath}.bak-v1`)

  const originalWarn = console.warn
  const warnings: string[] = []
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))
  }
  let threw = false
  let store: SqliteStore | undefined
  try {
    store = new SqliteStore(dbPath)
  } catch {
    threw = true
  }
  console.warn = originalWarn

  check('backup impossible : le boot ne throw jamais', !threw)
  check(
    'backup impossible : warn explicite "migration REPORTÉE"',
    warnings.some((w) => w.includes('migration REPORTÉE') && w.includes('backup impossible')),
  )

  // user_version reste l'ANCIENNE (migration jamais tentée sans sa copie de sûreté).
  const verify = new DatabaseSync(dbPath)
  const uv = (verify.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  const cols = (verify.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>).map((c) => c.name)
  verify.close()
  check('backup impossible : user_version reste 1 (pas migré)', uv === 1)
  check('backup impossible : colonnes timestamps ABSENTES (migration pas jouée)', !cols.includes('updated_at'))

  // Données existantes intactes, et le store reste utilisable (fail-open : put()
  // retombe sur l'écriture historique sans colonnes timestamps).
  check('backup impossible : donnée pré-existante intacte', JSON.stringify(store?.get('p', 'k')) === JSON.stringify('data-intacte'))
  store?.put('p', 'k2', { v: 1 })
  check('backup impossible : store reste utilisable (fail-open)', JSON.stringify(store?.get('p', 'k2')) === JSON.stringify({ v: 1 }))
  store?.close()

  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(`\n[blackboard-sqlite] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
