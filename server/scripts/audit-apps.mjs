// Audit santé des apps du workspace : tente un build de chacune et classe
// VERTE / ROUGE / NON-INSTALLÉE / VIDE. N'installe rien, ne modifie rien.
// Sortie : rapport trié + JSON (.audit-apps.json à la racine workspace).
//
//   node scripts/audit-apps.mjs
//
import { readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, "..", "..", "workspace");
const BUILD_TIMEOUT_MS = 90_000;
const CONCURRENCY = 4;

function listApps() {
  return readdirSync(WORKSPACE).filter((n) => {
    if (n.startsWith(".")) return false;
    try { return statSync(join(WORKSPACE, n)).isDirectory(); } catch { return false; }
  });
}

function runBuild(dir) {
  return new Promise((resolve) => {
    const child = spawn("npm run build", { cwd: dir, shell: true });
    let err = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* déjà mort */ }
      resolve({ ok: false, reason: "timeout", tail: "build > 90s" });
    }, BUILD_TIMEOUT_MS);
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.stdout.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, reason: "spawn", tail: e.message }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = err.replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-3).join(" | ").slice(-240);
      resolve({ ok: code === 0, reason: code === 0 ? "ok" : "build-fail", tail });
    });
  });
}

async function auditOne(app) {
  const dir = join(WORKSPACE, app);
  if (!existsSync(join(dir, "package.json"))) return { app, status: "vide", note: "pas de package.json" };
  if (!existsSync(join(dir, "src"))) return { app, status: "vide", note: "pas de src/" };
  if (!existsSync(join(dir, "node_modules"))) return { app, status: "non-installée", note: "node_modules absent" };
  const r = await runBuild(dir);
  return { app, status: r.ok ? "verte" : "rouge", note: r.ok ? "" : `${r.reason}: ${r.tail}` };
}

async function pool(items, n, worker) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
      process.stdout.write(`\r  ${out.filter(Boolean).length}/${items.length} audités…   `);
    }
  });
  await Promise.all(runners);
  return out;
}

async function main() {
  const apps = listApps();
  console.log(`Audit de ${apps.length} apps (build, concurrence ${CONCURRENCY}, timeout ${BUILD_TIMEOUT_MS / 1000}s)…\n`);
  const results = await pool(apps, CONCURRENCY, auditOne);
  console.log("\n");

  const by = { verte: [], rouge: [], "non-installée": [], vide: [] };
  for (const r of results) by[r.status]?.push(r);

  for (const s of ["verte", "rouge", "non-installée", "vide"]) {
    const icon = { verte: "✅", rouge: "❌", "non-installée": "⬇️", vide: "⬜" }[s];
    console.log(`${icon} ${s.toUpperCase()} — ${by[s].length}`);
    for (const r of by[s]) console.log(`    ${r.app}${r.note ? `  — ${r.note}` : ""}`);
    console.log("");
  }

  const summary = {
    total: apps.length,
    verte: by.verte.length, rouge: by.rouge.length,
    nonInstallee: by["non-installée"].length, vide: by.vide.length,
    results,
  };
  writeFileSync(join(WORKSPACE, ".audit-apps.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`Résumé : ✅ ${summary.verte} · ❌ ${summary.rouge} · ⬇️ ${summary.nonInstallee} · ⬜ ${summary.vide}`);
  console.log("→ détail dans workspace/.audit-apps.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
