// Exemple de montage de la brique 'auth' sur un backend Express (cf. templates/backend).
// Sert de référence pour le RECIPE et de cible pour le test. createApp est une factory
// pour pouvoir instancier l'app dans un test sans écouter un port fixe.
import express from "express";
import { createAuthRouter, requireAuth } from "./auth.js";

export function createApp(secret: string = process.env.AUTH_SECRET ?? "dev-secret-change-me") {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", createAuthRouter({ secret }));
  app.get("/api/me", requireAuth(secret), (req, res) => res.json({ user: req.user }));

  return app;
}

// Lancement direct (npm run dev) — pas pendant les tests.
if (process.env.NODE_ENV !== "test" && process.argv[1]?.includes("example")) {
  const PORT = Number(process.env.PORT ?? 3001);
  createApp().listen(PORT, "127.0.0.1", () => console.log(`auth demo on http://127.0.0.1:${PORT}`));
}
