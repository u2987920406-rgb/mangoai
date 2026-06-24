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
    const body = (req.body ?? {}) as { k?: number; directions?: string[] };
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    const imgUrl = (file: string) => `/api/taste/${encodeURIComponent(project)}/skin/${file}`;

    try {
      send({ type: "start" });
      const skins = await generateTasteSkins(
        projectDir(project),
        { k: body.k ?? 4, directions: body.directions, outDir: skinsDir(project) },
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
}

export type { SkinRender };
