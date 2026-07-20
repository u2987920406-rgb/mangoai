// Idée #56 — Système Tutorial Orchestral (Chantier A : squelette).
// 10 tutoriels progressifs (liberté 0% → 100%) qui font VIVRE les capacités
// réelles de MangoOS sur de vrais projets — pas une démo fictive. Double
// apprentissage : Raf apprend MangoOS pendant que MangoOS apprend Raf (les
// feedbacks → axiomes tagués viennent au Chantier C).
//
// Ce module porte les DÉFINITIONS (méta + étapes des tutos 1-2) et la
// PERSISTANCE de la progression (workspace-level, un seul "élève" = Raf),
// stockée dans workspace/.tutorial-progress.json — cohérent avec les autres
// magasins (.preferences.md, .axioms.md). Style calqué sur preferences.ts :
// lecture tolérante, jamais de throw.
import path from "node:path";
import fs from "node:fs";
import type { Express, Request, Response } from "express";
import { atomicWriteFileSync } from "./safe-io.js";
import { WORKSPACE_DIR } from "./projects.js";
import { processTutorialFeedback, loadTutorialAxioms } from "./tutorial-feedback.js";
import type { FeedbackRating } from "./feedback.js";

export const TUTORIAL_PROGRESS_FILE = ".tutorial-progress.json";
export const TUTORIAL_COUNT = 10;

import {
  type TutorialAction,
  type TutorialStep,
  type TutorialDefinition,
  TUTORIALS,
} from "./tutorial-content.js";
// Réexporté pour que les fichiers qui importent déjà `from "./tutorial.js"`
// (index.ts, routes/chat-route.ts, tests) restent inchangés.
export { type TutorialAction, type TutorialStep, type TutorialDefinition } from "./tutorial-content.js";

export interface TutorialMeta {
  id: number;
  title: string;
  mode?: "mvp" | "elite" | "finition";
  freedomLevel: number;
  durationLabel: string;
  stepCount: number;
}

export interface TutorialProgress {
  currentTutorial: number; // tuto en cours (1-10)
  completedTutorials: number[]; // ids terminés
  steps: Record<string, string[]>; // tutorialId -> stepIds complétés
  startedAt: string;
  lastActivity: string;
}

// ── Accès aux définitions ────────────────────────────────────────────────────

/** Métadonnées de tous les tutoriels (sans le détail des étapes). */
export function getAllTutorials(): TutorialMeta[] {
  return TUTORIALS.map(({ id, title, mode, freedomLevel, durationLabel, steps }) => ({
    id,
    title,
    mode,
    freedomLevel,
    durationLabel,
    stepCount: steps.length,
  }));
}

/** Définition complète d'un tutoriel (avec ses étapes), ou null si inconnu. */
export function getTutorial(id: number): TutorialDefinition | null {
  return TUTORIALS.find((t) => t.id === id) ?? null;
}

// ── Persistance de la progression ────────────────────────────────────────────

export function defaultProgress(): TutorialProgress {
  const now = new Date().toISOString();
  return {
    currentTutorial: 1,
    completedTutorials: [],
    steps: {},
    startedAt: now,
    lastActivity: now,
  };
}

function progressPath(workspaceDir: string): string {
  return path.join(workspaceDir, TUTORIAL_PROGRESS_FILE);
}

/** Lecture tolérante : fichier absent ou corrompu → progression par défaut. */
export function loadProgress(workspaceDir: string): TutorialProgress {
  try {
    const raw = fs.readFileSync(progressPath(workspaceDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    return normalizeProgress(parsed);
  } catch {
    return defaultProgress();
  }
}

/** Borne les champs au cas où le fichier aurait été édité à la main. */
function normalizeProgress(p: Partial<TutorialProgress>): TutorialProgress {
  const base = defaultProgress();
  const completed = Array.isArray(p.completedTutorials)
    ? p.completedTutorials.filter((n) => typeof n === "number" && n >= 1 && n <= TUTORIAL_COUNT)
    : [];
  const current =
    typeof p.currentTutorial === "number" && p.currentTutorial >= 1 && p.currentTutorial <= TUTORIAL_COUNT
      ? p.currentTutorial
      : 1;
  const steps =
    p.steps && typeof p.steps === "object" && !Array.isArray(p.steps)
      ? (p.steps as Record<string, string[]>)
      : {};
  return {
    currentTutorial: current,
    completedTutorials: [...new Set(completed)].sort((a, b) => a - b),
    steps,
    startedAt: typeof p.startedAt === "string" ? p.startedAt : base.startedAt,
    lastActivity: typeof p.lastActivity === "string" ? p.lastActivity : base.lastActivity,
  };
}

export function saveProgress(workspaceDir: string, p: TutorialProgress): void {
  fs.mkdirSync(workspaceDir, { recursive: true });
  const next = { ...p, lastActivity: new Date().toISOString() };
  atomicWriteFileSync(progressPath(workspaceDir), JSON.stringify(next, null, 2));
}

/** Marque une étape comme complétée (idempotent) et persiste. */
export function markStepComplete(workspaceDir: string, tutorialId: number, stepId: string): TutorialProgress {
  const progress = loadProgress(workspaceDir);
  const key = String(tutorialId);
  const done = new Set(progress.steps[key] ?? []);
  done.add(stepId);
  progress.steps[key] = [...done];
  if (progress.currentTutorial < tutorialId) progress.currentTutorial = tutorialId;
  saveProgress(workspaceDir, progress);
  return progress;
}

/** Marque un tutoriel comme terminé (idempotent) et avance le curseur. */
export function markTutorialComplete(workspaceDir: string, tutorialId: number): TutorialProgress {
  const progress = loadProgress(workspaceDir);
  const completed = new Set(progress.completedTutorials);
  completed.add(tutorialId);
  progress.completedTutorials = [...completed].sort((a, b) => a - b);
  progress.currentTutorial = Math.min(tutorialId + 1, TUTORIAL_COUNT);
  saveProgress(workspaceDir, progress);
  return progress;
}

/** Prochain tutoriel non terminé (1-10), ou null si tous terminés. */
export function nextTutorialId(progress: TutorialProgress): number | null {
  for (let id = 1; id <= TUTORIAL_COUNT; id++) {
    if (!progress.completedTutorials.includes(id)) return id;
  }
  return null;
}

// ── Routes HTTP ──────────────────────────────────────────────────────────────

export function registerTutorialRoutes(app: Express): void {
  // Liste méta de tous les tutoriels.
  app.get("/api/tutorials", (_req: Request, res: Response) => {
    res.json({ tutorials: getAllTutorials() });
  });

  // Progression courante (+ prochain tuto à faire). DOIT précéder /:id sinon
  // "progress" serait capturé comme un :id.
  app.get("/api/tutorial/progress", (_req: Request, res: Response) => {
    const progress = loadProgress(WORKSPACE_DIR);
    res.json({ progress, nextTutorialId: nextTutorialId(progress) });
  });

  // Retour utilisateur à un checkpoint → axiome tagué [tutoriel-N] (#41 RLHF).
  // Fire-and-forget : on répond tout de suite, la synthèse tourne en tâche de fond.
  app.post("/api/tutorial/feedback", (req: Request, res: Response) => {
    const body = req.body as { tutorialId?: unknown; stepId?: unknown; rating?: unknown; comment?: unknown };
    const tutorialId = typeof body.tutorialId === "number" ? body.tutorialId : NaN;
    const stepId = typeof body.stepId === "string" ? body.stepId : "";
    const rating = body.rating === "like" || body.rating === "dislike" ? (body.rating as FeedbackRating) : null;
    if (!Number.isFinite(tutorialId) || !stepId || !rating) {
      res.status(400).json({ error: "tutorialId, stepId et rating (like|dislike) sont requis" });
      return;
    }
    const comment = typeof body.comment === "string" ? body.comment : undefined;
    void processTutorialFeedback(WORKSPACE_DIR, { tutorialId, stepId, rating, comment });
    res.json({ ok: true });
  });

  // Bilan de "connaissance mutuelle" pour la RelationshipCard : tutos terminés
  // + ce que MangoOS a réellement appris (axiomes tagués tutoriel).
  app.get("/api/tutorial/relationship", (_req: Request, res: Response) => {
    const progress = loadProgress(WORKSPACE_DIR);
    res.json({
      completed: progress.completedTutorials.length,
      total: TUTORIAL_COUNT,
      learned: loadTutorialAxioms(WORKSPACE_DIR),
    });
  });

  // Définition complète d'un tutoriel.
  app.get("/api/tutorial/:id", (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const tutorial = getTutorial(id);
    if (!tutorial) {
      res.status(404).json({ error: `Tutoriel ${req.params.id} introuvable` });
      return;
    }
    res.json({ tutorial });
  });

  // Mise à jour partielle de la progression. Actions reconnues dans le body :
  //   { stepComplete: { tutorialId, stepId } }  → marque une étape
  //   { tutorialComplete: tutorialId }          → marque un tuto terminé
  //   { currentTutorial: id }                   → déplace le curseur
  app.post("/api/tutorial/progress", (req: Request, res: Response) => {
    const body = req.body as {
      stepComplete?: { tutorialId?: unknown; stepId?: unknown };
      tutorialComplete?: unknown;
      currentTutorial?: unknown;
    };

    let progress = loadProgress(WORKSPACE_DIR);

    if (
      body.stepComplete &&
      typeof body.stepComplete.tutorialId === "number" &&
      typeof body.stepComplete.stepId === "string"
    ) {
      progress = markStepComplete(WORKSPACE_DIR, body.stepComplete.tutorialId, body.stepComplete.stepId);
    }

    if (typeof body.tutorialComplete === "number") {
      progress = markTutorialComplete(WORKSPACE_DIR, body.tutorialComplete);
    }

    if (
      typeof body.currentTutorial === "number" &&
      body.currentTutorial >= 1 &&
      body.currentTutorial <= TUTORIAL_COUNT
    ) {
      progress.currentTutorial = body.currentTutorial;
      saveProgress(WORKSPACE_DIR, progress);
    }

    res.json({ progress, nextTutorialId: nextTutorialId(progress) });
  });
}
