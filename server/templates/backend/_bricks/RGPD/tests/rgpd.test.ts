// Test de la brique 'RGPD' — sans dépendance, sources de données en mémoire, user simulé.
// Lancer depuis server/ :  npx tsx templates/backend/_bricks/RGPD/tests/rgpd.test.ts
import type { AddressInfo } from "node:net";
import { PrivacyRegistry, type DataSource } from "../src/registry.js";
import { createMemoryConsentStore } from "../src/consent.js";
import { isExpired, selectExpired, sweepExpired, DAYS } from "../src/retention.js";
import { createApp } from "../src/example.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("[1] PrivacyRegistry — export + erase agrègent les sources");
  {
    const profil = new Map<string, unknown>([["u1", { email: "u1@x.com" }]]);
    const commandes = new Map<string, unknown[]>([["u1", [{ id: "c1" }, { id: "c2" }]]]);
    const reg = new PrivacyRegistry();
    reg.register({ name: "profil", collect: (uid) => profil.get(uid) ?? null, erase: (uid) => (profil.delete(uid) ? 1 : 0) });
    reg.register({ name: "commandes", collect: (uid) => commandes.get(uid) ?? [], erase: (uid) => { const n = (commandes.get(uid) ?? []).length; commandes.delete(uid); return n; } });

    const exported = await reg.exportUserData("u1");
    check("export agrège toutes les sources", (exported.profil as any).email === "u1@x.com" && (exported.commandes as any[]).length === 2);

    const erased = await reg.eraseUserData("u1");
    check("erase renvoie le compte par source", erased.profil === 1 && erased.commandes === 2);
    check("données réellement supprimées", !profil.has("u1") && !commandes.has("u1"));

    let threw = false;
    try { reg.register({ name: "profil", collect: () => null, erase: () => 0 }); } catch { threw = true; }
    check("source en double rejetée", threw);
  }

  console.log("\n[2] consentement — donner / retirer / lister / effacer");
  {
    const c = createMemoryConsentStore();
    await c.grant("u1", "marketing", "1.0", 1000);
    check("grant → has = true", await c.has("u1", "marketing"));
    check("grant horodaté + versionné", (await c.list("u1"))[0].grantedAt === 1000 && (await c.list("u1"))[0].version === "1.0");
    await c.withdraw("u1", "marketing");
    check("withdraw → has = false", !(await c.has("u1", "marketing")));
    await c.grant("u1", "analytics", "1.0", 2000);
    await c.grant("u2", "analytics", "1.0", 2000);
    check("eraseUser n'efface que le bon user", (await c.eraseUser("u1")) === 1 && (await c.has("u2", "analytics")));
  }

  console.log("\n[3] rétention — PUR (horloge injectée)");
  {
    const items = [{ id: "a", createdAt: 0 }, { id: "b", createdAt: 1000 }];
    check("isExpired vrai après le TTL", isExpired({ id: "a", createdAt: 0 }, 500, 1000));
    check("isExpired faux dans le TTL", !isExpired({ id: "b", createdAt: 1000 }, 500, 1200));
    check("selectExpired filtre", selectExpired(items, 500, 1200).map((i) => i.id).join() === "a");
    const erased: string[] = [];
    const swept = await sweepExpired(items, 500, 1200, (id) => { erased.push(id); });
    check("sweepExpired efface les expirés", swept.join() === "a" && erased.join() === "a");
    check("DAYS helper", DAYS(2) === 2 * 24 * 60 * 60 * 1000);
  }

  console.log("\n[4] HTTP — export / consent / oubli (user simulé)");
  const profil = new Map<string, unknown>([["user-1", { email: "user1@x.com" }]]);
  const source: DataSource = {
    name: "profil",
    collect: (uid) => profil.get(uid) ?? null,
    erase: (uid) => (profil.delete(uid) ? 1 : 0),
  };
  const app = createApp({
    sources: [source],
    purposes: ["marketing", "analytics"],
    getUserId: (req) => (req.headers["x-test-user"] as string) || undefined,
    now: () => 5000,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const U = { "x-test-user": "user-1" };

  try {
    const noauth = await fetch(base + "/api/privacy/export");
    check("sans user → 401", noauth.status === 401);

    const exp = await fetch(base + "/api/privacy/export", { headers: U });
    const expBody = await exp.json();
    check("export → 200 + données du user", exp.status === 200 && expBody.data.profil.email === "user1@x.com");

    const grant = await fetch(base + "/api/privacy/consent", {
      method: "POST", headers: { ...U, "content-type": "application/json" }, body: JSON.stringify({ purpose: "marketing", granted: true }),
    });
    check("consent accordé → 200 + version", grant.status === 200 && (await grant.json()).version === "1.0");

    const badPurpose = await fetch(base + "/api/privacy/consent", {
      method: "POST", headers: { ...U, "content-type": "application/json" }, body: JSON.stringify({ purpose: "espionnage", granted: true }),
    });
    check("finalité inconnue → 400", badPurpose.status === 400);

    const list = await fetch(base + "/api/privacy/consent", { headers: U });
    check("liste des consentements", (await list.json()).consents.length === 1);

    const del = await fetch(base + "/api/privacy/me", { method: "DELETE", headers: U });
    const delBody = await del.json();
    check("droit à l'oubli → 200 + compte effacé", del.status === 200 && delBody.erased.profil === 1 && delBody.erased.consents === 1);
    check("données réellement supprimées après oubli", !profil.has("user-1"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }

  console.log("\n[5] effaceur externe branché sur le coffre (#170) — la clé n'est jamais en clair");
  {
    // Un sous-traitant externe (CRM) doit effacer l'utilisateur ; sa clé d'API vient du COFFRE,
    // résolue au moment de l'appel. RGPD est résolveur-agnostique : l'app capture le resolver.
    const resolver = (ref: string) => (ref === "secret://crm/api_key" ? "CRM_KEY_42" : null);
    let usedKey = "";
    const erasedFromCrm = new Set(["user-1"]);
    const reg = new PrivacyRegistry();
    reg.register({
      name: "crm-externe",
      collect: () => ({ note: "données chez le sous-traitant CRM" }),
      erase: (uid) => {
        const key = resolver("secret://crm/api_key"); // résolu au dernier moment
        if (!key) return 0;
        usedKey = key; // simulateur d'appel API authentifié
        return erasedFromCrm.delete(uid) ? 1 : 0;
      },
    });
    const erased = await reg.eraseUserData("user-1");
    check("l'effaceur externe a utilisé la clé résolue du coffre", usedKey === "CRM_KEY_42");
    check("effacement chez le sous-traitant compté", erased["crm-externe"] === 1);
    const exported = JSON.stringify(await reg.exportUserData("user-1"));
    check("la clé du coffre n'apparaît PAS dans l'export", !exported.includes("CRM_KEY_42"));
  }

  console.log(`\n=== RGPD brick : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
