// Agent PDF (#145, Chantier 3) — routes HTTP de l'ingestion documentaire locale.
//
// Un Blackboard SQLite DÉDIÉ (pdf-store.db) isole complètement les chunks PDF
// des artefacts design du Blackboard du Kernel. Tout reste local : extraction
// pdfjs-dist, embeddings + synthèse Ollama. Claude n'est jamais sollicité.

import multer from "multer";
import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Blackboard } from "./kernel/kernel-blackboard.js";
import {
  indexPdf,
  queryPdf,
  extractStructuredFromPdf,
  listPdfDocs,
  deletePdfDoc,
  defaultPdfDeps,
  type PdfDeps,
} from "./pdf-pipeline.js";
import { renderPdfPage, extractPdfImages, type PdfCrop } from "./pdf-render.js";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "pdf-uploads");
const DB_PATH = path.join(DATA_DIR, "pdf-store.db");

/** Chemin du binaire PDF conservé pour le rendu visuel (clé = docId). */
function pdfFilePath(docId: string): string {
  return path.join(UPLOAD_DIR, `${docId}.pdf`);
}

/** (Un, 2026-07-03) U10 — anti path-traversal : docId est concaténé dans un
 * chemin (pdfFilePath). Un docId légitime est TOUJOURS un randomUUID (36 car.
 * hex + tirets) ; tout autre format (ex. "../../x") est rejeté en 400 avant
 * d'atteindre le filesystem. */
function isValidDocId(docId: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(docId);
}

const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}-${sanitize(file.originalname)}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")),
});

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}

// Blackboard PDF dédié — assigné dans registerPdfRoutes (SQLite persistant).
let pdfBoard: Blackboard | null = null;
function getPdfBoard(): Blackboard {
  if (!pdfBoard) pdfBoard = new Blackboard(); // filet : mémoire si jamais non initialisé
  return pdfBoard;
}

/** Branche les routes PDF. `deps` injectable pour les tests ; en production,
 * defaultPdfDeps() (pdfjs-dist + Ollama) et un store SQLite persistant. */
export async function registerPdfRoutes(app: Express, depsOverride?: PdfDeps): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Store persistant SQLite (fallback mémoire si node:sqlite indisponible).
  try {
    const { SqliteStore } = await import("./kernel/kernel-blackboard-sqlite.js");
    pdfBoard = new Blackboard(new SqliteStore(DB_PATH));
  } catch (err) {
    console.error("[pdf] SQLite indisponible, store mémoire :", err instanceof Error ? err.message : err);
    pdfBoard = new Blackboard();
  }

  const deps = depsOverride ?? (await defaultPdfDeps());

  // POST /api/pdf/upload — indexe un PDF, renvoie ses métadonnées.
  app.post("/api/pdf/upload", pdfUpload.single("file"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "fichier PDF requis (champ 'file')" });
      return;
    }
    const docId = randomUUID();
    try {
      const meta = await indexPdf(file.path, docId, file.originalname, getPdfBoard(), deps);
      // On CONSERVE le binaire (renommé par docId) pour le rendu visuel (#147) :
      // vision PDF, zoom, crop, extraction d'images. Supprimé via DELETE /:docId.
      try {
        fs.renameSync(file.path, pdfFilePath(docId));
      } catch {
        fs.rm(file.path, { force: true }, () => {});
      }
      res.json({ docId, meta });
    } catch (err) {
      // En cas d'échec d'indexation, le binaire ne sert à rien.
      fs.rm(file.path, { force: true }, () => {});
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/pdf/:docId/page/:n — rastérise une page en PNG (#147).
  // Query : scale (0.25–8), crop=x,y,w,h (pixels du rendu). Renvoie image/png.
  app.get("/api/pdf/:docId/page/:n", async (req: Request, res: Response) => {
    // (Un, 2026-07-03) U10 — docId non-UUID = tentative de traversal, rejet
    if (!isValidDocId(String(req.params.docId))) {
      res.status(400).json({ error: "docId invalide (UUID attendu)" });
      return;
    }
    const file = pdfFilePath(String(req.params.docId));
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "document introuvable (binaire non conservé)" });
      return;
    }
    const pageNum = Number.parseInt(String(req.params.n), 10);
    const scale = req.query.scale !== undefined ? Number(req.query.scale) : undefined;
    let crop: PdfCrop | undefined;
    if (typeof req.query.crop === "string") {
      const [x, y, w, h] = req.query.crop.split(",").map(Number);
      if ([x, y, w, h].every(Number.isFinite)) crop = { x, y, w, h };
    }
    try {
      const out = await renderPdfPage(file, pageNum, { scale, crop });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Pdf-Page-Count", String(out.pageCount));
      res.setHeader("X-Pdf-Render-Scale", out.scale.toFixed(3));
      res.send(out.png);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/pdf/:docId/images — images embarquées en PNG base64 (#147, lacune #32).
  app.get("/api/pdf/:docId/images", async (req: Request, res: Response) => {
    // (Un, 2026-07-03) U10 — docId non-UUID = tentative de traversal, rejet
    if (!isValidDocId(String(req.params.docId))) {
      res.status(400).json({ error: "docId invalide (UUID attendu)" });
      return;
    }
    const file = pdfFilePath(String(req.params.docId));
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "document introuvable (binaire non conservé)" });
      return;
    }
    try {
      const imgs = await extractPdfImages(file);
      res.json({
        count: imgs.length,
        images: imgs.map((im) => ({
          index: im.index,
          pageNum: im.pageNum,
          width: im.width,
          height: im.height,
          dataUrl: `data:image/png;base64,${im.png.toString("base64")}`,
        })),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/pdf/:docId/query — RAG : question → réponse + sources.
  app.post("/api/pdf/:docId/query", async (req: Request, res: Response) => {
    const docId = String(req.params.docId);
    const { query, k } = req.body as { query?: string; k?: number };
    if (!query?.trim()) {
      res.status(400).json({ error: "query requis" });
      return;
    }
    try {
      const result = await queryPdf(query.trim(), docId, getPdfBoard(), deps, typeof k === "number" ? k : 4);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/pdf/:docId/extract — extraction structurée (JSON) selon instruction.
  app.post("/api/pdf/:docId/extract", async (req: Request, res: Response) => {
    const docId = String(req.params.docId);
    const { instruction } = req.body as { instruction?: string };
    if (!instruction?.trim()) {
      res.status(400).json({ error: "instruction requise" });
      return;
    }
    try {
      const data = await extractStructuredFromPdf(instruction.trim(), docId, getPdfBoard(), deps);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/pdf — liste des documents indexés.
  app.get("/api/pdf", (_req: Request, res: Response) => {
    res.json(listPdfDocs(getPdfBoard()));
  });

  // DELETE /api/pdf/:docId — supprime un document (chunks + métadonnée + binaire).
  app.delete("/api/pdf/:docId", (req: Request, res: Response) => {
    const docId = String(req.params.docId);
    // (Un, 2026-07-03) U10 — fs.rm sur un chemin dérivé de docId : sans ce
    // filtre, "../../<fichier>" supprimerait un fichier arbitraire du serveur.
    if (!isValidDocId(docId)) {
      res.status(400).json({ error: "docId invalide (UUID attendu)" });
      return;
    }
    const removed = deletePdfDoc(docId, getPdfBoard());
    fs.rm(pdfFilePath(docId), { force: true }, () => {}); // binaire conservé pour le rendu (#147)
    res.json({ ok: true, chunksRemoved: removed });
  });
}
