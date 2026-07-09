// Routes /api/projects* (liste, suppression, plan de chantier Kanban) — extraites
// verbatim de index.ts (comportement inchangé). Handlers déplacés à l'identique ;
// aucune dépendance du scope d'index.ts n'était capturée (tout est import module).
import express from "express";
import path from "node:path";
import { deleteProject, listProjects, listTemplates, projectDir, projectExists } from "../projects.js";
import { loadReview } from "../build-review.js";
import { previewStatus, isPreviewing, stopPreview } from "../preview.js";
import { githubConfigured } from "../github.js";
import { loadPlan, replaceIncrements, loadFluxCounts } from "../project-plan.js";

export function registerProjectsRoutes(app: express.Express): void {

app.get("/api/projects", (_req, res) => {
  const projects = listProjects();
  // #93 — la note de revue utilisateur (1-5) par projet, pour afficher les étoiles
  // dans « Mes projets » (vision directe : revu ? + combien d'étoiles). Léger : lit
  // le .build-review.json de chaque projet ; absent → le projet n'est pas dans la map.
  const reviews: Record<string, { score: number }> = {};
  for (const name of projects) {
    const r = loadReview(name);
    if (r && typeof r.score === "number" && r.score > 0) reviews[name] = { score: r.score };
  }
  res.json({
    projects,
    reviews,
    templates: listTemplates(),
    preview: previewStatus(),
    githubEnabled: githubConfigured(),
  });
});

app.delete("/api/projects/:name", async (req, res) => {
  const name = req.params["name"] as string;
  try {
    // Si l'aperçu tourne sur CE projet, l'arrêter d'abord : sinon le dev server
    // Vite garde le dossier verrouillé (Windows) et rmSync échoue.
    const dir = path.resolve(projectDir(name));
    if (isPreviewing(dir)) {
      await stopPreview(dir);
    }
    deleteProject(name);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// #139 Gros Projet — le manifest d'orchestration (.project-plan.json) lu par le
// Kanban du cockpit. `plan` = null tant qu'aucun squelette n'a été scaffoldé ;
// `flux` = compteurs de cohérence de l'Auditeur de Flux (MangoQA) si présents.
app.get("/api/projects/:name/plan", (req, res) => {
  const name = req.params["name"] as string;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  const dir = projectDir(name);
  res.json({ plan: loadPlan(dir), flux: loadFluxCounts(dir) });
});

// Édition Kanban : réordre / ajout / renommage des incréments (PAS le build, qui
// passe par /api/chat avec mode:"projet"). Le squelette n'est jamais touché ici.
app.put("/api/projects/:name/plan", (req, res) => {
  const name = req.params["name"] as string;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  const { increments } = req.body as { increments?: unknown };
  const plan = replaceIncrements(projectDir(name), increments);
  if (!plan) {
    res.status(409).json({ error: "Aucun plan de chantier pour ce projet (squelette pas encore posé)." });
    return;
  }
  res.json({ plan });
});

}
