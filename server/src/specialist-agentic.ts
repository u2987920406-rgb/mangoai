// #175 — « Subagents » : un spécialiste en mode "action" reçoit sa PROPRE boucle agentique
// (askEleveAgentic) avec un registre d'outils SCELLÉ par sa toolPolicy (décidée à la forge)
// et un budget d'itérations strictement inférieur à l'Élève principal. Il traite un
// sous-problème borné — il ne remplace jamais l'Élève sur le projet entier.
//
// Découplage volontaire : les fonctions lourdes (askEleveAgentic, buildEleveActionTools) sont
// INJECTÉES (deps requises). Ce module n'importe eleve.ts qu'en type (effacé à la compilation)
// → aucun cycle runtime. Le câblage réel est fourni au point de branchement (#175 P3).
//
// Coexiste DÉLIBÉRÉMENT avec runSpecialist (conseil, specialist-agents.ts) : ne pas fusionner,
// la distinction conseil/action EST le garde-fou (plan §7).

import { getSpecialist, type SpecialistAgent } from "./specialist-agents.js"
import { sanitizeExternal } from "./agent-contract.js"
import type { ToolRegistry } from "./kernel-mcp.js"
import type { ToolPolicy } from "./eleve-action-tools.js"

/** Budget d'itérations d'un sous-agent : VOLONTAIREMENT < MAX_TOOL_ITERATIONS (12) de
 *  l'Élève principal — un spécialiste borne un sous-problème (garde-fou #175 §5). */
export const SPECIALIST_MAX_ITER = 6

export interface ToolStep { name: string; args: string }

/** Boucle agentique injectée — structurellement compatible avec `askEleveAgentic`. */
export type AgenticFn = (
  system: string,
  user: string,
  registry: ToolRegistry,
  opts?: { model?: string; maxIterations?: number; projectDir?: string; actorLabel?: string },
) => Promise<{ text: string; toolTrace: ToolStep[] }>

/** Constructeur de registre injecté — compatible avec `buildEleveActionTools`. */
export type BuildToolsFn = (projectDir: string, policy: ToolPolicy) => ToolRegistry

export interface SpecialistAgenticResult {
  ok: boolean
  text: string
  toolTrace: ToolStep[]
  agent?: SpecialistAgent
}

/**
 * Invoque un spécialiste en mode AGENTIQUE : il agit dans le projet via un registre d'outils
 * scellé par sa `toolPolicy` (allowlist/denylist décidée à la forge, jamais élargie ici),
 * avec un budget d'itérations réduit. La tâche entre en DONNÉE (`sanitizeExternal`). Ne lève
 * jamais — renvoie `{ ok, text, toolTrace, agent? }`. Deps REQUISES (agentic + buildTools) →
 * aucun couplage runtime à eleve.ts.
 */
export async function runSpecialistAgentic(
  id: string,
  task: string,
  projectDir: string,
  deps: {
    agentic: AgenticFn
    buildTools: BuildToolsFn
    getAgent?: (id: string) => SpecialistAgent | undefined
  },
): Promise<SpecialistAgenticResult> {
  const agent = (deps.getAgent ?? getSpecialist)(id)
  if (!agent) return { ok: false, text: `Spécialiste introuvable : ${id}`, toolTrace: [] }
  // Registre construit SUR le projectDir de l'Élève (mêmes gardes de confinement resolveInside)
  // + policy scellée à la forge. Un agent sans toolPolicy reçoit {} → registre action complet
  // (rien n'est retiré) ; c'est `assignMode` qui pose une allowlist restrictive à la forge.
  const registry = deps.buildTools(projectDir, agent.toolPolicy ?? {})
  try {
    const result = await deps.agentic(
      agent.systemPrompt,
      sanitizeExternal(String(task ?? "")),
      registry,
      {
        maxIterations: SPECIALIST_MAX_ITER,
        projectDir,
        actorLabel: `Agent forgé : ${agent.name}`,
        ...(agent.model ? { model: agent.model } : {}),
      },
    )
    return { ok: true, text: (result.text ?? "").trim(), toolTrace: result.toolTrace ?? [], agent }
  } catch (err) {
    return { ok: false, text: `Échec de l'exécution agentique : ${(err as Error).message}`, toolTrace: [], agent }
  }
}
