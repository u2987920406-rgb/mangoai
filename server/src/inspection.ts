// Inspection objective (Phase Ultime, Jalon D).
//
// Après que l'Élève a proposé un plan et que executeContract l'a appliqué, il
// faut décider — sans jugement subjectif — si le travail tient debout. Le seul
// verdict admis ici est FACTUEL : le projet compile-t-il ?
//
// Garde-fou acté (corrections du pré-test) : on escalade vers le Maître sur des
// signaux OBJECTIFS (build cassé, délai), JAMAIS sur « le rendu a l'air correct ».
// Pour un projet Vite, `vite build` est ce signal : il échoue sur erreur de
// syntaxe, import manquant, référence indéfinie, JSX invalide.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { BACKEND_DIR_NAME, backendDepsState } from "./backend-generator.js";

export type InspectionSignal =
  | "ok" // le projet compile (frontend ET, s'il existe, backend)
  | "build-failed" // build frontend en erreur → escalade
  | "timeout" // build trop long → escalade
  | "no-build-script" // pas de script build dans package.json
  | "no-deps" // node_modules absent : npm install requis d'abord
  | "no-package" // pas de package.json
  | "backend-failed" // backend généré (api/) : `tsc --noEmit` en erreur → escalade
  | "backend-no-deps"; // api/ présent mais api/node_modules absent : npm install requis

export interface Inspection {
  ok: boolean; // true uniquement si signal === "ok"
  signal: InspectionSignal;
  detail: string; // fin de la sortie du build / message
  durationMs: number;
}

function npmBin(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCmd(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number; out: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    // Commande en chaîne unique + shell:true (pas d'args séparés) pour éviter
    // l'avertissement DEP0190 ; npm.cmd sous Windows nécessite le shell.
    const proc = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let out = "";
    const cap = (d: Buffer) => {
      out += d.toString();
      if (out.length > 12_000) out = out.slice(-12_000);
    };
    proc.stdout?.on("data", cap);
    proc.stderr?.on("data", cap);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (proc.pid) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          proc.kill("SIGKILL");
        }
      }
    }, timeoutMs);

    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out: `${out}\n${e.message}`, timedOut });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, timedOut });
    });
  });
}

/** Build frontend (`npm run build`) à la racine du projet. */
function runBuild(projectDir: string, timeoutMs: number) {
  return runCmd(`${npmBin()} run build`, projectDir, timeoutMs);
}

/** Vérifie le backend généré (api/). Le backend tourne en runtime `tsx` → pas
 * de script `build` ; le signal objectif équivalent au `vite build` est
 * `tsc --noEmit` (échoue sur syntaxe / import manquant / type invalide). On
 * passe par le binaire LOCAL (--no-install → jamais de réseau ; typescript est
 * dans les devDeps du template backend). */
function runBackendCheck(apiDir: string, timeoutMs: number) {
  return runCmd("npx --no-install tsc --noEmit", apiDir, timeoutMs);
}

/** Vérifie objectivement qu'un projet généré compile. */
export async function inspectProject(
  projectDir: string,
  opts: { timeoutMs?: number } = {},
): Promise<Inspection> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const t0 = Date.now();
  const done = (signal: InspectionSignal, detail: string): Inspection => ({
    ok: signal === "ok",
    signal,
    detail: detail.trim(),
    durationMs: Date.now() - t0,
  });

  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return done("no-package", "package.json absent");

  let hasBuild = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    hasBuild = typeof pkg.scripts?.build === "string";
  } catch {
    return done("no-package", "package.json illisible");
  }
  if (!hasBuild) return done("no-build-script", "aucun script `build`");

  // Le build a besoin des dépendances ; sans elles, le verdict serait un faux
  // négatif. On le signale distinctement (l'orchestrateur lancera npm install).
  if (!fs.existsSync(path.join(projectDir, "node_modules"))) {
    return done("no-deps", "node_modules absent");
  }

  const { code, out, timedOut } = await runBuild(projectDir, timeoutMs);
  if (timedOut) return done("timeout", out.slice(-800));
  if (code !== 0) return done("build-failed", out.slice(-1500));

  // Frontend OK. Un projet full-stack a un backend généré dans api/ — jusqu'ici
  // jamais validé : le verdict s'arrêtait au frontend (bug du run 2026-06-20).
  // On l'inspecte aussi ; "ok" exige désormais que les DEUX tiennent debout.
  const backend = backendDepsState(projectDir);
  if (backend === "no-deps") return done("backend-no-deps", "api/node_modules absent");
  if (backend === "ready") {
    const apiDir = path.join(projectDir, BACKEND_DIR_NAME);
    const be = await runBackendCheck(apiDir, timeoutMs);
    if (be.timedOut) return done("timeout", be.out.slice(-800));
    if (be.code !== 0) return done("backend-failed", be.out.slice(-1500));
  }

  return done("ok", out.slice(-400));
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS (#L55) — un build vert ne garantit PAS que le code MARCHE. Si le projet
// a un VRAI script `test`, on le lance pour que le Gardien (#161) puisse renvoyer
// l'Élève corriger quand les tests sont rouges. Lancé via le runner normal du
// projet (comme `npm run build`) : le sandbox `node --permission` ne convient pas
// ici (il bloquerait un runner type vitest/node qui spawn des process).

export type TestSignal =
  | "tests-ok" // tous les tests passent
  | "tests-failed" // au moins un test échoue → renvoie corriger
  | "no-test-script" // pas de script `test` réel (ou placeholder npm)
  | "no-deps" // node_modules absent
  | "timeout"; // suite de tests trop longue

export interface TestRun {
  ok: boolean; // true uniquement si signal === "tests-ok"
  signal: TestSignal;
  detail: string;
  durationMs: number;
}

/** Lance la suite de tests du projet (`npm test`) si un script test réel existe. */
export async function runProjectTests(
  projectDir: string,
  opts: { timeoutMs?: number } = {},
): Promise<TestRun> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const t0 = Date.now();
  const done = (signal: TestSignal, detail: string): TestRun => ({
    ok: signal === "tests-ok",
    signal,
    detail: detail.trim(),
    durationMs: Date.now() - t0,
  });

  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return done("no-test-script", "package.json absent");

  let testScript = "";
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    testScript = typeof pkg.scripts?.test === "string" ? pkg.scripts.test : "";
  } catch {
    return done("no-test-script", "package.json illisible");
  }
  // Ignore le placeholder par défaut de `npm init` (« Error: no test specified »).
  if (!testScript.trim() || /no test specified/i.test(testScript)) {
    return done("no-test-script", "aucun script `test` réel");
  }
  if (!fs.existsSync(path.join(projectDir, "node_modules"))) {
    return done("no-deps", "node_modules absent");
  }

  const { code, out, timedOut } = await runCmd(`${npmBin()} test`, projectDir, timeoutMs);
  if (timedOut) return done("timeout", out.slice(-800));
  if (code !== 0) return done("tests-failed", out.slice(-1500));
  return done("tests-ok", out.slice(-400));
}
