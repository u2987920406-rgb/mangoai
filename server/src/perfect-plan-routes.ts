import type { Express } from "express";
import {
  PERFECT_PLAN_QUESTIONS,
  loadContract,
  saveContract,
  deleteContract,
  hasContract,
  selectRelevantQuestions,
  type PerfectPlanAnswer,
  type PerfectPlanRef,
} from "./perfect-plan.js";
import { projectDir } from "./projects.js";

export function registerPerfectPlanRoutes(app: Express): void {
  app.get("/api/perfect-plan/questions", (_req, res) => {
    res.json(PERFECT_PLAN_QUESTIONS);
  });

  // #196 partie B — sélection CIBLÉE (6-8 questions) pour le gate obligatoire,
  // à la place de la banque fixe de 15/30. Repli honnête intégré à
  // selectRelevantQuestions (jamais un throw, jamais un gate bloqué).
  app.post("/api/perfect-plan/questions", async (req, res) => {
    const { description } = req.body as { description?: string };
    if (!description || !description.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }
    const questionIds = await selectRelevantQuestions(description);
    res.json({ questionIds });
  });

  // Statut léger (sans charger tout le contrat) — le gate côté chat interroge
  // ceci avant le premier tour Construire d'un projet neuf (patron ideation.ts).
  app.get("/api/perfect-plan/status/:name", (req, res) => {
    const name = req.params["name"] as string;
    res.json({ done: hasContract(projectDir(name)) });
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
