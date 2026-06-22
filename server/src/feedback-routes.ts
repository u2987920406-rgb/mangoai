// Feedback, escalation and transcription routes.
// All routes are self-contained (no agentBusy, no SSE).
import multer from "multer";
import type { Express, Request, Response } from "express";
import { processFeedback, checkAndUpdateStreak, resetStreak, processEscalationReference, type FeedbackRating } from "./feedback.js";
import { transcribeAudio } from "./transcribe.js";
import { WORKSPACE_DIR } from "./projects.js";
import { chatEleve } from "./eleve.js";

const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function registerFeedbackRoutes(app: Express): void {
  // Interrupt the agent currently working (if any)
  app.post("/api/feedback", async (req: Request, res: Response) => {
    const { projectName, rating, text, model } = req.body as { projectName?: string; rating?: string; text?: string; model?: string };
    if (!projectName || !text || (rating !== "like" && rating !== "dislike")) {
      res.status(400).json({ error: "projectName, text et rating (like|dislike) requis" });
      return;
    }
    const escalate = checkAndUpdateStreak(projectName, rating as FeedbackRating);
    res.json({ ok: true, escalate });
    // Souveraineté : un pouce sur une réponse de l'Élève (GLM) est traité PAR GLM
    // (extraction de l'axiome), jamais par Claude — la boucle reste GLM + Mango.
    const ask = model === "eleve" ? (system: string, prompt: string) => chatEleve(system, prompt) : undefined;
    // Traitement en arrière-plan — ne bloque pas l'UI
    processFeedback(WORKSPACE_DIR, rating as FeedbackRating, text, projectName, ask).catch((err) =>
      console.error("[feedback]", err instanceof Error ? err.message : err)
    );
  });

  // Idée #43 — Escalade par signal humain : l'utilisateur fournit une référence
  // visuelle après 2 👎 consécutifs → axiome [validé-utilisateur] sur son goût.
  app.post("/api/escalation-reference", async (req: Request, res: Response) => {
    const { projectName, referenceText } = req.body as { projectName?: string; referenceText?: string };
    if (!projectName?.trim() || !referenceText?.trim()) {
      res.status(400).json({ error: "projectName et referenceText requis" });
      return;
    }
    res.json({ ok: true });
    resetStreak(projectName);
    processEscalationReference(WORKSPACE_DIR, projectName, referenceText).catch((err) =>
      console.error("[escalation]", err instanceof Error ? err.message : err)
    );
  });

  app.post("/api/transcribe", audioUpload.single("audio"), async (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ error: "Aucun fichier audio reçu" }); return; }
    try {
      const text = await transcribeAudio(req.file.buffer, req.file.mimetype);
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
