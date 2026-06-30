// Montage de référence de la brique 'paiement'. POINT CRITIQUE : la route webhook est montée
// avec express.raw AVANT tout express.json global → la signature est vérifiée sur le corps BRUT.
import express from "express";
import { createCheckoutRouter, createWebhookHandler } from "./payments.js";
import type { StripeClient } from "./checkout.js";
import type { IdempotencyStore } from "./idempotency.js";
import type { StripeEvent } from "./signature.js";

export interface PaymentsAppOptions {
  webhookSecret?: string;
  stripe?: StripeClient;
  idempotency?: IdempotencyStore;
  onEvent?: (event: StripeEvent) => Promise<void> | void;
  successUrl?: string;
  cancelUrl?: string;
}

export function createApp(opts: PaymentsAppOptions = {}) {
  const app = express();
  const webhookSecret = opts.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // 1) Webhook AVANT express.json : corps brut requis pour la signature.
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    createWebhookHandler({
      webhookSecret,
      idempotency: opts.idempotency,
      onEvent: opts.onEvent ?? (() => {}),
    }),
  );

  // 2) Le reste en JSON.
  app.use(
    "/api/payments",
    express.json(),
    createCheckoutRouter({
      stripe: opts.stripe,
      successUrl: opts.successUrl ?? "https://example.com/success",
      cancelUrl: opts.cancelUrl ?? "https://example.com/cancel",
    }),
  );

  return app;
}
