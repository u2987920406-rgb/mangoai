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
import { Blackboard } from "./kernel-blackboard.js";
import {
  indexPdf,
  queryPdf,
  extractStructuredFromPdf,
  listPdfDocs,
  deletePdfDoc,
  defaultPdfDeps,
  type PdfDeps,
} from "./pdf-pipeline.js";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "pdf-uploads");
const DB_PATH = path.join(DATA_DIR, "pdf-store.db");

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
    const { SqliteStore } = await import("./kernel-blackboard-sqlite.js");
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
      res.json({ docId, meta });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      // Le texte est indexé ; le binaire ne sert plus.
      fs.rm(file.path, { force: true }, () => {});
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

  // DELETE /api/pdf/:docId — supprime un document (chunks + métadonnée).
  app.delete("/api/pdf/:docId", (req: Request, res: Response) => {
    const removed = deletePdfDoc(String(req.params.docId), getPdfBoard());
    res.json({ ok: true, chunksRemoved: removed });
  });
}
