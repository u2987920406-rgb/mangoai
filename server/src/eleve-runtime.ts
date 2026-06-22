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

import { z } from "zod";
import { ToolRegistry, toOpenAITools, type OpenAITool, type KernelTool } from "./kernel-mcp.js";
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

// ── DÉLÉGATION : l'orchestrateur lance des SOUS-AGENTS (#146 Phase D) ─────────
//
// Le maillon « appeler un agent » : un sous-agent = une instance bornée du MÊME
// buildAgentic. Élégance clé : `delegate` n'est qu'UN OUTIL DE PLUS dans le
// registre — quand le cerveau l'appelle, son handler relance runAgenticTask sur
// la sous-tâche (profondeur +1) et renvoie le résumé. buildAgentic n'a rien à
// savoir de la délégation : il invoque `delegate` comme n'importe quel outil.
// Récursion bornée par la PROFONDEUR (depth/maxDepth) et un BUDGET PARTAGÉ de
// sous-agents (budget.spawned/max), tout deux passés par référence vers le bas.

export const DELEGATE_TOOL = "delegate";

export interface AgenticRunCtx {
  projectDir: string;
  /** System de base (coquille complète + contrat d'outils). */
  system: string;
  post: PostFn;
  /** Fabrique du registre d'outils d'action (= buildEleveActionTools). Injectée
   * pour garder ce module PUR (aucun import d'eleve.ts). */
  buildRegistry: (projectDir: string) => ToolRegistry;
  /** Construit le prompt user d'une (sous-)tâche (= buildEleveUser …, agentic). */
  buildUser: (subtask: string) => string;
  depth: number;
  maxDepth: number;
  /** Budget PARTAGÉ (même objet à tous les niveaux) : borne le nb total de sous-agents. */
  budget: { spawned: number; max: number };
  tracer?: KernelTracer;
  maxIterations?: number;
  onTool?: (name: string, args: string) => void;
  onLog?: (line: string) => void;
}

/** Lance la boucle agentique sur `user`, en injectant l'outil `delegate` tant
 * qu'on n'a pas atteint la profondeur max. Trace chaque niveau (span imbriqué). */
export async function runAgenticTask(user: string, ctx: AgenticRunCtx): Promise<AgenticBuildResult> {
  const registry = ctx.buildRegistry(ctx.projectDir);
  if (ctx.depth < ctx.maxDepth) registry.register(makeDelegateTool(ctx));

  const runOnce = () =>
    buildAgentic(ctx.system, user, registry, {
      post: ctx.post,
      maxIterations: ctx.maxIterations,
      onTool: ctx.onTool,
      onLog: ctx.onLog,
    });

  if (!ctx.tracer) return runOnce();
  return ctx.tracer.withSpan(`eleve.agentic.d${ctx.depth}`, () => runOnce(), { attributes: { depth: ctx.depth } });
}

/** L'outil `delegate` : confie une sous-tâche à un sous-agent borné. */
function makeDelegateTool(ctx: AgenticRunCtx): KernelTool {
  return {
    name: DELEGATE_TOOL,
    description:
      "Délègue une SOUS-TÂCHE bien bornée et autonome à un sous-agent disposant des mêmes outils (lecture/écriture/build) sur le même projet. Sers-t'en pour découper une grande tâche en morceaux indépendants. Renvoie le résumé du sous-agent.",
    inputSchema: { subtask: z.string().describe("La sous-tâche précise et autonome à confier au sous-agent") },
    handler: async (args) => {
      const subtask = String((args as Record<string, unknown>).subtask ?? "").trim();
      if (!subtask) return { text: "sous-tâche vide", isError: true };
      if (ctx.budget.spawned >= ctx.budget.max) {
        return {
          text: `budget de sous-agents épuisé (${ctx.budget.max}) — réalise cette sous-tâche toi-même avec tes outils.`,
          isError: true,
        };
      }
      ctx.budget.spawned++;
      ctx.onLog?.(`  ↳ délégation #${ctx.budget.spawned} (profondeur ${ctx.depth + 1}) : ${subtask.slice(0, 80)}`);
      const sub = await runAgenticTask(ctx.buildUser(subtask), { ...ctx, depth: ctx.depth + 1 });
      const head = sub.finished ? "✓ sous-agent terminé" : sub.stuck ? "⚠ sous-agent bloqué" : "⚠ sous-agent non conclu";
      return { text: `${head} : ${sub.text || "(pas de résumé)"}` };
    },
  };
}
