// Project IO routes: history, files, export (zip), versions, rollback.
// Note: /api/rollback checks agentBusy but does NOT set it — safe to extract.
// The agentBusy reference is passed in as a getter to keep this module decoupled
// from the shared variable in index.ts.
import fs from "node:fs";
import path from "node:path";
import { ZipArchive } from "archiver";
import type { Express, Request, Response } from "express";
import { appendHistory, loadHistory } from "./history.js";
import { projectDir, projectExists } from "./projects.js";
import { externalHistoryDir } from "./routes/code-route.js";
import { ASSETS_DIR_NAME } from "./uploads.js";
import { SNAPSHOTS_DIR_NAME } from "./vision.js";
import { safeDiffPath } from "./vision-diff.js";
import { commitVersion, listVersions, rollbackTo } from "./versions.js";

export function registerProjectIORoutes(app: Express, isAgentBusy: () => boolean): void {
  // Persisted chat history of a project (empty for unknown/new projects)
  app.get("/api/history/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    // #193 — section Code : un projet externe n'est jamais dans workspace/, cette
    // branche additive redirige vers son dossier d'historique dédié AVANT la
    // résolution workspace. Zéro changement sur la branche existante ci-dessous
    // (aucune collision possible : projectDir() ne produit jamais de nom avec ":").
    if (name.startsWith("ext:")) {
      res.json({ messages: loadHistory(externalHistoryDir(name.slice(4))) });
      return;
    }
    if (!projectExists(name)) {
      res.json({ messages: [] });
      return;
    }
    res.json({ messages: loadHistory(projectDir(name)) });
  });

  // Idée #80 — sert une image de diff avant/après (.diffs/<phase>-<ts>.jpg).
  app.get("/api/projects/:name/diff/:file", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) {
      res.status(404).end();
      return;
    }
    const imgPath = safeDiffPath(projectDir(name), req.params["file"] as string);
    if (!imgPath || !fs.existsSync(imgPath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(imgPath);
  });

  // List all project files (relative paths, sorted, excluding heavy/useless dirs)
  app.get("/api/files/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string as string;
    let dir: string;
    try {
      dir = projectDir(name);
    } catch {
      res.status(400).json({ error: "Nom invalide" });
      return;
    }
    if (!fs.existsSync(dir)) {
      res.json({ files: [] });
      return;
    }

    const IGNORE = new Set(["node_modules", ".git", "dist", ".vite", ".cache", ".assets", ".snapshots"]);
    const files: string[] = [];

    function walk(current: string, rel: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (IGNORE.has(e.name) || e.name.startsWith(".")) continue;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          walk(path.join(current, e.name), relPath);
        } else {
          files.push(relPath);
        }
      }
    }

    walk(dir, "");
    files.sort();
    res.json({ files });
  });

  // Download a generated project as a zip (sources only, no node_modules)
  app.get("/api/export/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }
    const dir = projectDir(name);
    const filename = `${path.basename(dir)}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err: Error) => {
      console.error("[export]", err.message);
      res.destroy(err);
    });
    archive.pipe(res);
    archive.glob("**/*", {
      cwd: dir,
      dot: true,
      ignore: [
        "node_modules/**",
        "dist/**",
        ".git/**",
        ".env",
        ".env.local",
        ".chat-history.json",
        ".memory.md",
        `${ASSETS_DIR_NAME}/**`,
        `${SNAPSHOTS_DIR_NAME}/**`,
      ],
    });
    archive.finalize();
  });

  // Version history of a project (one commit per agent iteration, newest first)
  app.get("/api/versions/:name", async (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    if (!projectExists(name)) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }
    try {
      res.json({ versions: await listVersions(projectDir(name)) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Body: { projectName: string, hash: string } — hard reset to that version
  app.post("/api/rollback", async (req: Request, res: Response) => {
    const { projectName, hash } = req.body as { projectName?: string; hash?: string };
    if (!projectName?.trim() || !hash?.trim()) {
      res.status(400).json({ error: "projectName and hash are required" });
      return;
    }
    if (isAgentBusy()) {
      res.status(409).json({ error: "Agent is working — stop it before rolling back" });
      return;
    }
    if (!projectExists(projectName)) {
      res.status(404).json({ error: `Project "${projectName}" not found` });
      return;
    }
    try {
      const dir = projectDir(projectName);
      await rollbackTo(dir, hash);
      res.json({ ok: true, versions: await listVersions(dir) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
