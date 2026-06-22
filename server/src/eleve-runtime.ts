// Runtime agentique de l'Élève (#146 Phase 2) — le MOTEUR DE BUILD maison.
//
// askEleveAgentic (eleve.ts) prouvait la boucle function-calling pour EXPLORER
// (lecture seule, conclure en texte). Ici on la généralise en un vrai moteur :
// l'Élève écrit → vérifie (check_build) → lit son erreur → corrige → recommence,
// jusqu'à `finish` ou une borne — c'est « la coquille de Claude pilotée par GLM ».
//
// Module PUR : il ne connaît ni l'env, ni la config, ni le réseau. Le transport
// (`post`) est INJECTÉ — eleve.ts fournit le vrai (OpenAI-compat), les tests un
// faux scripté. D'où une boucle 100 % testable sans réseau ni vrai build.

import { ToolRegistry, toOpenAITools, type OpenAITool } from "./kernel-mcp.js";
import { FINISH_TOOL } from "./eleve-action-tools.js";
import type { KernelTracer } from "./kernel-trace.js";

// ── Types du dialogue OpenAI-compat ──────────────────────────────────────────

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/** Le transport injecté : un tour de modèle. `tools=null` → appel SANS outils
 * (pour forcer une conclusion). Renvoie le contenu + d'éventuels tool_calls. */
export type PostFn = (
  messages: ChatMessage[],
  tools: OpenAITool[] | null,
) => Promise<{ content: string; toolCalls?: ToolCall[] }>;

// ── Bornes (garde-fous : contexte ET coût cloud) ─────────────────────────────

const DEFAULT_MAX_ITER = Number(process.env.ELEVE_AGENTIC_MAX_ITER ?? 24);
const DEFAULT_CTX_MAX = Number(process.env.ELEVE_AGENTIC_CTX_MAX ?? 60_000);
const DEFAULT_MAX_TOOL_RESULT = 12_000; // taille max d'un résultat d'outil réinjecté
const DEFAULT_REPEAT_LIMIT = 3; // au-delà, on considère le modèle bloqué
const KEEP_RECENT = 6; // messages récents jamais compactés

export interface AgenticOptions {
  /** Transport (obligatoire). Réel en prod (eleve.elevePost), faux en test. */
  post: PostFn;
  model?: string;
  maxIterations?: number;
  ctxMaxChars?: number;
  maxToolResult?: number;
  repeatLimit?: number;
  /** Tracer optionnel (best-effort). Absent → aucun span (tests purs). */
  tracer?: KernelTracer;
  onTool?: (name: string, args: string) => void;
  onLog?: (line: string) => void;
}

export interface AgenticBuildResult {
  /** Résumé final (si `finish`) ou dernier contenu du modèle. */
  text: string;
  /** Outils appelés (diagnostic / trace). */
  toolTrace: Array<{ name: string; args: string }>;
  /** `true` si le modèle a appelé `finish` (fin propre et explicite). */
  finished: boolean;
  /** Nombre d'itérations consommées. */
  iterations: number;
  /** `true` si la boucle a été coupée pour cause de blocage (répétition). */
  stuck: boolean;
}

/** Somme des longueurs de contenu (proxy du poids contexte). */
function totalChars(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
}

/** Compaction : au-delà de `ctxMax`, tronque les VIEUX résultats d'outils
 * volumineux (read_file/search_code…), en gardant intacts system, user et les
 * derniers échanges. Sans elle, une longue boucle fait exploser contexte + coût. */
function compact(messages: ChatMessage[], ctxMax: number): boolean {
  if (totalChars(messages) <= ctxMax) return false;
  let compacted = false;
  for (let i = 2; i < messages.length - KEEP_RECENT; i++) {
    const m = messages[i];
    if (m.role === "tool" && m.content.length > 200) {
      m.content = m.content.slice(0, 200) + " … [résultat compacté]";
      compacted = true;
    }
  }
  return compacted;
}

/**
 * Le moteur. Tourne la boucle outils jusqu'à `finish`, blocage, ou plafond.
 * À blocage/plafond → `finished:false` (l'appelant escaladera vers le Maître).
 */
export async function buildAgentic(
  system: string,
  user: string,
  registry: ToolRegistry,
  opts: AgenticOptions,
): Promise<AgenticBuildResult> {
  const maxIter = opts.maxIterations ?? DEFAULT_MAX_ITER;
  const ctxMax = opts.ctxMaxChars ?? DEFAULT_CTX_MAX;
  const maxToolResult = opts.maxToolResult ?? DEFAULT_MAX_TOOL_RESULT;
  const repeatLimit = opts.repeatLimit ?? DEFAULT_REPEAT_LIMIT;
  const tools = toOpenAITools(registry);

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const toolTrace: AgenticBuildResult["toolTrace"] = [];
  const seen = new Map<string, number>(); // (name+args) → nb d'appels identiques
  let corrections = 0; // nb de relances correctives injectées

  for (let iter = 0; iter < maxIter; iter++) {
    compact(messages, ctxMax);
    const { content, toolCalls } = await opts.post(messages, tools);
    messages.push({ role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) });

    // Le modèle ne demande plus d'outil : il a conclu (sans `finish` explicite).
    if (!toolCalls?.length) {
      return { text: content, toolTrace, finished: false, iterations: iter + 1, stuck: false };
    }

    for (const tc of toolCalls) {
      const name = tc.function.name;
      const rawArgs = tc.function.arguments || "{}";
      toolTrace.push({ name, args: rawArgs });
      opts.onTool?.(name, rawArgs);

      // Fin propre et explicite.
      if (name === FINISH_TOOL) {
        let summary = "";
        try {
          summary = (await registry.invoke(name, JSON.parse(rawArgs) as Record<string, unknown>)).text;
        } catch {
          summary = "Terminé.";
        }
        return { text: summary, toolTrace, finished: true, iterations: iter + 1, stuck: false };
      }

      // Anti-répétition : même appel identique au-delà de la limite → on n'exécute
      // plus, on injecte un correctif. Si ça persiste → sortie contrôlée (échec).
      const key = `${name}:${rawArgs}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      let resultText: string;
      if (count > repeatLimit) {
        corrections++;
        resultText =
          "⚠ Tu répètes le même appel sans progresser. Change d'approche : lis un autre fichier, " +
          "appelle check_build pour voir l'état réel, ou appelle finish si la tâche est faite.";
      } else {
        try {
          const r = await registry.invoke(name, JSON.parse(rawArgs) as Record<string, unknown>);
          resultText = r.text;
        } catch (e) {
          resultText = `Erreur outil "${name}" : ${(e as Error).message}`;
        }
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: resultText.slice(0, maxToolResult) });
    }

    if (corrections >= repeatLimit) {
      opts.onLog?.("⚠ Élève bloqué (appels répétés) — sortie contrôlée.");
      return { text: "", toolTrace, finished: false, iterations: iter + 1, stuck: true };
    }
  }

  // Plafond atteint : un dernier tour SANS outils pour forcer une conclusion.
  messages.push({
    role: "user",
    content: "Limite d'itérations atteinte. Conclus à partir de ce que tu as fait, sans appeler d'outil.",
  });
  const final = await opts.post(messages, null);
  return { text: final.content, toolTrace, finished: false, iterations: maxIter, stuck: false };
}
