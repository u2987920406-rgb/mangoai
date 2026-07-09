// Routes /api/image/* (galerie Krea + envoi vers projet) — extraites verbatim de
// index.ts (comportement inchangé). Anti path-traversal strict conservé.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_DIR, projectExists, projectDir } from "../projects.js";
import { generateKreaImage } from "../krea.js";
import { slugify as fluxSlugify } from "../eleve-tools/eleve-flux-tools.js";

const IMAGES_DIR = path.join(WORKSPACE_DIR, ".images");
const IMAGE_NAME_RE = /^[a-z0-9][a-z0-9._-]*.png$/i;

export function registerImagesRoutes(app: express.Express): void {

app.post("/api/image/generate", async (req, res) => {
  const { prompt, aspectRatio, resolution, project } = (req.body ?? {}) as {
    prompt?: string; aspectRatio?: string; resolution?: string; project?: string;
  };
  const p = String(prompt ?? "").trim();
  if (!p) return res.status(400).json({ error: "prompt requis" });
  if (project && !projectExists(project)) return res.status(400).json({ error: "projet inconnu" });

  const r = await generateKreaImage({ prompt: p, aspectRatio, resolution });
  if (!r.ok) return res.status(r.status && r.status >= 400 ? r.status : 502).json({ error: r.error });

  const name = `${Date.now()}-${fluxSlugify(p)}.png`;
  if (project) {
    const abs = path.join(projectDir(project), "public", "generated", name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, r.bytes);
    return res.json({ name, project, url: `/generated/${name}`, ms: r.ms });
  }
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMAGES_DIR, name), r.bytes);
  res.json({ name, url: `/api/image/file/${name}`, ms: r.ms });
});

app.get("/api/image/list", (_req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) return res.json({ images: [] });
    const images = fs
      .readdirSync(IMAGES_DIR)
      .filter((f) => IMAGE_NAME_RE.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(IMAGES_DIR, f));
        return { name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ images });
  } catch {
    res.json({ images: [] });
  }
});

app.get("/api/image/file/:name", (req, res) => {
  const name = String(req.params.name ?? "");
  if (!IMAGE_NAME_RE.test(name)) return res.status(400).json({ error: "nom invalide" });
  const abs = path.resolve(IMAGES_DIR, name);
  if (!abs.startsWith(path.resolve(IMAGES_DIR)) || !fs.existsSync(abs)) return res.status(404).json({ error: "introuvable" });
  res.sendFile(abs);
});

app.post("/api/image/send-to-project", (req, res) => {
  const { name, project } = (req.body ?? {}) as { name?: string; project?: string };
  if (!name || !IMAGE_NAME_RE.test(name)) return res.status(400).json({ error: "nom invalide" });
  if (!project || !projectExists(project)) return res.status(400).json({ error: "projet inconnu" });
  const src = path.resolve(IMAGES_DIR, name);
  if (!src.startsWith(path.resolve(IMAGES_DIR)) || !fs.existsSync(src)) return res.status(404).json({ error: "introuvable" });
  const dst = path.join(projectDir(project), "public", "generated", name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  res.json({ project, url: `/generated/${name}` });
});
}
