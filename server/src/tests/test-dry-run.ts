// Tests du dry-run / mode simulation (#182 É6) — toutes deps git/fs MOCKÉES (aucune vraie
// opération git, aucun fs). Prouve : simulation applicable → DIFF produit, RIEN écrit sans
// apply() ; étape divergente → jetée, projet réel intact ; apply() explicite → merge ;
// Gardien rouge sur le worktree → apply() refusé.
import { FileCodeAction, type DryRunDeps, type EffetPrevu } from "../dry-run.js";
import type { DraftStep } from "../eleve-speculative/eleve-speculative-runner.js";
import type { SelfWorktree } from "../mango-self.js";

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
  deps: DryRunDeps;
  gitCalls: string[][];
  removed: boolean;
  applyCalled: boolean;
  appliedFiles: string[];
  gateCalled: boolean;
}

function harness(opts: {
  worktreeOk?: boolean;
  typecheckOk?: (i: number) => boolean;
  gate?: (ok: boolean, raisons?: string[]) => void; // installe un gate qui renvoie ok
  gateOk?: boolean;
} = {}): Harness {
  const gitCalls: string[][] = [];
  const h: Harness = {
    gitCalls, removed: false, applyCalled: false, appliedFiles: [], gateCalled: false,
    deps: null as unknown as DryRunDeps,
  };
  let mutIndex = -1;
  h.deps = {
    createWorktree: async () => (opts.worktreeOk === false ? { wt: null, reason: "branche existe" } : { wt: WT, reason: "" }),
    removeWorktree: async () => { h.removed = true; },
    invoke: async () => { mutIndex++; return { ok: true }; },
    typecheck: async () => (opts.typecheckOk ? opts.typecheckOk(mutIndex) : true),
    git: async (args) => {
      gitCalls.push(args);
      if (args[0] === "rev-parse") return { code: 0, stdout: "basecommit\n", stderr: "" };
      if (args[0] === "diff" && args.includes("--name-only")) return { code: 0, stdout: "src/App.tsx\nsrc/Contact.tsx\n", stderr: "" };
      if (args[0] === "diff" && args.includes("--stat")) return { code: 0, stdout: " 2 files changed\n", stderr: "" };
      if (args[0] === "diff") return { code: 0, stdout: "diff --git a/src/App.tsx b/src/App.tsx\n+hello\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    apply: (_r, _w, files) => { h.applyCalled = true; h.appliedFiles = files; return { merged: files, refused: [] }; },
  };
  if (opts.gateOk !== undefined) {
    h.deps.gate = async () => { h.gateCalled = true; return { ok: opts.gateOk!, raisons: opts.gateOk ? [] : ["INTENTION 40/100"] }; };
  }
  return h;
}

const commits = (calls: string[][]) => calls.filter((c) => c[0] === "commit").length;
const hasReset = (calls: string[][]) => calls.some((c) => c[0] === "reset");
const hasForbidden = (calls: string[][]) => calls.some((c) => ["push", "merge"].includes(c[0]));

async function run() {
  console.log("[1] plan mutant simulé, type-check vert → DIFF produit, RIEN écrit sans apply()");
  {
    const h = harness();
    const action = new FileCodeAction("/repo", "x", draft(["read_file", "lire"], ["write_file", "écrire"], ["check_build", "build"]), h.deps);
    const effet: EffetPrevu = await action.simulate();
    check("simulation applicable (ok)", effet.ok);
    check("DIFF produit (patch non vide)", effet.diff.length > 0 && /diff --git/.test(effet.diff));
    check("résumé --stat produit", effet.stat.length > 0);
    check("fichiers changés listés (2)", effet.changedFiles.length === 2);
    check("type-check vert", effet.typecheckOk);
    check("RIEN appliqué au projet réel sans apply()", h.applyCalled === false && h.appliedFiles.length === 0);
    check("worktree CONSERVÉ après simulate (pour apply)", h.removed === false);
    check("un checkpoint (commit) par étape acceptée", commits(h.gitCalls) === 3);
    check("aucun push/merge (invariant de sûreté)", !hasForbidden(h.gitCalls));
  }

  console.log("\n[2] apply() explicite → le merge a bien lieu (via mergeSelfFiles injecté), worktree libéré");
  {
    const h = harness();
    const action = new FileCodeAction("/repo", "x", draft(["write_file", "a"], ["write_file", "b"]), h.deps);
    await action.simulate();
    check("avant apply : rien de fusionné", h.applyCalled === false);
    await action.apply();
    check("après apply : merge appelé", h.applyCalled === true);
    check("après apply : fichiers fusionnés", h.appliedFiles.length === 2);
    check("après apply : worktree libéré", h.removed === true);
  }

  console.log("\n[3] étape divergente (type-check casse) → jetée, worktree supprimé, projet RÉEL intact");
  {
    // write_file (index 0, 1ʳᵉ mutation) passe l'invoke mais le type-check échoue → divergence à #0
    const h = harness({ typecheckOk: (i) => i !== 0 });
    const action = new FileCodeAction("/repo", "x", draft(["write_file", "cassé"], ["write_file", "jamais atteint"]), h.deps);
    const effet = await action.simulate();
    check("non applicable (ok=false)", effet.ok === false);
    check("divergence signalée", effet.divergedAt !== null && /divergence/.test(effet.reason));
    check("reset --hard pour jeter l'étape divergente", hasReset(h.gitCalls));
    check("worktree JETÉ automatiquement (non applicable)", h.removed === true);
    check("RIEN appliqué au projet réel", h.applyCalled === false);
    // apply() doit refuser une simulation non applicable
    let refused = false;
    try { await action.apply(); } catch { refused = true; }
    check("apply() REFUSÉ sur simulation non applicable", refused && h.applyCalled === false);
  }

  console.log("\n[4] Gardien #161 joué sur le worktree simulé : rouge → apply() interdit");
  {
    const h = harness({ gateOk: false });
    const action = new FileCodeAction("/repo", "x", draft(["write_file", "a"]), h.deps);
    const effet = await action.simulate();
    check("Gardien joué sur le résultat simulé", h.gateCalled === true);
    check("verdict Gardien rouge reflété (gateOk=false)", effet.gateOk === false);
    check("simulation non applicable à cause du Gardien", effet.ok === false && /Gardien/.test(effet.reason));
    check("worktree jeté (non applicable)", h.removed === true);
    let refused = false;
    try { await action.apply(); } catch { refused = true; }
    check("apply() refusé (Gardien rouge)", refused && h.applyCalled === false);
  }

  console.log("\n[4b] Gardien vert → apply() permis");
  {
    const h = harness({ gateOk: true });
    const action = new FileCodeAction("/repo", "x", draft(["write_file", "a"]), h.deps);
    const effet = await action.simulate();
    check("Gardien vert (gateOk=true)", effet.gateOk === true && effet.ok === true);
    await action.apply();
    check("apply() permis après Gardien vert", h.applyCalled === true);
  }

  console.log("\n[5] robustesse — worktree impossible, plan vide, double apply/dispose");
  {
    const h = harness({ worktreeOk: false });
    const effet = await new FileCodeAction("/repo", "x", draft(["write_file", "a"]), h.deps).simulate();
    check("worktree impossible → ok:false, raison claire, pas de crash", !effet.ok && /worktree impossible/.test(effet.reason));

    const h2 = harness();
    const a2 = new FileCodeAction("/repo", "x", [], h2.deps);
    const e2 = await a2.simulate();
    check("plan vide → ok:false, aucun worktree créé", !e2.ok && e2.reason === "plan vide" && !h2.removed);

    const h3 = harness();
    const a3 = new FileCodeAction("/repo", "x", draft(["write_file", "a"]), h3.deps);
    await a3.simulate();
    await a3.apply();
    let doubleRefused = false;
    try { await a3.apply(); } catch { doubleRefused = true; }
    check("double apply() refusé (worktree déjà libéré)", doubleRefused);
    await a3.dispose(); // dispose idempotent, ne lève pas
    check("dispose() idempotent après apply", true);
  }

  console.log("\n[6] simulate() idempotent : 2ᵉ appel = même effet, pas de 2ᵉ worktree");
  {
    const h = harness();
    const action = new FileCodeAction("/repo", "x", draft(["write_file", "a"]), h.deps);
    const e1 = await action.simulate();
    const createCallsBefore = h.gitCalls.length;
    const e2 = await action.simulate();
    check("même objet EffetPrevu renvoyé (mémoïsé)", e1 === e2);
    check("aucune commande git supplémentaire au 2ᵉ simulate", h.gitCalls.length === createCallsBefore);
  }

  console.log(`\n=== dry-run : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
