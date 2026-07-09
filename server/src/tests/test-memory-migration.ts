// Preuve déterministe de A0.2 — versioning de schéma SQLite + cadre de migration.
//   npx tsx src/test-memory-migration.ts
// (a) planMigrations — pur, sans DB.
// (b) base "héritée" (user_version=0, table SANS timestamps déjà là) ouverte via
//     SqliteStore → migration v2 réelle joue (created_at/updated_at ajoutées),
//     user_version devient SCHEMA_VERSION (2), sans perte de données, réouverture
//     sans re-migration.
// (c) migration factice v1→v2 via runMigrations exporté → backup .bak-v1 créé,
//     données préservées, user_version=2.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  SCHEMA_VERSION,
  BASE_SCHEMA_VERSION,
  MIGRATIONS,
  planMigrations,
  runMigrations,
  SqliteStore,
  type Migration,
} from '../kernel/kernel-blackboard-sqlite.js'

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

// ── (a) planMigrations — pur ──────────────────────────────────────────────────
{
  check('SCHEMA_VERSION = 2 (bornage temporel A0.3)', SCHEMA_VERSION === 2)
  check('MIGRATIONS contient la migration v2 (timestamps)', MIGRATIONS.length === 1 && MIGRATIONS[0].to === 2)
  check('planMigrations déjà à SCHEMA_VERSION + MIGRATIONS réel → []', planMigrations(SCHEMA_VERSION, MIGRATIONS).length === 0)
  check(
    'planMigrations depuis BASE_SCHEMA_VERSION + MIGRATIONS réel → [2]',
    planMigrations(BASE_SCHEMA_VERSION, MIGRATIONS).map((m) => m.to).join(',') === '2',
  )

  const noop = () => {}
  const fake: Migration[] = [
    { to: 4, up: noop },
    { to: 2, up: noop },
    { to: 3, up: noop },
  ]
  const plan = planMigrations(2, fake)
  check('planMigrations currentVersion=2 → [3,4]', plan.map((m) => m.to).join(',') === '3,4')
  check('planMigrations respecte l’ordre croissant même si déclaré en désordre', plan[0].to === 3 && plan[1].to === 4)
  check('planMigrations currentVersion=4 (à jour) → []', planMigrations(4, fake).length === 0)
}

// ── (b) base héritée → estampillage v1 via SqliteStore, sans perte ──────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-migration-'))
  const dbPath = path.join(dir, 'legacy.db')

  // Simule une base créée AVANT A0.2 : table `artifacts` posée à la main,
  // user_version resté à 0 (défaut SQLite), une ligne de donnée déjà dedans.
  {
    const raw = new DatabaseSync(dbPath)
    raw.exec(
      `CREATE TABLE IF NOT EXISTS artifacts (
         scope     TEXT NOT NULL,
         key       TEXT NOT NULL,
         value     TEXT NOT NULL,
         embedding TEXT,
         PRIMARY KEY (scope, key)
       )`,
    )
    raw.prepare('INSERT INTO artifacts (scope, key, value, embedding) VALUES (?, ?, ?, ?)').run(
      'proj',
      'avant',
      JSON.stringify('donnée héritée'),
      null,
    )
    const row = raw.prepare('PRAGMA user_version').get() as { user_version: number }
    check('base héritée : user_version = 0 avant ouverture', row.user_version === 0)
    raw.close()
  }

  // Ouverture via SqliteStore → base héritée sans colonnes détectée (table_info),
  // migration v2 jouée automatiquement, SANS toucher aux données existantes.
  {
    const store = new SqliteStore(dbPath)
    check('donnée héritée intacte après ouverture', store.get('proj', 'avant') === 'donnée héritée')
    store.close()

    const raw = new DatabaseSync(dbPath)
    const row = raw.prepare('PRAGMA user_version').get() as { user_version: number }
    check('user_version = SCHEMA_VERSION (2) après ouverture', row.user_version === SCHEMA_VERSION)
    const cols = raw.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>
    check('colonne created_at ajoutée par la migration v2', cols.some((c) => c.name === 'created_at'))
    check('colonne updated_at ajoutée par la migration v2', cols.some((c) => c.name === 'updated_at'))
    check('backup .bak-v1 créé avant la migration v2 (base héritée)', fs.existsSync(`${dbPath}.bak-v1`))
    raw.close()
  }

  // Réouverture : déjà à jour → pas de re-migration (version stable, données stables).
  {
    const store2 = new SqliteStore(dbPath)
    check('réouverture : donnée toujours intacte', store2.get('proj', 'avant') === 'donnée héritée')
    store2.close()

    const raw = new DatabaseSync(dbPath)
    const row = raw.prepare('PRAGMA user_version').get() as { user_version: number }
    check('réouverture : user_version inchangé (pas de re-migration)', row.user_version === SCHEMA_VERSION)
    raw.close()
  }

  fs.rmSync(dir, { recursive: true, force: true })
}

// ── (c) migration factice v1→v2 via runMigrations : backup + préservation ───────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-migration-fake-'))
  const dbPath = path.join(dir, 'v1.db')

  // Base au schéma v1 (table artifacts + user_version=1), une donnée dedans.
  const db = new DatabaseSync(dbPath)
  db.exec(
    `CREATE TABLE IF NOT EXISTS artifacts (
       scope     TEXT NOT NULL,
       key       TEXT NOT NULL,
       value     TEXT NOT NULL,
       embedding TEXT,
       PRIMARY KEY (scope, key)
     )`,
  )
  db.prepare('INSERT INTO artifacts (scope, key, value, embedding) VALUES (?, ?, ?, ?)').run(
    'proj',
    'garde',
    JSON.stringify('ne doit pas se perdre'),
    null,
  )
  db.exec('PRAGMA user_version = 1')

  // Migration FACTICE : v1 → v2, ajoute une colonne `tag`.
  const fakeMigration: Migration = {
    to: 2,
    up: (conn) => {
      conn.exec('ALTER TABLE artifacts ADD COLUMN tag TEXT')
    },
  }

  const finalVersion = runMigrations(db, dbPath, 1, [fakeMigration])
  check('runMigrations retourne la version finale = 2', finalVersion === 2)

  const backupPath = `${dbPath}.bak-v1`
  check('backup .bak-v1 créé avant migration to>=2', fs.existsSync(backupPath))

  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  check('user_version = 2 après migration', row.user_version === 2)

  const kept = db.prepare('SELECT value FROM artifacts WHERE scope = ? AND key = ?').get('proj', 'garde') as
    | { value: string }
    | undefined
  check('donnée préservée après migration', kept !== undefined && JSON.parse(kept.value) === 'ne doit pas se perdre')

  const cols = db.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>
  check('colonne `tag` ajoutée par la migration', cols.some((c) => c.name === 'tag'))

  db.close()

  // Le backup doit être une copie fidèle de l'état PRÉ-migration (donnée présente,
  // colonne tag absente, user_version=1).
  const rawBackup = new DatabaseSync(backupPath)
  const backupRow = rawBackup.prepare('PRAGMA user_version').get() as { user_version: number }
  check('backup : user_version = 1 (état avant migration)', backupRow.user_version === 1)
  const backupCols = rawBackup.prepare('PRAGMA table_info(artifacts)').all() as Array<{ name: string }>
  check('backup : pas de colonne `tag` (pré-migration)', !backupCols.some((c) => c.name === 'tag'))
  rawBackup.close()

  fs.rmSync(dir, { recursive: true, force: true })
}

// ── Fail-open : une migration qui échoue ne casse pas le schéma en place ────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mangoos-migration-failopen-'))
  const dbPath = path.join(dir, 'fail.db')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE IF NOT EXISTS artifacts (scope TEXT, key TEXT, value TEXT, embedding TEXT, PRIMARY KEY (scope, key))')
  db.exec('PRAGMA user_version = 1')

  const brokenMigration: Migration = {
    to: 2,
    up: (conn) => {
      conn.exec('ALTER TABLE table_qui_nexiste_pas ADD COLUMN x TEXT')
    },
  }

  const finalVersion = runMigrations(db, dbPath, 1, [brokenMigration])
  check('migration cassée : version reste à 1 (fail-open, pas de saut)', finalVersion === 1)
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  check('migration cassée : PRAGMA user_version reste 1', row.user_version === 1)
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
}

console.log(`\n[memory-migration] ${passed} ✅  ${failed ? failed + ' ❌' : '0 ❌'}  (${passed + failed} assertions)`)
if (failed > 0) process.exit(1)
