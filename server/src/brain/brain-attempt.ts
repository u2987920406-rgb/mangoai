// Brain-Dispatch — UNE TENTATIVE sur un cerveau, extraite de `brain-dispatch.ts`
// (2026-08-06). Comportement repris à l'identique.
//
// C'est la brique que le repli inter-providers rejoue : le cerveau principal et
// chaque cible de la chaîne passent tous par `runOnce`. La sortir d'ici rend visible
// ce qui était noyé au milieu de `dispatch` — la distinction entre un échec qu'un
// repli peut sauver et un échec qu'il ne sauvera jamais.

import { type AskLLMOptions, type LLMProvider } from "../llm/llm-engine.js"
import {
  parseAgentResponse,
  withAgentTimeout,
  isTimeout,
  type AgentResult,
} from "../agent/agent-contract.js"
import type { AgentId } from "./brain-registry.js"
import type { Horloge } from "./brain-rate-limit.js"

export const DEFAULT_TIMEOUT_MS = 60_000

export type AskFn = (system: string, user: string, opts: AskLLMOptions) => Promise<string>

/** (C2) Un cerveau EFFECTIF pour UNE tentative : provider + éventuels modèle,
 *  endpoint, clé, timeout. Réutilisé pour le cerveau principal ET chaque repli. */
export interface BrainAttempt {
  provider: LLMProvider
  model?: string
  baseUrl?: string
  apiKeyEnv?: string
  timeoutMs?: number
}

// (2026-08-06) `maxTokens` et `imageMimeType` existaient dans `AskLLMOptions` mais
// PAS dans le dispatcher : router un appel par `dispatch` les perdait EN SILENCE.
// C'est ce qui bloquait la migration des appels directs à `askLLM` — dont un qui
// plafonne la sortie à 10 tokens, et un autre qui envoie un PNG. Les deux voyagent
// par tour, pas par rôle : ils dépendent de la question posée, pas du cerveau.

/** Contexte immuable partagé par toutes les tentatives d'un dispatch. */
export interface AttemptCtx {
  fullSystem: string
  safeUser: string
  imageBase64?: string
  /** Type MIME de l'image — défaut 'image/jpeg' côté askLLM. */
  imageMimeType?: string
  /** Plafond de tokens en SORTIE. Absent → le défaut d'`askLLM` s'applique. */
  maxTokens?: number
  freeform: boolean
  ask: AskFn
  started: number
  /** Horloge du dispatch — la même pour les durées et pour le rate limiter, afin
   *  qu'un test n'ait pas à composer avec deux temps différents. */
  now: Horloge
}

/** Un résultat dégradé : le contrat « ne throw jamais » a une seule forme de sortie. */
export function degraded(
  agentId: AgentId,
  summary: string,
  durationMs: number,
  status: AgentResult["status"] = "error",
): AgentResult {
  return { status, agent: agentId, summary, data: {}, confidence: 0, durationMs }
}

/**
 * (C2) UNE tentative sur un cerveau donné.
 *
 * `retryable` = l'échec est un problème de **disponibilité** (timeout ou erreur de
 * transport) → un repli est justifié. Un échec de **parsing** n'est PAS retryable :
 * le modèle a répondu, re-payer un appel ne le corrigerait pas. Cette distinction est
 * tout l'intérêt de la fonction ; sans elle, un repli coûterait de l'argent pour
 * reproduire la même mauvaise réponse.
 */
export async function runOnce(
  agentId: AgentId,
  cfg: BrainAttempt,
  ctx: AttemptCtx,
): Promise<{ result: AgentResult; retryable: boolean }> {
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const askOpts: AskLLMOptions = {
    provider: cfg.provider,
    model: cfg.model,
    timeoutMs,
    baseUrl: cfg.baseUrl,
    apiKeyEnv: cfg.apiKeyEnv,
    imageBase64: ctx.imageBase64,
    imageMimeType: ctx.imageMimeType,
    maxTokens: ctx.maxTokens,
  }
  const ecoule = () => ctx.now() - ctx.started

  try {
    const raced = await withAgentTimeout(ctx.ask(ctx.fullSystem, ctx.safeUser, askOpts), timeoutMs, agentId)

    if (isTimeout(raced)) {
      return { result: degraded(agentId, `délai dépassé (${timeoutMs} ms)`, ecoule(), "timeout"), retryable: true }
    }

    if (ctx.freeform) {
      // Mode PROSE LIBRE : pas de contrat Mango, pas de parsing. Une réponse VIDE
      // n'est pas un problème de disponibilité — le modèle a répondu, juste rien —
      // donc NON retryable, cohérent avec « on ne replie que sur timeout/transport ».
      const txt = (raced ?? "").trim()
      return txt
        ? { result: { status: "ok", agent: agentId, summary: txt, data: {}, confidence: 1, durationMs: ecoule() }, retryable: false }
        : { result: degraded(agentId, "réponse vide du cerveau", ecoule()), retryable: false }
    }

    return { result: parseAgentResponse(raced, agentId, ecoule()), retryable: false }
  } catch (err) {
    // Erreur de TRANSPORT (réseau, provider injoignable) → retryable.
    return { result: degraded(agentId, `erreur cerveau : ${(err as Error).message}`.slice(0, 200), ecoule()), retryable: true }
  }
}
