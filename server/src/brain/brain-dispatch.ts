// Brain-Dispatch #150 — Couche 4 : LE DISPATCHER.
//
// `dispatch(agentId, system, user)` route un appel vers LE cerveau de cet agent
// (registre #couche2) en appliquant tout le contrat (#couche3). Ne throw JAMAIS :
// toute erreur devient un AgentResult dégradé.
//
// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE — remaniement du 2026-08-06, à comportement IDENTIQUE
// ─────────────────────────────────────────────────────────────────────────────
// Raf : « garder toute la mécanique du Brain dispatcher, tout en l'améliorant et
// en le rendant plus léger et plus structuré ». Rien n'a été retiré. Le fichier
// portait cinq métiers dans une seule fonction de 80 lignes, découpée en « étapes »
// numérotées 1, 2, 3, 4&5, 6, 7, 7bis, 9 — **la 8 avait disparu en cours de route**,
// et personne ne pouvait le voir. Une numérotation qui ment est pire qu'aucune :
// elle donne l'illusion d'un plan.
//
// Ce qui a bougé, et rien d'autre :
//   · le rate limiter part dans `brain-rate-limit.ts` (+ horloge injectable) ;
//   · la tentative unique part dans `brain-attempt.ts` ;
//   · le repli inter-providers devient `rejoueLaChaine()`, une fonction nommée ;
//   · la garde de souveraineté était écrite DEUX FOIS (principal, puis chaque
//     cible de repli) — c'est maintenant un seul prédicat. Une règle de sûreté
//     dupliquée finit toujours par ne l'être qu'à moitié ;
//   · `flag` était importé sans jamais être appelé, et un commentaire annonçait un
//     « double verrou : le flag ET une chaîne de repli » alors que le flag avait
//     disparu au lot 2. Import retiré, commentaire remis d'aplomb — le verrou est
//     bien double, mais c'est « échec de DISPONIBILITÉ ET chaîne déclarée ».
//
// Ce qui n'a PAS bougé : les plafonds, le backoff, l'ordre des opérations, le
// contrat Mango, l'anti-injection, le timeout dégradé, la distinction
// retryable/non-retryable, la trace de session. 68 assertions le prouvent
// (test-brain-dispatch 40 · test-brain-fallback 17 · test-brain-facade 11).

import { askLLM } from "../llm/llm-engine.js"
import { getBrain, type AgentId, type BrainConfig } from "./brain-registry.js"
import { temporalContext } from "../temporal-context.js"
import {
  MANGO_CONTRACT_PROMPT,
  sanitizeExternal,
  sessionBudgetExceeded,
  type AgentResult,
  type PipelineSession,
} from "../agent/agent-contract.js"
import { acquireSlot, type Horloge, type Sleep } from "./brain-rate-limit.js"
import {
  runOnce,
  degraded,
  DEFAULT_TIMEOUT_MS,
  type AskFn,
  type BrainAttempt,
  type AttemptCtx,
} from "./brain-attempt.js"

export type { BrainConfig } from "./brain-registry.js"
export type { AskFn } from "./brain-attempt.js"
// Ré-exports de délégation pure : les appelants et tests existants importent
// toujours `resetRateLimits` d'ici. Déplacer du code ne doit rien casser en amont.
export { resetRateLimits, RATE_LIMITS, slotsConsommes } from "./brain-rate-limit.js"

export interface DispatchOpts {
  imageBase64?: string
  /** Type MIME de l'image (défaut 'image/jpeg'). */
  imageMimeType?: string
  /** Plafond de tokens en SORTIE. Absent → défaut d'`askLLM`. Voyage par TOUR et non
   *  par rôle : il dépend de la question posée (« réponds oui/non » vs « rédige un
   *  chapitre »), pas du cerveau qui répond. */
  maxTokens?: number
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
  sleep?: Sleep
  /** Horloge injectable (tests des durées et de l'expiration de fenêtre). Défaut :
   *  Date.now. Ajoutée au remaniement du 2026-08-06 : sans elle, l'expiration de la
   *  fenêtre de 60 s ne pouvait pas se tester autrement qu'en attendant 60 s. */
  now?: Horloge
}

const realSleep: Sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Souveraineté — UN seul prédicat, appliqué au principal comme à chaque repli
// ---------------------------------------------------------------------------

/**
 * Un rôle `localOnly` ne sort JAMAIS vers un cloud — ni en appel principal, ni en
 * repli. La règle était écrite à deux endroits ; à la première divergence, le repli
 * aurait pu franchir une frontière que l'appel principal refusait. Un seul prédicat,
 * donc, et les deux appelants ci-dessous s'y adossent.
 */
function sortieInterdite(role: BrainConfig, cible: { provider: string }): boolean {
  return Boolean(role.localOnly) && cible.provider !== "ollama"
}

// ---------------------------------------------------------------------------
// Repli inter-providers (C2)
// ---------------------------------------------------------------------------

/**
 * Rejoue la chaîne de repli déclarée par le rôle, dans l'ordre. Première réussite
 * gagne ; chaîne épuisée → le dernier résultat dégradé (la sortie ultime est celle
 * qu'aurait rendue le principal seul).
 *
 * N'est appelée QUE si l'échec est `retryable`, c'est-à-dire un problème de
 * disponibilité. Double verrou d'origine conservé : il faut une chaîne déclarée ET
 * un échec de disponibilité.
 */
async function rejoueLaChaine(
  agentId: AgentId,
  role: BrainConfig,
  ctx: AttemptCtx,
  sleep: Sleep,
  now: Horloge,
  dernier: AgentResult,
): Promise<AgentResult> {
  const budgetTimeout = role.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let result = dernier

  for (const fb of role.fallback ?? []) {
    if (sortieInterdite(role, fb)) {
      console.warn(`[brain-fallback] ${agentId}: repli ${fb.provider} REFUSÉ (rôle localOnly)`)
      continue
    }
    await acquireSlot(fb.provider, sleep, now)

    const cible: BrainAttempt = {
      provider: fb.provider,
      model: fb.model ?? role.model, // hérite du modèle du rôle si non précisé
      baseUrl: fb.baseUrl,
      apiKeyEnv: fb.apiKeyEnv,
      // Timeout de la cible plafonné à celui du principal : un repli ne doit pas
      // doubler le budget de temps que l'appelant croyait avoir accordé.
      timeoutMs: Math.min(fb.timeoutMs ?? budgetTimeout, budgetTimeout),
    }

    const att = await runOnce(agentId, cible, ctx)
    result = att.result
    if (att.result.status === "ok") {
      console.warn(`[brain-fallback] ${agentId}: ${role.provider}→${fb.provider} (repli réussi)`)
      return { ...att.result, brainUsed: { provider: fb.provider, model: cible.model, fallback: true } }
    }
    // Sinon (encore dégradé) : on tente la cible suivante s'il en reste.
  }
  return result
}

// ---------------------------------------------------------------------------
// dispatch
// ---------------------------------------------------------------------------

export async function dispatch(
  agentId: AgentId,
  system: string,
  user: string,
  opts: DispatchOpts = {},
): Promise<AgentResult> {
  const { session, trustExternal = false, imageBase64, imageMimeType, maxTokens, freeform = false } = opts
  const ask = opts.ask ?? askLLM
  const sleep = opts.sleep ?? realSleep
  const now = opts.now ?? Date.now
  const started = now()

  // ── Circuit breaker de session : un pipeline emballé s'arrête net ──────────
  if (session && sessionBudgetExceeded(session)) {
    return degraded(agentId, `budget de tours dépassé (${session.turns}/${session.maxTurns})`, now() - started)
  }

  // ── Résolution du cerveau (override explicite #182 D3 prioritaire) ─────────
  const role = opts.brainOverride ?? getBrain(agentId)

  // ── Garde de souveraineté ─────────────────────────────────────────────────
  if (sortieInterdite(role, role)) {
    const r = degraded(agentId, `agent localOnly mais cerveau cloud (${role.provider}) — dispatch refusé`, now() - started)
    if (session) { session.results.push(r); session.turns++ }
    return r
  }

  // ── Assemblage du prompt : conscience temporelle, contrat Mango, anti-injection ──
  // D4 — la conscience temporelle est figée ON (lot 2, refonte v3) : toujours injectée,
  // en TÊTE. En mode freeform on n'impose PAS le contrat (le cerveau répond en prose).
  const systemWithTemporal = `${temporalContext()}\n\n${system}`
  const ctx: AttemptCtx = {
    fullSystem: freeform ? systemWithTemporal : `${MANGO_CONTRACT_PROMPT}\n\n${systemWithTemporal}`,
    safeUser: trustExternal ? user : sanitizeExternal(user),
    imageBase64,
    imageMimeType,
    maxTokens,
    freeform,
    ask,
    started,
    now,
  }

  // ── Rate limiting, puis tentative sur le cerveau PRINCIPAL ────────────────
  await acquireSlot(role.provider, sleep, now)
  const { result: premier, retryable } = await runOnce(agentId, role, ctx)

  // ── Repli inter-providers, sous double verrou : échec de DISPONIBILITÉ ET
  //    chaîne déclarée. Un échec de parsing ne déclenche jamais de repli.
  const result = retryable && role.fallback?.length
    ? await rejoueLaChaine(agentId, role, ctx, sleep, now, premier)
    : premier

  // ── Trace dans la session ─────────────────────────────────────────────────
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
