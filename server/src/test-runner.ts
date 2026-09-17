// Runner de tests maison pour MangoOS.
//
// Le backend possède ~219 scripts `src/tests/test-*.ts` autonomes : chacun s'exécute
// via `npx tsx src/tests/test-X.ts` et sort avec exit 0 (succès) / 1 (échec). Aucun
// framework n'est imposé : ce runner ORCHESTRE les scripts existants tels quels,
// sans les réécrire ni installer vitest.
//
// Il découvre les tests par glob, lit un manifeste (`test-manifest.json`) qui
// classe chaque test dans un tier, exécute le tier demandé séquentiellement,
// capture (exit code · durée · dernière ligne utile) et affiche un tableau
// récapitulatif. Exit 1 si au moins un test échoue.
//
// Tiers :
//   smoke   → 12 tests déterministes rapides (défaut de `npm test`)
//   offline → smoke + tous les tests vérifiés passer sans réseau
//   full    → smoke + offline + tests réseau/backend (jamais par défaut)
//   broken  → bugs préexistants connus : listés, JAMAIS exécutés automatiquement
//   (unclassified = présent au glob mais absent du manifeste : listé, non exécuté)
//
// Usage :
//   npx tsx src/test-runner.ts --tier smoke
//   npx tsx src/test-runner.ts --tier offline
//   npx tsx src/test-runner.ts --tier full
//   npx tsx src/test-runner.ts --list        (affiche manifeste + unclassified)
//   npx tsx src/test-runner.ts --tier offline --timeout 120000

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(SERVER_DIR, "src");
const TESTS_DIR = path.join(SRC_DIR, "tests");
const MANIFEST_PATH = path.join(SERVER_DIR, "test-manifest.json");

type Tier = "smoke" | "offline" | "full" | "broken";
interface ManifestEntry { tier: Tier; reason?: string }
// `suites` = sélections nommées transverses (ex. "llm") qui listent EXACTEMENT des
// tests à exécuter comme gate rapide ciblé, INDÉPENDAMMENT de leur tier de base.
// Un test reste dans son tier (offline/smoke/broken) → la couverture offline est
// intacte ; une suite ne fait que le RE-sélectionner pour un gate court.
interface Manifest { entries: Record<string, ManifestEntry>; suites?: Record<string, string[]> }

// --- args ---------------------------------------------------------------
const argv = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const LIST = argv.includes("--list");
const TIER = argValue("--tier") ?? "smoke";
const TIMEOUT_MS = Number(argValue("--timeout") ?? 90_000);

// Quels tiers du manifeste sont exécutés pour un tier demandé (cumulatif).
const RUN_SETS: Record<"smoke" | "offline" | "full", Tier[]> = {
  smoke: ["smoke"],
  offline: ["smoke", "offline"],
  full: ["smoke", "offline", "full"],
};

// --- découverte ---------------------------------------------------------
function discover(): string[] {
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.startsWith("test-") && f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((name) => name !== "test-util" && name !== "test-runner") // helper + runner lui-même
    .sort();
}

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return { entries: {} };
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

// --- exécution d'un test ------------------------------------------------
interface RunResult {
  name: string;
  code: number | null;
  timedOut: boolean;
  durationMs: number;
  lastLine: string;
}

function lastMeaningfulLine(buf: string): string {
  const lines = buf
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  return lines.length ? lines[lines.length - 1] : "(aucune sortie)";
}

function runTest(name: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(process.execPath, ["--import", "tsx", path.join("src", "tests", `${name}.ts`)], {
      cwd: SERVER_DIR,
      shell: false,
      env: process.env,
    });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        name,
        code,
        timedOut,
        durationMs: Date.now() - start,
        lastLine: lastMeaningfulLine(out),
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        name,
        code: -1,
        timedOut,
        durationMs: Date.now() - start,
        lastLine: `spawn error: ${err.message}`,
      });
    });
  });
}

// --- mode --list --------------------------------------------------------
function doList(): void {
  const discovered = discover();
  const man = loadManifest();
  const byTier: Record<string, string[]> = { smoke: [], offline: [], full: [], broken: [], unclassified: [] };
  for (const name of discovered) {
    const e = man.entries[name];
    (byTier[e ? e.tier : "unclassified"] ??= []).push(name);
  }
  console.log("═".repeat(72));
  console.log(`MANIFESTE DES TESTS — ${discovered.length} tests découverts`);
  console.log("═".repeat(72));
  for (const tier of ["smoke", "offline", "full", "broken", "unclassified"]) {
    const list = byTier[tier] ?? [];
    console.log(`\n[${tier}] — ${list.length}`);
    for (const name of list) {
      const reason = man.entries[name]?.reason;
      console.log(`  ${name}${reason ? `  · ${reason}` : ""}`);
    }
  }
  console.log("\n" + "─".repeat(72));
  const total = discovered.length;
  const classified = total - (byTier.unclassified?.length ?? 0);
  console.log(`Classés : ${classified}/${total} · Non classés : ${byTier.unclassified?.length ?? 0}`);
}

// --- mode exécution -----------------------------------------------------
async function doRun(): Promise<void> {
  const discovered = discover();
  const man = loadManifest();
  let toRun: string[];
  if (TIER in RUN_SETS) {
    const wanted = new Set(RUN_SETS[TIER as "smoke" | "offline" | "full"]);
    toRun = discovered.filter((name) => {
      const e = man.entries[name];
      return e && wanted.has(e.tier);
    });
  } else if (man.suites?.[TIER]) {
    // Suite nommée : exactement les tests listés (dans l'ordre du manifeste),
    // filtrés sur ceux réellement présents au glob.
    const known = new Set(discovered);
    toRun = man.suites[TIER].filter((name) => known.has(name));
    const missing = man.suites[TIER].filter((name) => !known.has(name));
    if (missing.length) console.log(`⚠ suite « ${TIER} » : tests introuvables ignorés → ${missing.join(", ")}`);
  } else {
    console.error(`Tier/suite inconnu : « ${TIER} ». Tiers : ${Object.keys(RUN_SETS).join(", ")} · Suites : ${Object.keys(man.suites ?? {}).join(", ") || "(aucune)"}`);
    process.exit(2);
    return;
  }

  console.log("═".repeat(72));
  console.log(`RUNNER — tier « ${TIER} » · ${toRun.length} test(s) · timeout ${TIMEOUT_MS / 1000}s`);
  console.log("═".repeat(72));

  if (toRun.length === 0) {
    console.error("Aucun test sélectionné : vérifier le manifeste.");
    process.exit(1);
  }
  const results: RunResult[] = [];
  let idx = 0;
  for (const name of toRun) {
    idx++;
    process.stdout.write(`[${idx}/${toRun.length}] ${name} … `);
    const r = await runTest(name);
    results.push(r);
    const ok = r.code === 0;
    const tag = r.timedOut ? "TIMEOUT" : ok ? "PASS" : "FAIL";
    console.log(`${tag} (${(r.durationMs / 1000).toFixed(1)}s)`);
  }

  // Tableau récapitulatif
  console.log("\n" + "═".repeat(72));
  console.log("RÉCAPITULATIF");
  console.log("═".repeat(72));
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(`${pad("TEST", 38)} ${pad("ÉTAT", 8)} ${pad("DURÉE", 8)} DERNIÈRE LIGNE`);
  console.log("─".repeat(72));
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const ok = r.code === 0;
    if (ok) passed++;
    else failed++;
    const state = r.timedOut ? "TIMEOUT" : ok ? "✓ PASS" : "✗ FAIL";
    console.log(
      `${pad(r.name, 38)} ${pad(state, 8)} ${pad((r.durationMs / 1000).toFixed(1) + "s", 8)} ${r.lastLine.slice(0, 60)}`,
    );
  }
  console.log("─".repeat(72));
  const totalMs = results.reduce((a, r) => a + r.durationMs, 0);
  console.log(`TOTAL : ${passed} PASS · ${failed} FAIL · ${(totalMs / 1000).toFixed(1)}s cumulées`);

  if (failed > 0) {
    console.log("\nÉCHECS :");
    for (const r of results.filter((x) => x.code !== 0)) {
      console.log(`  ✗ ${r.name} — ${r.timedOut ? "timeout" : `exit ${r.code}`} — ${r.lastLine.slice(0, 80)}`);
    }
    process.exit(1);
  }
  console.log("\n✅ Tous les tests du tier sont verts.");
  process.exit(0);
}

// --- entrée -------------------------------------------------------------
if (LIST) {
  doList();
} else {
  void doRun();
}
