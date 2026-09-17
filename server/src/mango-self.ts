import { createRequire } from "node:module";
// Auto-amélioration de MangoOS — la « copie isolée » (barreau (B), décidé avec Raf 2026-06-27).
//
// Mango pourra un jour LIRE et améliorer son PROPRE code. La règle de sûreté décidée :
//   • COPIE ISOLÉE — il ne touche JAMAIS le repo vivant ni le process en cours. Il travaille
//     dans un **git worktree** sur une branche dédiée `mango/self-<slug>`.
//   • DIFF RELU — le livrable est un `git diff` que Raf relit ; RIEN n'est fusionné ni poussé
//     automatiquement (aucune fonction merge/push n'existe ici — impossible par accident).
//   • RÉVERSIBLE — `git worktree remove` rend la copie ; le repo vivant reste intact.
//
// Ce module = le MÉCANISME (cycle de vie du worktree + diff), pas encore l'agent. Le run de
// l'Élève DANS le worktree (read + write confinés via resolveInside) se branche par-dessus.
// Git INJECTABLE → tests déterministes sans toucher au vrai dépôt. Gaté `MANGO_SELF`.

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { z } from "zod";
import { ToolRegistry, type KernelTool } from "./kernel/kernel-mcp.js";
import { buildEleveActionTools } from "./eleve-tools/eleve-action-tools.js";
import { askEleveAgentic } from "./eleve.js";
import { selfAntiSpiralCfg } from "./eleve-antispiral.js";

/** Exécuteur git injectable (tests). Renvoie code/stdout/stderr, ne lève jamais. */
export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface SelfWorktree {
  /** Chemin absolu de la copie isolée (le worktree). */
  worktree: string;
  /** Branche dédiée créée pour ce travail. */
  branch: string;
  /** Racine du dépôt vivant (jamais modifiée). */
  repoRoot: string;
}

const BRANCH_PREFIX = "mango/self-";
const GIT_TIMEOUT_MS = 30_000;

/** Exécuteur git réel (spawn, sans shell, borné par timeout). Ne lève jamais. */
export const realGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    const p = spawn("git", args, { cwd, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try { p.kill(); } catch { /* déjà mort */ }
      resolve({ code: 124, stdout, stderr: stderr + "\n[timeout git]" });
    }, GIT_TIMEOUT_MS);
    p.stdout?.on("data", (d) => (stdout += d.toString()));
    p.stderr?.on("data", (d) => (stderr += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: String(e) }); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  });

/** Slug de branche/worktree sûr : minuscules, [a-z0-9-], borné. PUR. */
export function sanitizeSelfSlug(raw: string): string {
  const s = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "experience";
}

/** Base où vivent les worktrees (HORS du repo, pour ne rien polluer). Configurable. */
export function selfWorktreeBase(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = (env.MANGO_SELF_WORKTREE_BASE ?? "").trim();
  return fromEnv || path.join(path.dirname(path.resolve(repoRoot)), ".mango-self");
}

/**
 * Crée la copie isolée : un git worktree neuf sur une branche `mango/self-<slug>` partant de
 * HEAD. Le repo vivant n'est PAS modifié (worktree = dossier séparé). Ne lève jamais : en cas
 * d'échec git, renvoie null (+ la raison dans `reason`).
 */
export async function createSelfWorktree(
  repoRoot: string,
  rawSlug: string,
  opts: { git?: GitRunner; env?: NodeJS.ProcessEnv } = {},
): Promise<{ wt: SelfWorktree | null; reason: string }> {
  const git = opts.git ?? realGit;
  const slug = sanitizeSelfSlug(rawSlug);
  const branch = `${BRANCH_PREFIX}${slug}`;
  const base = selfWorktreeBase(repoRoot, opts.env);
  const worktree = path.join(base, slug);
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch (e) {
    return { wt: null, reason: `base injoignable : ${(e as Error).message}` };
  }
  // -b crée la branche ; échoue proprement si la branche/worktree existe déjà (slug à varier).
  const r = await git(["worktree", "add", "-b", branch, worktree, "HEAD"], repoRoot);
  if (r.code !== 0) {
    return { wt: null, reason: `git worktree add : ${(r.stderr || r.stdout).trim().slice(0, 200)}` };
  }
  return { wt: { worktree, branch, repoRoot }, reason: "" };
}

/**
 * Le DIFF relisable de la copie isolée : on stage TOUT (fichiers neufs inclus) puis on rend le
 * patch. Le staging se fait DANS le worktree (isolé, jetable) — le repo vivant n'est pas touché.
 * Renvoie aussi le résumé `--stat`. Ne lève jamais.
 */
export async function selfDiff(
  wt: SelfWorktree,
  opts: { git?: GitRunner } = {},
): Promise<{ patch: string; stat: string }> {
  const git = opts.git ?? realGit;
  await git(["add", "-A"], wt.worktree);
  const stat = await git(["diff", "--cached", "--stat"], wt.worktree);
  const patch = await git(["diff", "--cached"], wt.worktree);
  return { patch: patch.stdout, stat: stat.stdout };
}

/** Un chemin (cible) reste-t-il sous `root` ? (anti-évasion de chemin). PUR. */
export function isInsidePath(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(r + path.sep);
}

/**
 * FUSION : écrit dans le repo VIVANT les fichiers choisis depuis la copie isolée (ajoute le
 * newline final manquant). N'exécute AUCUN git (c'est « save » : à committer ensuite). Garde
 * anti-évasion : chaque fichier doit rester dans le repo ET dans la copie. Ne lève jamais.
 */
export function mergeSelfFiles(repoRoot: string, worktree: string, files: string[]): { merged: string[]; refused: string[] } {
  const merged: string[] = [];
  const refused: string[] = [];
  for (const rel of files) {
    const src = path.join(worktree, rel);
    const dst = path.join(repoRoot, rel);
    if (!isInsidePath(repoRoot, dst) || !isInsidePath(worktree, src)) { refused.push(rel); continue; }
    try {
      if (!fs.existsSync(src)) { refused.push(rel); continue; }
      let content = fs.readFileSync(src, "utf8");
      if (content.length > 0 && !content.endsWith("\n")) content += "\n";
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, content);
      merged.push(rel);
    } catch { refused.push(rel); }
  }
  return { merged, refused };
}

/** Liste des fichiers modifiés dans la copie (relatifs à la racine). Ne lève jamais. */
export async function selfChangedFiles(wt: SelfWorktree, opts: { git?: GitRunner } = {}): Promise<string[]> {
  const git = opts.git ?? realGit;
  await git(["add", "-A"], wt.worktree);
  const r = await git(["diff", "--cached", "--name-only"], wt.worktree);
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Rend la copie isolée : retire le worktree (et, en option, supprime la branche). Le repo vivant
 * reste intact. Par défaut on GARDE la branche (pour que Raf relise/fusionne lui-même). Ne lève jamais.
 *
 * ROBUSTE : si `git worktree remove` échoue (état à moitié laissé par un nettoyage antérieur,
 * `.git` manquant, dossier verrouillé sous Windows, métadonnées « prunable »…), on bascule sur un
 * FALLBACK — suppression physique du dossier PUIS `git worktree prune` — pour ne JAMAIS laisser
 * d'orphelin s'accumuler dans `.mango-self`. `pruned` indique si ce chemin de secours a servi.
 */
export async function removeSelfWorktree(
  wt: SelfWorktree,
  opts: { git?: GitRunner; deleteBranch?: boolean; rmDir?: (dir: string) => void } = {},
): Promise<{ ok: boolean; reason: string; pruned: boolean }> {
  const git = opts.git ?? realGit;
  const rmDir = opts.rmDir ?? ((dir: string) => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
  let pruned = false;
  const r = await git(["worktree", "remove", "--force", wt.worktree], wt.repoRoot);
  if (r.code !== 0) {
    // git n'a pas su retirer proprement → on force : dossier physique d'abord, puis purge des
    // métadonnées git (sinon `git worktree list` garde une entrée fantôme « prunable »).
    rmDir(wt.worktree);
    const pr = await git(["worktree", "prune"], wt.repoRoot);
    pruned = true;
    if (pr.code !== 0) return { ok: false, reason: (r.stderr || r.stdout || pr.stderr).trim().slice(0, 200), pruned };
  }
  if (opts.deleteBranch) await git(["branch", "-D", wt.branch], wt.repoRoot);
  return { ok: true, reason: "", pruned };
}

/** Ligne lisible (observabilité). */
export function formatSelfWorktree(wt: SelfWorktree): string {
  return `🪞 Copie isolée : branche « ${wt.branch} » → ${wt.worktree} (repo vivant intact)`;
}

// ── Barreau 2 : faire travailler l'Élève DANS la copie isolée ─────────────────
//
// L'Élève GLM reçoit un registre d'outils MINIMAL, enraciné sur le worktree :
// read/list/search + write/edit + finish. Volontairement PAS de `run_command`
// (allowRun:false), PAS de réseau (web/site/parcours filtrés) → zéro exécution
// de commande, zéro exfiltration possible. La vérification (tsc/tests) se fait
// EN DEHORS, par un humain/Claude, sur le diff produit. Tout dans le worktree :
// le repo vivant et le process en cours ne sont jamais touchés.

/** Outils autorisés pour un run d'auto-amélioration (barreau 2, lecture+écriture seules). */
export const SELF_ALLOWED_TOOLS: ReadonlySet<string> = new Set([
  "read_file", "list_files", "search_code", "write_file", "edit_file", "finish",
]);

// ── Barreau 3 : l'AUTO-VÉRIFICATION (type-check uniquement, sans RCE) ──────────
//
// On donne à l'Élève un moyen de vérifier que SON code compile, sans lui ouvrir un
// `run_command` générique. Raison de sûreté CAPITALE : autoriser `npx tsx src/test-X.ts`
// exécuterait du code ARBITRAIRE que l'Élève vient d'écrire (RCE → rm, exfiltration…).
// `tsc --noEmit` ne fait que TYPE-CHECKER : il n'exécute aucun code du projet. C'est
// l'« allowlist » réduite à sa forme la plus sûre — un outil à ZÉRO argument (aucune
// surface d'injection). L'EXÉCUTION de tests reste externe (Claude/Raf) tant qu'il n'y a
// pas de vrai bac à sable (barreau 4). tsc tourne DANS le worktree (jonction node_modules).

const TSC_TIMEOUT_MS = 120_000;

/** Lance `tsc --noEmit` dans le worktree (server/). Ne lève jamais. */
export function runTscInWorktree(worktree: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const cwd = path.join(worktree, "server");
    const p = spawn("npx tsc --noEmit", { cwd, shell: true, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => { try { p.kill(); } catch { /* mort */ } resolve({ ok: false, output: out + "\n[timeout tsc]" }); }, TSC_TIMEOUT_MS);
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (out += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, output: String(e) }); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, output: out }); });
  });
}

/** Outil `check_types` (zéro argument) : type-check du serveur, n'exécute aucun code. */
export function buildCheckTypesTool(worktree: string): KernelTool {
  return {
    name: "check_types",
    description:
      "Vérifie que TON code compile : lance `tsc --noEmit` sur le serveur (dans la copie isolée). " +
      "Type-check SEULEMENT — n'exécute aucun code. Appelle-le AVANT `finish` ; s'il remonte des erreurs, corrige-les puis re-vérifie.",
    inputSchema: {},
    handler: async () => {
      const r = await runTscInWorktree(worktree);
      return { text: r.ok ? "✅ tsc --noEmit : aucun problème de types." : `❌ tsc --noEmit a trouvé des erreurs :\n${r.output.slice(0, 3000)}` };
    },
  };
}

// ── Barreau 4 : exécuter les TESTS dans un VRAI bac à sable ───────────────────
//
// Le seul cran qui ouvre l'exécution de code écrit par l'Élève. Garde-fou réel (prouvé) :
//   1. esbuild BUNDLE le test (étape de CONFIANCE : esbuild TRANSFORME, n'exécute pas le
//      code du test) → un .mjs autonome dans un dossier temp jetable.
//   2. `node --permission` exécute ce bundle avec : FS en LECTURE/ÉCRITURE confiné au temp,
//      `child_process` REFUSÉ, addons natifs REFUSÉS. Un test piégé (`fs.rmSync('D:/…')`,
//      `execSync(...)`) échoue en `ERR_ACCESS_DENIED` — prouvé live.
// Le modèle de permissions de Node ne filtre PAS le réseau nativement — on ajoute donc une
// GARDE RÉSEAU (runner.cjs) qui neutralise fetch + bloque les modules réseau (L42). Mais le test
// ne peut RIEN lire hors du temp (ni `.env`, ni secrets, absents du worktree de toute façon)
// → rien de sensible à exfiltrer ; au pire un POST de données qu'il génère lui-même. Faible.

const SANDBOX_BUNDLE_TIMEOUT_MS = 60_000;
const SANDBOX_RUN_TIMEOUT_MS = 60_000;

/** Spawn capturé (code+sortie), borné par timeout, ne lève jamais. */
function spawnCaptured(
  command: string, args: string[] | null, cwd: string, shell: boolean, timeoutMs: number,
): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = args ? spawn(command, args, { cwd, shell, windowsHide: true }) : spawn(command, { cwd, shell, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => { try { p.kill(); } catch { /* mort */ } resolve({ code: 124, out: out + "\n[timeout]" }); }, timeoutMs);
    p.stdout?.on("data", (d) => (out += d.toString()));
    p.stderr?.on("data", (d) => (out += d.toString()));
    p.on("error", (e) => { clearTimeout(timer); resolve({ code: 1, out: out + String(e) }); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 0, out }); });
  });
}

/**
 * Exécute un fichier de test du worktree DANS UN BAC À SABLE. PROUVÉ : bloque l'écriture FS
 * hors temp + le `child_process`. `nowMs` injectable (unicité du dossier temp). Ne lève jamais.
 */
export async function runTestSandboxed(
  worktree: string, testRel: string, opts: { nowMs?: number } = {},
): Promise<{ ok: boolean; output: string }> {
  const stamp = opts.nowMs ?? Date.now();
  const tmp = path.join(os.tmpdir(), "mango-sbx", `${sanitizeSelfSlug(testRel)}-${stamp}`);
  const bundle = path.join(tmp, "bundle.cjs");
  const testAbs = path.join(worktree, testRel);
  try { fs.mkdirSync(tmp, { recursive: true }); } catch (e) { return { ok: false, output: `temp KO : ${(e as Error).message}` }; }
  try {
    // 1. Bundle (CONFIANCE) — cwd=worktree pour résoudre node_modules (jonction) + imports relatifs.
    const esb = await spawnCaptured(
      process.platform === "win32" ? process.execPath : createRequire(import.meta.url).resolve("esbuild/bin/esbuild"), [...(process.platform === "win32" ? [createRequire(import.meta.url).resolve("esbuild/bin/esbuild")] : []), testAbs, "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`],
      worktree, false, SANDBOX_BUNDLE_TIMEOUT_MS,
    );
    if (esb.code !== 0 || !fs.existsSync(bundle)) return { ok: false, output: "bundling esbuild KO :\n" + esb.out.slice(0, 1500) };

  // 1b. GARDE RÉSEAU — le modèle --permission de Node ne filtre PAS le réseau (L42).
  //     On crée un runner.cjs qui patche Module.prototype.require (bloque les modules
  //     réseau) et neutralise globalThis.fetch, AVANT de charger le bundle.
  const runnerPath = path.join(tmp, "runner.cjs");
  const runnerCode =
    'const M=require("module");' +
    'const F=new Set(["net","tls","http","https","http2","dgram","dns","node:net","node:tls","node:http","node:https","node:http2","node:dgram","node:dns"]);' +
    'const O=M.prototype.require;' +
    'M.prototype.require=function(n){if(F.has(n))throw new Error("réseau interdit dans le bac à sable : require(\'"+n+"\') bloqué");return O.call(this,n)};' +
    'globalThis.fetch=function(){throw new Error("réseau interdit dans le bac à sable : fetch() bloqué");};' +
    'require(' + JSON.stringify(bundle) + ');';
  fs.writeFileSync(runnerPath, runnerCode);
    // 2. Exécution SOUS BAC À SABLE — FS confiné à tmp, pas de child_process/natif.
    const runRes = await spawnCaptured(
      "node", ["--permission", `--allow-fs-read=${tmp}`, `--allow-fs-write=${tmp}`, runnerPath],
      tmp, false, SANDBOX_RUN_TIMEOUT_MS,
    );
    return { ok: runRes.code === 0, output: runRes.out };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/** Outil `run_tests` (barreau 4) : exécute un fichier de test dans le bac à sable. */
export function buildRunTestsTool(worktree: string): KernelTool {
  return {
    name: "run_tests",
    description:
      "Exécute un fichier de test DANS UN BAC À SABLE (système de fichiers confiné, pas de réseau vers tes secrets, pas de spawn). " +
      "Donne le chemin du test relatif à la racine (ex. server/src/test-x.ts). Appelle-le pour vérifier que TES tests PASSENT avant `finish`.",
    inputSchema: { file: z.string().describe("Chemin du fichier de test, relatif à la racine (ex. server/src/test-x.ts)") },
    handler: async (args) => {
      const file = String(args.file ?? "");
      if (!file) return { text: "❌ run_tests : précise le chemin du fichier de test.", isError: true };
      const r = await runTestSandboxed(worktree, file);
      return { text: r.ok ? `✅ tests OK (bac à sable) :\n${r.output.slice(-1500)}` : `❌ tests KO (bac à sable) :\n${r.output.slice(-2500)}` };
    },
  };
}

/** Registre confiné au worktree, réduit aux seuls outils sûrs (pas de run/réseau).
 *  `opts.checks` ajoute `check_types` (B3) ; `opts.sandboxTests` ajoute `run_tests` (B4). */
export function buildSelfRegistry(worktree: string, opts: { checks?: boolean; sandboxTests?: boolean } = {}): ToolRegistry {
  const full = buildEleveActionTools(worktree, { allowRun: false });
  const reg = new ToolRegistry();
  for (const t of full.list()) if (SELF_ALLOWED_TOOLS.has(t.name)) reg.register(t);
  if (opts.checks) reg.register(buildCheckTypesTool(worktree));
  if (opts.sandboxTests) reg.register(buildRunTestsTool(worktree));
  return reg;
}

/** Jonction node_modules (server) du worktree → repo vivant, pour que `tsc` tourne.
 *  Renvoie true si une jonction a été créée (à retirer ensuite). Ne lève jamais. */
export function linkNodeModules(worktree: string, repoRoot: string): boolean {
  const link = path.join(worktree, "server", "node_modules");
  const target = path.join(path.resolve(repoRoot), "server", "node_modules");
  try {
    if (!fs.existsSync(link) && fs.existsSync(target)) { fs.symlinkSync(target, link, "junction"); return true; }
  } catch { /* best-effort */ }
  return false;
}

/** Retire la jonction node_modules (sans toucher au node_modules cible). Ne lève jamais. */
export function unlinkNodeModules(worktree: string): void {
  const link = path.join(worktree, "server", "node_modules");
  try { if (fs.existsSync(link)) fs.rmSync(link, { recursive: false, force: true }); } catch { /* best-effort */ }
}

/** System prompt cadrant le travail sur le code de MangoOS lui-même. */
export const SELF_SYSTEM = [
  "Tu travailles sur le CODE SOURCE de MangoOS LUI-MÊME (le générateur d'apps), dans une COPIE ISOLÉE (git worktree).",
  "Tu as des outils de LECTURE (read_file, list_files, search_code) et d'ÉCRITURE (write_file, edit_file) confinés à cette copie.",
  "Contraintes STRICTES :",
  "- Ne modifie QUE les fichiers nommés dans la tâche. Ne touche à rien d'autre.",
  "- SUIS les conventions du code existant (lis d'abord le fichier voisin pour t'aligner sur le style, les imports, le ton des commentaires en français).",
  "- Tu n'as ni terminal ni réseau : tu ne peux pas lancer de commande ni chercher sur le web. Raisonne à partir du code que tu lis.",
  "- Code TypeScript correct (types explicites, pas de `any` gratuit). Le code doit compiler (`tsc`) et les tests passer — un humain vérifiera.",
  "- Quand tu as fini, appelle `finish` avec un résumé bref de ce que tu as changé.",
].join("\n");

/** Clause ajoutée au system quand l'auto-vérification (barreau 3) est active. */
export const SELF_SYSTEM_CHECKS =
  "\n- AUTO-VÉRIFICATION : tu as l'outil `check_types`. Appelle-le pour vérifier que ton code compile " +
  "AVANT d'appeler `finish`. S'il remonte des erreurs de types, CORRIGE-les puis re-vérifie, jusqu'à ce que ce soit vert.";

/** Clause ajoutée au system quand l'exécution de tests en bac à sable (barreau 4) est active. */
export const SELF_SYSTEM_TESTS =
  "\n- TESTS : tu as l'outil `run_tests` (exécution en bac à sable). Après avoir écrit/modifié un test, " +
  "appelle-le sur ton fichier de test pour vérifier qu'il PASSE. Corrige jusqu'au vert avant `finish`.";

/** Regex : un chemin de fichier de test (`test-*.ts` / `.tsx`), à n'importe quel niveau. */
const TEST_FILE_RE = /(?:^|[\\/])test-[^\\/]+\.tsx?$/;

/** Dépendances de la vérif de clôture (injectables pour les tests). */
export interface VerifyDeps {
  runTsc?: (worktree: string) => Promise<{ ok: boolean; output: string }>;
  runTest?: (worktree: string, testRel: string) => Promise<{ ok: boolean; output: string }>;
}

/**
 * Vérification de CLÔTURE (#atelier) : sur l'état FINAL du worktree, lance le VRAI
 * `tsc --noEmit` (le même contrôle que le repo) puis exécute en bac à sable les fichiers
 * `test-*.ts` modifiés. Le verdict reflète ce que le repo verra à la FUSION — fini le badge
 * « ✓ » basé sur « l'Élève a appelé l'outil ». Node_modules doit être jointe. Ne lève jamais.
 */
export async function verifySelfClosure(
  worktree: string,
  changedFiles: string[],
  onLog: (s: string) => void = () => {},
  deps: VerifyDeps = {},
): Promise<SelfVerify> {
  const runTsc = deps.runTsc ?? runTscInWorktree;
  const runTest = deps.runTest ?? runTestSandboxed;
  onLog("🔎 Vérification de clôture : tsc réel + tests sur l'état final…");
  const tsc = await runTsc(worktree);
  onLog(tsc.ok ? "  ✅ tsc --noEmit : aucun problème de types" : "  ❌ tsc --noEmit : des erreurs de types subsistent");
  const testFiles = (changedFiles ?? []).filter((f) => TEST_FILE_RE.test(f));
  const tests: SelfVerify["tests"] = [];
  for (const rel of testFiles) {
    const r = await runTest(worktree, rel);
    onLog(`  ${r.ok ? "✅" : "❌"} tests ${rel}`);
    tests.push({ file: rel, ok: r.ok, output: r.output.slice(-1500) });
  }
  return {
    ran: true,
    typesOk: tsc.ok,
    typesOutput: tsc.ok ? "" : tsc.output.slice(0, 2500),
    testsOk: tests.every((t) => t.ok), // vrai aussi si aucun test-*.ts modifié
    tests,
  };
}

/** Comment lancer l'agent dans le worktree (injectable pour les tests). */
export type SelfAgentRun = (
  worktree: string, system: string, task: string, onLog: (s: string) => void,
) => Promise<{ text: string; toolTrace: { name: string; args: string }[] }>;

/**
 * Verdict de CLÔTURE — reflète l'état FINAL du worktree tel que le repo le verra à la fusion
 * (le VRAI `tsc --noEmit` + les tests modifiés exécutés), PAS « l'Élève a appelé l'outil ».
 * C'est ce qui empêche un chantier « vert » de casser le repo une fois fusionné.
 */
export interface SelfVerify {
  ran: boolean; // false si non vérifié (node_modules non jointe)
  typesOk: boolean; // `tsc --noEmit` final sans erreur
  typesOutput: string; // erreurs tsc (tronquées) si rouge, sinon ""
  testsOk: boolean; // aucun test-*.ts modifié en échec (vrai aussi si aucun)
  tests: { file: string; ok: boolean; output: string }[]; // par fichier de test exécuté
}

export interface SelfExperimentResult {
  ok: boolean;
  reason: string;
  branch: string;
  worktree: string;
  summary: string; // le résumé de l'Élève
  trace: { name: string; args: string }[]; // outils appelés
  diff: { patch: string; stat: string };
  /** Verdict de clôture (état final réel) — présent si la vérif a pu tourner (#atelier). */
  verify?: SelfVerify;
  wt: SelfWorktree | null;
}

/**
 * Lance un chantier BORNÉ d'auto-amélioration : copie isolée → l'Élève travaille DEDANS
 * (lecture+écriture, sans run ni réseau) → on rend le DIFF relisable. Ne fusionne ni ne
 * pousse JAMAIS (à Raf de relire/fusionner). Le worktree est CONSERVÉ par défaut (pour
 * inspection/vérif). Ne lève jamais : toute erreur → `ok:false` + raison.
 */
export async function runSelfExperiment(
  repoRoot: string,
  task: string,
  opts: { slug?: string; git?: GitRunner; env?: NodeJS.ProcessEnv; runAgent?: SelfAgentRun; system?: string; allowChecks?: boolean; allowTests?: boolean; onLog?: (s: string) => void } = {},
): Promise<SelfExperimentResult> {
  const onLog = opts.onLog ?? (() => {});
  const empty = { patch: "", stat: "" };
  const slug = opts.slug ?? sanitizeSelfSlug(task.slice(0, 40));
  const { wt, reason } = await createSelfWorktree(repoRoot, slug, { git: opts.git, env: opts.env });
  if (!wt) return { ok: false, reason, branch: "", worktree: "", summary: "", trace: [], diff: empty, wt: null };
  onLog(formatSelfWorktree(wt));
  // Barreaux 3/4 — auto-vérification : on jointe node_modules pour que `tsc` (B3) et le
  // bundling esbuild (B4) tournent dans la copie ; le system rappelle d'appeler les outils.
  // Le défaut compose le registre ; un runAgent injecté (tests) court-circuite tout ça.
  const system = (opts.system ?? SELF_SYSTEM) + (opts.allowChecks ? SELF_SYSTEM_CHECKS : "") + (opts.allowTests ? SELF_SYSTEM_TESTS : "");
  // Un run d'auto-amélioration enchaîne écrire → check_types → corriger → run_tests →
  // corriger : on donne plus de marge d'itérations que le chat (défaut 12) quand on
  // ouvre les outils de vérification, sinon l'Élève épuise son budget avant de vérifier.
  const maxIterations = opts.allowChecks || opts.allowTests ? 28 : undefined;
  // Garde anti-spirale (L35/run L42) : empêche l'Élève de mourir en pure exploration
  // avant d'écrire. Opt-out SELF_ANTISPIRAL=off. Sans effet sur les autres flux (build,
  // discuter, explore) qui n'appellent pas askEleveAgentic via ce chemin.
  const antiSpiral = selfAntiSpiralCfg() ?? undefined;
  const defaultAgent: SelfAgentRun = (worktree, sys, t, log) =>
    askEleveAgentic(sys, t, buildSelfRegistry(worktree, { checks: opts.allowChecks, sandboxTests: opts.allowTests }), {
      onTool: (n, a) => log(`  🔧 ${n} ${a.slice(0, 110)}`),
      maxIterations,
      antiSpiral,
    });
  const runAgent = opts.runAgent ?? defaultAgent;
  let linked = false;
  if ((opts.allowChecks || opts.allowTests) && !opts.runAgent) linked = linkNodeModules(wt.worktree, repoRoot);
  let summary = "";
  let trace: { name: string; args: string }[] = [];
  try {
    const r = await runAgent(wt.worktree, system, task, onLog);
    summary = r.text;
    trace = r.toolTrace;
  } catch (e) {
    if (linked) unlinkNodeModules(wt.worktree);
    return { ok: false, reason: `agent : ${(e as Error).message}`, branch: wt.branch, worktree: wt.worktree, summary: "", trace: [], diff: empty, wt };
  }
  const diff = await selfDiff(wt, { git: opts.git });
  // Vérification de CLÔTURE : reflète l'état FINAL (vrai tsc + tests) tel que le repo le verra
  // à la fusion. Node_modules est encore jointe ici (unlink juste après). Best-effort : un
  // échec de la vérif ne cache pas le diff (verify reste undefined).
  let verify: SelfVerify | undefined;
  if (linked && (opts.allowChecks || opts.allowTests)) {
    try {
      const changed = await selfChangedFiles(wt);
      verify = await verifySelfClosure(wt.worktree, changed, onLog);
    } catch { /* best-effort : on rend quand même le diff */ }
  }
  if (linked) unlinkNodeModules(wt.worktree);
  return { ok: true, reason: "", branch: wt.branch, worktree: wt.worktree, summary, trace, diff, verify, wt };
}
