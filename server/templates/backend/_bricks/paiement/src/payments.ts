// Routeur paiement : une route checkout (JSON) + un handler webhook (corps BRUT, signature vérifiée).
// Les deux sont séparés car le webhook DOIT lire le body brut (la signature est calculée dessus) →
// on le monte avec express.raw, le reste avec express.json (cf. example.ts / RECIPE.md).
import { Router, type Request, type Response } from "express";
import { buildCheckoutParams, createCheckoutSession, getStripeClient, type StripeClient } from "./checkout.js";
import { verifyStripeSignature, type StripeEvent, type VerifyResult } from "./signature.js";
import { createMemoryIdempotencyStore, type IdempotencyStore } from "./idempotency.js";

export interface CheckoutRouterOptions {
  stripe?: StripeClient; // défaut : SDK chargé à la demande
  mode?: "payment" | "subscription";
  successUrl?: string;
  cancelUrl?: string;
}

export function createCheckoutRouter(opts: CheckoutRouterOptions = {}): Router {
  const router = Router();
  router.post("/checkout", async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const built = buildCheckoutParams({
      priceId: b.priceId as string,
      quantity: b.quantity as number | undefined,
      mode: (b.mode as "payment" | "subscription") ?? opts.mode,
      successUrl: (b.successUrl as string) ?? opts.successUrl,
      cancelUrl: (b.cancelUrl as string) ?? opts.cancelUrl,
      customerEmail: b.customerEmail as string | undefined,
    });
    if (!built.ok) return res.status(400).json({ error: built.error });
    try {
      const client = opts.stripe ?? (await getStripeClient());
      const session = await createCheckoutSession(client, built.params);
      return res.json({ id: session.id, url: session.url });
    } catch {
      return res.status(502).json({ error: "stripe-error" });
    }
  });
  return router;
}

export interface WebhookHandlerOptions {
  webhookSecret: string;
  onEvent: (event: StripeEvent) => Promise<void> | void;
  idempotency?: IdempotencyStore;
  /** vérificateur injectable (défaut verifyStripeSignature) — sert aux tests */
  verify?: (payload: string, header: string | undefined, secret: string) => VerifyResult;
  toleranceSec?: number;
}

export function createWebhookHandler(opts: WebhookHandlerOptions) {
  const idempotency = opts.idempotency ?? createMemoryIdempotencyStore();
  const verify =
    opts.verify ??
    ((payload: string, header: string | undefined, secret: string) =>
      verifyStripeSignature(payload, header, secret, { toleranceSec: opts.toleranceSec }));

  return async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});
    const header = req.headers["stripe-signature"] as string | undefined;

    const result = verify(raw, header, opts.webhookSecret);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    // Idempotence : un événement déjà traité est acquitté sans ré-exécuter le handler.
    const fresh = await idempotency.markProcessed(result.event.id);
    if (!fresh) return res.json({ received: true, duplicate: true });

    try {
      await opts.onEvent(result.event);
    } catch {
      // On a accepté la signature ; si le traitement échoue, demander un retry à Stripe (500).
      return res.status(500).json({ error: "handler-failed" });
    }
    return res.json({ received: true });
  };
}
