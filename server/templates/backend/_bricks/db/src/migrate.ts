// Runner de migrations — idempotent et ordonné. PUR vis-à-vis de l'engine : opère sur l'interface Db.
// Les migrations sont appliquées par ordre d'`id` croissant ; une migration déjà appliquée est sautée.
import type { Db } from "./db.js";

export interface Migration {
  /** identifiant ordonné, ex. "001_init_users" */
  id: string;
  /** SQL à exécuter (peut contenir plusieurs instructions) */
  up: string;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export function runMigrations(db: Db, migrations: Migration[]): MigrateResult {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const done = new Set(
    (db.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
  );

  const ordered = [...migrations].sort((a, b) => a.id.localeCompare(b.id));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const m of ordered) {
    if (done.has(m.id)) {
      skipped.push(m.id);
      continue;
    }
    db.exec(m.up);
    db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(m.id, Date.now());
    applied.push(m.id);
  }
  return { applied, skipped };
}
