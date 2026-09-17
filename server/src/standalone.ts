import express from "express";
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import { WORKSPACE_DIR } from "./projects.js";
import { dataDir } from "./safe-io.js";
import { isMangoQaActive } from "./mangoqa.js";

export function installStandaloneAccess(app: express.Express): void {
  const token = process.env.MANGO_AUTH_TOKEN;
  const host = process.env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && (!token || token.length < 32)) {
    throw new Error("Accès réseau : définir MANGO_AUTH_TOKEN (32 caractères minimum), ou HOST=127.0.0.1.");
  }
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    // An untrusted website must not drive a local code-execution service.
    const hostname = req.hostname.toLowerCase();
    if (!token && !["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
      res.status(403).json({ error: "Hôte non autorisé." }); return;
    }
    if (req.headers.origin) {
      let originHost = "";
      try { originHost = new URL(req.headers.origin).host; } catch { /* invalid */ }
      if (originHost !== req.headers.host) {
        res.status(403).json({ error: "Origine non autorisée." }); return;
      }
    }
    if (token) {
      const expected = createHash("sha256").update(`Basic ${Buffer.from(`mango:${token}`).toString("base64")}`).digest();
      const supplied = createHash("sha256").update(req.headers.authorization ?? "").digest();
      if (!timingSafeEqual(expected, supplied)) {
        res.setHeader("WWW-Authenticate", 'Basic realm="Mango", charset="UTF-8"');
        res.status(401).send("Connecte-toi avec mango et ton mot de passe MANGO_AUTH_TOKEN."); return;
      }
    }
    next();
  });
}

export function installRuntimeRoutes(app: express.Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({ app: "mangoos", status: "ok" });
  });
  app.get("/api/runtime", async (_req, res) => {
    let ollama: { available: boolean; models: string[] } = { available: false, models: [] };
    try {
      const response = await fetch(`${(process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const data = await response.json() as { models?: { name: string }[] };
        ollama = { available: true, models: (data.models ?? []).map(m => m.name) };
      }
    } catch { /* unavailable is a state, never a fake success */ }
    let storageWritable = true;
    try { fs.accessSync(WORKSPACE_DIR, fs.constants.W_OK); fs.accessSync(dataDir(), fs.constants.W_OK); }
    catch { storageWritable = false; }
    res.setHeader("Cache-Control", "no-store");
    res.json({ standalone: process.env.MANGO_STANDALONE === "1", storageWritable, qa: isMangoQaActive(), ollama,
      claude: "Connexion Claude à vérifier lors du premier appel ; aucune connexion n’est supposée." });
  });
}

export function serveStandaloneUI(app: express.Express, dist = path.resolve(import.meta.dirname, "../../ui/dist")): void {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Interface absente : exécute npm run build à la racine de Mango.");
  app.use("/api", (_req, res) => { res.status(404).json({ error: "Route API inconnue." }); });
  app.use(express.static(dist, { index: false, dotfiles: "deny" }));
  app.get("/{*page}", (req, res) => {
    if (req.path.split("/").some(part => part.startsWith(".")) || path.extname(req.path)) { res.sendStatus(404); return; }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
}
