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
import { ToolRegistry } from "./kernel-mcp.js";
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

/** Registre confiné au worktree, réduit aux seuls outils sûrs (pas de run/réseau). */
export function buildSelfRegistry(worktree: string): ToolRegistry {
  const full = buildEleveActionTools(worktree, { allowRun: false });
  const reg = new ToolRegistry();
  for (const t of full.list()) if (SELF_ALLOWED_TOOLS.has(t.name)) reg.register(t);
  return reg;
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

/** Comment lancer l'agent dans le worktree (injectable pour les tests). */
export type SelfAgentRun = (
  worktree: string, system: string, task: string, onLog: (s: string) => void,
) => Promise<{ text: string; toolTrace: { name: string; args: string }[] }>;

const defaultSelfAgent: SelfAgentRun = (worktree, system, task, onLog) =>
  askEleveAgentic(system, task, buildSelfRegistry(worktree), {
    onTool: (n, a) => onLog(`  🔧 ${n} ${a.slice(0, 110)}`),
  });

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
  opts: { slug?: string; git?: GitRunner; env?: NodeJS.ProcessEnv; runAgent?: SelfAgentRun; system?: string; onLog?: (s: string) => void } = {},
): Promise<SelfExperimentResult> {
  const onLog = opts.onLog ?? (() => {});
  const empty = { patch: "", stat: "" };
  const slug = opts.slug ?? sanitizeSelfSlug(task.slice(0, 40));
  const { wt, reason } = await createSelfWorktree(repoRoot, slug, { git: opts.git, env: opts.env });
  if (!wt) return { ok: false, reason, branch: "", worktree: "", summary: "", trace: [], diff: empty, wt: null };
  onLog(formatSelfWorktree(wt));
  const runAgent = opts.runAgent ?? defaultSelfAgent;
  let summary = "";
  let trace: { name: string; args: string }[] = [];
  try {
    const r = await runAgent(wt.worktree, opts.system ?? SELF_SYSTEM, task, onLog);
    summary = r.text;
    trace = r.toolTrace;
  } catch (e) {
    return { ok: false, reason: `agent : ${(e as Error).message}`, branch: wt.branch, worktree: wt.worktree, summary: "", trace: [], diff: empty, wt };
  }
  const diff = await selfDiff(wt, { git: opts.git });
  return { ok: true, reason: "", branch: wt.branch, worktree: wt.worktree, summary, trace, diff, wt };
}
