import type { Express, Request, Response } from "express";
import { projectExists } from "./projects.js";
import { loadReview, saveReview, analyzeAndSave, type ReviewAnswers } from "./build-review.js";

/** Garde le QCM s'il est un objet de paires clé→(string|bool). */
function asAnswers(v: unknown): ReviewAnswers | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: ReviewAnswers = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string" || typeof val === "boolean") out[k] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

export function registerBuildReviewRoutes(app: Express): void {
  app.get("/api/projects/:name/build-review", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) { res.status(404).json({ error: "Projet introuvable" }); return; }
    res.json({ review: loadReview(name) });
  });

  app.post("/api/projects/:name/build-review/rate", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    const { score, comment, answers } = req.body as { score?: unknown; comment?: unknown; answers?: unknown };
    if (!projectExists(name)) { res.status(404).json({ error: "Projet introuvable" }); return; }
    if (typeof score !== "number" || score < 1 || score > 5) {
      res.status(400).json({ error: "score doit être un entier entre 1 et 5" }); return;
    }
    saveReview(name, score, typeof comment === "string" ? comment.trim() : "", asAnswers(answers));
    res.json({ ok: true });
  });

  app.post("/api/projects/:name/build-review/analyze", async (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    const { score, comment, answers } = req.body as { score?: unknown; comment?: unknown; answers?: unknown };
    if (!projectExists(name)) { res.status(404).json({ error: "Projet introuvable" }); return; }
    if (typeof score !== "number" || score < 1 || score > 5) {
      res.status(400).json({ error: "score doit être un entier entre 1 et 5" }); return;
    }
    try {
      const axioms = await analyzeAndSave(
        name,
        score,
        typeof comment === "string" ? comment.trim() : "",
        asAnswers(answers),
      );
      res.json({ ok: true, axiomsExtracted: axioms });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
