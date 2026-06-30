// Tests du pré-passe spéculatif (#171, auto-déclenchement) — ask + exec mockés, aucun LLM/git.
import { speculativePrepass, type PrepassDeps } from "./eleve-speculative-trigger.js";
import type { SpecExecDeps } from "./eleve-speculative-exec.js";
import type { SelfWorktree } from "./mango-self.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const WT: SelfWorktree = { worktree: "/wt", branch: "b", repoRoot: "/repo" };

// exec mock : accepte les étapes jusqu'à `acceptUpto` (exclus = divergence)
function execMock(acceptUpto: number, worktreeOk = true): { deps: SpecExecDeps; applied: string[] } {
  const state = { applied: [] as string[] };
  let i = -1;
  const deps: SpecExecDeps = {
    createWorktree: async () => (worktreeOk ? { wt: WT, reason: "" } : { wt: null, reason: "pas un dépôt git" }),
    removeWorktree: async () => {},
    invoke: async () => { i++; return { ok: true }; },
    typecheck: async () => i < acceptUpto, // diverge à l'index acceptUpto
    git: async (args) => ({ code: 0, stdout: args[0] === "diff" ? "src/a.tsx\n" : "base\n", stderr: "" }),
    apply: (_r, _w, files) => { state.applied = files; return { merged: files, refused: [] }; },
  };
  return { deps, applied: state.applied };
}

const draftJson = '[{"label":"lire","tool":"read_file","args":{}},{"label":"écrire","tool":"write_file","args":{}},{"label":"build","tool":"check_build","args":{}}]';

async function run() {
  console.log("[1] draft + spéculation OK → ran, métriques, fichiers appliqués");
  {
    const m = execMock(99); // tout accepté
    const deps: PrepassDeps = { ask: async () => draftJson, exec: m.deps, toolNames: ["read_file", "write_file", "check_build"] };
    const r = await speculativePrepass("ajouter page Contact", "/repo", 4, deps);
    check("ran = true", r.ran);
    check("3 étapes draftées", r.drafted === 3);
    check("préfixe entier accepté", r.accepted === 3 && !r.escalate);
    check("fichiers appliqués remontés", r.appliedFiles.length === 1);
  }

  console.log("\n[2] divergence → escalade (la boucle reprend), préfixe partiel appliqué");
  {
    const m = execMock(1); // diverge à l'index 1
    const deps: PrepassDeps = { ask: async () => draftJson, exec: m.deps, toolNames: ["read_file", "write_file", "check_build"] };
    const r = await speculativePrepass("tâche", "/repo", 4, deps);
    check("ran = true", r.ran);
    check("escalade signalée", r.escalate === true);
    check("préfixe partiel accepté (1)", r.accepted === 1);
  }

  console.log("\n[3] repli silencieux — aucun draft, ask qui plante, worktree impossible");
  {
    const noDraft: PrepassDeps = { ask: async () => "désolé je ne sais pas", exec: execMock(99).deps, toolNames: ["read_file"] };
    const r1 = await speculativePrepass("x", "/repo", 4, noDraft);
    check("aucun draft → ran:false, raison", !r1.ran && /aucun draft/.test(r1.reason));

    // draftSteps avale l'erreur d'ask en interne → draft vide → "aucun draft exploitable" (jamais de throw).
    const askThrows: PrepassDeps = { ask: async () => { throw new Error("réseau"); }, exec: execMock(99).deps, toolNames: ["read_file"] };
    const r2 = await speculativePrepass("x", "/repo", 4, askThrows);
    check("ask qui plante → ran:false, ne lève pas", !r2.ran && /aucun draft/.test(r2.reason));

    const noGit: PrepassDeps = { ask: async () => draftJson, exec: execMock(99, false).deps, toolNames: ["read_file", "write_file", "check_build"] };
    const r3 = await speculativePrepass("x", "/repo", 4, noGit);
    check("projet non-git → ran:false (repli séquentiel), pas de crash", !r3.ran && r3.drafted === 3);
  }

  console.log(`\n=== eleve-speculative-trigger : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
