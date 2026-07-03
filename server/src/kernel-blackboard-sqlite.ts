// MangoOS Kernel — Backend SQLite du Blackboard (persistance disque réelle).
//
// Utilise `node:sqlite`, le module SQLite INTÉGRÉ au runtime Node (≥ 22.5, stable
// en 25) : aucune dépendance native, aucun node-gyp, aucun risque de build sur
// Windows — fidèle au principe local-first « ça marche toujours ». Les artefacts
// (valeur JSON + embedding optionnel) survivent au redémarrage du serveur.
//
// Le « vec » de SQLite-vec : les embeddings sont rangés en colonne et la recherche
// se fait par COSINUS en JS (rankByCosine) — proven, déterministe, sans extension.
// L'extension native sqlite-vec (index ANN) pourra se brancher sur la MÊME table
// plus tard pour accélérer `search` à grande échelle, sans changer l'interface.
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { rankByCosine, type BlackboardStore, type SearchHit } from './kernel-blackboard-store.js'

// ── Versioning de schéma (A0.2 cadre + A0.3 bornage temporel) ────────────────
//
// Pourquoi : le Blackboard SQLite survit au serveur — sur 10 ans, son format de
// table VA changer. Sans version tracée, on ne peut jamais savoir en toute
// sûreté si une base sur disque correspond au code qui l'ouvre. On utilise le
// PRAGMA user_version natif de SQLite (entier, gratuit, pas de table dédiée).
//
// BASE_SCHEMA_VERSION = 1 : le schéma HISTORIQUE (table `artifacts` sans
// timestamps), tel qu'il existait avant A0.3. SCHEMA_VERSION = 2 : le schéma
// COURANT, qui ajoute `created_at`/`updated_at` (bornage temporel, purge/TTL —
// cf. MIGRATIONS ci-dessous). Une base neuve est créée DIRECTEMENT au schéma
// courant (CREATE TABLE inclut les colonnes) ; une base héritée passe par la
// migration v2 pour les acquérir.
//
// Fail-open partout : une erreur de lecture/migration ne bloque JAMAIS le
// boot — on logue et on continue avec le schéma en place (mieux vaut un
// Blackboard qui démarre avec un schéma non-migré qu'un serveur qui ne
// démarre pas du tout).
export const BASE_SCHEMA_VERSION = 1
export const SCHEMA_VERSION = 2

/** Une migration de schéma : `to` = version cible, `up` = la DDL/DML à jouer
 *  (reçoit la connexion DÉJÀ ouverte, DANS la transaction de runMigrations). */
export interface Migration {
  to: number
  up: (db: DatabaseSync) => void
}

/** Vrai si la table `table` possède la colonne `column` (fail-open : false en
 *  cas d'erreur — table absente, connexion fermée, etc.). Utilisé pour rendre
 *  les migrations et l'estampillage IDEMPOTENTS-SAFE (jamais retenter un ALTER
 *  déjà appliqué). */
function tableHasColumn(db: DatabaseSync, table: string, column: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return cols.some((c) => c.name === column)
  } catch {
    return false
  }
}

/** Catalogue des migrations. v2 (A0.3) : bornage temporel — ajoute
 *  `created_at`/`updated_at` sur `artifacts`, base du futur prune/TTL
 *  (BLACKBOARD_TTL). IDEMPOTENTE-SAFE : vérifie table_info avant chaque ALTER,
 *  donc rejouable sans erreur si une colonne existe déjà (base déjà migrée
 *  partiellement, ou schéma frais qui a les colonnes dès le CREATE TABLE).
 *  Ajouter une entrée {to: 3, up: ...} suffira pour la migration suivante,
 *  sans toucher au constructeur ni à runMigrations. Ordre non requis à
 *  l'écriture (planMigrations trie), mais garder l'ordre croissant par lisibilité. */
export const MIGRATIONS: Migration[] = [
  {
    to: 2,
    up: (db) => {
      if (!tableHasColumn(db, 'artifacts', 'created_at')) {
        db.exec('ALTER TABLE artifacts ADD COLUMN created_at INTEGER')
      }
      if (!tableHasColumn(db, 'artifacts', 'updated_at')) {
        db.exec('ALTER TABLE artifacts ADD COLUMN updated_at INTEGER')
      }
    },
  },
]

/** Pure, testable sans DB : quelles migrations appliquer, et dans quel ordre,
 *  pour amener `currentVersion` à jour parmi `migrations`. */
export function planMigrations(currentVersion: number, migrations: Migration[]): Migration[] {
  return migrations.filter((m) => m.to > currentVersion).sort((a, b) => a.to - b.to)
}

/**
 * Applique en séquence (une TRANSACTION par migration) les migrations dont
 * `to > currentVersion`. RÈGLE NON NÉGOCIABLE : avant toute migration réelle
 * (to >= 2), on copie le fichier `.db` en `<dbPath>.bak-v<versionAvant>` — un
 * schéma v1 n'a rien à sauvegarder (MIGRATIONS vide), donc ce chemin n'est
 * exercé qu'à partir de la première vraie migration.
 *
 * (Un, 2026-07-03) U2 — le backup n'est PAS optionnel : un backup raté (disque
 * plein, verrou antivirus Windows…) DOIT arrêter la chaîne de migrations avant
 * le moindre up() — sinon l'invariant « backup avant tout up() » est violé. On
 * reste alors sur le schéma courant (fail-open : le runtime détecte les
 * colonnes réelles via `tableHasColumn`, donc `put()` retombe sur l'écriture
 * historique sans throw ni blocage au boot) et une prochaine ouverture
 * retentera la migration (rien n'est marqué comme fait).
 *
 * Fail-open : si une migration échoue APRÈS un backup réussi, ROLLBACK de
 * CETTE migration, log, et on ARRÊTE la chaîne (on ne saute pas une version —
 * l'ordre doit rester linéaire) en gardant le schéma tel qu'il était avant
 * elle. Ne throw jamais.
 *
 * Retourne la version finale effectivement atteinte.
 */
export function runMigrations(db: DatabaseSync, dbPath: string, currentVersion: number, migrations: Migration[]): number {
  const plan = planMigrations(currentVersion, migrations)
  let version = currentVersion
  for (const migration of plan) {
    if (migration.to >= 2 && dbPath !== ':memory:') {
      try {
        fs.copyFileSync(dbPath, `${dbPath}.bak-v${version}`)
      } catch (err) {
        // Backup impossible → migration REPORTÉE (pas de up() sans copie de
        // sûreté). On arrête la chaîne ici, schéma courant conservé.
        console.warn('[blackboard] migration REPORTÉE : backup impossible :', err)
        break
      }
    }
    try {
      db.exec('BEGIN')
      migration.up(db)
      db.exec(`PRAGMA user_version = ${migration.to}`)
      db.exec('COMMIT')
      version = migration.to
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* rien à annuler (l'échec peut précéder le BEGIN) */
      }
      console.warn('[blackboard] migration:', err)
      break
    }
  }
  return version
}

export class SqliteStore implements BlackboardStore {
  private db: DatabaseSync
  /** Vrai si `artifacts` a les colonnes created_at/updated_at (schéma v2 atteint).
   *  Vérifié en LISANT le schéma réel après migration (pas en faisant confiance
   *  au numéro de version) : fail-open si une migration a échoué en route, put()
   *  retombe alors sur la requête sans timestamps plutôt que de throw. */
  private hasTimestamps = false

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath)
    // WAL : lectures concurrentes pendant une écriture (serveur long-running).
    this.db.exec('PRAGMA journal_mode = WAL')
    // Schéma COURANT (v2) pour toute base FRAÎCHE : created_at/updated_at dès la
    // création. Une base HÉRITÉE (déjà sur disque, sans ces colonnes) n'est pas
    // affectée par IF NOT EXISTS — elle passera par la migration v2 ci-dessous.
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS artifacts (
         scope      TEXT NOT NULL,
         key        TEXT NOT NULL,
         value      TEXT NOT NULL,
         embedding  TEXT,
         created_at INTEGER,
         updated_at INTEGER,
         PRIMARY KEY (scope, key)
       )`,
    )

    // Versioning : lecture fail-open, jamais bloquante pour le boot.
    try {
      const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
      let current = row?.user_version ?? 0
      // user_version=0 est AMBIGU : base FRAÎCHE (jamais estampillée, schéma
      // courant complet grâce au CREATE TABLE ci-dessus) OU base HÉRITÉE d'avant
      // A0.2 (jamais estampillée non plus, mais SANS les colonnes timestamps).
      // On tranche en lisant le schéma réel plutôt qu'en le supposer : la
      // colonne `updated_at` n'existe QUE si le CREATE TABLE vient de la créer
      // (base fraîche) — une base héritée ne l'a pas tant que la migration v2
      // n'a pas tourné.
      if (current === 0) {
        current = tableHasColumn(this.db, 'artifacts', 'updated_at') ? SCHEMA_VERSION : BASE_SCHEMA_VERSION
        this.db.exec(`PRAGMA user_version = ${current}`)
      }
      runMigrations(this.db, dbPath, current, MIGRATIONS)
      this.hasTimestamps = tableHasColumn(this.db, 'artifacts', 'updated_at')
    } catch (err) {
      console.warn('[blackboard] migration:', err)
    }
  }

  put(scope: string, key: string, value: unknown, embedding?: number[]): void {
    const v = JSON.stringify(value ?? null)
    const e = embedding ? JSON.stringify(embedding) : null
    if (this.hasTimestamps) {
      const now = Math.floor(Date.now() / 1000)
      this.db
        .prepare(
          `INSERT INTO artifacts (scope, key, value, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, embedding = excluded.embedding, updated_at = excluded.updated_at`,
        )
        .run(scope, key, v, e, now, now)
      return
    }
    // Fail-open : colonnes timestamps absentes (migration non aboutie) — on
    // retombe sur l'écriture historique plutôt que de throw.
    this.db
      .prepare(
        `INSERT INTO artifacts (scope, key, value, embedding) VALUES (?, ?, ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, embedding = excluded.embedding`,
      )
      .run(scope, key, v, e)
  }

  /**
   * Maintenance optionnelle (JAMAIS appelée automatiquement au boot) : purge
   * les artefacts d'un scope selon un critère d'âge (`olderThanMs`) et/ou de
   * volume (`maxEntries`, garde les N plus récents par updated_at). Les deux
   * critères se combinent. Retourne le nombre de lignes supprimées.
   *
   * Prévu pour être appelée par un job nocturne gaté `BLACKBOARD_TTL`
   * (cf. flags.ts) — le câblage du job est un autre chantier, cette méthode
   * n'est que l'outil. No-op (retourne 0) si `hasTimestamps` est faux (base
   * jamais migrée en v2 — fail-open, pas de throw).
   */
  prune(scope: string, opts: { olderThanMs?: number; maxEntries?: number }): number {
    if (!this.hasTimestamps) return 0
    let deleted = 0
    try {
      if (opts.olderThanMs !== undefined) {
        const cutoff = Math.floor((Date.now() - opts.olderThanMs) / 1000)
        const info = this.db.prepare('DELETE FROM artifacts WHERE scope = ? AND updated_at < ?').run(scope, cutoff)
        deleted += Number(info.changes)
      }
      if (opts.maxEntries !== undefined) {
        // rowid (implicite, unique table entière) plutôt que `key` seule : évite
        // toute collision si un autre scope partage un nom de clé.
        const info = this.db
          .prepare(
            `DELETE FROM artifacts WHERE scope = ? AND rowid NOT IN (
               SELECT rowid FROM artifacts WHERE scope = ? ORDER BY updated_at DESC LIMIT ?
             )`,
          )
          .run(scope, scope, opts.maxEntries)
        deleted += Number(info.changes)
      }
    } catch (err) {
      console.warn('[blackboard] prune:', err)
    }
    return deleted
  }

  get(scope: string, key: string): unknown | undefined {
    const row = this.db.prepare('SELECT value FROM artifacts WHERE scope = ? AND key = ?').get(scope, key) as
      | { value: string }
      | undefined
    if (!row) return undefined
    try {
      return JSON.parse(row.value)
    } catch {
      return undefined
    }
  }

  has(scope: string, key: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM artifacts WHERE scope = ? AND key = ? LIMIT 1').get(scope, key)
    return row !== undefined
  }

  delete(scope: string, key: string): boolean {
    const info = this.db.prepare('DELETE FROM artifacts WHERE scope = ? AND key = ?').run(scope, key)
    return Number(info.changes) > 0
  }

  keys(scope: string): string[] {
    const rows = this.db.prepare('SELECT key FROM artifacts WHERE scope = ?').all(scope) as Array<{ key: string }>
    return rows.map((r) => r.key)
  }

  search(scope: string, queryEmbedding: number[], k: number): SearchHit[] {
    const rows = this.db
      .prepare('SELECT key, value, embedding FROM artifacts WHERE scope = ? AND embedding IS NOT NULL')
      .all(scope) as Array<{ key: string; value: string; embedding: string }>
    const entries = rows.map((r) => ({
      key: r.key,
      value: safeParse(r.value),
      embedding: safeParse(r.embedding) as number[] | undefined,
    }))
    return rankByCosine(entries, queryEmbedding, k)
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      /* déjà fermée */
    }
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
