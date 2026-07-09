// Documentation generator: reads project files and generates markdown doc via LLM.
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { WORKSPACE_DIR } from "./projects.js";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";

const MAX_FILES = 20;
const MAX_LINES = 500;

// Recursively collect source files from a directory, skipping node_modules / .git / dist
function collectFiles(dir: string, base: string, results: string[]): void {
  if (results.length >= MAX_FILES) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (results.length >= MAX_FILES) break;
    const skip = ["node_modules", ".git", "dist", "build", ".cache", "coverage"];
    if (skip.includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectFiles(full, base, results);
    } else if (e.isFile()) {
      const rel = path.relative(base, full);
      results.push(rel);
    }
  }
}

async function readProjectFiles(
  projectDir: string,
): Promise<{ path: string; content: string }[]> {
  const srcDir = path.join(projectDir, "src");
  const searchDir = fs.existsSync(srcDir) ? srcDir : projectDir;

  const relPaths: string[] = [];
  collectFiles(searchDir, searchDir, relPaths);

  const files: { path: string; content: string }[] = [];
  for (const rel of relPaths.slice(0, MAX_FILES)) {
    const full = path.join(searchDir, rel);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const lines = raw.split("\n");
      const content =
        lines.length > MAX_LINES
          ? lines.slice(0, MAX_LINES).join("\n") + `\n... (tronqué à ${MAX_LINES} lignes)`
          : raw;
      files.push({ path: rel, content });
    } catch {
      // skip unreadable files
    }
  }
  return files;
}

async function generateDocumentation(
  projectName: string,
  files: { path: string; content: string }[],
): Promise<string> {
  const fileBlocks = files
    .map((f) => `### Fichier : ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");

  const userPrompt = `Projet : **${projectName}**\n\nVoici les fichiers sources :\n\n${fileBlocks}`;

  const system =
    "Tu es un expert en documentation technique. Génère une documentation complète et professionnelle en Markdown pour le projet analysé. Structure : ## Vue d'ensemble, ## Architecture, ## Composants clés, ## API & Endpoints, ## Guide d'utilisation rapide.";

  const text = await getBrain().complete(system, userPrompt, {
    provider: resolveProvider(process.env.DOC_PROVIDER),
    maxTokens: 4000,
  });

  if (!text) throw new Error("Unexpected empty response from LLM");
  return text;
}

function saveDocumentation(projectDir: string, content: string): void {
  const docPath = path.join(projectDir, "DOCUMENTATION.md");
  fs.writeFileSync(docPath, content, "utf8");
}

export function registerDocGeneratorRoutes(app: Express): void {
  // POST /api/docs/generate { projectName: string }
  // SSE stream: { type: 'progress', text: '...' } then { type: 'done', docPath: '...' }
  app.post("/api/docs/generate", async (req: Request, res: Response) => {
    const { projectName } = req.body as { projectName?: string };
    if (!projectName) {
      res.status(400).json({ error: "projectName requis" });
      return;
    }

    const projDir = path.join(WORKSPACE_DIR, projectName);
    if (!fs.existsSync(projDir)) {
      res.status(404).json({ error: `Projet "${projectName}" introuvable` });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      send({ type: "progress", text: "Lecture des fichiers du projet..." });
      const files = await readProjectFiles(projDir);

      send({
        type: "progress",
        text: `${files.length} fichier(s) trouvé(s). Génération de la documentation via LLM...`,
      });

      const doc = await generateDocumentation(projectName, files);

      send({ type: "progress", text: "Sauvegarde de DOCUMENTATION.md..." });
      saveDocumentation(projDir, doc);

      const docPath = path.join(projDir, "DOCUMENTATION.md");
      send({ type: "done", docPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ type: "error", text: msg });
    } finally {
      res.end();
    }
  });

  // GET /api/docs/:projectName → retourne la doc existante (markdown) ou 404
  app.get("/api/docs/:projectName", (req: Request, res: Response) => {
    const projectName = String(req.params["projectName"] ?? "");
    const docPath = path.join(WORKSPACE_DIR, projectName, "DOCUMENTATION.md");
    if (!fs.existsSync(docPath)) {
      res.status(404).json({ error: "Aucune documentation trouvée pour ce projet" });
      return;
    }
    const content = fs.readFileSync(docPath, "utf8");
    res.json({ content, docPath });
  });
}
