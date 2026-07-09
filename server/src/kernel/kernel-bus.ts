// MangoOS Kernel — Event Bus (pilier 2, cf. fondation.md).
//
// Le système nerveux du Kernel : les agents ne se parlent JAMAIS directement,
// ils publient des enveloppes sur ce bus et MangoOS distribue. C'est le point
// unique où passent tous les messages — donc le seul endroit où l'on gère les
// erreurs (problème #4 : erreur propagée) et le format (problème #1 : l'Enveloppe
// Standard). En-process (Node) pour l'instant ; A2A (Agent2Agent, Google) prendra
// le relais le jour où des agents tourneront dans des process séparés.
//
// Principe de routage :
//   - publish(input) scelle une enveloppe v1 (protocol/id/ts) et la distribue.
//   - subscribe(type, agentId, handler) écoute un type d'événement.
//   - recipient absent  → broadcast à tous les abonnés de ce type.
//   - recipient présent → livraison ciblée (seul l'agent nommé reçoit).
//   - abonné '*'        → OBSERVATEUR : voit TOUT, quel que soit le recipient
//                         (c'est ainsi que MangoQA surveillera le bus sans
//                          jamais en faire partie).

// ── L'Enveloppe Standard v1 ──────────────────────────────────────────────────
// Tout message entre MangoOS et un agent a cette forme, peu importe le contenu.
export type EnvelopeKind = 'success' | 'error' | 'progress' | 'request'
export type PayloadType = 'json' | 'file_pointer'

export interface MangoEnvelope<T = unknown> {
  protocol: 'v1'
  /** Identifiant unique du message (scellé par le bus). */
  id: string
  /** Type d'événement, ex. 'design.tokens.extracted'. */
  type: string
  /** Agent émetteur. */
  sender: string
  /** Destinataire ciblé ; absent = broadcast aux abonnés du type. */
  recipient?: string
  kind: EnvelopeKind
  payloadType: PayloadType
  /** JSON direct, ou un FilePointer si payloadType === 'file_pointer'. */
  payload: T
  /** Timestamp (scellé par le bus). */
  ts: number
}

/** Référence vers un artefact lourd stocké dans le Blackboard (pilier suivant).
 * Les payloads volumineux (images, audio) ne transitent pas dans l'enveloppe :
 * on passe leur chemin. */
export interface FilePointer {
  path: string
}

/** Ce que l'appelant fournit ; le bus complète protocol / id / ts. */
export interface PublishInput<T = unknown> {
  type: string
  sender: string
  payload: T
  /** Défaut 'success'. */
  kind?: EnvelopeKind
  /** Défaut 'json'. */
  payloadType?: PayloadType
  /** Absent = broadcast. */
  recipient?: string
}

export type BusHandler = (env: MangoEnvelope) => void | Promise<void>

/** Dépendances injectables (déterminisme en test + gestion d'erreur centrale). */
export interface BusDeps {
  now?: () => number
  genId?: () => string
  /** Appelé quand un handler lève — un handler fautif ne casse pas les autres. */
  onError?: (error: unknown, env: MangoEnvelope) => void
}

interface Subscriber {
  agentId: string
  handler: BusHandler
}

/** Abonnement à TOUT (observateurs type MangoQA). */
export const WILDCARD = '*'

export class KernelBus {
  private subs = new Map<string, Set<Subscriber>>()
  private counter = 0
  private readonly now: () => number
  private readonly genId: () => string
  private readonly onError?: (error: unknown, env: MangoEnvelope) => void

  constructor(deps: BusDeps = {}) {
    // Date.now par défaut ; injecté en test pour un ts déterministe.
    this.now = deps.now ?? (() => Date.now())
    this.genId = deps.genId ?? (() => `env-${++this.counter}`)
    this.onError = deps.onError
  }

  /** Écoute un type d'événement (ou WILDCARD pour tout observer).
   * Renvoie une fonction de désabonnement. */
  subscribe(type: string, agentId: string, handler: BusHandler): () => void {
    let set = this.subs.get(type)
    if (!set) {
      set = new Set<Subscriber>()
      this.subs.set(type, set)
    }
    const sub: Subscriber = { agentId, handler }
    set.add(sub)
    return () => {
      set!.delete(sub)
      if (set!.size === 0) this.subs.delete(type)
    }
  }

  /** Scelle une enveloppe v1 et la distribue. Attend tous les handlers
   * (un handler qui lève est isolé → onError, les autres reçoivent quand même). */
  async publish<T>(input: PublishInput<T>): Promise<MangoEnvelope<T>> {
    const env = this.seal(input)
    const targets = this.targetsFor(env)
    await Promise.all(
      targets.map(async (s) => {
        try {
          await s.handler(env)
        } catch (error) {
          this.onError?.(error, env)
        }
      }),
    )
    return env
  }

  /** Nombre d'abonnés pour un type (utilitaire de diagnostic / test). */
  subscriberCount(type: string): number {
    return this.subs.get(type)?.size ?? 0
  }

  // ── interne ────────────────────────────────────────────────────────────────
  private seal<T>(input: PublishInput<T>): MangoEnvelope<T> {
    return {
      protocol: 'v1',
      id: this.genId(),
      type: input.type,
      sender: input.sender,
      recipient: input.recipient,
      kind: input.kind ?? 'success',
      payloadType: input.payloadType ?? 'json',
      payload: input.payload,
      ts: this.now(),
    }
  }

  private targetsFor(env: MangoEnvelope): Subscriber[] {
    const out: Subscriber[] = []
    // Abonnés au type exact : filtrés par recipient s'il est ciblé.
    for (const s of this.subs.get(env.type) ?? []) {
      if (env.recipient && s.agentId !== env.recipient) continue
      out.push(s)
    }
    // Observateurs WILDCARD : voient tout, recipient ignoré (audit).
    for (const s of this.subs.get(WILDCARD) ?? []) {
      if (env.type === WILDCARD) continue // évite le doublon si type === '*'
      out.push(s)
    }
    return out
  }
}

// ── Bus par défaut du Kernel (singleton) ─────────────────────────────────────
let current: KernelBus | null = null

export function getBus(): KernelBus {
  if (current === null) current = new KernelBus()
  return current
}

export function setBus(bus: KernelBus): void {
  current = bus
}

export function resetBus(): void {
  current = null
}
