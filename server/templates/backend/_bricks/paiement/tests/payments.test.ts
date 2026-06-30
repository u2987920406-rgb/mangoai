// Test de la brique 'paiement' — sans compte Stripe ni réseau.
// Lancer depuis server/ :  npx tsx templates/backend/_bricks/paiement/tests/payments.test.ts
import type { AddressInfo } from "node:net";
import { verifyStripeSignature, signPayload } from "../src/signature.js";
import { createMemoryIdempotencyStore } from "../src/idempotency.js";
import { buildCheckoutParams, createCheckoutSession, type StripeClient } from "../src/checkout.js";
import { createApp } from "../src/example.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const SECRET = "whsec_test";

async function run() {
  console.log("[1] signature webhook — HMAC (horloge injectée)");
  {
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const header = signPayload(payload, SECRET, 1000);
    const ok = verifyStripeSignature(payload, header, SECRET, { nowSec: 1010 });
    check("signature valide → event décodé", ok.ok && ok.event.id === "evt_1");

    const tampered = verifyStripeSignature(payload + " ", header, SECRET, { nowSec: 1010 });
    check("payload modifié → bad-signature", !tampered.ok && tampered.reason === "bad-signature");

    const wrongSecret = verifyStripeSignature(payload, header, "whsec_autre", { nowSec: 1010 });
    check("mauvais secret → bad-signature", !wrongSecret.ok && wrongSecret.reason === "bad-signature");

    const old = verifyStripeSignature(payload, header, SECRET, { nowSec: 1000 + 4000 });
    check("timestamp hors tolérance → rejet", !old.ok && old.reason === "timestamp-out-of-tolerance");

    check("en-tête absent → no-signature", !verifyStripeSignature(payload, undefined, SECRET).ok);
    check("en-tête mal formé → bad-format", verifyStripeSignature(payload, "garbage", SECRET).ok === false);

    const notJson = signPayload("pas du json", SECRET, 2000);
    const malformed = verifyStripeSignature("pas du json", notJson, SECRET, { nowSec: 2000 });
    check("signé mais pas un event JSON → malformed-json", !malformed.ok && malformed.reason === "malformed-json");
  }

  console.log("\n[2] idempotence");
  {
    const store = createMemoryIdempotencyStore();
    check("1re fois → true (à traiter)", (await store.markProcessed("evt_42")) === true);
    check("2e fois → false (doublon)", (await store.markProcessed("evt_42")) === false);
    check("autre id → true", (await store.markProcessed("evt_43")) === true);
  }

  console.log("\n[3] buildCheckoutParams — PUR");
  {
    const bad = buildCheckoutParams({ priceId: "", successUrl: "x", cancelUrl: "y" });
    check("priceId manquant → erreur", !bad.ok);
    const badUrl = buildCheckoutParams({ priceId: "price_1", successUrl: "pas-une-url", cancelUrl: "https://ok/c" });
    check("successUrl non http → erreur", !badUrl.ok);
    const good = buildCheckoutParams({ priceId: "price_1", quantity: 2, successUrl: "https://ok/s", cancelUrl: "https://ok/c", customerEmail: "a@b.com" });
    check("params valides construits", good.ok && (good.params as any).mode === "payment");
    check("line_items correct", good.ok && JSON.stringify((good.params as any).line_items) === JSON.stringify([{ price: "price_1", quantity: 2 }]));
    check("customer_email passé", good.ok && (good.params as any).customer_email === "a@b.com");
    const sub = buildCheckoutParams({ priceId: "price_1", mode: "subscription", successUrl: "https://ok/s", cancelUrl: "https://ok/c" });
    check("mode subscription respecté", sub.ok && (sub.params as any).mode === "subscription");
  }

  console.log("\n[4] createCheckoutSession — client Stripe injecté (faux)");
  {
    const calls: Record<string, unknown>[] = [];
    const fake: StripeClient = {
      checkout: { sessions: { async create(p) { calls.push(p); return { id: "cs_123", url: "https://stripe/pay/cs_123" }; } } },
    };
    const session = await createCheckoutSession(fake, { mode: "payment" });
    check("session créée via le client injecté", session.id === "cs_123" && session.url === "https://stripe/pay/cs_123");
    check("le client a bien reçu les params", calls.length === 1);
  }

  console.log("\n[5] HTTP bout-en-bout : /checkout + /webhook signé + idempotence");
  const received: string[] = [];
  const fakeStripe: StripeClient = {
    checkout: { sessions: { async create() { return { id: "cs_e2e", url: "https://stripe/pay/cs_e2e" }; } } },
  };
  const app = createApp({
    webhookSecret: SECRET,
    stripe: fakeStripe,
    onEvent: (e) => { received.push(e.id); },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const checkout = await fetch(base + "/api/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priceId: "price_e2e", successUrl: "https://ok/s", cancelUrl: "https://ok/c" }),
    });
    const cb = await checkout.json();
    check("/checkout → 200 + url Stripe", checkout.status === 200 && cb.url === "https://stripe/pay/cs_e2e");

    const badCheckout = await fetch(base + "/api/payments/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
    });
    check("/checkout sans priceId → 400", badCheckout.status === 400);

    const evt = JSON.stringify({ id: "evt_http", type: "checkout.session.completed" });
    const nowSec = Math.floor(Date.now() / 1000);
    const sig = signPayload(evt, SECRET, nowSec);
    const postWebhook = (body: string, signature?: string) =>
      fetch(base + "/api/payments/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) },
        body,
      });

    const wh = await postWebhook(evt, sig);
    check("/webhook signé → 200 received", wh.status === 200 && (await wh.json()).received === true);
    check("onEvent appelé une fois", received.filter((id) => id === "evt_http").length === 1);

    const dup = await postWebhook(evt, sig);
    check("/webhook même event → 200 duplicate", dup.status === 200 && (await dup.json()).duplicate === true);
    check("onEvent PAS rappelé (idempotence)", received.filter((id) => id === "evt_http").length === 1);

    const bad = await postWebhook(evt, signPayload(evt, "whsec_pirate", nowSec));
    check("/webhook signature pirate → 400", bad.status === 400);

    const noSig = await postWebhook(evt);
    check("/webhook sans signature → 400", noSig.status === 400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }

  console.log(`\n=== paiement brick : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
