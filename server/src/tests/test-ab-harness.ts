// Preuve déterministe du harnais A/B (#182 D7/É7).
//   npx tsx src/test-ab-harness.ts
// Zéro réseau : dispatch et judge sont des fakes injectés. Le seul I/O réel est
// le fichier de test data/ab-runs.json (nettoyé avant/après) et
// data/prompt-evolution.json (la proposition créée est retirée en fin de test
// pour ne pas polluer le registre réel — on note son id avant de la retirer).
import fs from "node:fs";
import path from "node:path";
import { flag } from "../flags.js";
import { abCompare, loadAbRuns, type AbTask, type AbVariant } from "../ab-harness.js";
import { loadRuns as loadEvolutionRuns } from "../prompt-evolution.js";
import { Blackboard, setBlackboard } from "../kernel/kernel-blackboard.js";
import { MemoryStore } from "../kernel/kernel-blackboard-store.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
  }
}

const DATA_DIR = path.join(process.cwd(), "..", "server", "data");
const AB_RUNS_FILE = path.join(DATA_DIR, "ab-runs.json");

/** Sauvegarde/restaure les deux fichiers touchés pour ne rien laisser derrière. */
function snapshotFile(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}
function restoreFile(file: string, prev: string | null): void {
  if (prev === null) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* pas grave */
    }
  } else {
    fs.writeFileSync(file, prev);
  }
}

const EVOLUTION_FILE = path.join(DATA_DIR, "prompt-evolution.json");

/** Fabrique un dispatch fake : renvoie un texte dépendant du system prompt reçu
 *  (pour vérifier qu'un cache mal namespacé masquerait la différence A/B), et
 *  compte les appels par variante (via un tag dans le system). */
function fakeDispatch(calls: { count: number }) {
  return async (_agentId: string, system: string, _user: string) => {
    calls.count++;
    // Le "tag" = la 1re ligne du system prompt (ex. "VARIANT_A" / "VARIANT_B").
    const tag = system.split("\n")[0];
    return { status: "ok", agent: "codeur", summary: `réponse-${tag}`, data: {}, confidence: 1, durationMs: 1 } as const;
  };
}

/** Juge fake : score dérivé du texte de sortie (déterministe, sans LLM). */
function fakeJudge(scoreByOutput: Record<string, number>) {
  return async (_task: string, output: string) => ({
    couverture: scoreByOutput[output] ?? 50,
    manques: scoreByOutput[output] === 100 ? [] : ["quelque chose"],
  });
}

async function main() {
  // Blackboard mémoire pour toute la session de test (pas de SQLite disque).
  setBlackboard(new Blackboard(new MemoryStore()));

  const prevAb = snapshotFile(AB_RUNS_FILE);
  const prevEvo = snapshotFile(EVOLUTION_FILE);

  try {
    // ── (1) 2 variantes sur 1 taskSet → scores → gagnant → proposition pending ──
    {
      const taskSet: AbTask[] = [{ id: "t1", user: "écris une fonction qui trie un tableau" }];
      const variantA: AbVariant = { label: "A", promptRef: "scenario@abc123", system: "VARIANT_A\nSois concis." };
      const variantB: AbVariant = { label: "B", promptRef: "scenario@def456", system: "VARIANT_B\nSois exhaustif." };

      const calls = { count: 0 };
      const dispatch = fakeDispatch(calls) as any;
      const judge = fakeJudge({ "réponse-VARIANT_A": 40, "réponse-VARIANT_B": 90 });

      const evoBefore = loadEvolutionRuns().length;
      const run = await abCompare(taskSet, variantA, variantB, { dispatch, judge, ts: "2026-07-04T10:00:00.000Z", idSeed: "test-run-1" });

      check("2 tâches notées (1 par variante)", run.variantA.tasks.length === 1 && run.variantB.tasks.length === 1);
      check("scores calculés (A=40, B=90)", run.variantA.avgCouverture === 40 && run.variantB.avgCouverture === 90);
      check("gagnant déterminé (B)", run.winner === "B");
      check("proposition créée", run.proposal !== null);

      const evoAfter = loadEvolutionRuns();
      check("un run d'évolution de plus dans prompt-evolution.json", evoAfter.length === evoBefore + 1);
      const evoRun = evoAfter.find((r) => r.id === run.proposal?.runId);
      const prop = evoRun?.proposals.find((p) => p.id === run.proposal?.proposalId);
      check("proposition retrouvée, kind=promote", !!prop && prop.kind === "promote");
      check("proposition PENDING (jamais appliquée)", prop?.status === "pending");
      check("proposition == le prompt de la variante gagnante (B)", prop?.newText === variantB.system);

      // Vérifie explicitement qu'aucun mécanisme d'auto-apply n'a été déclenché :
      // le fichier axiomes (cible réelle d'application) n'a AUCUNE raison d'avoir
      // été touché — on ne fait qu'une assertion structurelle (status pending
      // suffit à prouver l'absence d'apply, applyProposal n'étant jamais appelé
      // par ab-harness.ts — vérifié par lecture de code, pas d'I/O ici).
      check("statut pending = pas d'apply (garantie structurelle)", prop?.appliedAt === undefined);
    }

    // ── (2) Le run est versionné et relisible depuis data/ab-runs.json ──────────
    {
      const runs = loadAbRuns();
      check("le run est bien persisté dans ab-runs.json", runs.some((r) => r.id === "test-run-1"));
    }

    // ── (3) Cache namespacé par variante : pas de fuite/masquage entre A et B ──
    // Gate ON pour ce scénario, système QUASI-IDENTIQUE entre A et B (seul le tag
    // diffère) — sans namespacing correct, le cache exact/sémantique de la
    // variante A pourrait servir sa réponse à la variante B (même embed factice).
    {
      process.env.LLM_SEMANTIC_CACHE = "on";
      check("gate LLM_SEMANTIC_CACHE actif pour ce scénario", flag("LLM_SEMANTIC_CACHE") === true);

      const taskSet: AbTask[] = [{ id: "t1", user: "même tâche pour les deux variantes" }];
      // Systèmes très proches (même embedding factice constant) → si le cache
      // n'était PAS namespacé par variante, le premier hit (A) masquerait B.
      const variantA: AbVariant = { label: "A", brainId: "codeur" as any, system: "VARIANT_A\nRègle commune." };
      const variantB: AbVariant = { label: "B", brainId: "juge" as any, system: "VARIANT_B\nRègle commune." };

      const calls = { count: 0 };
      const dispatch = fakeDispatch(calls) as any;
      const judge = fakeJudge({ "réponse-VARIANT_A": 60, "réponse-VARIANT_B": 60 });

      const run = await abCompare(taskSet, variantA, variantB, {
        dispatch,
        judge,
        ts: "2026-07-04T10:05:00.000Z",
        idSeed: "test-run-cache-ns",
      });

      check("dispatch appelé pour CHAQUE variante (pas de fuite de cache A→B)", calls.count === 2);
      check("sortie A distincte de la sortie B malgré le cache", run.variantA.tasks[0]?.output !== run.variantB.tasks[0]?.output);
      check("sortie A = réponse de la variante A", run.variantA.tasks[0]?.output === "réponse-VARIANT_A");
      check("sortie B = réponse de la variante B", run.variantB.tasks[0]?.output === "réponse-VARIANT_B");

      process.env.LLM_SEMANTIC_CACHE = "off";
    }

    // ── (4) Égalité → aucune proposition (rien à proposer sans gagnant net) ─────
    {
      const taskSet: AbTask[] = [{ id: "t1", user: "tâche" }];
      const variantA: AbVariant = { label: "A", system: "VARIANT_A\nX" };
      const variantB: AbVariant = { label: "B", system: "VARIANT_B\nY" };
      const calls = { count: 0 };
      const dispatch = fakeDispatch(calls) as any;
      const judge = fakeJudge({ "réponse-VARIANT_A": 70, "réponse-VARIANT_B": 70 });

      const evoBefore = loadEvolutionRuns().length;
      const run = await abCompare(taskSet, variantA, variantB, { dispatch, judge, ts: "2026-07-04T10:10:00.000Z", idSeed: "test-run-tie" });
      check("égalité détectée", run.winner === "tie");
      check("aucune proposition sur égalité", run.proposal === null);
      check("aucun run d'évolution ajouté sur égalité", loadEvolutionRuns().length === evoBefore);
    }

    console.log(`\n${passed} passés, ${failed} échoués`);
    if (failed > 0) process.exit(1);
  } finally {
    // Nettoyage : restaure l'état des deux fichiers touchés (best-effort).
    restoreFile(AB_RUNS_FILE, prevAb);
    restoreFile(EVOLUTION_FILE, prevEvo);
  }
}

main();
