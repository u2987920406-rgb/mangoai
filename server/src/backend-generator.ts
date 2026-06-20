// Generated-project backend manager (Chantier #35 — Backend généré).
// When a generated app needs server-side logic (webhooks, secure API calls,
// OAuth, jobs), the agent creates files in api/ at the project root. This
// module scaffolds that folder from a template, installs deps, and manages
// the Express dev-server process lifecycle — mirroring preview.ts for Vite.
import { execSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_DIR_NAME = "api";
const BACKEND_PORT_BASE = Number(process.env.BACKEND_PORT ?? 3001);

// Resolve the backend template dir relative to this file (server/src/ → server/templates/backend/)
const TEMPLATE_DIR = path.resolve(__dirname, "../templates/backend");

let current: { projectDir: string; proc: ChildProcess; url: string; port: number } | null = null;

// ── Status ────────────────────────────────────────────────────────────────────

export function backendServerStatus() {
  return {
    running: current !== null && current.proc.exitCode === null,
    projectDir: current?.projectDir ?? null,
    url: current?.url ?? null,
    port: current?.port ?? null,
  };
}

export function hasBackend(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, BACKEND_DIR_NAME, "package.json"));
}

/** État des dépendances du backend généré — pur (fs seul), donc testable sans
 * réseau. "absent" = pas de backend ; "no-deps" = backend présent mais
 * api/node_modules manquant ; "ready" = installable/installé. */
export function backendDepsState(projectDir: string): "ready" | "no-deps" | "absent" {
  if (!hasBackend(projectDir)) return "absent";
  return fs.existsSync(path.join(projectDir, BACKEND_DIR_NAME, "node_modules")) ? "ready" : "no-deps";
}

// ── Scaffold ──────────────────────────────────────────────────────────────────

/** Copies the built-in Express template into <projectDir>/api/ (idempotent). */
export function scaffoldBackend(projectDir: string): void {
  const dest = path.join(projectDir, BACKEND_DIR_NAME);
  if (fs.existsSync(dest)) return; // Already scaffolded — never overwrite

  copyRecursive(TEMPLATE_DIR, dest);

  // Bootstrap .env from .env.example
  const exampleEnv = path.join(dest, ".env.example");
  const envFile = path.join(dest, ".env");
  if (fs.existsSync(exampleEnv) && !fs.existsSync(envFile)) {
    fs.copyFileSync(exampleEnv, envFile);
  }
}

function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

// ── Dependencies ──────────────────────────────────────────────────────────────

/** Runs npm install in api/ if node_modules is absent. Synchronous — call before startBackendServer. */
export function installBackendDeps(projectDir: string): void {
  const apiDir = path.join(projectDir, BACKEND_DIR_NAME);
  const nm = path.join(apiDir, "node_modules");
  if (fs.existsSync(nm)) return;

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execSync(`${npm} install`, {
    cwd: apiDir,
    stdio: "inherit",
    timeout: 120_000,
  });
}

/** Async, non-bloquant : npm install dans api/ si node_modules absent. Utilisé
 * par les orchestrateurs (nocturnal/eleve) qui tournent dans l'event loop du
 * serveur — l'execSync de installBackendDeps gèlerait le thread jusqu'à 120 s. */
export async function installBackendDepsAsync(projectDir: string): Promise<void> {
  if (backendDepsState(projectDir) !== "no-deps") return;
  const apiDir = path.join(projectDir, BACKEND_DIR_NAME);
  await new Promise<void>((resolve) => {
    const p = spawn("npm install", { cwd: apiDir, shell: true, windowsHide: true });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}

// ── Process lifecycle ─────────────────────────────────────────────────────────

async function findFreePort(base: number): Promise<number> {
  const { createServer } = await import("node:net");
  for (let port = base; port < base + 100; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = createServer();
      srv.listen(port, "127.0.0.1", () => { srv.close(() => resolve(true)); });
      srv.on("error", () => resolve(false));
    });
    if (free) return port;
  }
  throw new Error("No free port found in range");
}

async function serverAlive(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

export async function startBackendServer(projectDir: string): Promise<{ url: string; port: number }> {
  const apiDir = path.join(projectDir, BACKEND_DIR_NAME);
  if (!fs.existsSync(path.join(apiDir, "package.json"))) {
    throw new Error(`No api/package.json in ${projectDir} — scaffold the backend first`);
  }

  // Fast path: same project, process alive and server answers
  if (current && current.projectDir === projectDir && current.proc.exitCode === null) {
    if (await serverAlive(current.url)) return { url: current.url, port: current.port };
  }
  await stopBackendServer();

  const port = await findFreePort(BACKEND_PORT_BASE);
  const env = { ...process.env, PORT: String(port), FRONTEND_ORIGIN: "http://localhost:5173" };

  const proc = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev"],
    { cwd: apiDir, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", env },
  );

  const url = `http://127.0.0.1:${port}`;
  current = { projectDir, proc, url, port };

  proc.on("exit", (code) => {
    console.log(`[backend] server exited (code ${code})`);
    if (current?.proc === proc) current = null;
  });
  proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[backend] ${d}`));
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[backend] ${d}`));

  // Poll until the health endpoint answers (max 20 s)
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await serverAlive(url)) {
      patchFrontendEnv(projectDir, port);
      return { url, port };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  proc.kill();
  current = null;
  throw new Error(`Backend server did not start within 20 s (port ${port})`);
}

export async function stopBackendServer(): Promise<void> {
  if (!current) return;
  const { proc } = current;
  current = null;
  proc.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 2000);
    proc.on("exit", () => { clearTimeout(t); resolve(); });
  });
}

// ── Frontend wiring ───────────────────────────────────────────────────────────

/** Writes/updates VITE_API_URL in the frontend project .env so the React app can call the backend. */
function patchFrontendEnv(projectDir: string, port: number): void {
  const envFile = path.join(projectDir, ".env");
  const line = `VITE_API_URL=http://127.0.0.1:${port}`;
  try {
    let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    if (content.includes("VITE_API_URL=")) {
      content = content.replace(/^VITE_API_URL=.*/m, line);
    } else {
      content = content ? `${content.trimEnd()}\n${line}\n` : `${line}\n`;
    }
    fs.writeFileSync(envFile, content, "utf8");
  } catch {
    // Non-fatal — the agent will tell the user VITE_API_URL if the file write fails
  }
}
