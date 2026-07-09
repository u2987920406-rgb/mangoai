// Œil-Coach (#152) — route SSE. Le bouton « Coach design » du workspace lance la boucle
// critique → corrige → re-regarde sur le projet ouvert ; tout est streamé dans le chat.

import type { Express, Request, Response } from "express";
import { projectDir, projectExists, WORKSPACE_DIR } from "../projects.js";
import { buildJudgeContext } from "../taste/taste-judge.js";
import { runDesignCoach } from "./design-coach.js";

// Verrou par projet : la boucle ÉDITE le projet (runRelay) → pas de coach concurrent.
const inFlight = new Set<string>();

export function registerDesignCoachRoutes(app: Express): void {
  app.post("/api/design-coach/:project", async (req: Request, res: Response) => {
    const project = req.params["project"] as string;
    if (!project || !projectExists(project)) {
      res.status(404).json({ error: "projet introuvable" });
      return;
    }
    if (inFlight.has(project)) {
      res.status(409).json({ error: "un coach design est déjà en cours sur ce projet" });
      return;
    }
    const body = (req.body ?? {}) as { threshold?: number; maxRounds?: number };
    const threshold = Math.min(100, Math.max(50, Math.floor(body.threshold ?? 85)));
    const maxRounds = Math.min(5, Math.max(1, Math.floor(body.maxRounds ?? 3)));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);

    inFlight.add(project);
    try {
      send({ type: "start", project, threshold, maxRounds });
      const ctx = buildJudgeContext(WORKSPACE_DIR, project);
      const result = await runDesignCoach(
        projectDir(project),
        { threshold, maxRounds },
        ctx,
        (ev) => send(ev),
      );
      send({
        type: "done",
        before: result.before.overall,
        after: result.after.overall,
        rounds: result.rounds,
        reason: result.reason,
        lensesBefore: result.before.lenses,
        lensesAfter: result.after.lenses,
      });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight.delete(project);
      res.end();
    }
  });
}
