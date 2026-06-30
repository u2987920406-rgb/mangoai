// Montage de référence de la brique 'securite' : en-têtes → CORS → rate-limit → JSON, puis routes.
// L'ordre compte : les gardes transverses passent AVANT le parsing du corps et les routes métier.
import express from "express";
import { securityHeaders } from "./headers.js";
import { cors } from "./cors.js";
import { rateLimit, type RateLimitOptions } from "./rate-limit.js";
import { validate, object, string } from "./validate.js";

export interface SecurityAppOptions {
  corsOrigins?: string[];
  rateLimit?: RateLimitOptions;
  hsts?: boolean;
}

export function createApp(opts: SecurityAppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");

  app.use(securityHeaders({ hsts: opts.hsts }));
  app.use(cors({ origins: opts.corsOrigins ?? ["http://localhost:5173"] }));
  if (opts.rateLimit) app.use(rateLimit(opts.rateLimit));
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Exemple de route validée à la frontière.
  app.post("/api/echo", validate(object({ name: string({ min: 1, max: 50 }) })), (req, res) => {
    res.json({ name: (req.body as { name: string }).name });
  });

  return app;
}
