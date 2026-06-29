// Tests de l'orchestrateur Grand Chantier (Phase 2). Déterministe, deps injectées :
// plan en mémoire (markIncrementDone mute le statut), buildIncrement/checkIncrement
// scriptés, état checkpointé en mémoire. Aucun LLM/FS réel. On exerce : pickNext PUR,
// happy path complet, reprise (checkpoint), budget, quarantaine, stopOnFailure, abort.

import {
  runGrandChantier,
  pickNext,
  type GrandChantierDeps,
  type GrandChantierState,
  type IncrementGate,
  type IncrementOutcome,
  type BuildTarget,
} from "./grand-chantier.js";
import type { ProjectPlan, Increment } from "./project-plan.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

function inc(id: string, status: Increment["status"] = "todo"): Increment {
  return { id, kind: "page", title: id.toUpperCase(), status };
}

function makePlan(ids: string[]): ProjectPlan {
  return {
    createdAt: 1,
    updatedAt: 1,
    stack: "ts+rrv7",
    skeleton: { status: "done", files: ["src/router.tsx"] },
    increments: ids.map((id) => inc(id)),
  };
}

/** Harnais : plan mutable + état mémoire + scripts d'échec/coût. */
function harness(
  opts: {
    planIds: string[];
    skeletonDone?: boolean;
    initialState?: Partial<GrandChantierState>;
    // ids dont le Gardien échoue (build cassé) — défaut : aucun
    buildFails?: Set<string>;
    // ids dont les tests échouent (build ok mais tests rouges)
    testFails?: Set<string>;
    costPerTurn?: number;
    skeletonPoses?: boolean; // le tour squelette pose-t-il le .project-plan.json ?
  },
): { deps: GrandChantierDeps; plan: ProjectPlan; state: GrandChantierState; calls: { builds: BuildTarget[]; saves: number } } {
  const plan = makePlan(opts.planIds);
  let skel = opts.skeletonDone ?? true;
  const state: GrandChantierState = {
    skeletonDone: opts.initialState?.skeletonDone ?? false,
    done: opts.initialState?.done ?? [],
    failed: opts.initialState?.failed ?? [],
    costUsd: opts.initialState?.costUsd ?? 0,
    startedAt: 0,
    updatedAt: 0,
  };
  const calls = { builds: [] as BuildTarget[], saves: 0 };
  const buildFails = opts.buildFails ?? new Set<string>();
  const testFails = opts.testFails ?? new Set<string>();
  const cost = opts.costPerTurn ?? 0;
  let lastBuilt = "";

  const deps: GrandChantierDeps = {
    loadPlan: () => plan,
    skeletonDone: () => skel,
    buildIncrement: async (_dir, target): Promise<IncrementOutcome> => {
      calls.builds.push(target);
      lastBuilt = target.id;
      if (target.kind === "skeleton" && opts.skeletonPoses !== false) skel = true;
      return { ok: true, files: [`src/${target.id}.tsx`], costUsd: cost, resolvedBy: "eleve" };
    },
    checkIncrement: async (): Promise<IncrementGate> => {
      const buildOk = !buildFails.has(lastBuilt);
      const testsOk = buildOk && !testFails.has(lastBuilt);
      return { buildOk, testsOk, testsRan: testFails.size > 0, signal: buildOk ? "ok" : "build-failed", detail: "x" };
    },
    markIncrementDone: (_dir, id) => {
      const it = plan.increments.find((i) => i.id === id);
      if (it) it.status = "done";
    },
    loadState: () => state,
    saveState: (_dir, s) => {
      calls.saves++;
      Object.assign(state, s);
    },
    now: () => 42,
  };
  return { deps, plan, state, calls };
}

async function run() {
  console.log("\n[1] pickNext — PUR");
  {
    const plan = makePlan(["a", "b", "c"]);
    check("premier todo", pickNext(plan, [])?.id === "a");
    plan.increments[0]!.status = "done";
    check("saute le done", pickNext(plan, [])?.id === "b");
    check("saute la quarantaine", pickNext(plan, ["b"])?.id === "c");
    plan.increments.forEach((i) => (i.status = "done"));
    check("tout done → undefined", pickNext(plan, []) === undefined);
  }

  console.log("\n[2] Happy path — squelette déjà posé, 2 incréments enchaînés");
  {
    const h = harness({ planIds: ["accueil", "contact"], skeletonDone: true });
    const r = await runGrandChantier("/p", {}, h.deps);
    check("ok complet", r.ok && r.reason === "complete");
    check("2 incréments faits", r.done.join() === "accueil,contact");
    check("aucune quarantaine", r.failed.length === 0);
    check("les 2 incréments construits (pas le squelette, déjà posé)", h.calls.builds.map((b) => b.id).join() === "accueil,contact");
    check("checkpoint sauvegardé plusieurs fois", h.calls.saves >= 2);
  }

  console.log("\n[3] Squelette à poser d'abord");
  {
    const h = harness({ planIds: ["accueil"], skeletonDone: false });
    const r = await runGrandChantier("/p", {}, h.deps);
    check("squelette construit en premier", h.calls.builds[0]?.kind === "skeleton");
    check("puis l'incrément", h.calls.builds[1]?.id === "accueil");
    check("complet", r.ok && r.reason === "complete" && r.skeletonDone);
  }

  console.log("\n[4] Squelette qui échoue à se poser → blocked");
  {
    const h = harness({ planIds: ["accueil"], skeletonDone: false, skeletonPoses: false });
    const r = await runGrandChantier("/p", {}, h.deps);
    check("bloqué si pas de .project-plan.json", !r.ok && r.reason === "blocked");
    check("aucun incrément tenté", h.calls.builds.every((b) => b.kind === "skeleton"));
  }

  console.log("\n[5] Reprise (checkpoint) — un incrément déjà done dans le plan");
  {
    const h = harness({ planIds: ["accueil", "contact"], skeletonDone: true, initialState: { skeletonDone: true, done: ["accueil"] } });
    h.plan.increments[0]!.status = "done"; // reflète l'état repris
    const r = await runGrandChantier("/p", {}, h.deps);
    check("ne reconstruit QUE l'incrément restant", h.calls.builds.map((b) => b.id).join() === "contact");
    check("complet", r.ok && r.done.includes("contact"));
  }

  console.log("\n[6] Budget — arrêt propre à la limite");
  {
    const h = harness({ planIds: ["a", "b", "c"], skeletonDone: true, costPerTurn: 1 });
    const r = await runGrandChantier("/p", { budgetUsd: 2 }, h.deps);
    check("arrêt pour budget", !r.ok && r.reason === "budget");
    check("seuls les incréments sous budget faits", r.done.length <= 2 && r.costUsd >= 2);
  }

  console.log("\n[7] Quarantaine — build qui casse, continue puis bloqué");
  {
    const h = harness({ planIds: ["a", "b"], skeletonDone: true, buildFails: new Set(["a"]) });
    const r = await runGrandChantier("/p", { attemptsPerIncrement: 2 }, h.deps);
    check("a en quarantaine après 2 tentatives", r.failed.includes("a"));
    check("b quand même construit et fait", r.done.includes("b"));
    check("verdict bloqué (quarantaine non vide)", !r.ok && r.reason === "blocked");
    const aBuilds = h.calls.builds.filter((bb) => bb.id === "a").length;
    check("a tenté exactement 2 fois", aBuilds === 2);
  }

  console.log("\n[8] stopOnFailure — arrêt dès la première quarantaine");
  {
    const h = harness({ planIds: ["a", "b"], skeletonDone: true, buildFails: new Set(["a"]) });
    const r = await runGrandChantier("/p", { attemptsPerIncrement: 1, stopOnFailure: true }, h.deps);
    check("stoppe sans tenter b", h.calls.builds.every((bb) => bb.id !== "b"));
    check("bloqué", !r.ok && r.reason === "blocked");
  }

  console.log("\n[9] Tests rouges → Gardien rejette (build vert ≠ tests verts)");
  {
    const h = harness({ planIds: ["a"], skeletonDone: true, testFails: new Set(["a"]) });
    const r = await runGrandChantier("/p", { attemptsPerIncrement: 2 }, h.deps);
    check("a non validé malgré build vert", !r.done.includes("a"));
    check("a en quarantaine", r.failed.includes("a"));
  }

  console.log("\n[10] Abort coopératif");
  {
    const h = harness({ planIds: ["a", "b"], skeletonDone: true });
    let n = 0;
    const r = await runGrandChantier("/p", { shouldAbort: () => ++n > 2 }, h.deps);
    check("arrêt pour abort", !r.ok && r.reason === "aborted");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} grand-chantier : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
