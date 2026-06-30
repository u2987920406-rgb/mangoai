// Orchestrateur de l'exécution agentique spéculative (#171, slice 2). Assemble le cœur slice 1
// (`runSpeculative`) avec : (1) un DRAFT — le cerveau frugal (Élève) propose une séquence d'étapes
// d'un coup ; (2) un VERIFY — déterministe (build/Gardien). Au 1ᵉʳ point de divergence on ESCALADE
// (on rend la main au cerveau fort / on replanifie). Deps injectées → testable ; ne lève jamais.
import {
  runSpeculative,
  summarizeSpeculation,
  type SpecStep,
  type SpeculativeDeps,
  type SpeculativeResult,
} from "./eleve-speculative.js";

export interface DraftStep {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface DraftDeps {
  ask: (system: string, user: string) => Promise<string>;
}

export function buildDraftPrompt(goal: string, depth: number, toolNames: string[]): { system: string; user: string } {
  const system =
    "Tu planifies À L'AVANCE (spéculation) les prochaines étapes concrètes d'une tâche de code. " +
    `Réponds UNIQUEMENT par un tableau JSON de ${depth} étapes AU PLUS, chaque étape = ` +
    `{"label": string, "tool": string, "args": object}. ` +
    `Les "tool" doivent venir EXACTEMENT de cette liste : ${toolNames.join(", ")}. ` +
    "Ordonne-les dans l'ordre d'exécution le plus probable. Aucun texte hors du JSON.";
  const user = `Objectif : ${goal}\nPropose la séquence la plus probable (max ${depth} étapes).`;
  return { system, user };
}

/** Extraction TOLÉRANTE d'un tableau de steps depuis la réponse du modèle (fences, texte parasite). */
export function parseDraft(text: string, allowedTools?: string[]): DraftStep[] {
  const cleaned = (text ?? "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: DraftStep[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const tool = typeof o.tool === "string" ? o.tool.trim() : "";
    if (!tool) continue;
    if (allowedTools && !allowedTools.includes(tool)) continue; // garde : pas d'outil hors liste
    out.push({
      label: typeof o.label === "string" && o.label.trim() ? o.label : tool,
      tool,
      args: o.args && typeof o.args === "object" ? (o.args as Record<string, unknown>) : {},
    });
  }
  return out;
}

export async function draftSteps(deps: DraftDeps, goal: string, depth: number, toolNames: string[]): Promise<DraftStep[]> {
  const { system, user } = buildDraftPrompt(goal, depth, toolNames);
  let text: string;
  try {
    text = await deps.ask(system, user);
  } catch {
    return []; // pas de draft → l'appelant retombe sur le mode séquentiel
  }
  return parseDraft(text, toolNames);
}

export interface SpeculativeAttempt {
  result: SpeculativeResult<DraftStep>;
  escalate: boolean; // true si divergence → rendre la main au cerveau fort / replanifier
  summary: string;
}

/** Exécute spéculativement un draft (execute/verify injectés). Décide de l'escalade à la divergence. */
export async function speculativeAttempt(
  draft: DraftStep[],
  deps: SpeculativeDeps<DraftStep>,
): Promise<SpeculativeAttempt> {
  const steps: SpecStep<DraftStep>[] = draft.map((d) => ({ label: d.label, payload: d }));
  const result = await runSpeculative(steps, deps);
  return {
    result,
    escalate: result.divergedAt !== null,
    summary: summarizeSpeculation(result),
  };
}
