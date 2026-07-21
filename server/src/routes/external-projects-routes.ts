// #193 — Routes serveur du registre de projets locaux externes (section Code,
// docs/plan-193-section-code.md). Ne fait QUE lire/écrire via les fonctions déjà
// exportées par external-projects.ts — aucune logique de résolution de chemin
// dupliquée ici (même discipline que perimeter-routes.ts).
//
// Gate CODE_SECTION : OFF (défaut) → réponses INERTES (liste vide / 403), jamais
// de 404 sec — cohérent avec le reste du repo (registres additifs jamais bloquants
// à découvrir). C'est /api/code-chat qui porte le vrai effet observable du gate.

import type { Express, Request, Response } from "express";
import { flag } from "../flags.js";
import {
  loadExternalProjects,
  addExternalProject,
  removeExternalProject,
  type ExternalProject,
} from "../external-projects.js";
import type { GrantMode } from "../perimeter.js";

function isGrantMode(v: unknown): v is GrantMode {
  return v === "ro" || v === "rw";
}

export function registerExternalProjectsRoutes(app: Express): void {
  app.get("/api/flags/code-section", (_req: Request, res: Response) => {
    res.json({ enabled: flag("CODE_SECTION") });
  });

  app.get("/api/external-projects", (_req: Request, res: Response) => {
    if (!flag("CODE_SECTION")) {
      res.json({ projects: [] as ExternalProject[] });
      return;
    }
    try {
      res.json({ projects: loadExternalProjects() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/external-projects", (req: Request, res: Response) => {
    if (!flag("CODE_SECTION")) {
      res.status(403).json({ error: "section Code désactivée (CODE_SECTION=off)" });
      return;
    }
    const body = (req.body ?? {}) as { label?: unknown; path?: unknown; mode?: unknown };
    const p = typeof body.path === "string" ? body.path.trim() : "";
    if (!p) {
      res.status(400).json({ error: "path requis" });
      return;
    }
    if (!isGrantMode(body.mode)) {
      res.status(400).json({ error: "mode requis : 'ro' ou 'rw'" });
      return;
    }
    const label = typeof body.label === "string" ? body.label : "";
    try {
      const r = addExternalProject(label, p, body.mode);
      if (!r.ok) {
        res.status(400).json({ error: r.error });
        return;
      }
      res.json({ project: r.project });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/external-projects/:id", (req: Request, res: Response) => {
    if (!flag("CODE_SECTION")) {
      res.status(403).json({ error: "section Code désactivée (CODE_SECTION=off)" });
      return;
    }
    try {
      const projects = removeExternalProject(String(req.params.id));
      res.json({ projects });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
