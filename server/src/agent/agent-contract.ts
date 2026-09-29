// Brain-Dispatch #150 — Couche 3 : le contrat universel des agents.
//
// Un seul format de réponse pour TOUS les cerveaux (Claude, Gemma, GLM…), un
// parseur robuste à 4 niveaux (chaque modèle bavarde à sa façon), des protections
// transverses : anti-injection (sanitizeExternal), timeout dégradé (withAgentTimeout),
// session immuable anti-amnésie (PipelineSession) et estimation de coût avant exécution.
import { getBrain, type AgentId } from "../brain/brain-registry.js"

// ---------------------------------------------------------------------------
// Contrat de réponse
// ---------------------------------------------------------------------------

export interface AgentResult {
  status: "ok" | "partial" | "error" | "timeout"
  agent: AgentId
  summary: string
  data: Record<string, unknown>
  confidence: number   // 0.0 → 1.0
  durationMs: number
  /** (C2, 2026-07-03) Quel cerveau a RÉELLEMENT produit ce résultat, et si c'est
   *  via un REPLI (fallback inter-providers). Champ OPTIONNEL — sur-ensemble strict,
   *  aucun consommateur existant impacté ; présent seulement quand un repli a joué. */
  brainUsed?: { provider: string; model?: string; fallback: boolean }
}

/** Fragment injecté en tête du system de CHAQUE agent — impose le format Mango. */
export const MANGO_CONTRACT_PROMPT = `RÈGLE ABSOLUE — FORMAT DE RÉPONSE MANGO :
Ta réponse doit commencer par <<<MANGO>>> et finir par <<<END>>>.
Entre ces deux balises : UNIQUEMENT du JSON valide, zéro texte autour, zéro markdown.
Schéma : <<<MANGO>>>{"status":"ok","summary":"une phrase","data":{},"confidence":0.9}<<<END>>>
- status : "ok" (terminé) | "partial" (incomplet) | "error" (échec).
- summary : une seule phrase décrivant ce que tu as trouvé/fait.
- data : objet JSON spécifique à ton rôle (peut être {}).
- confidence : ta confiance entre 0.0 et 1.0.`

// ---------------------------------------------------------------------------
// Parseur robuste à 4 niveaux
// ---------------------------------------------------------------------------

const VALID_STATUS = new Set(["ok", "partial", "error", "timeout"])

/** Extrait la chaîne JSON candidate selon 4 stratégies de robustesse décroissante. */
function extractJsonCandidate(raw: string): string | null {
  // Niveau 1 — entre les sentinelles Mango (cas nominal).
  const sentinel = raw.match(/<<<MANGO>>>([\s\S]*?)<<<END>>>/)
  if (sentinel) return sentinel[1].trim()
  // Niveau 2 — bloc ```json ... ``` (GLM, Mistral aiment les fences markdown).
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Niveau 3 — premier objet { ... } trouvé dans le texte (Gemma en roue libre).
  const first = raw.indexOf("{")
  const last = raw.lastIndexOf("}")
  if (first !== -1 && last > first) return raw.slice(first, last + 1).trim()
  // Niveau 4 — rien d'exploitable.
  return null
}

/**
 * Parse la réponse brute d'un cerveau en AgentResult. Ne throw JAMAIS :
 * une réponse illisible devient un résultat dégradé (status "error"), un JSON
 * tronqué (champ requis manquant) devient "partial".
 */
export function parseAgentResponse(raw: string, agentId: AgentId, durationMs: number): AgentResult {
  const candidate = extractJsonCandidate(raw ?? "")
  if (candidate === null) {
    return { status: "error", agent: agentId, summary: (raw ?? "").slice(0, 200), data: {}, confidence: 0, durationMs }
  }
  let obj: Record<string, unknown>
  try {
    const parsed = JSON.parse(candidate)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("pas un objet")
    obj = parsed as Record<string, unknown>
  } catch {
    return { status: "error", agent: agentId, summary: candidate.slice(0, 200), data: {}, confidence: 0, durationMs }
  }

  // Vérification de complétude : tous les champs requis présents ?
  const hasStatus = typeof obj.status === "string" && VALID_STATUS.has(obj.status)
  const hasSummary = typeof obj.summary === "string"
  const hasData = obj.data !== undefined && typeof obj.data === "object" && obj.data !== null && !Array.isArray(obj.data)
  const hasConfidence = typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
  const complete = hasStatus && hasSummary && hasData && hasConfidence

  const summary = hasSummary ? (obj.summary as string) : candidate.slice(0, 200)
  const data = hasData ? (obj.data as Record<string, unknown>) : {}
  const confidence = hasConfidence ? Math.min(1, Math.max(0, obj.confidence as number)) : (complete ? 0.5 : 0.3)
  // Si l'objet est complet, on respecte son status ; sinon JSON tronqué → "partial".
  const status = complete ? (obj.status as AgentResult["status"]) : "partial"

  return { status, agent: agentId, summary, data, confidence, durationMs }
}

// ---------------------------------------------------------------------------
// Anti-injection : encadrer toute donnée externe non fiable
// ---------------------------------------------------------------------------

/** Encadre du contenu externe pour qu'un cerveau le lise comme DONNÉE, pas comme instruction. */
export function sanitizeExternal(content: string): string {
  return `<<<UNTRUSTED_INPUT>>>\n${content ?? ""}\n<<<END_UNTRUSTED>>>`
}

// ---------------------------------------------------------------------------
// Timeout à dégradation gracieuse
// ---------------------------------------------------------------------------

export interface TimeoutSentinel { timedOut: true; agentId: AgentId }

export function isTimeout<T>(v: T | TimeoutSentinel): v is TimeoutSentinel {
  return typeof v === "object" && v !== null && (v as TimeoutSentinel).timedOut === true
}

/**
 * Course entre la promesse et un délai. Au-delà de `timeoutMs`, renvoie un
 * sentinel { timedOut: true } au lieu de rejeter — le pipeline continue.
 * (La connexion HTTP sous-jacente est, elle, coupée par le timeoutMs interne d'askLLM.)
 */
export function withAgentTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  agentId: AgentId,
): Promise<T | TimeoutSentinel> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<TimeoutSentinel>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true, agentId }), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// Session immuable — l'amnésie devient impossible
// ---------------------------------------------------------------------------

export interface PipelineSession {
  readonly sessionId: string
  readonly originalTask: string   // jamais écrasé
  readonly createdAt: string
  readonly maxTurns: number       // circuit breaker
  turns: number
  results: AgentResult[]
}

export const DEFAULT_MAX_TURNS = 6

export function createSession(task: string, maxTurns: number = DEFAULT_MAX_TURNS): PipelineSession {
  return {
    sessionId: `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    originalTask: task,
    createdAt: new Date().toISOString(),
    maxTurns,
    turns: 0,
    results: [],
  }
}

export function sessionBudgetExceeded(s: PipelineSession): boolean {
  return s.turns >= s.maxTurns
}

// ---------------------------------------------------------------------------
// Estimation de coût avant exécution
// ---------------------------------------------------------------------------

/** Prix indicatif en USD par million de tokens (entrée+sortie mélangés, ordre de grandeur).
 *
 *  B14 (audit 2026-09-28) — cette table indexait sur le TRANSPORT (`provider`), pas sur la
 *  RÉALITÉ DE FACTURATION. Deux erreurs en sens inverse, mesurées sur la config réelle :
 *
 *  1. `claude/*` à 6-30 $ alors que le chemin Claude de ce harnais passe par l'ABONNEMENT
 *     Claude Code (`subscriptionEnv()` neutralise les clés API — jamais les crédits) et
 *     qu'un audit MangoQA tourne sur Ollama Cloud. Coût crédits RÉEL = 0. Ce chiffre
 *     dissuadait donc d'utiliser le meilleur modèle pour une raison financière qui
 *     n'existe pas, et déclenchait l'alerte « anti-dérive » à tort.
 *  2. `ollama/*` à 0 « local → gratuit » alors qu'il n'y a PAS de daemon Ollama local ici :
 *     tous les rôles pointent `https://ollama.com/v1` (Ollama Cloud) derrière un provider
 *     `openai`. Le coût réel n'était donc pas nul ET il était invisible.
 *
 *  On indexe désormais sur la DESTINATION réelle. `ABONNEMENT_*` = quota d'abonnement
 *  (pas de crédits consommés : informer, ne pas alarmer). `PLATEFORME_*` = plateforme
 *  cloud payante, tarifée. Un modèle cloud inconnu est volontairement PRUDENT (tarifé) :
 *  mieux vaut une alerte à vérifier qu'une fausse gratuité. */
const ABONNEMENT_CLAUDE = 0
/** Plateformes cloud par défaut (baseUrl ≠ localhost) : tarifées. */
const PLATEFORME_PAR_DEFAUT = 2
const PRICE_PER_MTOK: Record<string, number> = {
  // Voie ABONNEMENT Claude Code — 0 crédit. La chaîne de repli MangoQA en dépend.
  "claude/opus": ABONNEMENT_CLAUDE,
  "claude/sonnet": ABONNEMENT_CLAUDE,
  "claude/haiku": ABONNEMENT_CLAUDE,
  "claude/*": ABONNEMENT_CLAUDE,
  // Voie CRÉDITS API explicite (hors abonnement) : là, les tarifs sont réels.
  "anthropic/opus": 30,
  "anthropic/sonnet": 6,
  "anthropic/haiku": 1.5,
  "anthropic/*": 6,
  "openai/*": 2,
  "deepseek/*": 0.5,
  "mistral/*": 1,
  "groq/*": 0.5,
  "litellm/*": 1,
  // Ollama Cloud (https://ollama.com/v1) — PAS gratuit. Un daemon LOCAL (localhost)
  // reste, lui, réellement gratuit : voir `priceFor`, qui distingue les deux.
  "ollama-cloud/*": 0.3,
}

const COST_WARNING_USD = 2

/** L'endpoint est-il LOCAL (aucun coût plateforme) ? */
function estLocal(baseUrl?: string): boolean {
  if (!baseUrl) return false
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/.test(baseUrl)
}

/** Le rôle est-il routé vers Ollama Cloud (payant) plutôt qu'un daemon local ? */
function estOllamaCloud(baseUrl?: string): boolean {
  return !!baseUrl && /ollama\.com/i.test(baseUrl)
}

function priceFor(provider: string, model?: string, baseUrl?: string): number {
  // 1. Un endpoint LOCAL est réellement gratuit, quel que soit le transport.
  if (estLocal(baseUrl)) return 0
  // 2. Transport ollama NATIF sans baseUrl distant = le daemon LOCAL par défaut →
  //    réellement gratuit (c'est le cas des défauts du registre).
  if (provider === "ollama" && !baseUrl) return 0
  // 3. Ollama Cloud : facturé (le registre route `openai` → `ollama.com`).
  if (estOllamaCloud(baseUrl)) {
    return PRICE_PER_MTOK[`${provider}/${model ?? ''}`] ?? PRICE_PER_MTOK['ollama-cloud/*']!
  }
  // 4. Modèle précis, puis joker du transport.
  if (model && PRICE_PER_MTOK[`${provider}/${model}`] !== undefined) return PRICE_PER_MTOK[`${provider}/${model}`]!
  if (PRICE_PER_MTOK[`${provider}/*`] !== undefined) return PRICE_PER_MTOK[`${provider}/*`]!
  // 5. Transport non local non répertorié : prudent.
  return baseUrl ? PLATEFORME_PAR_DEFAUT : 1
}

/**
 * Estime le coût d'un pipeline (somme par agent de prix × tokens estimés).
 * `warning: true` au-delà de COST_WARNING_USD (2 $) — garde-fou anti-dérive.
 */
export function estimatePipelineCost(
  agents: AgentId[],
  estimatedTokens: number,
): { usd: number; warning: boolean } {
  const tokens = Math.max(0, estimatedTokens)
  let usd = 0
  for (const id of agents) {
    const brain = getBrain(id)
    usd += priceFor(brain.provider, brain.model, brain.baseUrl) * (tokens / 1_000_000)
  }
  usd = Math.round(usd * 10_000) / 10_000
  return { usd, warning: usd > COST_WARNING_USD }
}
