// Atelier de Mango — industrialisation de l'auto-amélioration (barreaux 1-4) dans l'UI.
//
// Trois routes, single-user local :
//   POST /api/self/run      (SSE) — lance un chantier BORNÉ : copie isolée → l'Élève
//                                    travaille (read/write + check_types + run_tests
//                                    sandboxé) → renvoie le DIFF relisable. Ne fusionne pas.
//   POST /api/self/merge          — applique le diff au repo VIVANT (écrit les fichiers,
//                                    PAS de git commit — c'est « save ») puis nettoie la copie.
//   POST /api/self/discard        — jette la copie sans rien fusionner.
//
// Sûreté : tout est structurellement borné (worktree isolé, sandbox prouvé, relecture
// humaine avant fusion, aucun git auto). La fusion valide que la copie est bien sous la
// base mango-self et que chaque fichier reste dans le repo (anti-évasion de chemin).

import type { Express, Request, Response } from "express";
import path from "node:path";
import {
  runSelfExperiment, selfChangedFiles, removeSelfWorktree, selfWorktreeBase,
  sanitizeSelfSlug, mergeSelfFiles, isInsidePath, type SelfWorktree,
} from "./mango-self.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

// Un seul chantier d'auto-amélioration à la fois (worktrees + jetons).
let inFlight = false;

export function registerSelfRoutes(app: Express): void {
  // ── Lancer un chantier (SSE) ────────────────────────────────────────────────
  app.post("/api/self/run", async (req: Request, res: Response) => {
    const task = String((req.body as { task?: unknown })?.task ?? "").trim();
    if (!task) { res.status(400).json({ error: "tâche vide" }); return; }
    if (inFlight) { res.status(409).json({ error: "un chantier d'auto-amélioration est déjà en cours" }); return; }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (ev: unknown) => res.write(`data: ${JSON.stringify(ev)}\n\n`);

    inFlight = true;
    try {
      // slug unique (évite la collision de worktree avec un run précédent).
      const slug = `${sanitizeSelfSlug(task.slice(0, 28))}-${Date.now().toString(36)}`;
      send({ type: "start", task });
      const r = await runSelfExperiment(REPO_ROOT, task, {
        slug, allowChecks: true, allowTests: true,
        onLog: (s) => send({ type: "log", text: s }),
      });
      if (!r.ok) { send({ type: "error", error: r.reason }); return; }
      const files = r.wt ? await selfChangedFiles(r.wt) : [];
      // #atelier — badges HONNÊTES : le verify de clôture reflète l'état FINAL (vrai
      // `tsc --noEmit` + tests exécutés), plus « l'Élève a APPELÉ l'outil ». usedChecks/
      // usedTests pointent dessus → un chantier « vert » l'est vraiment à la fusion.
      // Repli sur l'ancien comportement seulement si la vérif n'a pas tourné.
      const verify = r.verify;
      const usedChecks = verify?.ran ? verify.typesOk : r.trace.some((t) => t.name === "check_types");
      const usedTests = verify?.ran ? verify.testsOk : r.trace.some((t) => t.name === "run_tests");
      send({
        type: "done",
        branch: r.branch, worktree: r.worktree,
        summary: r.summary, stat: r.diff.stat, patch: r.diff.patch, files,
        tools: r.trace.map((t) => t.name), usedChecks, usedTests, verify,
      });
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      inFlight = false;
      res.end();
    }
  });

  // ── Fusionner le diff dans le repo vivant (écrit les fichiers, PAS de git) ───
  app.post("/api/self/merge", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { worktree?: string; branch?: string; files?: string[] };
    const worktree = String(body.worktree ?? "");
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    if (!worktree || files.length === 0) { res.status(400).json({ error: "worktree ou fichiers manquants" }); return; }
    // Garde : la copie doit être sous la base mango-self (pas un dossier arbitraire).
    if (!isInsidePath(selfWorktreeBase(REPO_ROOT), worktree)) { res.status(403).json({ error: "worktree hors zone" }); return; }
    const { merged, refused } = mergeSelfFiles(REPO_ROOT, worktree, files);
    // Nettoie la copie isolée (worktree + branche jetable) APRÈS fusion. On ATTEND le résultat
    // (plus de fire-and-forget) et on le remonte : sinon un échec silencieux laisse des worktrees
    // orphelins s'accumuler dans .mango-self. `removeSelfWorktree` a un fallback prune robuste.
    const wt: SelfWorktree = { worktree, branch: String(body.branch ?? ""), repoRoot: REPO_ROOT };
    const cleanup = await removeSelfWorktree(wt, { deleteBranch: !!body.branch });
    res.json({ ok: true, merged, refused, cleanup });
  });

  // ── Jeter la copie sans fusionner ───────────────────────────────────────────
  app.post("/api/self/discard", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { worktree?: string; branch?: string };
    const worktree = String(body.worktree ?? "");
    if (!worktree) { res.status(400).json({ error: "worktree manquant" }); return; }
    if (!isInsidePath(selfWorktreeBase(REPO_ROOT), worktree)) { res.status(403).json({ error: "worktree hors zone" }); return; }
    const wt: SelfWorktree = { worktree, branch: String(body.branch ?? ""), repoRoot: REPO_ROOT };
    const r = await removeSelfWorktree(wt, { deleteBranch: !!body.branch });
    res.json({ ok: r.ok, reason: r.reason });
  });
}
