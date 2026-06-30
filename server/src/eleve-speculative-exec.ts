// Exécution agentique spéculative — EXÉCUTEUR EN WORKTREE (#171, slice 3). Compose l'orchestrateur
// (slice 2) avec l'infra isolée de l'auto-amélioration : on exécute le draft dans un **git worktree**
// (effets de bord jetables), on VÉRIFIE chaque étape (build/type-check après les étapes mutantes), on
// CHECKPOINTE les étapes acceptées (commit dans le worktree) et on JETTE l'étape divergente (reset),
// puis on APPLIQUE le préfixe accepté au projet. Deps injectées → testable sans git ni réseau.
//
// Chemin ADDITIF : ne modifie PAS la boucle `eleve-runtime`. S'invoque à part (gaté), comme une
// expérience. Hérite du modèle de sûreté de l'auto-amélioration (#167 : worktree jetable, réversible).
import { speculativeAttempt, type DraftStep } from "./eleve-speculative-runner.js";
import type { SpecStep } from "./eleve-speculative.js";
import {
  createSelfWorktree,
  removeSelfWorktree,
  runTscInWorktree,
  buildSelfRegistry,
  mergeSelfFiles,
  SELF_ALLOWED_TOOLS,
  type SelfWorktree,
  type GitRunner,
} from "./mango-self.js";
import { inspectProject } from "./inspection.js";
import { BACKEND_DIR_NAME } from "./backend-generator.js";
import { buildEleveActionTools } from "./eleve-action-tools.js";
import { ToolRegistry } from "./kernel-mcp.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Outils dont le nom dénote une MUTATION → on lance un type-check avant d'accepter. */
const MUTATING = /write|edit|create|modif|patch|append|supprim|delete/i;

export interface SpecExecDeps {
  createWorktree(repoRoot: string, slug: string): Promise<{ wt: SelfWorktree | null; reason: string }>;
  removeWorktree(wt: SelfWorktree): Promise<void>;
  /** exécute un outil drafté dans le worktree → résultat */
  invoke(worktree: string, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }>;
  /** vérif déterministe après une étape mutante (type-check vert ?) */
  typecheck(worktree: string): Promise<boolean>;
  git: GitRunner;
  /** applique le préfixe accepté au projet (défaut : merge des fichiers, sans git) */
  apply(repoRoot: string, worktree: string, files: string[]): { merged: string[]; refused: string[] };
}

export interface SpecExecResult {
  ok: boolean;
  reason: string;
  accepted: number;
  drafted: number;
  divergedAt: number | null;
  savedRoundTrips: number;
  changedFiles: string[];
  appliedFiles: string[];
  summary: string;
}

export async function runSpeculativeInWorktree(
  repoRoot: string,
  slug: string,
  draft: DraftStep[],
  deps: SpecExecDeps,
): Promise<SpecExecResult> {
  const empty: SpecExecResult = {
    ok: false, reason: "", accepted: 0, drafted: draft.length, divergedAt: null,
    savedRoundTrips: 0, changedFiles: [], appliedFiles: [], summary: "",
  };
  if (!draft.length) return { ...empty, reason: "draft vide" };

  const { wt, reason } = await deps.createWorktree(repoRoot, slug);
  if (!wt) return { ...empty, reason: `worktree impossible : ${reason}` };

  try {
    // Point de départ du worktree (branche off HEAD) : sert à calculer le diff du préfixe accepté.
    const baseRev = (await deps.git(["rev-parse", "HEAD"], wt.worktree)).stdout.trim();

    const attempt = await speculativeAttempt(draft, {
      execute: (s: SpecStep<DraftStep>) => deps.invoke(wt.worktree, s.payload!.tool, s.payload!.args),
      verify: async (s: SpecStep<DraftStep>, outcome) => {
        if (!outcome.ok) return false;
        const step = s.payload!;
        if (MUTATING.test(step.tool)) {
          const green = await deps.typecheck(wt.worktree);
          if (!green) return false; // build cassé → divergence (l'étape sera jetée)
        }
        // checkpoint : on fige l'étape acceptée dans le worktree
        await deps.git(["add", "-A"], wt.worktree);
        await deps.git(["commit", "-m", `spec: ${step.label}`.slice(0, 72), "--no-verify"], wt.worktree);
        return true;
      },
    });

    // L'étape divergente a pu muter le worktree sans être committée → on la jette proprement.
    if (attempt.escalate) {
      await deps.git(["reset", "--hard"], wt.worktree);
      await deps.git(["clean", "-fd"], wt.worktree);
    }

    // Fichiers du préfixe accepté = diff des commits de checkpoint depuis le point de départ.
    let changed: string[] = [];
    if (attempt.result.accepted > 0 && baseRev) {
      const diff = await deps.git(["diff", "--name-only", `${baseRev}..HEAD`], wt.worktree);
      if (diff.code === 0) changed = diff.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    }
    const applied = changed.length > 0 ? deps.apply(repoRoot, wt.worktree, changed) : { merged: [], refused: [] };

    return {
      ok: true,
      reason: attempt.escalate
        ? `divergence à l'étape #${attempt.result.divergedAt} → escalade au cerveau fort`
        : "préfixe entier accepté",
      accepted: attempt.result.accepted,
      drafted: attempt.result.drafted,
      divergedAt: attempt.result.divergedAt,
      savedRoundTrips: attempt.result.savedRoundTrips,
      changedFiles: changed,
      appliedFiles: applied.merged,
      summary: attempt.summary,
    };
  } finally {
    await deps.removeWorktree(wt); // le worktree est jetable ; le préfixe accepté est déjà appliqué
  }
}

// ── Adaptateurs réels (réutilisent l'infra auto-amélioration) ─────────────────────────────────

const realGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    try {
      const p = spawn("git", args, { cwd, shell: false, windowsHide: true });
      let stdout = "", stderr = "";
      p.stdout?.on("data", (d) => (stdout += d));
      p.stderr?.on("data", (d) => (stderr += d));
      p.on("error", () => resolve({ code: 1, stdout: "", stderr: "spawn git failed" }));
      p.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
    } catch {
      resolve({ code: 1, stdout: "", stderr: "spawn git threw" });
    }
  });

export function realSpecExecDeps(): SpecExecDeps {
  return {
    createWorktree: (repoRoot, slug) => createSelfWorktree(repoRoot, slug),
    removeWorktree: (wt) => removeSelfWorktree(wt).then(() => undefined),
    invoke: async (worktree, tool, args) => {
      try {
        const reg = buildSelfRegistry(worktree, { checks: true, sandboxTests: false });
        const r = await reg.invoke(tool, args);
        return { ok: !r.isError, detail: r.text };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
    typecheck: async (worktree) => (await runTscInWorktree(worktree)).ok,
    git: realGit,
    apply: (repoRoot, worktree, files) => mergeSelfFiles(repoRoot, worktree, files),
  };
}

// ── Mode GÉNÉRATION D'APP (projet-agnostique) ─────────────────────────────────
// Le hook d'auto-déclenchement (#171) vit dans `runRelay` = le chemin APP. Le verify ne doit
// donc PAS être le `tsc` de MangoOS (`realSpecExecDeps`, lié à l'auto-amélioration #167) mais le
// BUILD RÉEL de l'app générée (`inspectProject` : `npm run build` + `tsc --noEmit` du back si
// présent). Tout le reste (worktree jetable, git, apply→projet) est déjà générique.

/**
 * Jonctions `node_modules` (racine + back `api/`) du PROJET vers le worktree, pour que le build
 * réel tourne sans réinstaller (un git worktree ne copie pas les fichiers gitignorés). Best-effort,
 * ne lève jamais. Sans jonction, `inspectProject` rendrait `no-deps` → faux négatif sur chaque étape.
 */
export function linkProjectModules(projectDir: string, worktree: string): void {
  const root = path.resolve(projectDir);
  for (const sub of ["", BACKEND_DIR_NAME]) {
    const target = path.join(root, sub, "node_modules");
    const link = path.join(worktree, sub, "node_modules");
    try {
      if (fs.existsSync(target) && !fs.existsSync(link)) {
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(target, link, "junction");
      }
    } catch { /* best-effort : sans jonction, le build signalera no-deps → repli séquentiel */ }
  }
}

/**
 * Registre projet-agnostique : mêmes outils fichiers confinés que le mode self, mais `check_types`
 * lance le BUILD RÉEL de l'app (`inspectProject`) au lieu du `tsc` MangoOS. Le nom `check_types`
 * est conservé pour rester dans `SPECULATIVE_TOOLS` (le draft peut l'appeler sans diverger).
 */
function buildAppRegistry(worktree: string): ToolRegistry {
  const full = buildEleveActionTools(worktree, { allowRun: false });
  const reg = new ToolRegistry();
  for (const t of full.list()) if (SELF_ALLOWED_TOOLS.has(t.name)) reg.register(t);
  reg.register({
    name: "check_types",
    description:
      "Vérifie que l'app COMPILE : lance son build réel (npm run build + tsc du back si présent) " +
      "dans la copie isolée. N'exécute pas le code applicatif et n'altère pas le projet vivant.",
    inputSchema: {},
    handler: async () => {
      const r = await inspectProject(worktree);
      return { text: r.ok ? "✅ build de l'app : OK." : `❌ build KO (${r.signal}) :\n${r.detail.slice(0, 3000)}` };
    },
  });
  return reg;
}

/**
 * Deps d'exécution spéculative pour la **génération d'app** : verify = build réel de l'app
 * (`inspectProject`), `node_modules` jointés au worktree, apply → le projet. Réutilise le
 * cycle de vie worktree / git / merge génériques. `projectDir` = la racine de l'app générée.
 */
export function appSpecExecDeps(projectDir: string): SpecExecDeps {
  return {
    createWorktree: async (repoRoot, slug) => {
      const r = await createSelfWorktree(repoRoot, slug);
      if (r.wt) linkProjectModules(projectDir, r.wt.worktree);
      return r;
    },
    removeWorktree: (wt) => removeSelfWorktree(wt).then(() => undefined),
    invoke: async (worktree, tool, args) => {
      try {
        const reg = buildAppRegistry(worktree);
        const r = await reg.invoke(tool, args);
        return { ok: !r.isError, detail: r.text };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
    typecheck: async (worktree) => (await inspectProject(worktree)).ok,
    git: realGit,
    apply: (repoRoot, worktree, files) => mergeSelfFiles(repoRoot, worktree, files),
  };
}
