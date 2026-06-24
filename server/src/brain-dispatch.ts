// Brain-Dispatch #150 — Couche 4 : le dispatcher.
//
// `dispatch(agentId, system, user)` route un appel vers LE cerveau de cet agent
// (registre #couche2), en appliquant tout le contrat (#couche3) : injection du
// format Mango, anti-injection sur l'entrée externe, circuit breaker de session,
// timeout dégradé, rate limiting par provider avec retry exponentiel, et parsing
// robuste. Ne throw JAMAIS : toute erreur devient un AgentResult dégradé.
import { askLLM, type AskLLMOptions, type LLMProvider } from "./llm-engine.js"
import { getBrain, type AgentId } from "./brain-registry.js"
import {
  MANGO_CONTRACT_PROMPT,
  parseAgentResponse,
  sanitizeExternal,
  withAgentTimeout,
  isTimeout,
  sessionBudgetExceeded,
  type AgentResult,
  type PipelineSession,
} from "./agent-contract.js"

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

  // 2. Résolution du cerveau.
  const brain = getBrain(agentId)

  // 3. Garde de souveraineté — un agent localOnly ne sort jamais vers un cloud.
  if (brain.localOnly && brain.provider !== "ollama") {
    const r = degraded(agentId, `agent localOnly mais cerveau cloud (${brain.provider}) — dispatch refusé`, Date.now() - started)
    if (session) { session.results.push(r); session.turns++ }
    return r
  }

  // 4 & 5. Injection du contrat + encadrement anti-injection de l'entrée externe.
  // En mode freeform, on n'impose PAS le contrat Mango (le cerveau répond en prose).
  const fullSystem = freeform ? system : `${MANGO_CONTRACT_PROMPT}\n\n${system}`
  const safeUser = trustExternal ? user : sanitizeExternal(user)

  // 6. Rate limiting (avec retry exponentiel interne).
  await acquireSlot(brain.provider, sleep)

  // 7. Appel borné par timeout dégradé.
  const askOpts: AskLLMOptions = {
    provider: brain.provider,
    model: brain.model,
    timeoutMs: brain.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    baseUrl: brain.baseUrl,
    apiKeyEnv: brain.apiKeyEnv,
    imageBase64,
  }

  let result: AgentResult
  try {
    const raced = await withAgentTimeout(ask(fullSystem, safeUser, askOpts), brain.timeoutMs ?? DEFAULT_TIMEOUT_MS, agentId)
    if (isTimeout(raced)) {
      result = degraded(agentId, `délai dépassé (${brain.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms)`, Date.now() - started, "timeout")
    } else if (freeform) {
      // 8b. Prose libre : pas de parsing, le texte brut EST le résultat.
      const txt = (raced ?? "").trim()
      result = txt
        ? { status: "ok", agent: agentId, summary: txt, data: {}, confidence: 1, durationMs: Date.now() - started }
        : degraded(agentId, "réponse vide du cerveau", Date.now() - started)
    } else {
      // 8. Parsing robuste.
      result = parseAgentResponse(raced, agentId, Date.now() - started)
    }
  } catch (err) {
    result = degraded(agentId, `erreur cerveau : ${(err as Error).message}`.slice(0, 200), Date.now() - started)
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
