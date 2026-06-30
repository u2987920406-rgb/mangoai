// Vérification de signature des webhooks Stripe — réimplémentée avec node:crypto (ZÉRO dépendance).
// Stripe signe `${timestamp}.${rawBody}` en HMAC-SHA256 ; l'en-tête `Stripe-Signature` ressemble à
// "t=1690000000,v1=<hex>[,v1=<hex2>]". Vérifier soi-même évite de dépendre du SDK juste pour ça,
// et c'est le point de sécurité CRITIQUE de la brique (un webhook non signé = un ordre de paiement falsifiable).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface StripeEvent {
  id: string;
  type: string;
  data?: unknown;
  [k: string]: unknown;
}

export type VerifyResult =
  | { ok: true; event: StripeEvent }
  | { ok: false; reason: "no-signature" | "bad-format" | "timestamp-out-of-tolerance" | "bad-signature" | "malformed-json" };

export interface VerifyOptions {
  toleranceSec?: number; // défaut 300 (5 min) — comme Stripe
  nowSec?: number; // horloge injectable → tests déterministes
}

// Helper de DEV/TEST : produit un en-tête Stripe-Signature valide pour un payload donné.
export function signPayload(payload: string, secret: string, timestampSec: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestampSec}.${payload}`).digest("hex");
  return `t=${timestampSec},v1=${v1}`;
}

function parseHeader(header: string): { t?: number; v1: string[] } {
  const out: { t?: number; v1: string[] } = { v1: [] };
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") out.t = Number(v);
    else if (k === "v1") out.v1.push(v);
  }
  return out;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function verifyStripeSignature(
  payload: string,
  header: string | undefined | null,
  secret: string,
  opts: VerifyOptions = {},
): VerifyResult {
  if (!header) return { ok: false, reason: "no-signature" };
  const { t, v1 } = parseHeader(header);
  if (t === undefined || Number.isNaN(t) || v1.length === 0) return { ok: false, reason: "bad-format" };

  const tolerance = opts.toleranceSec ?? 300;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - t) > tolerance) return { ok: false, reason: "timestamp-out-of-tolerance" };

  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  if (!v1.some((sig) => safeEqualHex(sig, expected))) return { ok: false, reason: "bad-signature" };

  let event: StripeEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "malformed-json" };
  }
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return { ok: false, reason: "malformed-json" };
  }
  return { ok: true, event };
}
