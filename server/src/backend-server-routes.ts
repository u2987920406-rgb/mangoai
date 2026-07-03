// Backend-server routes: scaffold, start, stop the generated Express backend
// alongside a React/Vite project (#35).
// All routes are self-contained (no agentBusy, no SSE).
import type { Express, Request, Response } from "express";
import { backendServerStatus, hasBackend, installBackendDepsAsync, scaffoldBackend, startBackendServer, stopBackendServer } from "./backend-generator.js";
import { projectDir } from "./projects.js";

export function registerBackendServerRoutes(app: Express): void {
  // ── Chantier #35 — Backend généré (Express alongside React/Vite) ────────────

  // Status: is the api/ server scaffolded and/or running for this project?
  app.get("/api/backend-server/:name/status", (req: Request, res: Response) => {
    const dir = projectDir(req.params["name"] as string);
    const status = backendServerStatus();
    res.json({
      scaffolded: hasBackend(dir),
      running: status.running && status.projectDir === dir,
      url: status.projectDir === dir ? status.url : null,
      port: status.projectDir === dir ? status.port : null,
    });
  });

  // Scaffold: copy the Express template into api/ (idempotent).
  app.post("/api/backend-server/:name/scaffold", (req: Request, res: Response) => {
    try {
      const dir = projectDir(req.params["name"] as string);
      scaffoldBackend(dir);
      res.json({ ok: true, message: "Backend scaffolded in api/. Run npm install then start." });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Start: install deps (if needed) then launch the Express dev server.
  app.post("/api/backend-server/:name/start", async (req: Request, res: Response) => {
    try {
      const dir = projectDir(req.params["name"] as string);
      if (!hasBackend(dir)) {
        res.status(400).json({ error: "No api/ folder found. Scaffold the backend first." });
        return;
      }
      // (Un, 2026-07-03) U3 — l'execSync de installBackendDeps gelait TOUT
      // l'event loop du serveur jusqu'à 120 s (aucune autre requête servie
      // pendant le npm install). Version async non-bloquante déjà fournie.
      await installBackendDepsAsync(dir); // npm install si node_modules absent
      const { url, port } = await startBackendServer(dir);
      res.json({ ok: true, url, port });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Stop: kill the Express dev server.
  app.post("/api/backend-server/:name/stop", async (_req: Request, res: Response) => {
    try {
      await stopBackendServer();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
