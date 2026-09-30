// L'ORCHESTRATEUR « GRAND CHANTIER » (Phase 2) — enchaîne TOUT SEUL les incréments
// d'un gros projet A-Z, là où le mode « Gros Projet » #139 existait mais exigeait un
// CLIC MANUEL par incrément.
//
// Boucle : squelette (si absent) → pour chaque incrément `todo` du `.project-plan.json`
//   → buildIncrement (réutilise runRelay) → GARDIEN+TESTS (Phase 1A : build + npm test)
//   → markIncrementDone → incrément suivant ; jusqu'au plan complet ou budget atteint.
//
// Garde-fous (non négociables, fidèles au reste du système) :
//   • CHECKPOINT resumable (.grand-chantier.state.json) calqué sur run-finish.ts →
//     survit à une coupure : on reprend à l'incrément non fait.
//   • BUDGET coût (GRAND_CHANTIER_BUDGET_USD, défaut FINI 20 $ ; seul opts.budgetUsd=0 explicite = illimité) → arrêt PROPRE à la limite.
//   • DISJONCTEUR par incrément : un incrément qui échoue (build/tests rouges) après
//     son budget de tentatives est mis en QUARANTAINE (state.failed) → on ne boucle pas
//     dessus à l'infini ; on passe au suivant (ou on s'arrête selon stopOnFailure).
//   • GATÉ : le moteur ne tourne que si on l'invoque (CLI run-grand-chantier / route
//     future) ; l'invocation est gardée par GRAND_CHANTIER=on côté appelant.
//
// Tout est PUR/testable : la logique d'orchestration (pickNext, décision, checkpoint,
// budget) est exercée avec des deps injectées — aucun LLM réel requis pour les tests.
// `realGrandChantierDeps` câble runRelay + inspectProject + runProjectTests.

import fs from "node:fs";
import path from "node:path";
import {
  loadPlan,
  skeletonDone,
  markIncrementDone,
  projectPlanSection,
  SCAFFOLD_RULES,
  PROJET_MODE_RULES,
  type ProjectPlan,
  type Increment,
} from "./project-plan.js";
import { flag } from "./flags.js";
import { finiteBudgetUsd } from "./nocturnal-budget.js";
import { runRelay } from "./eleve.js";
import { inspectProject, runProjectTests } from "./inspection.js";

const STATE_FILE = ".grand-chantier.state.json";

/** Cible d'un tour de construction : un incrément du Kanban, ou le squelette initial. */
export type BuildTarget =
  | { kind: "skeleton"; id: "__skeleton__"; title: "Squelette" }
  | { kind: Increment["kind"]; id: string; title: string };

/** Résultat d'un tour de construction (neutre vis-à-vis du transport — runRelay réel ou mock). */
export interface IncrementOutcome {
  ok: boolean; // le tour a-t-il abouti (build vert in fine) ?
  files: string[]; // fichiers changés (métadonnée, best-effort)
  costUsd: number; // coût Claude du tour ($0 si l'Élève a suffi)
  resolvedBy: "eleve" | "maitre" | "none";
  incomplete?: boolean; // build vert mais tâche non bouclée (plafond d'itérations)
  aborted?: boolean; // Stop volontaire
}

/** Verdict du Gardien d'incrément (Phase 1A) : build + tests. */
export interface IncrementGate {
  buildOk: boolean;
  testsOk: boolean; // vert OU non lancé (ne pénalise pas)
  testsRan: boolean;
  signal: string; // signal d'inspection (ok / build-failed / …)
  detail: string;
}

/** État CHECKPOINTÉ sur disque (resumable). */
export interface GrandChantierState {
  skeletonDone: boolean;
  done: string[]; // ids d'incréments validés (build+tests verts)
  failed: string[]; // ids en quarantaine (échec après budget de tentatives)
  costUsd: number; // coût cumulé
  startedAt: number;
  updatedAt: number;
}

export interface GrandChantierResult {
  ok: boolean; // plan complet (tous les incréments done) ?
  reason: "complete" | "budget" | "blocked" | "aborted" | "no-plan";
  done: string[];
  failed: string[];
  costUsd: number;
  skeletonDone: boolean;
  log: string[];
}

export interface GrandChantierOptions {
  /** Plafond de coût Claude ($). 0 = illimité. Défaut : GRAND_CHANTIER_BUDGET_USD. */
  budgetUsd?: number;
  /** Tentatives par incrément avant quarantaine. Défaut 2. */
  attemptsPerIncrement?: number;
  /** Si un incrément finit en quarantaine, stopper tout le chantier (true) ou passer au
   *  suivant (false, défaut) — un gros projet peut tolérer un incrément récalcitrant. */
  stopOnFailure?: boolean;
  /** Borne dure du nombre de tours (anti-emballement). Défaut 200. */
  maxTurns?: number;
  onLog?: (line: string) => void;
  shouldAbort?: () => boolean;
}

/** Dépendances injectables — le cœur d'orchestration ne connaît ni LLM ni FS réel. */
export interface GrandChantierDeps {
  loadPlan: (dir: string) => ProjectPlan | null;
  skeletonDone: (dir: string) => boolean;
  buildIncrement: (dir: string, target: BuildTarget) => Promise<IncrementOutcome>;
  checkIncrement: (dir: string) => Promise<IncrementGate>;
  markIncrementDone: (dir: string, id: string, files: string[]) => void;
  loadState: (dir: string) => GrandChantierState;
  saveState: (dir: string, s: GrandChantierState) => void;
  now: () => number;
}

// ── Helpers d'état (checkpoint resumable, calqué sur run-finish.ts) ───────────

function freshState(now: number): GrandChantierState {
  return { skeletonDone: false, done: [], failed: [], costUsd: 0, startedAt: now, updatedAt: now };
}

/** Charge l'état depuis `.grand-chantier.state.json` (défensif → état neuf si absent/cassé). */
export function loadState(dir: string, now: number = Date.now()): GrandChantierState {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), "utf8")) as Partial<GrandChantierState>;
    return {
      skeletonDone: !!raw.skeletonDone,
      done: Array.isArray(raw.done) ? raw.done.filter((x): x is string => typeof x === "string") : [],
      failed: Array.isArray(raw.failed) ? raw.failed.filter((x): x is string => typeof x === "string") : [],
      costUsd: typeof raw.costUsd === "number" && raw.costUsd >= 0 ? raw.costUsd : 0,
      startedAt: typeof raw.startedAt === "number" ? raw.startedAt : now,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
    };
  } catch {
    return freshState(now);
  }
}

export function saveState(dir: string, s: GrandChantierState): void {
  try {
    fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(s, null, 2), "utf8");
  } catch {
    /* best-effort : un checkpoint raté ne doit pas tuer le chantier */
  }
}

// ── Décision PURE : le prochain incrément à construire ───────────────────────

/**
 * Premier incrément à traiter : statut ≠ "done" dans le plan ET pas en quarantaine.
 * PUR — la source de vérité du « done » est le plan (markIncrementDone le met à jour),
 * `failed` ne sert qu'à ne pas reboucler sur un incrément récalcitrant. Renvoie
 * undefined quand il ne reste rien à faire.
 */
export function pickNext(plan: ProjectPlan, failed: string[]): Increment | undefined {
  const quarantined = new Set(failed);
  return plan.increments.find((inc) => inc.status !== "done" && !quarantined.has(inc.id));
}

// ── Boucle d'orchestration ───────────────────────────────────────────────────

export async function runGrandChantier(
  projectDir: string,
  opts: GrandChantierOptions = {},
  deps: GrandChantierDeps = realGrandChantierDeps,
): Promise<GrandChantierResult> {
  const budgetUsd = opts.budgetUsd ?? finiteBudgetUsd(process.env.GRAND_CHANTIER_BUDGET_USD); // fini par défaut (audit dormant 2026-09-30)
  const attempts = Math.max(1, opts.attemptsPerIncrement ?? 2);
  const maxTurns = Math.max(1, opts.maxTurns ?? 200);
  const stopOnFailure = opts.stopOnFailure ?? false;
  const log: string[] = [];
  const emit = (line: string) => {
    log.push(line);
    opts.onLog?.(line);
  };

  const state = deps.loadState(projectDir);
  const finish = (ok: boolean, reason: GrandChantierResult["reason"]): GrandChantierResult => {
    state.updatedAt = deps.now();
    deps.saveState(projectDir, state);
    emit(
      `🏁 Grand Chantier — ${reason} · ${state.done.length} incrément(s) fait(s)` +
        `${state.failed.length ? `, ${state.failed.length} en quarantaine` : ""} · $${state.costUsd.toFixed(2)}`,
    );
    return {
      ok,
      reason,
      done: state.done,
      failed: state.failed,
      costUsd: state.costUsd,
      skeletonDone: state.skeletonDone,
      log,
    };
  };

  const overBudget = () => budgetUsd > 0 && state.costUsd >= budgetUsd;
  const aborted = () => opts.shouldAbort?.() === true;

  emit(`🚧 Grand Chantier démarré — budget ${budgetUsd > 0 ? `$${budgetUsd}` : "illimité"}, ${attempts} tentative(s)/incrément`);

  // 1) SQUELETTE — router/layout/tokens + génération du .project-plan.json. Sans lui,
  //    pas d'incréments à enchaîner. Une seule passe (le mode scaffold pose tout en un tour).
  if (!state.skeletonDone && !deps.skeletonDone(projectDir)) {
    if (overBudget()) return finish(false, "budget");
    if (aborted()) return finish(false, "aborted");
    emit("📐 Pose du squelette…");
    const r = await deps.buildIncrement(projectDir, { kind: "skeleton", id: "__skeleton__", title: "Squelette" });
    state.costUsd += r.costUsd;
    state.skeletonDone = deps.skeletonDone(projectDir);
    deps.saveState(projectDir, state);
    if (r.aborted) return finish(false, "aborted");
    if (!state.skeletonDone) {
      emit("⛔ Squelette non posé (pas de .project-plan.json) — chantier bloqué.");
      return finish(false, "blocked");
    }
    emit("✅ Squelette posé.");
  } else {
    state.skeletonDone = true;
  }

  // 2) INCRÉMENTS — enchaînement automatique borné.
  let turns = 0;
  while (turns < maxTurns) {
    if (aborted()) return finish(false, "aborted");
    if (overBudget()) return finish(false, "budget");

    const plan = deps.loadPlan(projectDir);
    if (!plan) {
      emit("⛔ Plan introuvable.");
      return finish(false, "no-plan");
    }
    const next = pickNext(plan, state.failed);
    if (!next) {
      // Plus rien à faire : complet si aucune quarantaine ne reste.
      return finish(state.failed.length === 0, state.failed.length === 0 ? "complete" : "blocked");
    }

    emit(`▶️ Incrément « ${next.title} » (${next.id})…`);
    let success = false;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      turns++;
      if (aborted()) return finish(false, "aborted");
      if (overBudget()) return finish(false, "budget");

      const r = await deps.buildIncrement(projectDir, { kind: next.kind, id: next.id, title: next.title });
      state.costUsd += r.costUsd;
      deps.saveState(projectDir, state);
      if (r.aborted) return finish(false, "aborted");

      // GARDIEN d'incrément (Phase 1A) : on ne valide QUE si build vert ET tests verts.
      const gate = await deps.checkIncrement(projectDir);
      if (gate.buildOk && gate.testsOk) {
        deps.markIncrementDone(projectDir, next.id, r.files);
        if (!state.done.includes(next.id)) state.done.push(next.id);
        deps.saveState(projectDir, state);
        emit(`   ✅ validé (build vert${gate.testsRan ? ", tests verts" : ""}, ${r.resolvedBy}, $${r.costUsd.toFixed(2)})`);
        success = true;
        break;
      }
      emit(
        `   ✗ tentative ${attempt}/${attempts} rejetée par le Gardien — ` +
          `${!gate.buildOk ? `build ${gate.signal}` : "tests rouges"} : ${gate.detail.slice(-160)}`,
      );
    }

    if (!success) {
      if (!state.failed.includes(next.id)) state.failed.push(next.id);
      deps.saveState(projectDir, state);
      emit(`   ⚠ « ${next.title} » en quarantaine après ${attempts} tentative(s).`);
      if (stopOnFailure) return finish(false, "blocked");
    }
  }

  emit(`⛔ Plafond de tours atteint (${maxTurns}).`);
  return finish(false, "blocked");
}

// ── Câblage RÉEL des deps (runRelay + inspection + tests) ─────────────────────

/** Construit la consigne d'un tour selon la cible (squelette vs incrément). */
function buildTask(projectDir: string, target: BuildTarget): string {
  if (target.kind === "skeleton") {
    return (
      `${SCAFFOLD_RULES}\n\n` +
      `Pose le SQUELETTE complet du projet (router, layout commun, design tokens, et une page placeholder par incrément prévu), ` +
      `puis génère le manifeste \`.project-plan.json\` listant tous les incréments à statut "todo". Un seul tour, puis arrête-toi.`
    );
  }
  return (
    `${PROJET_MODE_RULES}\n\n${projectPlanSection(projectDir)}\n\n` +
    `Construis l'incrément « ${target.title} » (id: ${target.id}) — et UNIQUEMENT celui-là. ` +
    `Réutilise le squelette et les composants existants. Vérifie le build avant de finir.`
  );
}

export const realGrandChantierDeps: GrandChantierDeps = {
  loadPlan,
  skeletonDone,
  markIncrementDone,
  loadState,
  saveState,
  now: () => Date.now(),
  buildIncrement: async (dir, target) => {
    const task = buildTask(dir, target);
    const r = await runRelay(task, dir);
    return {
      ok: r.success,
      files: [], // métadonnée best-effort ; markIncrementDone tolère une liste vide
      costUsd: r.costUsd,
      resolvedBy: r.resolvedBy,
      incomplete: r.incomplete,
      aborted: r.aborted,
    };
  },
  checkIncrement: async (dir) => {
    const insp = await inspectProject(dir);
    let testsOk = true;
    let testsRan = false;
    // Aligné sur le Gardien #161 (eleve-gate) : tests pris en compte seulement si ELEVE_GATE_TESTS=on.
    if (insp.ok && flag("ELEVE_GATE_TESTS")) {
      try {
        const t = await runProjectTests(dir);
        if (t.signal === "tests-ok" || t.signal === "tests-failed") {
          testsRan = true;
          testsOk = t.ok;
        }
      } catch {
        /* tests KO techniquement → ne pénalise pas (testsOk reste true) */
      }
    }
    return { buildOk: insp.ok, testsOk, testsRan, signal: insp.signal, detail: insp.detail };
  },
};
