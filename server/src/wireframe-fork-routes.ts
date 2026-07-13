// Routes de la fourche visuelle multi-wireframes (2026-07-13) — génération des 3
// variantes (image + rationale) et persistance du choix, patron EXACT
// perfect-plan-routes.ts (REST découplé du tour SSE /api/chat, pas de matching de
// texte libre — le choix est envoyé comme donnée structurée par le frontend).
import type { Express } from "express";
import {
  generateAndRenderVariants,
  saveWireframeChoice,
  loadWireframeChoice,
  deleteWireframeChoice,
  type LayoutSpec,
} from "./wireframe-fork.js";
import { projectDir } from "./projects.js";

export function registerWireframeForkRoutes(app: Express): void {
  // Endpoint autonome (debug/tests manuels) — le flux réel passe par le tour de
  // chat (chat-route.ts), qui appelle la MÊME fonction generateAndRenderVariants.
  app.post("/api/wireframe-fork/generate", async (req, res) => {
    const { intention } = req.body as { intention?: string };
    if (!intention || !intention.trim()) {
      res.status(400).json({ error: "intention is required" });
      return;
    }
    try {
      const variants = await generateAndRenderVariants(intention);
      res.json({ variants });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/wireframe-fork/:name", (req, res) => {
    const name = req.params["name"] as string;
    res.json(loadWireframeChoice(projectDir(name)) ?? null);
  });

  app.post("/api/wireframe-fork/:name", (req, res) => {
    const name = req.params["name"] as string;
    const body = req.body as { spec?: LayoutSpec };
    if (!body?.spec || !Array.isArray(body.spec.regions)) {
      res.status(400).json({ error: "spec required" });
      return;
    }
    saveWireframeChoice(projectDir(name), body.spec);
    res.json({ ok: true });
  });

  app.delete("/api/wireframe-fork/:name", (req, res) => {
    const name = req.params["name"] as string;
    deleteWireframeChoice(projectDir(name));
    res.json({ ok: true });
  });
}
