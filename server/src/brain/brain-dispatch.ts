// Brain-Dispatch #150 — Couche 4 : le dispatcher.
//
// `dispatch(agentId, system, user)` route un appel vers LE cerveau de cet agent
// (registre #couche2), en appliquant tout le contrat (#couche3) : injection du
// format Mango, anti-injection sur l'entrée externe, circuit breaker de session,
// timeout dégradé, rate limiting par provider avec retry exponentiel, et parsing
// robuste. Ne throw JAMAIS : toute erreur devient un AgentResult dégradé.
import { askLLM, type AskLLMOptions, type LLMProvider } from "../llm/llm-engine.js"
import { getBrain, type AgentId, type BrainConfig } from "./brain-registry.js"
export type { BrainConfig } from "./brain-registry.js"
import { flag } from "../flags.js"
import { temporalContext } from "../temporal-context.js"
import {
  MANGO_CONTRACT_PROMPT,
  parseAgentResponse,
  sanitizeExternal,
  withAgentTimeout,
  isTimeout,
  sessionBudgetExceeded,
  type AgentResult,
  type PipelineSession,
} from "../agent/agent-contract.js"

export type AskFn = (system: string, user: string, opts: AskLLMOptions) => Promise<string>

export interface DispatchOpts {
  imageBase64?: string
  session?: PipelineSession
  /** false (défaut) → `user` est encadré par sanitizeExternal() avant l'envoi. */
  trustExternal?: boolean
  /** true → mode PROSE LIBRE : n'injecte pas le contrat Mango et ne parse pas de
   *  JSON ; renvoie le texte brut du modèle dans `summary` (status 'ok'). Pour les
   *  cerveaux qui répondent en prose (ex. lecteur d'images VL — #vision/Sharingan). */
  freeform?: boolean
  /** (#182 D3) Override EXPLICITE du cerveau : ignore le registre `getBrain(agentId)` et
   *  route la tentative vers ce cerveau précis. Sert à l'orchestration de l'Accueil, où le
   *  cerveau raisonneur est le MODÈLE choisi par Raf (Fable/Opus/Sonnet…), pas un rôle du
   *  registre. Absent (défaut) → résolution normale par rôle, byte-identique. */
  brainOverride?: BrainConfig
  /** Transport injectable (tests). Défaut : askLLM. */
  ask?: AskFn
  /** Sleep injectable (tests du rate limiter / backoff). Défaut : vrai setTimeout. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_TIMEOUT_MS = 60_000
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Rate limiter par provider (fenêtre glissante de 60 s + retry exponentiel)
// ---------------------------------------------------------------------------

const RATE_LIMITS: Record<LLMProvider, number> = {
  claude: 10,
  ollama: 999,   // local → pas de limite réelle
  openai: 20,
  deepseek: 20,
  mistral: 20,
  groq: 30,
  litellm: 999,
}

const windows = new Map<LLMProvider, { count: number; windowStart: number }>()

/** Réserve un créneau d'appel pour ce provider, en attendant (backoff) si saturé. */
async function acquireSlot(provider: LLMProvider, sleep: (ms: number) => Promise<void>): Promise<void> {
  const max = RATE_LIMITS[provider] ?? 20
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now()
    let w = windows.get(provider)
    if (!w || now - w.windowStart >= 60_000) {
      w = { count: 0, windowStart: now }
      windows.set(provider, w)
    }
    if (w.count < max) {
      w.count++
      return
    }
    // Saturé → backoff exponentiel 1s → 2s → 4s avant de réessayer.
    await sleep(1000 * 2 ** attempt)
  }
  // Après 3 essais : on laisse passer ; le 429 éventuel du provider (géré par askLLM)
  // prendra le relais plutôt que de bloquer le pipeline indéfiniment.
  const w = windows.get(provider) ?? { count: 0, windowStart: Date.now() }
  w.count++
  windows.set(provider, w)
}

/** Remet à zéro les compteurs de rate limiting (tests). */
export function resetRateLimits(): void {
  windows.clear()
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

function degraded(agentId: AgentId, summary: string, durationMs: number, status: AgentResult["status"] = "error"): AgentResult {
  return { status, agent: agentId, summary, data: {}, confidence: 0, durationMs }
}

/** (C2) Un cerveau EFFECTIF pour UNE tentative : provider + éventuels modèle,
 *  endpoint, clé, timeout. Réutilisé pour le cerveau principal ET chaque repli. */
interface BrainAttempt {
  provider: LLMProvider
  model?: string
  baseUrl?: string
  apiKeyEnv?: string
  timeoutMs?: number
}

/** Contexte immuable partagé par toutes les tentatives d'un dispatch. */
interface AttemptCtx {
  fullSystem: string
  safeUser: string
  imageBase64?: string
  freeform: boolean
  ask: AskFn
  started: number
}

/**
 * (C2) UNE tentative sur un cerveau donné. `retryable` = l'échec est un problème
 * de DISPONIBILITÉ (timeout ou erreur transport) → un repli est justifié. Un
 * échec de PARSING (le modèle a répondu) N'est PAS retryable : re-payer un appel
 * ne le corrigerait pas. Reproduit exactement l'ancien chemin pour le principal.
 */
async function runOnce(agentId: AgentId, cfg: BrainAttempt, ctx: AttemptCtx): Promise<{ result: AgentResult; retryable: boolean }> {
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const askOpts: AskLLMOptions = {
    provider: cfg.provider,
    model: cfg.model,
    timeoutMs,
    baseUrl: cfg.baseUrl,
    apiKeyEnv: cfg.apiKeyEnv,
    imageBase64: ctx.imageBase64,
  }
  try {
    const raced = await withAgentTimeout(ctx.ask(ctx.fullSystem, ctx.safeUser, askOpts), timeoutMs, agentId)
    if (isTimeout(raced)) {
      return { result: degraded(agentId, `délai dépassé (${timeoutMs} ms)`, Date.now() - ctx.started, "timeout"), retryable: true }
    }
    if (ctx.freeform) {
      const txt = (raced ?? "").trim()
      // Réponse vide en prose = pas un problème de disponibilité (le modèle a
      // répondu, juste vide) → NON retryable, cohérent avec « repli sur timeout/transport ».
      return txt
        ? { result: { status: "ok", agent: agentId, summary: txt, data: {}, confidence: 1, durationMs: Date.now() - ctx.started }, retryable: false }
        : { result: degraded(agentId, "réponse vide du cerveau", Date.now() - ctx.started), retryable: false }
    }
    return { result: parseAgentResponse(raced, agentId, Date.now() - ctx.started), retryable: false }
  } catch (err) {
    // Erreur de TRANSPORT (réseau, provider injoignable) → retryable.
    return { result: degraded(agentId, `erreur cerveau : ${(err as Error).message}`.slice(0, 200), Date.now() - ctx.started), retryable: true }
  }
}

export async function dispatch(
  agentId: AgentId,
  system: string,
  user: string,
  opts: DispatchOpts = {},
): Promise<AgentResult> {
  const started = Date.now()
  const { session, trustExternal = false, imageBase64, freeform = false } = opts
  const ask = opts.ask ?? askLLM
  const sleep = opts.sleep ?? realSleep

  // 1. Circuit breaker de session — un pipeline emballé s'arrête net.
  if (session && sessionBudgetExceeded(session)) {
    return degraded(agentId, `budget de tours dépassé (${session.turns}/${session.maxTurns})`, Date.now() - started)
  }

  // 2. Résolution du cerveau (override explicite #182 D3 prioritaire sur le registre).
  const brain = opts.brainOverride ?? getBrain(agentId)

  // 3. Garde de souveraineté — un agent localOnly ne sort jamais vers un cloud.
  if (brain.localOnly && brain.provider !== "ollama") {
    const r = degraded(agentId, `agent localOnly mais cerveau cloud (${brain.provider}) — dispatch refusé`, Date.now() - started)
    if (session) { session.results.push(r); session.turns++ }
    return r
  }

  // 4 & 5. Injection du contrat + encadrement anti-injection de l'entrée externe.
  // En mode freeform, on n'impose PAS le contrat Mango (le cerveau répond en prose).
  // D4 — Conscience temporelle : injection en TÊTE du system prompt si gate ON.
  let systemWithTemporal = system
  if (flag("TEMPORAL_AWARENESS")) {
    systemWithTemporal = `${temporalContext()}\n\n${system}`
  }
  const fullSystem = freeform ? systemWithTemporal : `${MANGO_CONTRACT_PROMPT}\n\n${systemWithTemporal}`
  const safeUser = trustExternal ? user : sanitizeExternal(user)

  // 6. Rate limiting (avec retry exponentiel interne).
  await acquireSlot(brain.provider, sleep)

  // 7. Appel borné par timeout dégradé (tentative sur le cerveau PRINCIPAL).
  const ctx: AttemptCtx = { fullSystem, safeUser, imageBase64, freeform, ask, started }
  let { result, retryable } = await runOnce(agentId, brain, ctx)

  // 7bis. (C2) FALLBACK inter-providers — DANS le contrat « ne throw jamais » :
  // si l'échec est un problème de DISPONIBILITÉ (retryable) ET que le flag +
  // une chaîne de repli sont présents (double verrou), on essaie les cibles
  // déclarées, dans l'ordre. Première réussite gagne ; chaîne épuisée → le
  // dernier résultat dégradé (sortie ultime inchangée). Garde localOnly
  // re-passée sur CHAQUE cible + acquireSlot + timeout borné au principal.
  if (retryable && flag("BRAIN_FALLBACK") && Array.isArray(brain.fallback) && brain.fallback.length) {
    const brainTimeout = brain.timeoutMs ?? DEFAULT_TIMEOUT_MS
    for (const fb of brain.fallback) {
      // Un rôle localOnly ne bascule JAMAIS vers un cloud, même en repli.
      if (brain.localOnly && fb.provider !== "ollama") {
        console.warn(`[brain-fallback] ${agentId}: repli ${fb.provider} REFUSÉ (rôle localOnly)`)
        continue
      }
      await acquireSlot(fb.provider, sleep)
      // Timeout de la cible plafonné à celui du principal (évite de doubler le budget).
      const target: BrainAttempt = {
        provider: fb.provider,
        model: fb.model ?? brain.model, // hérite du modèle du rôle si non précisé
        baseUrl: fb.baseUrl,
        apiKeyEnv: fb.apiKeyEnv,
        timeoutMs: Math.min(fb.timeoutMs ?? brainTimeout, brainTimeout),
      }
      const att = await runOnce(agentId, target, ctx)
      result = att.result
      retryable = att.retryable
      if (att.result.status === "ok") {
        console.warn(`[brain-fallback] ${agentId}: ${brain.provider}→${fb.provider} (repli réussi)`)
        result = { ...att.result, brainUsed: { provider: fb.provider, model: target.model, fallback: true } }
        break
      }
      // Sinon (encore retryable ou dégradé) : on tente la cible suivante s'il en reste.
    }
  }

  // 9. Trace dans la session immuable.
  if (session) {
    session.results.push(result)
    session.turns++
  }
  return result
}

export async function dispatchParallel(
  tasks: Array<{ agentId: AgentId; system: string; user: string; opts?: DispatchOpts }>,
): Promise<AgentResult[]> {
  // Promise.all : un timeout/erreur d'un agent n'arrête pas les autres
  // (dispatch ne throw jamais → chaque entrée résout en AgentResult).
  return Promise.all(tasks.map((t) => dispatch(t.agentId, t.system, t.user, t.opts)))
}
