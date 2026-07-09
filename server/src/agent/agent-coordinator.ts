// Idée #103 — Mango Agent Factory. Coordinateur : planifie et orchestre les missions.
// Un coordinateur décompose un objectif en étapes, délègue chaque étape à un agent
// spécialisé via le bus de messages, puis agrège les résultats.
import { resolveProvider } from "../llm/llm-engine.js";
import { getBrain } from "../kernel.js";
import { sendMessage, readInbox } from "./agent-bus.js";
import { loadAgentRegistry } from "./agent-factory.js";
import type { AgentDef, AgentMessage, MissionPlan, MissionStep } from "./agent-types.js";
import { randomUUID } from "node:crypto";

// ── Deps injectables (tests déterministes) ───────────────────────────────────

export interface CoordinatorDeps {
  ask: (system: string, user: string) => Promise<string>;
  sendMessage: typeof sendMessage;
  readInbox: typeof readInbox;
}

function defaultAsk(system: string, user: string): Promise<string> {
  return getBrain().complete(system, user, {
    provider:  resolveProvider(process.env["AGENT_LLM_PROVIDER"]),
    maxTokens: 1200,
  });
}

const defaultCoordinatorDeps: CoordinatorDeps = {
  ask:         defaultAsk,
  sendMessage,
  readInbox,
};

// ── Planification d'une mission ───────────────────────────────────────────────

export async function planMission(
  goal: string,
  availableAgents: AgentDef[],
  deps: CoordinatorDeps = defaultCoordinatorDeps,
): Promise<MissionPlan> {
  const agentList = availableAgents
    .map((a) => `- id: ${a.id} | nom: ${a.name} | catégorie: ${a.category} | description: ${a.description}`)
    .join("\n");

  const system = `Tu es un coordinateur d'agents autonomes. Tu reçois un objectif et une liste d'agents disponibles.
Tu dois décomposer l'objectif en étapes claires et assigner chaque étape à l'agent le plus adapté.
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte autour.
Format exact :
{
  "goal": "<objectif reformulé>",
  "steps": [
    { "stepId": "step-1", "agentId": "<id exact>", "task": "<instruction précise>", "dependsOn": [] },
    { "stepId": "step-2", "agentId": "<id exact>", "task": "<instruction précise>", "dependsOn": ["step-1"] }
  ]
}`;

  const user = `Objectif : ${goal}\n\nAgents disponibles :\n${agentList || "(aucun)"}`;

  const raw = await deps.ask(system, user);
  let parsed: { goal?: string; steps?: MissionStep[] };
  try {
    parsed = JSON.parse(raw.trim()) as typeof parsed;
  } catch {
    // Plan dégradé : une seule étape libre si parsing échoue
    parsed = {
      goal: goal,
      steps: availableAgents.length > 0
        ? [{ stepId: "step-1", agentId: availableAgents[0]!.id, task: goal, dependsOn: [] }]
        : [],
    };
  }

  return {
    missionId: `mission-${Date.now()}`,
    goal:      parsed.goal ?? goal,
    steps:     parsed.steps ?? [],
  };
}

// ── Exécution d'une mission ───────────────────────────────────────────────────

export async function executeMission(
  coordinatorId: string,
  plan: MissionPlan,
  deps: CoordinatorDeps = defaultCoordinatorDeps,
): Promise<{ ok: boolean; results: Record<string, string>; summary: string }> {
  const results: Record<string, string> = {};
  const completed = new Set<string>();

  // Exécute les étapes dans l'ordre topologique (dependsOn)
  const remaining = [...plan.steps];
  const maxRounds = plan.steps.length * 2 + 5; // protection contre les boucles
  let rounds = 0;

  while (remaining.length > 0 && rounds < maxRounds) {
    rounds++;
    const ready = remaining.filter((s) =>
      (s.dependsOn ?? []).every((dep) => completed.has(dep)),
    );

    if (ready.length === 0) break; // dépendances circulaires ou agents manquants

    for (const step of ready) {
      // Enrichit le payload avec le contexte des étapes précédentes
      const context = Object.entries(results)
        .map(([sid, r]) => `[${sid}] ${r}`)
        .join("\n");

      const payload = {
        missionId: plan.missionId,
        stepId:    step.stepId,
        task:      step.task,
        context:   context || null,
      };

      deps.sendMessage({
        from:    coordinatorId,
        to:      step.agentId,
        type:    "task",
        payload,
        ttlMs:   3_600_000,
      });

      // Attend la réponse de l'agent (polling avec timeout 60s)
      const reply = await waitForReply(coordinatorId, step.stepId, plan.missionId, 60_000, deps);
      results[step.stepId] = reply ?? `(pas de réponse de ${step.agentId})`;
      completed.add(step.stepId);
    }

    // Retire les étapes terminées
    for (const s of ready) {
      const idx = remaining.indexOf(s);
      if (idx !== -1) remaining.splice(idx, 1);
    }
  }

  const summary = await aggregateMissionResults(plan, results, deps);
  return { ok: true, results, summary };
}

// ── Attente d'une réponse d'un agent (polling) ────────────────────────────────

async function waitForReply(
  coordinatorId: string,
  stepId: string,
  missionId: string,
  timeoutMs: number,
  deps: CoordinatorDeps,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = deps.readInbox(coordinatorId);
    const reply = messages.find(
      (m: AgentMessage) =>
        m.type === "result" &&
        (m.payload as { stepId?: string; missionId?: string } | null)?.stepId === stepId &&
        (m.payload as { stepId?: string; missionId?: string } | null)?.missionId === missionId,
    );
    if (reply) {
      return String((reply.payload as { result?: string } | null)?.result ?? "");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

// ── Agrégation des résultats ──────────────────────────────────────────────────

export async function aggregateMissionResults(
  plan: MissionPlan,
  results: Record<string, string>,
  deps: CoordinatorDeps = defaultCoordinatorDeps,
): Promise<string> {
  const stepsText = plan.steps
    .map((s) => `Étape ${s.stepId} (agent: ${s.agentId}) : ${results[s.stepId] ?? "(aucun résultat)"}`)
    .join("\n");

  const system = "Tu es un coordinateur. Agrège les résultats des étapes d'une mission en un rapport clair et concis.";
  const user   = `Objectif : ${plan.goal}\n\nRésultats :\n${stepsText}\n\nRédige un rapport de synthèse en 3-5 phrases.`;

  try {
    return await deps.ask(system, user);
  } catch {
    return `Mission terminée. ${Object.keys(results).length}/${plan.steps.length} étapes complétées.`;
  }
}
