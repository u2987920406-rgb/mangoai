// Test de la brique 'db' — VRAI SQLite en mémoire (node:sqlite, intégré, $0, zéro dépendance).
// Lancer depuis server/ :  npx tsx templates/backend/_bricks/db/tests/db.test.ts
import { openDatabase } from "../src/db.js";
import { runMigrations, type Migration } from "../src/migrate.js";
import { MIGRATIONS } from "../src/migrations.js";
import { createSqliteUserStore } from "../src/repo.js";
import { setupDatabase } from "../src/example.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("[1] migrations — idempotentes et ordonnées");
  {
    const db = openDatabase(":memory:");
    const first = runMigrations(db, MIGRATIONS);
    check("1er run applique 001_init_users", first.applied.includes("001_init_users") && first.skipped.length === 0);

    const second = runMigrations(db, MIGRATIONS);
    check("2e run ne réapplique rien (idempotent)", second.applied.length === 0 && second.skipped.includes("001_init_users"));

    const tracked = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
    check("_migrations trace l'historique", tracked.some((r) => r.id === "001_init_users"));

    // ordre : ids appliqués dans l'ordre croissant même si fournis en désordre
    const db2 = openDatabase(":memory:");
    const unordered: Migration[] = [
      { id: "002_b", up: "CREATE TABLE b(x)" },
      { id: "001_a", up: "CREATE TABLE a(x)" },
    ];
    const r = runMigrations(db2, unordered);
    check("appliquées par id croissant", r.applied[0] === "001_a" && r.applied[1] === "002_b");
    db.close();
    db2.close();
  }

  console.log("\n[2] UserStore SQLite — create / find / unicité");
  {
    const db = openDatabase(":memory:");
    runMigrations(db, MIGRATIONS);
    const store = createSqliteUserStore(db);

    const created = await store.create({ email: "A@B.com", passwordHash: "scrypt$x$y" });
    check("create rend un UserRecord complet", typeof created.id === "string" && created.email === "a@b.com" && typeof created.createdAt === "number");

    const byEmail = await store.findByEmail("a@b.com");
    check("findByEmail (insensible à la casse) trouve", byEmail?.id === created.id);

    const byEmailCase = await store.findByEmail("A@B.COM");
    check("findByEmail normalise la casse", byEmailCase?.id === created.id);

    const byId = await store.findById(created.id);
    check("findById trouve + mappe password_hash", byId?.passwordHash === "scrypt$x$y");

    check("findByEmail inconnu → null", (await store.findByEmail("nope@x.com")) === null);
    check("findById inconnu → null", (await store.findById("00000000")) === null);

    let threw = false;
    try { await store.create({ email: "a@b.com", passwordHash: "z" }); } catch { threw = true; }
    check("email en double → contrainte UNIQUE (throw)", threw);
    db.close();
  }

  console.log("\n[3] setupDatabase — montage de référence (db + userStore prêts)");
  {
    const { db, userStore } = setupDatabase(":memory:");
    const u = await userStore.create({ email: "ready@x.com", passwordHash: "h" });
    check("setupDatabase migre + expose un store fonctionnel", (await userStore.findById(u.id))?.email === "ready@x.com");
    // forme du record = contrat attendu par la brique 'auth'
    check("record a {id,email,passwordHash,createdAt} (contrat auth)",
      "id" in u && "email" in u && "passwordHash" in u && "createdAt" in u);
    db.close();
  }

  console.log(`\n=== db brick : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
