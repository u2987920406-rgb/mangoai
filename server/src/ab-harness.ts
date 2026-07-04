// Harnais A/B (#182 D7/É7) — comparaison OBJECTIVE + VERSIONNÉE de deux variantes
// de prompt/cerveau sur le MÊME jeu de tâches, par-dessus le rail `dispatch`
// (#150). Le gagnant devient une PROPOSITION dans le pipeline #76
// (prompt-evolution.ts) — jamais auto-appliqué : Raf valide, comme toujours.
//
// Une variante = { promptRef | brainId } : une réf git de scenario.ts/.axioms.md
// (label de versioning, PAS un nouveau dépôt de prompts — git + .axioms.md
// versionnent déjà tout prompt), ou une BrainCard (rôle du registre #150) à
// laquelle router la tâche. Le système RÉELLEMENT testé (`system`) est fourni
// par l'appelant — l'A/B ne devine rien.
//
// Notation : un juge existant (`judgeIntention`, #161 — score d'ADÉQUATION
// demande↔livré, souverain, cerveau `juge` distinct de l'exécutant). On ne crée
// PAS un second juge : c'est le rail nommé en D7.
//
// Interaction avec D5 (cache sémantique, llm-cache.ts) — §4.8 du plan : le cache
// est le point d'intégration le plus fragile. Chaque variante exécute ses tâches
// via `cachedComplete` avec un `promptVersion` NAMESPACÉ par variante
// (`<base>::<promptRef|brainId|label>`) — deux variantes qui partageraient un
// sous-appel identique ne se MASQUENT donc jamais l'une l'autre : chacune a sa
// propre entrée de cache, même si le texte sous-jacent est proche. Gate
// LLM_SEMANTIC_CACHE OFF (défaut) → cachedComplete appelle `ask` directement,
// comportement byte-identique ; le namespacing ne change alors rien d'observable.
//
// Gate AB_HARNESS (flags.ts), défaut OFF — porte sur la ROUTE HTTP (index.ts) ;
// `abCompare` elle-même reste une fonction PURE/injectable, toujours appelable
// directement par les tests/scripts (comme les autres modules du chantier
// fondations : la fonction n'est jamais gatée, seule la surface l'est).
import { dispatch as realDispatch, type DispatchOpts } from "./brain-dispatch.js";
import type { AgentId } from "./brain-registry.js";
import type { AgentResult } from "./agent-contract.js";
import { cachedComplete } from "./llm-cache.js";
import { judgeIntention, type IntentVerdict } from "./eleve-judge.js";
import { loadRuns as loadEvolutionRuns, saveRuns as saveEvolutionRuns, type EvolutionProposal, type EvolutionRun } from "./prompt-evolution.js";
import { atomicWriteFileSync } from "./safe-io.js";
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { flag } from "./flags.js";

const DATA_DIR = path.join(process.cwd(), "..", "server", "data");
const AB_RUNS_FILE = path.join(DATA_DIR, "ab-runs.json");

/** Une variante A/B — le prompt système RÉELLEMENT testé, plus les réfs de traçabilité. */
export interface AbVariant {
  /** Étiquette lisible ("A", "B", ou un nom descriptif). */
  label: string;
  /** Réf git de scenario.ts/.axioms.md identifiant la version de prompt testée
   *  (versioning existant, JAMAIS un nouveau dépôt de prompts). Sert aussi au
   *  namespacing du cache (D5) et à l'identification dans le run enregistré. */
  promptRef?: string;
  /** BrainCard (rôle du registre #150, brain-registry.json) vers laquelle router
   *  cette variante. Défaut = `deps.agentId` (fallback "codeur"). */
  brainId?: AgentId;
  /** Le system prompt réellement soumis pour cette variante. */
  system: string;
}

/** Une tâche du jeu de tâches — envoyée telle quelle aux deux variantes. */
export interface AbTask {
  id: string;
  user: string;
}

export interface AbTaskResult {
  taskId: string;
  output: string;
  couverture: number;
  manques: string[];
}

export interface AbVariantResult {
  label: string;
  promptRef?: string;
  brainId?: AgentId;
  tasks: AbTaskResult[];
  avgCouverture: number;
}

export interface AbRun {
  id: string;
  ts: string;
  taskSetSize: number;
  variantA: AbVariantResult;
  variantB: AbVariantResult;
  winner: "A" | "B" | "tie";
  /** Référence vers la proposition #76 créée pour le gagnant (null si égalité —
   *  pas de gagnant net, rien à proposer). */
  proposal: { runId: string; proposalId: string } | null;
}

export type AbDispatchFn = (agentId: AgentId, system: string, user: string, opts?: DispatchOpts) => Promise<AgentResult>;
export type AbJudgeFn = (task: string, output: string) => Promise<Pick<IntentVerdict, "couverture" | "manques">>;

export interface AbCompareDeps {
  /** Transport injectable (tests, zéro réseau). Défaut : dispatch réel (brain-dispatch.ts). */
  dispatch?: AbDispatchFn;
  /** Juge injectable (tests). Défaut : judgeIntention (#161, cerveau `juge`, souverain). */
  judge?: AbJudgeFn;
  /** Cerveau par défaut si une variante ne précise pas `brainId`. Défaut "codeur" (l'Élève). */
  agentId?: AgentId;
  /** Base du namespace de cache (D5×D7) — combinée à la réf de variante. Défaut "ab-harness". */
  promptVersionBase?: string;
  /** Horodatage injectable (tests reproductibles). Défaut `new Date().toISOString()`. */
  ts?: string;
  /** Graine d'id injectable (tests reproductibles). Défaut `ab-${Date.now()}`. */
  idSeed?: string;
}

/** Clé de namespacing d'une variante — priorité promptRef > brainId > label. PUR. */
function variantKey(v: AbVariant): string {
  return v.promptRef ?? v.brainId ?? v.label;
}

async function runVariant(
  taskSet: AbTask[],
  variant: AbVariant,
  dispatchFn: AbDispatchFn,
  judgeFn: AbJudgeFn,
  agentId: AgentId,
  promptVersionBase: string,
): Promise<AbVariantResult> {
  const targetAgent = variant.brainId ?? agentId;
  // D5×D7 : namespace de cache PROPRE à cette variante — deux variantes ne
  // partagent jamais une entrée, même à system/texte proches (§4.8 du plan).
  const promptVersion = `${promptVersionBase}::${variantKey(variant)}`;
  const providerModel = `ab:${targetAgent}`;

  const tasks: AbTaskResult[] = [];
  for (const task of taskSet) {
    const output = await cachedComplete(variant.system, task.user, {
      role: "ab-harness",
      providerModel,
      promptVersion,
      ask: async (sys, user) => {
        const r = await dispatchFn(targetAgent, sys, user, { freeform: true });
        return r.summary ?? "";
      },
    });
    const verdict = await judgeFn(task.user, output);
    tasks.push({ taskId: task.id, output, couverture: verdict.couverture, manques: verdict.manques });
  }
  const avgCouverture = tasks.length ? tasks.reduce((s, t) => s + t.couverture, 0) / tasks.length : 0;
  return {
    label: variant.label,
    ...(variant.promptRef !== undefined ? { promptRef: variant.promptRef } : {}),
    ...(variant.brainId !== undefined ? { brainId: variant.brainId } : {}),
    tasks,
    avgCouverture,
  };
}

/**
 * Exécute les DEUX variantes sur le MÊME jeu de tâches, note chaque sortie via
 * le juge d'intention (#161), enregistre un run versionné (data/ab-runs.json),
 * et — si un gagnant net se dégage — crée une proposition `promote` PENDANTE
 * dans le pipeline #76 (prompt-evolution.ts, data/prompt-evolution.json).
 * JAMAIS auto-appliquée : `applyProposal` n'est jamais appelé ici.
 * Ne lève jamais côté notation/écriture (dispatch/judge ne throw pas par
 * contrat ; une écriture disque ratée ne doit pas faire échouer la mesure —
 * mais le run est alors simplement non persisté, best-effort).
 */
export async function abCompare(taskSet: AbTask[], variantA: AbVariant, variantB: AbVariant, deps: AbCompareDeps = {}): Promise<AbRun> {
  const dispatchFn = deps.dispatch ?? (realDispatch as AbDispatchFn);
  const judgeFn: AbJudgeFn = deps.judge ?? ((task, output) => judgeIntention(task, output, [], ""));
  const agentId = deps.agentId ?? "codeur";
  const promptVersionBase = deps.promptVersionBase ?? "ab-harness";
  const ts = deps.ts ?? new Date().toISOString();
  const idSeed = deps.idSeed ?? `ab-${Date.now()}`;

  const resA = await runVariant(taskSet, variantA, dispatchFn, judgeFn, agentId, promptVersionBase);
  const resB = await runVariant(taskSet, variantB, dispatchFn, judgeFn, agentId, promptVersionBase);

  const winner: "A" | "B" | "tie" =
    resA.avgCouverture === resB.avgCouverture ? "tie" : resA.avgCouverture > resB.avgCouverture ? "A" : "B";

  let proposal: { runId: string; proposalId: string } | null = null;
  if (winner !== "tie") {
    const winnerRes = winner === "A" ? resA : resB;
    const winnerVariant = winner === "A" ? variantA : variantB;
    const loserRes = winner === "A" ? resB : resA;
    const runId = `${idSeed}-evolution`;
    const evolutionProposal: EvolutionProposal = {
      id: `${runId}-0`,
      kind: "promote",
      title: `A/B ${idSeed} : variante ${winner} (${winnerVariant.label}) gagnante`,
      rationale:
        `Couverture moyenne ${winnerRes.avgCouverture.toFixed(1)} (${winner}) vs ${loserRes.avgCouverture.toFixed(1)} ` +
        `(${winner === "A" ? "B" : "A"}) sur ${taskSet.length} tâche(s) — harnais A/B #182 D7. ` +
        `Proposition en attente de validation Raf, jamais auto-appliquée.`,
      targetIds: [],
      newText: winnerVariant.system,
      status: "pending",
    };
    const evoRun: EvolutionRun = { id: runId, ts, summary: evolutionProposal.rationale, proposals: [evolutionProposal] };
    try {
      const runs = loadEvolutionRuns();
      runs.unshift(evoRun);
      saveEvolutionRuns(runs);
      proposal = { runId, proposalId: evolutionProposal.id };
    } catch {
      /* persistance ratée → la mesure reste valide, seule la trace #76 manque. */
    }
  }

  const run: AbRun = { id: idSeed, ts, taskSetSize: taskSet.length, variantA: resA, variantB: resB, winner, proposal };
  try {
    const runs = loadAbRuns();
    runs.unshift(run);
    saveAbRuns(runs);
  } catch {
    /* idem : la mesure est renvoyée à l'appelant même si l'écriture disque échoue. */
  }
  return run;
}

// ── Persistance des runs A/B (miroir de prompt-evolution.ts) ────────────────
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadAbRuns(): AbRun[] {
  try {
    const data = JSON.parse(fs.readFileSync(AB_RUNS_FILE, "utf8")) as { runs?: AbRun[] };
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export function saveAbRuns(runs: AbRun[]): void {
  ensureDataDir();
  atomicWriteFileSync(AB_RUNS_FILE, JSON.stringify({ runs: runs.slice(0, 50) }, null, 2));
}

// ── Route HTTP ────────────────────────────────────────────────────────────────
// Fire-and-forget (pattern de taste-routes.ts /api/taste/nocturnal/run) : la
// route répond IMMÉDIATEMENT ("started: true") sans attendre le run complet
// (2 variantes × N tâches × dispatch + juge peut être long) ; le run se
// termine en tâche de fond et devient lisible via GET data/ab-runs.json (ou un
// futur GET /api/ab/runs — hors scope É7, non demandé par le plan).
//
// Gate AB_HARNESS (défaut OFF) : porte UNIQUEMENT sur cette route — `abCompare`
// reste appelable directement (tests/CLI) même gate OFF.
export function registerAbHarnessRoutes(app: Express): void {
  app.post("/api/ab/run", (req: Request, res: Response) => {
    if (!flag("AB_HARNESS")) {
      res.status(404).json({ error: "harnais A/B désactivé (gate AB_HARNESS)" });
      return;
    }
    const body = (req.body ?? {}) as { taskSet?: AbTask[]; variantA?: AbVariant; variantB?: AbVariant; agentId?: AgentId };
    const taskSet = Array.isArray(body.taskSet) ? body.taskSet : [];
    if (!taskSet.length || !body.variantA || !body.variantB) {
      res.status(400).json({ error: "taskSet (non vide), variantA et variantB sont requis" });
      return;
    }
    res.json({ ok: true, started: true });
    abCompare(taskSet, body.variantA, body.variantB, { agentId: body.agentId }).catch((err) =>
      console.error("[ab-harness]", err instanceof Error ? err.message : err),
    );
  });
}
