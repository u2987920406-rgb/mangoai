// MangoOS Kernel — Pont Chat → Bus + Tracer (ACTIVATION du Kernel).
//
// Jusqu'ici le chat (/api/chat) était MUET vis-à-vis du Kernel : il générait via
// query()/runAgent sans jamais parler à l'Event Bus ni au Tracer. Les piliers
// existaient (kernel-bus, kernel-trace) et le pont MangoQA exportait le flux —
// mais rien ne coulait dedans. Ce module branche enfin le chat :
//
//   chaque tour  ──▶  un SPAN (getTracer)        → trace OTel publiée sur le Bus
//                ──▶  une ENVELOPPE d'issue (getBus, kind success/error)
//
// C'est ce flux qui ARME les visages de MangoQA (cf. fondation.md) :
//   • Disjoncteur — kind error/success (échecs consécutifs), payload.costUsd
//     (garde-fou coût), payload.turns / durationMs (kill switch agent) ;
//   • MangoQA observe tout via l'abonné '*' (le pont d'export).
//
// PRINCIPE : publier ne doit JAMAIS casser ni ralentir un tour de chat (fire-and-
// forget, erreurs avalées). La génération agentique RESTE sur query() ($0
// abonnement) — on n'y touche pas ; getBrain() est la voie des appels one-shot,
// le cœur agentique garde sa boucle. Le Kernel s'active par OBSERVATION, pas en
// remplaçant le moteur qui marche.

import { getBus, type KernelBus } from './kernel-bus.js'
import { getTracer, type KernelTracer, type Span } from './kernel-trace.js'

/** Type d'événement d'un tour de chat sur le Bus. */
export const CHAT_TURN_EVENT = 'chat.turn'

export interface ChatTurnStart {
  project: string
  mode: string
  model: string
}

export interface ChatTurnOutcome extends ChatTurnStart {
  ok: boolean
  costUsd?: number
  /** Itérations agentiques internes du tour (signal d'emballement). */
  numTurns?: number
  durationMs?: number
  /** Taille de contexte (informatif — PAS mappé au kill switch tokens). */
  contextTokens?: number
  resolvedBy?: 'eleve' | 'maitre' | 'none'
  error?: string
}

export interface ChatBridgeDeps {
  bus?: KernelBus
  tracer?: KernelTracer
}

/** Ouvre le span d'un tour. Ne lève jamais (le tracing ne casse pas un tour). */
export function startChatTurn(info: ChatTurnStart, deps: ChatBridgeDeps = {}): Span | null {
  try {
    const tracer = deps.tracer ?? getTracer()
    return tracer.startSpan(CHAT_TURN_EVENT, {
      attributes: { project: info.project, mode: info.mode, model: info.model },
    })
  } catch {
    return null
  }
}

/** Clôt le tour : termine le span (statut + attributs) et publie l'issue sur le
 * Bus. Fire-and-forget de bout en bout — ne lève jamais. */
export function finishChatTurn(span: Span | null, info: ChatTurnOutcome, deps: ChatBridgeDeps = {}): void {
  // 1. Span (trace) — publié sur le Bus par le tracer (createBusTracer.onEnd).
  try {
    if (span) {
      span.setStatus(info.ok ? 'ok' : 'error')
      if (info.costUsd !== undefined) span.setAttribute('cost.usd', info.costUsd)
      if (info.numTurns !== undefined) span.setAttribute('turns', info.numTurns)
      if (info.contextTokens !== undefined) span.setAttribute('context.tokens', info.contextTokens)
      if (info.resolvedBy) span.setAttribute('resolved.by', info.resolvedBy)
      if (info.error) span.setAttribute('error.message', info.error)
      span.end()
    }
  } catch {
    /* le tracing ne casse jamais un tour */
  }

  // 2. Enveloppe d'issue — le signal que les disjoncteurs lisent. Les noms de
  //    champs (costUsd / turns / durationMs) correspondent exactement à ce que
  //    le moteur du Disjoncteur inspecte. contextTokens reste informatif.
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: CHAT_TURN_EVENT,
      sender: info.project,
      kind: info.ok ? 'success' : 'error',
      payload: {
        project: info.project,
        mode: info.mode,
        model: info.model,
        costUsd: info.costUsd ?? 0,
        turns: info.numTurns ?? 0,
        durationMs: info.durationMs ?? 0,
        contextTokens: info.contextTokens ?? 0,
        ...(info.resolvedBy ? { resolvedBy: info.resolvedBy } : {}),
        ...(info.error ? { error: info.error } : {}),
      },
    })
  } catch {
    /* fire-and-forget : publier ne casse jamais un tour */
  }
}
