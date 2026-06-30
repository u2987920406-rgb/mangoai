// Montage de référence de la brique 'RGPD'. En prod, monter requireAuth (brique 'auth') AVANT
// le routeur pour que req.user.id soit posé. Ici getUserId est injectable pour le test/démo.
import express from "express";
import { PrivacyRegistry, type DataSource } from "./registry.js";
import { createMemoryConsentStore, type ConsentStore } from "./consent.js";
import { createPrivacyRouter } from "./privacy.js";
import type { Request } from "express";

export interface PrivacyAppOptions {
  sources?: DataSource[];
  consents?: ConsentStore;
  purposes?: string[];
  getUserId?: (req: Request) => string | undefined;
  now?: () => number;
}

export function createApp(opts: PrivacyAppOptions = {}) {
  const app = express();
  app.use(express.json());

  const registry = new PrivacyRegistry();
  for (const s of opts.sources ?? []) registry.register(s);
  const consents = opts.consents ?? createMemoryConsentStore();

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // En prod : app.use("/api/privacy", requireAuth(process.env.AUTH_SECRET!), createPrivacyRouter({...}))
  app.use(
    "/api/privacy",
    createPrivacyRouter({
      registry,
      consents,
      purposes: opts.purposes,
      getUserId: opts.getUserId,
      now: opts.now,
    }),
  );

  return app;
}
