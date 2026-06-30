// Tokens signés HMAC-SHA256 (node:crypto, ZÉRO dépendance) — format compact "<bodyB64url>.<sigB64url>".
// Suffisant pour de l'auth de session interne. Pour de l'interop JWT standard (RS256, claims tiers),
// installer jsonwebtoken et remplacer sign/verify (voir RECIPE.md).
// L'horloge est INJECTABLE (param nowSec) → tests déterministes sans dépendre du temps réel.
import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenType = "access" | "refresh";

export interface TokenClaims {
  sub: string;
  type: TokenType;
  iat: number;
  exp: number;
}

function enc(buf: Buffer): string {
  return buf.toString("base64url");
}

export function signToken(
  args: { sub: string; type: TokenType; ttlSec: number },
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  const claims: TokenClaims = {
    sub: args.sub,
    type: args.type,
    iat: nowSec,
    exp: nowSec + args.ttlSec,
  };
  const body = enc(Buffer.from(JSON.stringify(claims)));
  const sig = enc(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

export function verifyToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = enc(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.exp !== "number" || claims.exp < nowSec) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, claims };
}
