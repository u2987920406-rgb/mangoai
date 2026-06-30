// Montage de référence de la brique 'db' : ouvrir la base, migrer, exposer un UserStore.
// Sert de cible au test et d'exemple pour le RECIPE.
import { openDatabase, type Db } from "./db.js";
import { runMigrations } from "./migrate.js";
import { MIGRATIONS } from "./migrations.js";
import { createSqliteUserStore, type UserStore } from "./repo.js";
import { seed } from "./seed.js";

export function setupDatabase(path?: string): { db: Db; userStore: UserStore } {
  const db = openDatabase(path);
  runMigrations(db, MIGRATIONS);
  seed(db);
  const userStore = createSqliteUserStore(db);
  return { db, userStore };
}

// Branchement avec la brique 'auth' :
//   import { createAuthRouter } from "./auth.js";
//   const { userStore } = setupDatabase(process.env.DATABASE_PATH);
//   app.use("/api/auth", createAuthRouter({ secret: process.env.AUTH_SECRET!, store: userStore }));
