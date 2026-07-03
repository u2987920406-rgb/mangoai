import type { Express } from "express";
import {
  PERFECT_PLAN_QUESTIONS,
  loadContract,
  saveContract,
  deleteContract,
  type PerfectPlanAnswer,
  type PerfectPlanRef,
} from "./perfect-plan.js";
import { projectDir } from "./projects.js";

export function registerPerfectPlanRoutes(app: Express): void {
  app.get("/api/perfect-plan/questions", (_req, res) => {
    res.json(PERFECT_PLAN_QUESTIONS);
  });

  app.get("/api/perfect-plan/:name", (req, res) => {
    const name = req.params["name"] as string;
    res.json(loadContract(projectDir(name)) ?? null);
  });

  app.post("/api/perfect-plan/:name", (req, res) => {
    const name = req.params["name"] as string;
    const body = req.body as { answers: PerfectPlanAnswer[]; refs?: PerfectPlanRef[]; kind?: "perfect" | "chantier" };
    if (!Array.isArray(body?.answers)) {
      res.status(400).json({ error: "answers required" });
      return;
    }
    saveContract(projectDir(name), {
      answers: body.answers,
      refs: body.refs ?? [],
      ...(body.kind ? { kind: body.kind } : {}),
    });
    res.json({ ok: true });
  });

  app.delete("/api/perfect-plan/:name", (req, res) => {
    const name = req.params["name"] as string;
    deleteContract(projectDir(name));
    res.json({ ok: true });
  });
}
