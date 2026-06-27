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
import { ToolRegistry, type KernelTool } from "./kernel-mcp.js";
import { buildEleveActionTools } from "./eleve-action-tools.js";
import { askEleveAgentic } from "./eleve.js";

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

/**
 * Rend la copie isolée : retire le worktree (et, en option, supprime la branche). Le repo vivant
 * reste intact. Par défaut on GARDE la branche (pour que Raf relise/fusionne lui-même). Ne lève jamais.
 */
export async function removeSelfWorktree(
  wt: SelfWorktree,
  opts: { git?: GitRunner; deleteBranch?: boolean } = {},
): Promise<{ ok: boolean; reason: string }> {
  const git = opts.git ?? realGit;
  const r = await git(["worktree", "remove", "--force", wt.worktree], wt.repoRoot);
  if (r.code !== 0) return { ok: false, reason: (r.stderr || r.stdout).trim().slice(0, 200) };
  if (opts.deleteBranch) await git(["branch", "-D", wt.branch], wt.repoRoot);
  return { ok: true, reason: "" };
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

/** Registre confiné au worktree, réduit aux seuls outils sûrs (pas de run/réseau).
 *  `opts.checks` ajoute `check_types` (barreau 3 : auto-vérification, type-check seul). */
export function buildSelfRegistry(worktree: string, opts: { checks?: boolean } = {}): ToolRegistry {
  const full = buildEleveActionTools(worktree, { allowRun: false });
  const reg = new ToolRegistry();
  for (const t of full.list()) if (SELF_ALLOWED_TOOLS.has(t.name)) reg.register(t);
  if (opts.checks) reg.register(buildCheckTypesTool(worktree));
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

/** Comment lancer l'agent dans le worktree (injectable pour les tests). */
export type SelfAgentRun = (
  worktree: string, system: string, task: string, onLog: (s: string) => void,
) => Promise<{ text: string; toolTrace: { name: string; args: string }[] }>;

export interface SelfExperimentResult {
  ok: boolean;
  reason: string;
  branch: string;
  worktree: string;
  summary: string; // le résumé de l'Élève
  trace: { name: string; args: string }[]; // outils appelés
  diff: { patch: string; stat: string };
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
  opts: { slug?: string; git?: GitRunner; env?: NodeJS.ProcessEnv; runAgent?: SelfAgentRun; system?: string; allowChecks?: boolean; onLog?: (s: string) => void } = {},
): Promise<SelfExperimentResult> {
  const onLog = opts.onLog ?? (() => {});
  const empty = { patch: "", stat: "" };
  const slug = opts.slug ?? sanitizeSelfSlug(task.slice(0, 40));
  const { wt, reason } = await createSelfWorktree(repoRoot, slug, { git: opts.git, env: opts.env });
  if (!wt) return { ok: false, reason, branch: "", worktree: "", summary: "", trace: [], diff: empty, wt: null };
  onLog(formatSelfWorktree(wt));
  // Barreau 3 — auto-vérification : on jointe node_modules pour que `tsc` tourne dans la
  // copie, et le system rappelle d'appeler check_types. Le défaut compose le registre
  // (avec/sans checks) ; un runAgent injecté (tests) court-circuite tout ça.
  const system = (opts.system ?? SELF_SYSTEM) + (opts.allowChecks ? SELF_SYSTEM_CHECKS : "");
  const defaultAgent: SelfAgentRun = (worktree, sys, t, log) =>
    askEleveAgentic(sys, t, buildSelfRegistry(worktree, { checks: opts.allowChecks }), {
      onTool: (n, a) => log(`  🔧 ${n} ${a.slice(0, 110)}`),
    });
  const runAgent = opts.runAgent ?? defaultAgent;
  let linked = false;
  if (opts.allowChecks && !opts.runAgent) linked = linkNodeModules(wt.worktree, repoRoot);
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
  if (linked) unlinkNodeModules(wt.worktree);
  return { ok: true, reason: "", branch: wt.branch, worktree: wt.worktree, summary, trace, diff, wt };
}
