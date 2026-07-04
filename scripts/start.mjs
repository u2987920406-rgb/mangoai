#!/usr/bin/env node
// mango start — Phase 1 (jalon C) du plan de distribution (docs/plan-distribution.md §3.5).
// Lance le backend Express (server/, port 3000) et l'UI Vite (ui/, port 5173), avec
// anti-orphelin intégré : si un process écoute déjà sur le port 3000, il est tué avant
// de spawn un backend frais (c'est la procédure manuelle de CLAUDE.md, transformée en code).
// Ouvre le navigateur sur l'UI une fois les deux serveurs prêts. Ctrl+C arrête proprement
// les deux process enfants.
//
// Usage : node scripts/start.mjs

import { spawn, exec } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");
const UI_DIR = path.join(ROOT, "ui");
const BACKEND_PORT = 3000;
const UI_PORT = 5173;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}

// Trouve le(s) PID écoutant sur un port et les tue. Cross-plateforme (best-effort) :
// Windows via `netstat` + `taskkill`, POSIX via `lsof` + `kill`. Ne fait rien si rien n'écoute.
async function killPortOwner(port) {
  if (await isPortFree(port)) return false;
  console.log(`⚠️  Port ${port} déjà occupé — recherche du process orphelin…`);
  if (process.platform === "win32") {
    const pids = await new Promise((resolve) => {
      exec(`netstat -ano -p tcp`, { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const set = new Set();
        for (const line of stdout.split(/\r?\n/)) {
          const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
          if (m && Number(m[1]) === port) set.add(m[2]);
        }
        resolve([...set]);
      });
    });
    for (const pid of pids) {
      console.log(`   → taskkill /F /PID ${pid}`);
      await new Promise((r) => exec(`taskkill /F /PID ${pid}`, { windowsHide: true }, () => r()));
    }
    return pids.length > 0;
  } else {
    const pids = await new Promise((resolve) => {
      exec(`lsof -ti tcp:${port}`, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
      });
    });
    for (const pid of pids) {
      console.log(`   → kill -9 ${pid}`);
      await new Promise((r) => exec(`kill -9 ${pid}`, () => r()));
    }
    return pids.length > 0;
  }
}

function waitForPort(port, timeoutMs = 30000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = async () => {
      const free = await isPortFree(port);
      if (!free) return resolve(true); // quelqu'un écoute désormais
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {});
}

const children = [];
function spawnLogged(label, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell: process.platform === "win32", stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    console.log(`[${label}] terminé (code ${code})`);
  });
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nArrêt de mango start — fermeture des serveurs…");
  for (const child of children) {
    if (!child.killed) {
      try {
        if (process.platform === "win32") {
          exec(`taskkill /pid ${child.pid} /T /F`, { windowsHide: true });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
  }
}
process.on("SIGINT", () => {
  shutdown();
  setTimeout(() => process.exit(0), 500);
});
process.on("SIGTERM", () => {
  shutdown();
  setTimeout(() => process.exit(0), 500);
});

async function main() {
  console.log("mango start — lancement de MangoOS\n");

  await killPortOwner(BACKEND_PORT);

  console.log("→ backend (server/, port 3000)…");
  spawnLogged("backend", "npm", ["run", "start"], SERVER_DIR);
  const backendUp = await waitForPort(BACKEND_PORT, 30000);
  console.log(backendUp ? "✅ backend prêt sur http://localhost:3000" : "⚠️ backend pas encore prêt après 30s (continue quand même)");

  console.log("→ UI (ui/, port 5173)…");
  spawnLogged("ui", "npm", ["run", "dev"], UI_DIR);
  const uiUp = await waitForPort(UI_PORT, 30000);
  console.log(uiUp ? "✅ UI prête sur http://localhost:5173" : "⚠️ UI pas encore prête après 30s (continue quand même)");

  if (uiUp) openBrowser("http://localhost:5173");

  console.log("\nMangoOS tourne. Ctrl+C pour tout arrêter proprement.");
}

main().catch((err) => {
  console.error("mango start a échoué :", err);
  shutdown();
  process.exit(1);
});
