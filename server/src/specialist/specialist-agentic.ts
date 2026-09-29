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
import { sanitizeExternal } from "../agent/agent-contract.js"
import type { ToolRegistry } from "../kernel/kernel-mcp.js"
import type { ToolPolicy } from "../eleve-tools/eleve-action-tools.js"

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

/**
 * (D8 de l'audit 2026-09-28, constat B9) La BOÎTE À OUTILS RÉELLE, dite au sous-agent.
 *
 * Le champ `tools` des specs forgées n'a jamais rien câblé : la boîte vient de
 * `deps.buildTools(projectDir, toolPolicy)` (ligne ci-dessous), pas de la spec. Un
 * spécialiste pouvait donc recevoir un prompt système qui lui ordonne d'utiliser cinq
 * capacités absentes de sa boîte (`rasteriser_pdf`, `extraire_ocr`…). Le champ est retiré
 * du contrat de forge ; pour les 11 agents DÉJÀ forgés (données conservées, jamais
 * supprimées), on corrige la promesse à l'exécution : on énonce les outils réellement
 * disponibles et on invalide explicitement tout nom absent de cette liste.
 *
 * PUR (testable sans réseau). Renvoie "" si le registre est vide — dans ce cas on
 * n'ajoute rien au prompt système (aucune modification de comportement).
 */
export function realToolboxClause(toolNames: string[]): string {
  const names = toolNames.filter((n) => typeof n === "string" && n.trim())
  if (!names.length) return ""
  return (
    "\n\n## Ta boîte à outils RÉELLE\n" +
    `Tu disposes EXACTEMENT de ces outils : ${names.join(", ")}.\n` +
    "Toute autre capacité nommée ailleurs dans ces consignes n'existe PAS : ne l'appelle pas, " +
    "fais le travail avec les outils ci-dessus, et dis-le franchement si c'est impossible."
  )
}

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
  // (D8/B9) La vérité sur la boîte à outils, ajoutée au prompt système du sous-agent.
  // Ce chemin est lui-même gaté ELEVE_DELEGATE_AGENTIC (défaut off, relay-agentic.ts) :
  // aucun comportement par défaut ne change. Registre vide → clause vide → prompt identique.
  const systemPrompt = agent.systemPrompt + realToolboxClause(registry.names())
  try {
    const result = await deps.agentic(
      systemPrompt,
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
