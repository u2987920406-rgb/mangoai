// Routes projet/aperçu/déploiement : upload multimodal, snap de zone, clic→source,
// aperçus Vite vivants, deploy statique, push GitHub — extraites verbatim de
// index.ts (comportement inchangé). Aucune dépendance du scope d'index.ts capturée.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { projectDir, projectExists } from "../projects.js";
import { saveUpload } from "../uploads.js";
import { externalHistoryDir } from "./code-route.js";
import { isPreviewing, startPreview, previewList } from "../preview.js";
import { snapZone } from "../vision.js";
import { isAgentBusy } from "../agent/agent-lock.js";
import { readSourceSnippet } from "../clicksource.js";
import { ensureErrorRelay } from "../relay.js";
import { deployProject, isDeployTarget } from "../deploy.js";
import { pushToGitHub } from "../github.js";

export function registerPreviewRoutes(app: express.Express): void {

// Multimodal input: stores a user-attached image/PDF under <project>/.assets/
// so the agent can Read it. Raw body (the file bytes), filename in the query.
// Works before the project scaffold exists (first message with attachments).
app.post(
  "/api/upload/:name",
  express.raw({ type: () => true, limit: "26mb" }),
  (req, res) => {
    try {
      // #193 — même branche additive que /api/history/:name : un projet externe
      // n'est jamais dans workspace/. On garde la même philosophie que l'historique
      // (rien n'atterrit dans le dépôt de l'utilisateur, tout reste côté MangoOS).
      const name = req.params.name;
      const dir = name.startsWith("ext:") ? externalHistoryDir(name.slice(4)) : projectDir(name);
      fs.mkdirSync(dir, { recursive: true });
      const relPath = saveUpload(dir, String(req.query.filename ?? ""), req.body as Buffer);
      res.json({ path: relPath });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Snap button: captures a user-drawn zone of the live preview and returns it
// as a base64 PNG that the UI attaches to the next message.
app.post("/api/snap", async (req, res) => {
  const { projectName, viewport, box } = req.body as {
    projectName?: string;
    viewport?: { width?: number; height?: number };
    box?: { x?: number; y?: number; width?: number; height?: number };
  };
  const nums = [viewport?.width, viewport?.height, box?.x, box?.y, box?.width, box?.height];
  if (!projectName?.trim() || nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    res.status(400).json({ error: "projectName, viewport and box are required" });
    return;
  }
  if (!projectExists(projectName)) {
    res.status(404).json({ error: `Project "${projectName}" not found` });
    return;
  }
  const dir = projectDir(projectName);
  // Reusing the running preview is always safe; starting one for a NOT-yet-
  // previewed project while the agent works is not.
  if (isAgentBusy() && !isPreviewing(dir)) {
    res.status(409).json({ error: "L'agent travaille — la capture suivra le projet actif" });
    return;
  }
  try {
    const { url } = await startPreview(dir);
    const buf = await snapZone(
      url,
      viewport as { width: number; height: number },
      box as { x: number; y: number; width: number; height: number },
    );
    res.json({ data: buf.toString("base64") });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Relais clic→source (#5) : le builder a capté un data-mango-src (fichier:ligne)
// via le clic en mode inspection ; il demande ici l'extrait de code pointé (pour
// l'afficher et, plus tard #6, alimenter l'édition chirurgicale via la Coque Rigide).
app.post("/api/inspect", (req, res) => {
  const { projectName, src } = req.body as { projectName?: string; src?: string };
  if (!projectName?.trim() || !src?.trim()) {
    res.status(400).json({ error: "projectName and src are required" });
    return;
  }
  if (!projectExists(projectName)) {
    res.status(404).json({ error: `Project "${projectName}" not found` });
    return;
  }
  const result = readSourceSnippet(projectDir(projectName), src);
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

// Liste des aperçus Vite vivants (surface « aperçus simultanés » #138-P2 :
// permet d'afficher plusieurs apps de la Suite côte à côte, chacune sur son port).
app.get("/api/preview", (_req, res) => {
  res.json({ previews: previewList() });
});

// Start (or reuse) the live preview of an existing project — lets the UI
// restore the preview on page load without sending a message first
app.post("/api/preview/:name", async (req, res) => {
  const name = req.params.name;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "Agent is working — preview follows the active project" });
    return;
  }
  try {
    const dir = projectDir(name);
    ensureErrorRelay(dir);
    const { url } = await startPreview(dir);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One-click deploy to a static host — Cloudflare/Vercel/Netlify (build + upload)
app.post("/api/deploy/:name", async (req, res) => {
  const name = req.params.name;
  const target = (req.body as { target?: unknown })?.target ?? "cloudflare";
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (!isDeployTarget(target)) {
    res.status(400).json({ error: `Cible de déploiement inconnue : ${String(target)}` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "L'agent travaille — attends la fin avant de publier" });
    return;
  }
  try {
    const { url } = await deployProject(projectDir(name), name, target);
    res.json({ url, target });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One-click push to GitHub (creates the repo if needed, force-pushes history)
app.post("/api/github/:name", async (req, res) => {
  const name = req.params.name as string;
  const body = req.body as { private?: boolean; targetRepo?: string };
  const isPrivate = body?.private !== false;
  // targetRepo: optional custom repo name (e.g. "Projet-valid-"); persisted per project.
  const targetFile = path.join(projectDir(name), ".github-target");
  let targetRepo = body?.targetRepo?.trim() || undefined;
  if (targetRepo) {
    fs.writeFileSync(targetFile, targetRepo, "utf8");
  } else {
    try { targetRepo = fs.readFileSync(targetFile, "utf8").trim() || undefined; } catch { /* no target */ }
  }
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "L'agent travaille — attends la fin avant de publier sur GitHub" });
    return;
  }
  try {
    const { url } = await pushToGitHub(projectDir(name), name, isPrivate, targetRepo);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

}
