# Brique `db` — recette d'assemblage

> Base **SQLite** (via `node:sqlite`, intégré à Node 22+ — **rien à installer**), un runner de
> **migrations** idempotent, et un **UserStore** SQLite qui implémente le contrat de la brique `auth`.

## Ce que la brique apporte

- `openDatabase(path)` → une connexion `Db` (interface minimale `exec`/`prepare`/`close`).
- `runMigrations(db, MIGRATIONS)` → applique les migrations en attente, en ordre, **une seule fois**.
- `createSqliteUserStore(db)` → un `UserStore` (`findByEmail`/`findById`/`create`) **branchable tel quel sur `auth`**.
- `provides`: `db`, `userStore`.

## Pré-requis

- **Node 22+** (pour `node:sqlite`). Si l'environnement est plus ancien : `npm i better-sqlite3` et ouvrir la base via better-sqlite3 dans `db.ts` (même interface `Db`).

## Assemblage (3 étapes)

1. **Copier** `src/db.ts`, `src/migrate.ts`, `src/migrations.ts`, `src/repo.ts`, `src/seed.ts` dans le `src/` du backend.
2. **Variable d'env** (optionnelle) :
   ```bash
   # .env
   DATABASE_PATH=./data.db   # défaut ; ':memory:' pour un test éphémère
   ```
3. **Monter** au démarrage (cf. `src/example.ts`) :
   ```ts
   import { openDatabase } from "./db.js";
   import { runMigrations } from "./migrate.js";
   import { MIGRATIONS } from "./migrations.js";
   import { createSqliteUserStore } from "./repo.js";

   const db = openDatabase(process.env.DATABASE_PATH);
   runMigrations(db, MIGRATIONS);
   const userStore = createSqliteUserStore(db);
   ```

## Composition avec la brique `auth`

```ts
import { createAuthRouter } from "./auth.js";
app.use("/api/auth", createAuthRouter({ secret: process.env.AUTH_SECRET!, store: userStore }));
```
→ les comptes sont désormais **persistés en base** au lieu du store mémoire. Aucune ligne de `auth.ts` à modifier (le contrat `UserStore` est le seul point de contact).

## Ajouter une migration

Ajouter une entrée dans `migrations.ts` avec un **id croissant** (ex. `002_add_sessions`). **Ne jamais modifier** une migration déjà livrée — en créer une nouvelle. Les migrations sont appliquées par ordre d'`id` et tracées dans la table `_migrations`.

## Vérifier

```bash
# depuis server/
npx tsx templates/backend/_bricks/db/tests/db.test.ts
```
Le test utilise un **vrai SQLite en mémoire** : migrations idempotentes + ordonnées, `UserStore` (create/find/unicité), et montage de référence.

## Limites assumées de la v1

- **SQLite** (mono-fichier) : parfait pour mono-utilisateur / petit multi-tenant ; pour de la forte concurrence, basculer l'interface `Db` sur Postgres (driver `pg`) — le `repo.ts` change, le reste non.
- Pas de **RLS** ici (propre à Postgres/Supabase, cf. template `supabase`) : l'isolation par utilisateur se fait au niveau des requêtes du repository.
- Pas d'ORM : SQL explicite et minimal (lisible, auditable). Pour un schéma riche, envisager Drizzle au-dessus de la même base.
