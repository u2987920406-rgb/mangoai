// Test de la brique 'securite' — gardes HTTP, zéro dépendance, horloge injectée pour le rate-limit.
// Lancer depuis server/ :  npx tsx templates/backend/_bricks/securite/tests/securite.test.ts
import type { AddressInfo } from "node:net";
import { RateCounter } from "../src/rate-limit.js";
import { object, string } from "../src/validate.js";
import { requireEnv } from "../src/secrets.js";
import { createApp } from "../src/example.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("[1] RateCounter — PUR (fenêtre fixe, horloge injectée)");
  {
    const c = new RateCounter(1000, 2);
    check("1er hit autorisé", c.check("ip", 0).allowed);
    check("2e hit autorisé (= max)", c.check("ip", 100).allowed);
    check("3e hit refusé", !c.check("ip", 200).allowed);
    check("après la fenêtre → ré-autorisé", c.check("ip", 1200).allowed);
    check("clé différente = compteur indépendant", c.check("autre-ip", 200).allowed);
  }

  console.log("\n[2] validate — mini-schémas (drop-in Zod)");
  {
    const schema = object({ name: string({ min: 2 }), email: string({ email: true }) });
    const ok = schema.safeParse({ name: "Léa", email: "lea@x.com" });
    check("entrée valide → success", ok.success);
    const ko = schema.safeParse({ name: "L", email: "pasunmail" });
    check("entrée invalide → échec + erreurs préfixées", !ko.success && (ko as any).errors.some((e: string) => e.startsWith("name")) && (ko as any).errors.some((e: string) => e.startsWith("email")));
    check("non-objet → échec", !object({}).safeParse(42).success);
  }

  console.log("\n[3] requireEnv — secrets hors-code");
  {
    const got = requireEnv(["A", "B"], { A: "1", B: "2" } as NodeJS.ProcessEnv);
    check("toutes présentes → valeurs rendues", got.A === "1" && got.B === "2");
    let threw = false;
    try { requireEnv(["A", "MANQUE"], { A: "1" } as NodeJS.ProcessEnv); } catch { threw = true; }
    check("une manquante → throw (échec rapide au boot)", threw);
    let threwEmpty = false;
    try { requireEnv(["A"], { A: "  " } as NodeJS.ProcessEnv); } catch { threwEmpty = true; }
    check("valeur vide compte comme manquante", threwEmpty);
  }

  console.log("\n[4] HTTP — en-têtes, CORS, validation (rate-limit large pour ne pas interférer)");
  const app = createApp({
    corsOrigins: ["https://ok.com"],
    rateLimit: { windowMs: 10_000, max: 100 }, // large : on teste le blocage dans [5] avec un app dédié
    hsts: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const h = await fetch(base + "/api/health");
    check("CSP posé", h.headers.get("content-security-policy") === "default-src 'self'");
    check("X-Content-Type-Options nosniff", h.headers.get("x-content-type-options") === "nosniff");
    check("X-Frame-Options DENY", h.headers.get("x-frame-options") === "DENY");
    check("HSTS posé", (h.headers.get("strict-transport-security") ?? "").includes("max-age"));
    check("X-Powered-By retiré", h.headers.get("x-powered-by") === null);

    const allowed = await fetch(base + "/api/health", { headers: { origin: "https://ok.com" } });
    check("CORS origine autorisée → ACAO renvoyé", allowed.headers.get("access-control-allow-origin") === "https://ok.com");
    const denied = await fetch(base + "/api/health", { headers: { origin: "https://evil.com" } });
    check("CORS origine non listée → pas d'ACAO", denied.headers.get("access-control-allow-origin") === null);
    const preflight = await fetch(base + "/api/health", { method: "OPTIONS", headers: { origin: "https://ok.com" } });
    check("préflight OPTIONS → 204 + méthodes", preflight.status === 204 && (preflight.headers.get("access-control-allow-methods") ?? "").includes("POST"));

    const good = await fetch(base + "/api/echo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Mango" }) });
    check("body valide → 200", good.status === 200 && (await good.json()).name === "Mango");
    const bad = await fetch(base + "/api/echo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    check("body invalide → 400 + details", bad.status === 400 && Array.isArray((await bad.json()).details));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }

  console.log("\n[5] HTTP — rate-limit dédié (max 2, horloge injectée)");
  let clock = 1000;
  const rlApp = createApp({ rateLimit: { windowMs: 10_000, max: 2, now: () => clock } });
  const rlServer = rlApp.listen(0, "127.0.0.1");
  await new Promise<void>((r) => rlServer.once("listening", () => r()));
  const rlBase = `http://127.0.0.1:${(rlServer.address() as AddressInfo).port}`;

  try {
    const a = await fetch(rlBase + "/api/health");
    const b = await fetch(rlBase + "/api/health");
    const c = await fetch(rlBase + "/api/health");
    check("2 requêtes OK puis 3e → 429", a.status === 200 && b.status === 200 && c.status === 429);
    check("429 porte Retry-After", c.headers.get("retry-after") !== null);
    clock += 20_000; // nouvelle fenêtre
    const d = await fetch(rlBase + "/api/health");
    check("après la fenêtre → ré-autorisé", d.status === 200);
  } finally {
    await new Promise<void>((r) => rlServer.close(() => r()));
  }

  console.log(`\n=== securite brick : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
