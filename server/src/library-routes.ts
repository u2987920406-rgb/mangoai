// Library routes: cross-project component library (#36) and reference bank (#50).
// All routes are self-contained (no agentBusy, no SSE).
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Express, Request, Response } from "express";
import { listComponents, loadComponent, saveComponent, deleteComponent, isSafeComponentName, type ComponentEntry } from "./components.js";
import { listReferences, loadReference, saveReference, deleteReference, referenceImagePath, type ReferenceMeta } from "./references.js";
import { WORKSPACE_DIR } from "./projects.js";

// Image upload middleware for references (10 MB limit, memory storage)
const refImageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function registerLibraryRoutes(app: Express): void {
  // ── Idée #36 — Bibliothèque de composants inter-projets ──────────────────────

  // List all component metas
  app.get("/api/components", (_req: Request, res: Response) => {
    res.json({ components: listComponents(WORKSPACE_DIR) });
  });

  // Get a single component (meta + code)
  app.get("/api/components/:name", (req: Request, res: Response) => {
    // (Un, 2026-07-03) U1 — :name brut dans path.join = lecture hors .components
    if (!isSafeComponentName(req.params["name"] as string)) {
      res.status(400).json({ error: "nom de composant invalide" });
      return;
    }
    const entry = loadComponent(WORKSPACE_DIR, req.params["name"] as string);
    if (!entry) {
      res.status(404).json({ error: `Composant "${req.params["name"] as string}" introuvable` });
      return;
    }
    res.json(entry);
  });

  // Create or update a component (manual from the UI)
  app.post("/api/components", (req: Request, res: Response) => {
    const { meta, code } = req.body as Partial<ComponentEntry>;
    if (!meta?.name?.trim() || !code?.trim()) {
      res.status(400).json({ error: "meta.name et code requis" });
      return;
    }
    // (Un, 2026-07-03) U1 — meta.name devient un nom de dossier : on le valide
    // AVANT tout path.join (sinon "../../x" écrit hors du store → RCE).
    if (!isSafeComponentName(meta.name.trim())) {
      res.status(400).json({ error: "nom de composant invalide (lettres/chiffres/tirets uniquement)" });
      return;
    }
    const now = new Date().toISOString();
    const existing = loadComponent(WORKSPACE_DIR, meta.name);
    const entry: ComponentEntry = {
      meta: {
        name: meta.name.trim(),
        description: meta.description ?? "",
        tags: meta.tags ?? [],
        props: meta.props ?? [],
        usedIn: meta.usedIn ?? [],
        createdAt: existing?.meta.createdAt ?? now,
        updatedAt: now,
      },
      code: code.trim(),
    };
    try {
      saveComponent(WORKSPACE_DIR, entry);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Delete a component
  app.delete("/api/components/:name", (req: Request, res: Response) => {
    // (Un, 2026-07-03) U1 — rmSync récursif : un :name traversant supprimerait n'importe quel dossier
    if (!isSafeComponentName(req.params["name"] as string)) {
      res.status(400).json({ error: "nom de composant invalide" });
      return;
    }
    try {
      deleteComponent(WORKSPACE_DIR, req.params["name"] as string);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Idée #50 — Banque de références perso (mood library, workspace-level) ────

  // List all reference metas
  app.get("/api/references", (_req: Request, res: Response) => {
    res.json({ references: listReferences(WORKSPACE_DIR) });
  });

  // Get a single reference meta
  app.get("/api/references/:slug", (req: Request, res: Response) => {
    const meta = loadReference(WORKSPACE_DIR, req.params["slug"] as string);
    if (!meta) {
      res.status(404).json({ error: `Référence "${req.params["slug"] as string}" introuvable` });
      return;
    }
    res.json(meta);
  });

  // Serve the image file of a reference
  app.get("/api/references/:slug/image", (req: Request, res: Response) => {
    const imgPath = referenceImagePath(WORKSPACE_DIR, req.params["slug"] as string);
    if (!imgPath) {
      res.status(404).json({ error: "Pas d'image pour cette référence" });
      return;
    }
    res.sendFile(imgPath);
  });

  // Create or update a reference (JSON body)
  app.post("/api/references", (req: Request, res: Response) => {
    const body = req.body as Partial<ReferenceMeta>;
    if (!body.title?.trim()) {
      res.status(400).json({ error: "title requis" });
      return;
    }
    if (!body.kind || !["url", "image", "palette"].includes(body.kind)) {
      res.status(400).json({ error: "kind doit être url, image ou palette" });
      return;
    }
    const slug = body.title.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    const now = new Date().toISOString();
    const existing = loadReference(WORKSPACE_DIR, slug);
    const meta: ReferenceMeta = {
      slug,
      title: body.title.trim(),
      kind: body.kind,
      url: body.url ?? existing?.url,
      image: body.image ?? existing?.image,
      palette: body.palette ?? existing?.palette ?? [],
      ambiance: body.ambiance ?? existing?.ambiance,
      tags: body.tags ?? existing?.tags ?? [],
      note: body.note ?? existing?.note,
      usedIn: body.usedIn ?? existing?.usedIn ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      saveReference(WORKSPACE_DIR, meta);
      res.json(meta);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Upload an image file for an existing reference
  app.post("/api/references/:slug/image", refImageUpload.single("file"), (req: Request, res: Response) => {
    const slug = req.params["slug"] as string;
    const meta = loadReference(WORKSPACE_DIR, slug);
    if (!meta) {
      res.status(404).json({ error: `Référence "${slug}" introuvable` });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Fichier image requis (champ: file)" });
      return;
    }
    // Sanitize the original filename: strip path separators and dangerous chars
    const safeName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    const refDir = path.join(WORKSPACE_DIR, ".references", slug);
    fs.mkdirSync(refDir, { recursive: true });
    const imgPath = path.join(refDir, safeName);
    fs.writeFileSync(imgPath, req.file.buffer);
    const updatedMeta: ReferenceMeta = { ...meta, image: safeName, kind: meta.kind === "palette" ? "image" : meta.kind, updatedAt: new Date().toISOString() };
    saveReference(WORKSPACE_DIR, updatedMeta);
    res.json(updatedMeta);
  });

  // Delete a reference
  app.delete("/api/references/:slug", (req: Request, res: Response) => {
    try {
      deleteReference(WORKSPACE_DIR, req.params["slug"] as string);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
