// Test de la brique 'auth' — bout en bout (vrai serveur HTTP sur port éphémère) + unités.
// Lancer depuis server/ :  npx tsx templates/backend/_bricks/auth/tests/auth.test.ts
// Zéro réseau externe, zéro dépendance hors express (déjà dans server/node_modules).
import type { AddressInfo } from "node:net";
import { createApp } from "../src/example.js";
import { signToken, verifyToken } from "../src/tokens.js";
import { scryptHasher } from "../src/password.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("[1] tokens — PUR (horloge injectée)");
  {
    const secret = "s1";
    const t = signToken({ sub: "u1", type: "access", ttlSec: 100 }, secret, 1000);
    const v = verifyToken(t, secret, 1050);
    check("token valide vérifié", v.ok && v.claims.sub === "u1" && v.claims.type === "access");
    const expired = verifyToken(t, secret, 2000);
    check("token expiré rejeté", !expired.ok && expired.reason === "expired");
    const wrong = verifyToken(t, "autre-secret", 1050);
    check("mauvaise signature rejetée", !wrong.ok && wrong.reason === "bad-signature");
    check("token malformé rejeté", !verifyToken("xxx", secret, 1050).ok);
  }

  console.log("\n[2] password — scrypt roundtrip");
  {
    const h = await scryptHasher.hash("hunter2!!");
    check("format scrypt$salt$hash", /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/.test(h));
    check("bon mot de passe vérifié", await scryptHasher.verify("hunter2!!", h));
    check("mauvais mot de passe rejeté", !(await scryptHasher.verify("nope", h)));
    check("hash corrompu rejeté", !(await scryptHasher.verify("hunter2!!", "garbage")));
  }

  console.log("\n[3] HTTP bout-en-bout : register → login → refresh → /api/me");
  const server = createApp("test-secret-please-change").listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  try {
    const reg = await post("/api/auth/register", { email: "a@b.com", password: "motdepasse1" });
    const regBody = await reg.json();
    check("register → 201", reg.status === 201);
    check("register rend accessToken + refreshToken + user", !!regBody.accessToken && !!regBody.refreshToken && regBody.user?.email === "a@b.com");

    const dup = await post("/api/auth/register", { email: "a@b.com", password: "motdepasse1" });
    check("register en double → 409", dup.status === 409);

    const weak = await post("/api/auth/register", { email: "c@d.com", password: "court" });
    check("mot de passe < 8 → 400", weak.status === 400);

    const badLogin = await post("/api/auth/login", { email: "a@b.com", password: "mauvais" });
    check("login mauvais mot de passe → 401", badLogin.status === 401);

    const unknownLogin = await post("/api/auth/login", { email: "inconnu@x.com", password: "whatever1" });
    check("login email inconnu → 401", unknownLogin.status === 401);

    const login = await post("/api/auth/login", { email: "a@b.com", password: "motdepasse1" });
    const loginBody = await login.json();
    check("login OK → 200 + tokens", login.status === 200 && !!loginBody.accessToken);

    const meNoToken = await fetch(base + "/api/me");
    check("/api/me sans token → 401", meNoToken.status === 401);

    const meBadToken = await fetch(base + "/api/me", { headers: { authorization: "Bearer abc.def" } });
    check("/api/me token invalide → 401", meBadToken.status === 401);

    const me = await fetch(base + "/api/me", { headers: { authorization: `Bearer ${loginBody.accessToken}` } });
    const meBody = await me.json();
    check("/api/me avec access token → 200 + user.id", me.status === 200 && typeof meBody.user?.id === "string");

    const refresh = await post("/api/auth/refresh", { refreshToken: loginBody.refreshToken });
    const refreshBody = await refresh.json();
    check("refresh → 200 + nouveau accessToken", refresh.status === 200 && !!refreshBody.accessToken);

    // un access token ne doit PAS servir de refresh
    const wrongRefresh = await post("/api/auth/refresh", { refreshToken: loginBody.accessToken });
    check("access token rejeté comme refresh → 401", wrongRefresh.status === 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }

  console.log(`\n=== auth brick : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
