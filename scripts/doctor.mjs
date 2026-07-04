#!/usr/bin/env node
// mango doctor — Phase 1 (jalon C) du plan de distribution (docs/plan-distribution.md §3.3).
// Vérifie les prérequis d'installation de MangoOS chez un tiers et rapporte l'état
// en clair (✅/❌). Zéro dépendance externe : Node natif uniquement (net, child_process, fs).
//
// Usage : node scripts/doctor.mjs
// Code de sortie : 0 si tout est vert, 1 sinon.

import { execFile } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");

const results = [];
function report(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
}

function execP(cmd, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, out: (stdout || "") + (stderr || ""), err });
      else resolve({ ok: true, out: stdout || "" });
    });
    child.on("error", () => resolve({ ok: false, out: "" }));
  });
}

async function fetchWithTimeout(url, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

console.log("mango doctor — vérification des prérequis MangoOS\n");

// 1. Version Node
{
  const [major] = process.versions.node.split(".").map(Number);
  const ok = major >= 20;
  report("Node.js >= 20", ok, `détecté v${process.versions.node}`);
}

// 2. Ollama joignable
{
  let ok = await fetchWithTimeout("http://localhost:11434/api/tags", 1500);
  let detail = ok ? "API locale http://localhost:11434 répond" : "";
  if (!ok) {
    const r = await execP("ollama", ["--version"], 3000);
    if (r.ok) {
      ok = true;
      detail = r.out.trim();
    } else {
      detail = "API locale injoignable et binaire `ollama` introuvable dans le PATH";
    }
  }
  report("Ollama joignable", ok, detail);
}

// 3. Navigateur Playwright présent
{
  let ok = false;
  let detail = "";
  const cacheCandidates = [
    path.join(SERVER_DIR, "node_modules", ".cache", "ms-playwright"),
    path.join(process.env.LOCALAPPDATA || "", "ms-playwright"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".cache", "ms-playwright"),
  ].filter(Boolean);
  const found = cacheCandidates.find((p) => {
    try {
      return fs.existsSync(p) && fs.readdirSync(p).length > 0;
    } catch {
      return false;
    }
  });
  if (found) {
    ok = true;
    detail = `navigateurs trouvés dans ${found}`;
  } else {
    const r = await execP(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["--no-install", "playwright", "--version"],
      6000
    );
    if (r.ok) {
      ok = true;
      detail = r.out.trim();
    } else {
      detail = "aucun cache ms-playwright trouvé et `npx playwright --version` a échoué — lance `npx playwright install` dans server/";
    }
  }
  report("Navigateur Playwright installé", ok, detail);
}

// 4. .env présent + clé Élève obligatoire renseignée
{
  const envPath = path.join(SERVER_DIR, ".env");
  const exists = fs.existsSync(envPath);
  if (!exists) {
    report(".env présent (server/.env)", false, "absent — copie server/.env.example → server/.env puis renseigne au moins ELEVE_API_KEY");
  } else {
    const content = fs.readFileSync(envPath, "utf-8");
    const map = {};
    for (const line of content.split(/\r?\n/)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (m) map[m[1]] = m[2].trim();
    }
    const requiredOk = !!map.ELEVE_API_KEY;
    report(".env présent (server/.env)", true, "trouvé");
    report("Clé Élève renseignée (ELEVE_API_KEY)", requiredOk, requiredOk ? "présente" : "vide — l'Élève ne pourra pas tourner sans elle");

    const optionalKeys = ["PEXELS_API_KEY", "GITHUB_TOKEN", "FIGMA_API_KEY", "FIGMA_TOKEN"];
    const missingOptional = optionalKeys.filter((k) => !map[k]);
    if (missingOptional.length) {
      console.log(`   (optionnel, non bloquant) clés vides : ${missingOptional.join(", ")}`);
    }
  }
}

// 5. Ports 3000 et 5173 libres
{
  const free3000 = await isPortFree(3000);
  report("Port 3000 libre (backend)", free3000, free3000 ? "" : "un process écoute déjà — `mango start` le libère automatiquement, ou tue-le manuellement");
  const free5173 = await isPortFree(5173);
  report("Port 5173 libre (UI)", free5173, free5173 ? "" : "un process écoute déjà sur 5173");
}

const allOk = results.every((r) => r.ok);
console.log("\n" + (allOk ? "\x1b[32mTout est vert — installation prête.\x1b[0m" : "\x1b[31mDes points bloquent l'installation — corrige les ❌ ci-dessus.\x1b[0m"));
process.exit(allOk ? 0 : 1);
