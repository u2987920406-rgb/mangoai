// Tests de l'exécuteur spéculatif en worktree (#171 slice 3) — toutes deps mockées (aucun git, aucun fs).
import { runSpeculativeInWorktree, appSpecExecDeps, linkProjectModules, type SpecExecDeps } from "./eleve-speculative-exec.js";
import type { DraftStep } from "./eleve-speculative-runner.js";
import type { SelfWorktree } from "./mango-self.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const WT: SelfWorktree = { worktree: "/wt", branch: "mango/self-x", repoRoot: "/repo" };

const draft = (...d: Array<[string, string]>): DraftStep[] =>
  d.map(([tool, label]) => ({ tool, label, args: {} }));

interface Harness {
  deps: SpecExecDeps;
  gitCalls: string[][];
  removed: boolean;
  appliedFiles: string[];
}

function harness(opts: {
  worktreeOk?: boolean;
  invokeOk?: (tool: string, i: number) => boolean;
  typecheckOk?: (i: number) => boolean;
} = {}): Harness {
  const gitCalls: string[][] = [];
  const h: Harness = { gitCalls, removed: false, appliedFiles: [], deps: null as unknown as SpecExecDeps };
  let mutIndex = -1;
  h.deps = {
    createWorktree: async () => (opts.worktreeOk === false ? { wt: null, reason: "branche existe" } : { wt: WT, reason: "" }),
    removeWorktree: async () => { h.removed = true; },
    invoke: async (_wt, tool) => { mutIndex++; return { ok: opts.invokeOk ? opts.invokeOk(tool, mutIndex) : true }; },
    typecheck: async () => (opts.typecheckOk ? opts.typecheckOk(mutIndex) : true),
    git: async (args) => {
      gitCalls.push(args);
      if (args[0] === "rev-parse") return { code: 0, stdout: "basecommit\n", stderr: "" };
      if (args[0] === "diff") return { code: 0, stdout: "src/Contact.tsx\nsrc/App.tsx\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    apply: (_r, _w, files) => { h.appliedFiles = files; return { merged: files, refused: [] }; },
  };
  return h;
}

const commits = (calls: string[][]) => calls.filter((c) => c[0] === "commit").length;
const hasReset = (calls: string[][]) => calls.some((c) => c[0] === "reset");
const hasForbidden = (calls: string[][]) => calls.some((c) => ["push", "merge"].includes(c[0]));

async function run() {
  console.log("[1] préfixe entier accepté → checkpoint par étape + appliqué + worktree nettoyé");
  {
    const h = harness();
    const r = await runSpeculativeInWorktree("/repo", "x", draft(["read_file", "lire"], ["write_file", "écrire"], ["check_build", "build"]), h.deps);
    check("ok, tout accepté", r.ok && r.accepted === 3 && r.divergedAt === null);
    check("un commit (checkpoint) par étape acceptée", commits(h.gitCalls) === 3);
    check("aucun reset (pas de divergence)", !hasReset(h.gitCalls));
    check("préfixe appliqué au projet", r.appliedFiles.length === 2);
    check("savedRoundTrips = 2", r.savedRoundTrips === 2);
    check("worktree nettoyé", h.removed);
  }

  console.log("\n[2] étape mutante qui casse le build → divergence + rollback");
  {
    // write_file (index 1) passe l'invoke mais le type-check échoue → divergence à #1
    const h = harness({ typecheckOk: (i) => i !== 1 });
    const r = await runSpeculativeInWorktree("/repo", "x", draft(["read_file", "lire"], ["write_file", "écrire cassé"], ["check_build", "build"]), h.deps);
    check("préfixe accepté = 1 (la lecture)", r.accepted === 1 && r.divergedAt === 1);
    check("1 commit (la lecture seule)", commits(h.gitCalls) === 1);
    check("reset --hard pour jeter l'étape divergente", hasReset(h.gitCalls));
    check("escalade reflétée dans la raison", /escalade/.test(r.reason));
    check("worktree nettoyé même en divergence", h.removed);
  }

  console.log("\n[3] invariant de sûreté : JAMAIS de push/merge");
  {
    const h = harness({ typecheckOk: (i) => i !== 1 });
    await runSpeculativeInWorktree("/repo", "x", draft(["write_file", "a"], ["write_file", "b"]), h.deps);
    check("aucun git push/merge émis", !hasForbidden(h.gitCalls));
  }

  console.log("\n[4] rejet dès la 1ʳᵉ étape (invoke échoue) → rien d'appliqué");
  {
    const h = harness({ invokeOk: () => false });
    const r = await runSpeculativeInWorktree("/repo", "x", draft(["read_file", "lire"]), h.deps);
    check("accepted 0, rien appliqué", r.accepted === 0 && r.appliedFiles.length === 0);
    check("reset effectué (divergence à #0)", hasReset(h.gitCalls));
  }

  console.log("\n[5] robustesse — worktree impossible, draft vide");
  {
    const h = harness({ worktreeOk: false });
    const r = await runSpeculativeInWorktree("/repo", "x", draft(["read_file", "lire"]), h.deps);
    check("worktree impossible → ok:false, raison claire, pas de crash", !r.ok && /worktree impossible/.test(r.reason));

    const h2 = harness();
    const r2 = await runSpeculativeInWorktree("/repo", "x", [], h2.deps);
    check("draft vide → ok:false, pas de worktree créé", !r2.ok && r2.reason === "draft vide" && !h2.removed);
  }

  console.log("\n[6] mode APP (projet-agnostique) — jonction node_modules + verify = build réel");
  {
    // 6a. linkProjectModules : crée une jonction node_modules du projet vers le worktree (fs réel, temp).
    const stamp = process.hrtime.bigint().toString();
    const projectDir = path.join(os.tmpdir(), `spec-app-proj-${stamp}`);
    const worktree = path.join(os.tmpdir(), `spec-app-wt-${stamp}`);
    fs.mkdirSync(path.join(projectDir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "node_modules", "marker.txt"), "dep");
    fs.mkdirSync(worktree, { recursive: true });
    try {
      linkProjectModules(projectDir, worktree);
      const linked = path.join(worktree, "node_modules", "marker.txt");
      check("jonction node_modules créée → la dépendance est visible dans le worktree", fs.existsSync(linked));
    } finally {
      try { fs.rmSync(path.join(worktree, "node_modules"), { recursive: false, force: true }); } catch { /* jonction */ }
      try { fs.rmSync(worktree, { recursive: true, force: true }); } catch { /* best-effort */ }
      try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }

    // 6b. le verify du mode app = inspectProject : sur un dossier sans package.json, build KO → typecheck false.
    const emptyDir = path.join(os.tmpdir(), `spec-app-empty-${stamp}`);
    fs.mkdirSync(emptyDir, { recursive: true });
    try {
      const deps = appSpecExecDeps(emptyDir);
      const green = await deps.typecheck(emptyDir);
      check("verify projet-agnostique : pas de package.json → build KO (≠ tsc MangoOS)", green === false);
    } finally {
      try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }

  console.log(`\n=== eleve-speculative-exec : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
