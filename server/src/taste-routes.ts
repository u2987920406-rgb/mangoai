// Moteur de Goût (#149) — routes cockpit.
//  POST /api/taste/:project/generate  → SSE : streame chaque skin rendu (galerie)
//  GET  /api/taste/:project/skin/:file → sert l'image JPEG d'un skin
//  POST /api/taste/:project/choose     → distille le choix en axiome de goût (souverain GLM)

import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { chatEleve } from "./eleve.js";
import { processFeedback } from "./feedback.js";
import { generateTasteSkins, type SkinRender } from "./taste-render.js";
import { judgeSkins, buildJudgeContext } from "./taste-judge.js";
import { listPending, getRun, decideRun, runSkinsDir } from "./taste-queue.js";
import {
  loadTasteNocturnalConfig, saveTasteNocturnalConfig, runNocturnalTasteBatch,
  type TasteNocturnalConfig,
} from "./taste-nocturnal.js";
import { tasteReviewPage } from "./taste-review-page.js";

function skinsDir(project: string): string {
  return path.join(projectDir(project), ".skins");
}

/** Distille le choix de l'utilisateur en axiome de GOÛT VISUEL (réutilise le canal souverain). */
async function distillTaste(
  project: string,
  chosen: { id: string; name: string; palette: string[] },
  shown: string[],
  note: string,
  ask?: (system: string, prompt: string) => Promise<string>,
): Promise<void> {
  const msg = [
    "PRÉFÉRENCE ESTHÉTIQUE (goût visuel de l'utilisateur — pas une opinion technique).",
    shown.length ? `Parmi les directions proposées : ${shown.join(", ")}.` : "",
    `Il a CHOISI : « ${chosen.name} »${chosen.palette.length ? ` (palette ${chosen.palette.slice(0, 6).join(", ")})` : ""}.`,
    note ? `Sa remarque : « ${note} ».` : "",
    "Extrais UN axiome de goût visuel réutilisable (catégorie VISION ou UIUX), abstrait et applicable aux futurs projets.",
  ].filter(Boolean).join("\n");
  await processFeedback(WORKSPACE_DIR, "like", msg, project, ask);
}

export function registerTasteRoutes(app: Express): void {
  // Génération + rendu des skins, streamés en SSE.
  app.post("/api/taste/:project/generate", async (req: Request, res: Response) => {
    const project = req.params["project"] as string;
    if (!project || !projectExists(project)) {
      res.status(404).json({ error: "projet introuvable" });
      return;
    }
    const body = (req.body ?? {}) as { k?: number; directions?: string[]; maille?: "skin" | "hero" };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    const imgUrl = (file: string) => `/api/taste/${encodeURIComponent(project)}/skin/${file}`;

    try {
      send({ type: "start" });
      const skins = await generateTasteSkins(
        projectDir(project),
        { k: body.k ?? 4, directions: body.directions, maille: body.maille, outDir: skinsDir(project) },
        (ev) => {
          if (ev.type === "skin" && ev.skin?.file) ev.skin.image = imgUrl(ev.skin.file);
          send(ev);
        },
      );
      for (const s of skins) if (s.ok && s.file) s.image = imgUrl(s.file);

      // Juge-pixels (#149 v2) — l'œil note et trie les variantes selon le goût
      // appris, AVANT le choix. Opt-out TASTE_JUDGE=off. Jamais bloquant.
      if (process.env.TASTE_JUDGE !== "off") {
        try {
          send({ type: "status", text: "L'œil note les variantes…" });
          const ctx = buildJudgeContext(WORKSPACE_DIR, project);
          await judgeSkins(skinsDir(project), skins, ctx);
        } catch (e) {
          console.error("[taste] juge:", e instanceof Error ? e.message : e);
        }
      }
      send({ type: "done", skins });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  });

  // Sert l'image d'un skin (anti path-traversal : basename .jpg uniquement).
  app.get("/api/taste/:project/skin/:file", (req: Request, res: Response) => {
    const project = req.params["project"] as string;
    const file = req.params["file"] as string;
    if (!project || !projectExists(project)) { res.status(404).end(); return; }
    if (!file || !/^[a-z0-9-]+\.jpg$/i.test(file)) { res.status(400).end(); return; }
    const p = path.resolve(path.join(skinsDir(project), file));
    if (!p.startsWith(path.resolve(skinsDir(project)) + path.sep) || !fs.existsSync(p)) { res.status(404).end(); return; }
    // .skins commence par un point → sans dotfiles:"allow", send() refuse le chemin (404 silencieux).
    res.sendFile(p, { dotfiles: "allow" });
  });

  // Choix de l'utilisateur → axiome de goût (souverain GLM si model==="eleve").
  app.post("/api/taste/:project/choose", async (req: Request, res: Response) => {
    const project = req.params["project"] as string;
    const body = (req.body ?? {}) as { chosenId?: string; chosenName?: string; palette?: string[]; shown?: string[]; note?: string; model?: string };
    if (!project || !projectExists(project) || !body.chosenId) {
      res.status(400).json({ error: "projet + chosenId requis" });
      return;
    }
    res.json({ ok: true });
    const ask = body.model === "eleve" ? (s: string, p: string) => chatEleve(s, p) : undefined;
    distillTaste(
      project,
      { id: body.chosenId, name: body.chosenName ?? body.chosenId, palette: body.palette ?? [] },
      body.shown ?? [],
      body.note ?? "",
      ask,
    ).catch((err) => console.error("[taste]", err instanceof Error ? err.message : err));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Curation ASYNCHRONE (#149 v2) — file d'attente + validation mobile (LAN).
  // ───────────────────────────────────────────────────────────────────────────

  // Runs de goût en attente de la décision de Raf (vue allégée pour la boîte mobile).
  app.get("/api/taste/pending", (_req: Request, res: Response) => {
    res.json(listPending());
  });

  // Un run complet (variantes notées + URLs d'images run-scopées).
  app.get("/api/taste/run/:runId", (req: Request, res: Response) => {
    const runId = req.params["runId"] as string;
    const run = getRun(runId);
    if (!run) { res.status(404).json({ error: "run introuvable" }); return; }
    const withUrls = {
      ...run,
      skins: run.skins.map((s) => (s.ok && s.file
        ? { ...s, image: `/api/taste/run/${encodeURIComponent(runId)}/skin/${s.file}` }
        : s)),
    };
    res.json(withUrls);
  });

  // Sert le JPEG d'une variante d'un run (.skins/<runId>/<file>, anti path-traversal).
  app.get("/api/taste/run/:runId/skin/:file", (req: Request, res: Response) => {
    const runId = req.params["runId"] as string;
    const file = req.params["file"] as string;
    const run = getRun(runId);
    if (!run) { res.status(404).end(); return; }
    if (!file || !/^[a-z0-9-]+\.jpg$/i.test(file)) { res.status(400).end(); return; }
    const dir = runSkinsDir(run.project, runId);
    const p = path.resolve(path.join(dir, file));
    if (!p.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(p)) { res.status(404).end(); return; }
    res.sendFile(p, { dotfiles: "allow" }); // .skins est un dotfile
  });

  // Décision de Raf sur un run → axiome de goût souverain (GLM) + run "decided".
  app.post("/api/taste/run/:runId/decide", (req: Request, res: Response) => {
    const runId = req.params["runId"] as string;
    const body = (req.body ?? {}) as { chosenId?: string; note?: string };
    if (!body.chosenId) { res.status(400).json({ error: "chosenId requis" }); return; }
    const result = decideRun(runId, body.chosenId, body.note);
    if (!result.ok) {
      const code = result.reason === "not-found" ? 404 : result.reason === "already-decided" ? 409 : 400;
      res.status(code).json({ error: result.reason });
      return;
    }
    res.json({ ok: true });
    // Distillation souveraine (GLM) en fire-and-forget, hors du chemin de réponse.
    const run = result.run!;
    const chosen = run.skins.find((s) => s.id === body.chosenId);
    distillTaste(
      run.project,
      { id: body.chosenId, name: chosen?.name ?? body.chosenId, palette: chosen?.palette ?? [] },
      run.skins.map((s) => s.name),
      body.note ?? "",
      (s, p) => chatEleve(s, p),
    ).catch((err) => console.error("[taste]", err instanceof Error ? err.message : err));
  });

  // Déclencheur manuel de la curation nocturne (test / à la demande).
  app.post("/api/taste/nocturnal/run", (_req: Request, res: Response) => {
    const cfg = loadTasteNocturnalConfig();
    res.json({ ok: true, started: true });
    runNocturnalTasteBatch(cfg).catch((err) => console.error("[taste-nocturnal]", err instanceof Error ? err.message : err));
  });

  // Config de la curation nocturne (enabled/hour/count/maille/k/ntfyTopic).
  app.get("/api/taste/nocturnal/config", (_req: Request, res: Response) => {
    res.json(loadTasteNocturnalConfig());
  });
  app.put("/api/taste/nocturnal/config", (req: Request, res: Response) => {
    const cur = loadTasteNocturnalConfig();
    const b = (req.body ?? {}) as Partial<TasteNocturnalConfig>;
    const next: TasteNocturnalConfig = {
      ...cur,
      enabled: typeof b.enabled === "boolean" ? b.enabled : cur.enabled,
      hour: typeof b.hour === "number" ? Math.min(23, Math.max(0, Math.floor(b.hour))) : cur.hour,
      count: typeof b.count === "number" ? Math.min(10, Math.max(1, Math.floor(b.count))) : cur.count,
      k: typeof b.k === "number" ? Math.min(6, Math.max(2, Math.floor(b.k))) : cur.k,
      maille: b.maille === "skin" || b.maille === "hero" ? b.maille : cur.maille,
      ntfyTopic: typeof b.ntfyTopic === "string" ? b.ntfyTopic.trim() : cur.ntfyTopic,
    };
    saveTasteNocturnalConfig(next);
    res.json(next);
  });

  // Page de validation MOBILE (servie par Express, ouverte depuis le téléphone en LAN).
  app.get("/taste/review", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(tasteReviewPage());
  });
}

export type { SkinRender };
