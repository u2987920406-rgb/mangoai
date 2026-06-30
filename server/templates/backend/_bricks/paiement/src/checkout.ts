// Création de session de paiement Stripe Checkout. La CONSTRUCTION des paramètres est PURE/testable ;
// l'appel API réel passe par un StripeClient INJECTABLE (défaut = SDK 'stripe' chargé à la demande,
// comme argon2 dans la brique auth) → les tests n'ont besoin ni du SDK ni d'un compte Stripe.

export interface StripeClient {
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ id: string; url: string | null }>;
    };
  };
}

export interface CheckoutInput {
  priceId: string;
  quantity?: number;
  mode?: "payment" | "subscription";
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
}

export type BuildResult =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: string };

const URL_RE = /^https?:\/\/.+/i;

export function buildCheckoutParams(input: CheckoutInput): BuildResult {
  if (typeof input.priceId !== "string" || !input.priceId.trim()) return { ok: false, error: "priceId requis" };
  if (typeof input.successUrl !== "string" || !URL_RE.test(input.successUrl)) return { ok: false, error: "successUrl (http/https) requise" };
  if (typeof input.cancelUrl !== "string" || !URL_RE.test(input.cancelUrl)) return { ok: false, error: "cancelUrl (http/https) requise" };
  const quantity = Number.isInteger(input.quantity) && (input.quantity as number) > 0 ? (input.quantity as number) : 1;
  const mode = input.mode === "subscription" ? "subscription" : "payment";

  const params: Record<string, unknown> = {
    mode,
    line_items: [{ price: input.priceId, quantity }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
  if (typeof input.customerEmail === "string" && input.customerEmail) {
    params.customer_email = input.customerEmail;
  }
  return { ok: true, params };
}

export async function createCheckoutSession(
  client: StripeClient,
  params: Record<string, unknown>,
): Promise<{ id: string; url: string | null }> {
  return client.checkout.sessions.create(params);
}

let cached: StripeClient | null = null;
export async function getStripeClient(): Promise<StripeClient> {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY manquant");
  const Stripe: any = (await import("stripe")).default;
  cached = new Stripe(key) as StripeClient;
  return cached;
}
