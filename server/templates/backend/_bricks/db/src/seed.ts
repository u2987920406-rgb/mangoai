// Seed idempotent — à adapter au projet. Ne crée RIEN de sensible par défaut.
// Appeler après runMigrations, et écrire des INSERT « OR IGNORE » pour pouvoir le relancer sans dégât.
import type { Db } from "./db.js";

export function seed(_db: Db): void {
  // Exemple (décommenter/adapter) :
  // _db.prepare("INSERT OR IGNORE INTO roles (name) VALUES (?)").run("admin");
}
