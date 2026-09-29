// D1 (audit 2026-09-28, constat B4) — COMPTEUR DE CONSOMMATION PAR RUN.
//
// Le problème constaté : tout endpoint OpenAI-compat renvoie un champ `usage`
// ({prompt_tokens, completion_tokens, total_tokens}) et Ollama renvoie ses
// équivalents (prompt_eval_count / eval_count) — MangoOS les jetait au transport
// (`openAiChat` ne lisait que `choices[0].message.content`). Le SEUL endroit du
// dépôt qui lisait un usage réel était le chemin SDK Claude (agent.ts:276-306),
// c'est-à-dire précisément le chemin inactif dans la configuration courante.
// Conséquence : « combien coûte une app ? » n'avait pas de réponse mesurée.
//
// Ce module est une ADDITION PURE : il ne décide rien, ne coupe rien, n'émet rien
// vers l'utilisateur. Il se contente de ne plus jeter une donnée déjà reçue.
//   • `parseUsage` est PUR (testable sans réseau) ;
//   • `recordLLMUsage` accumule dans le run COURANT (ouvert par `startLLMRun`) ;
//   • aucune fonction ne lève JAMAIS — une erreur de mesure ne doit pas pouvoir
//     casser un build (règle de fail-open du dépôt).
//
// HONNÊTETÉ : un appel dont la réponse ne porte aucun usage exploitable est compté
// dans `unmeasuredCalls`, jamais estimé. Un total affiché est donc toujours un
// PLANCHER explicite, avec le nombre d'appels non mesurés à côté.

import { flag } from "../flags.js"

/** Le triplet de jetons d'un appel, normalisé (OpenAI-compat ou Ollama). */
export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** Cumul par modèle à l'intérieur d'un run. */
export interface ModelUsage extends LLMUsage {
  calls: number
}

/** Photographie d'un run : ce qui a été réellement mesuré, et ce qui ne l'a pas été. */
export interface LLMRunUsage extends LLMUsage {
  runId: string
  label: string
  startedAt: number
  /** Appels dont l'usage a été LU (donc comptés dans les totaux). */
  calls: number
  /** Appels vus passer SANS usage exploitable — jamais estimés (voir en-tête). */
  unmeasuredCalls: number
  byModel: Record<string, ModelUsage>
}

/** Nombre de runs conservés en mémoire (borné : ce module ne doit jamais fuir). */
const MAX_RUNS = 20

const runs = new Map<string, LLMRunUsage>()
let currentRunId: string | null = null
let seq = 0

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null
}

/**
 * Extrait l'usage d'une réponse BRUTE de modèle. PUR, ne lève jamais.
 * Formats reconnus :
 *  - OpenAI-compat : `usage.prompt_tokens` / `usage.completion_tokens` / `usage.total_tokens`
 *    (DeepSeek, GLM/Zhipu, Groq, Mistral, OpenRouter, LiteLLM, Ollama Cloud /v1…) ;
 *  - Anthropic-style : `usage.input_tokens` / `usage.output_tokens` ;
 *  - Ollama natif (/api/chat) : `prompt_eval_count` / `eval_count` à la racine.
 * Renvoie `null` si rien d'exploitable (→ appel compté comme NON mesuré).
 */
export function parseUsage(payload: unknown): LLMUsage | null {
  if (!payload || typeof payload !== "object") return null
  const root = payload as Record<string, unknown>
  const u = (root.usage && typeof root.usage === "object" ? root.usage : {}) as Record<string, unknown>
  const prompt = num(u.prompt_tokens) ?? num(u.input_tokens) ?? num(root.prompt_eval_count)
  const completion = num(u.completion_tokens) ?? num(u.output_tokens) ?? num(root.eval_count)
  const total = num(u.total_tokens)
  if (prompt === null && completion === null && total === null) return null
  const promptTokens = prompt ?? 0
  const completionTokens = completion ?? 0
  return { promptTokens, completionTokens, totalTokens: total ?? promptTokens + completionTokens }
}

function emptyRun(runId: string, label: string): LLMRunUsage {
  return {
    runId,
    label,
    startedAt: Date.now(),
    calls: 0,
    unmeasuredCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    byModel: {},
  }
}

/**
 * Ouvre un run de mesure et le rend COURANT. Tout appel modèle enregistré ensuite
 * (y compris depuis un sous-agent) s'y accumule, jusqu'au prochain `startLLMRun`.
 * Ne lève jamais ; renvoie l'identifiant du run.
 */
export function startLLMRun(label = "run"): string {
  const runId = `run_${Date.now()}_${++seq}`
  runs.set(runId, emptyRun(runId, String(label).slice(0, 120)))
  currentRunId = runId
  // Borne mémoire : on ne garde que les MAX_RUNS derniers (insertion ordonnée).
  while (runs.size > MAX_RUNS) {
    const oldest = runs.keys().next().value
    if (oldest === undefined) break
    runs.delete(oldest)
  }
  return runId
}

/** Le run courant, créé à la volée si aucun `startLLMRun` n'a été fait (mesure
 *  jamais perdue, même hors d'une boucle de build). */
function currentRun(): LLMRunUsage {
  const existing = currentRunId ? runs.get(currentRunId) : undefined
  if (existing) return existing
  const runId = startLLMRun("implicite")
  return runs.get(runId)!
}

/**
 * Enregistre l'usage d'UNE réponse modèle dans le run courant. Renvoie l'usage lu,
 * ou `null` si la réponse n'en portait pas (appel alors compté `unmeasuredCalls`).
 * Ne lève JAMAIS — toute erreur interne est avalée (la mesure ne casse pas un build).
 */
export function recordLLMUsage(payload: unknown, meta: { model?: string; channel?: string } = {}): LLMUsage | null {
  try {
    const run = currentRun()
    const usage = parseUsage(payload)
    if (!usage) {
      run.unmeasuredCalls++
      return null
    }
    const key = (meta.model ?? "inconnu") || "inconnu"
    const per = run.byModel[key] ?? { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    per.calls++
    per.promptTokens += usage.promptTokens
    per.completionTokens += usage.completionTokens
    per.totalTokens += usage.totalTokens
    run.byModel[key] = per
    run.calls++
    run.promptTokens += usage.promptTokens
    run.completionTokens += usage.completionTokens
    run.totalTokens += usage.totalTokens
    // Lecture au journal : gate LLM_USAGE_LOG, défaut OFF (politique flags.ts:10-12).
    // OFF → ce module n'écrit RIEN nulle part, il accumule seulement en mémoire.
    if (flag("LLM_USAGE_LOG")) {
      console.log(
        `[llm-usage] ${meta.channel ?? "?"} ${key} +${usage.promptTokens}/${usage.completionTokens} ` +
        `(run ${run.label} : ${run.totalTokens} jetons sur ${run.calls} appel(s), ${run.unmeasuredCalls} non mesuré(s))`,
      )
    }
    return usage
  } catch {
    return null
  }
}

/** Photographie d'un run (copie — l'appelant ne peut pas corrompre le compteur).
 *  Sans argument : le run courant. `null` si aucun run de ce nom. */
export function getLLMRun(runId?: string): LLMRunUsage | null {
  const id = runId ?? currentRunId
  const run = id ? runs.get(id) : undefined
  if (!run) return null
  const byModel: Record<string, ModelUsage> = {}
  for (const [k, v] of Object.entries(run.byModel)) byModel[k] = { ...v }
  return { ...run, byModel }
}

/** Tous les runs conservés, du plus ancien au plus récent (copies). */
export function listLLMRuns(): LLMRunUsage[] {
  return [...runs.keys()].map((id) => getLLMRun(id)!).filter(Boolean)
}

/** Remise à zéro complète (tests / diagnostic). */
export function resetLLMUsage(): void {
  runs.clear()
  currentRunId = null
}
