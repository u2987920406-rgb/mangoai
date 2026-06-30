// Limiteur de débit (fenêtre fixe) — ZÉRO dépendance, horloge INJECTABLE → tests déterministes.
// Mémoire par process (suffit pour un mono-instance) ; pour du multi-instance, brancher un store
// partagé (Redis) sur la même logique. Pour une lib complète : `npm i express-rate-limit`.
import type { Request, Response, NextFunction } from "express";

export interface RateCheck {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// Cœur PUR/testable : compte les hits par clé dans une fenêtre glissante par expiration.
export class RateCounter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private windowMs: number, private max: number) {}

  check(key: string, nowMs: number): RateCheck {
    let e = this.hits.get(key);
    if (!e || nowMs >= e.resetAt) {
      e = { count: 0, resetAt: nowMs + this.windowMs };
      this.hits.set(key, e);
    }
    e.count++;
    return { allowed: e.count <= this.max, remaining: Math.max(0, this.max - e.count), resetAt: e.resetAt };
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  keyFn?: (req: Request) => string;
}

export function rateLimit(opts: RateLimitOptions) {
  const counter = new RateCounter(opts.windowMs, opts.max);
  const now = opts.now ?? (() => Date.now());
  const keyFn = opts.keyFn ?? ((req: Request) => req.ip || req.socket?.remoteAddress || "unknown");

  return (req: Request, res: Response, next: NextFunction) => {
    const r = counter.check(keyFn(req), now());
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(r.remaining));
    if (!r.allowed) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((r.resetAt - now()) / 1000))));
      return res.status(429).json({ error: "too-many-requests" });
    }
    next();
  };
}
