// Brain-Dispatch #150 — Couche 2 : le registre des cerveaux par agent.
//
// Chaque agent de MangoOS (orchestrateur, codeur, vision…) a SON propre cerveau
// (provider + modèle), configurable dans data/brain-registry.json SANS toucher au
// code. Ce module charge, valide et expose ce registre. Robuste par conception :
// un fichier absent, corrompu ou partiellement invalide retombe toujours sur des
// valeurs par défaut saines (DEFAULT_REGISTRY) — jamais de crash, jamais de blocage.
import fs from "node:fs"
import path from "node:path"
import { atomicWriteFileSync } from "./safe-io.js"
import type { LLMProvider } from "./llm-engine.js"

export interface BrainConfig {
  provider: LLMProvider
  model?: string
  /** Endpoint OpenAI-compat custom (ex. Zhipu). */
  baseUrl?: string
  /** Nom de la variable d'env qui porte la clé API (ex. "ZHIPU_API_KEY"). */
  apiKeyEnv?: string
  timeoutMs?: number
  /** true → refuse de router vers un cloud (souveraineté / non-fuite du code). */
  localOnly?: boolean
}

export type AgentId =
  | "orchestrateur" | "architecte" | "codeur" | "vision"
  | "designer_ux" | "extracteur" | "testeur" | "auditeur"
  | "optimiseur" | "chercheur"

/** Valeurs par défaut — la vérité de repli si le registre est absent ou corrompu. */
export const DEFAULT_REGISTRY: Record<AgentId, BrainConfig> = {
  orchestrateur: { provider: "claude", model: "opus", timeoutMs: 30_000 },
  architecte:    { provider: "claude", model: "opus", timeoutMs: 45_000 },
  codeur:        { provider: "ollama", model: "gemma4:12b", timeoutMs: 120_000 },
  vision:        { provider: "ollama", model: "qwen3.5:cloud", timeoutMs: 60_000 },
  designer_ux:   { provider: "claude", model: "sonnet", timeoutMs: 30_000 },
  extracteur:    { provider: "claude", model: "haiku", timeoutMs: 30_000 },
  testeur:       { provider: "claude", model: "sonnet", timeoutMs: 45_000 },
  auditeur:      { provider: "claude", model: "sonnet", timeoutMs: 30_000 },
  optimiseur:    { provider: "ollama", model: "gemma4:12b", timeoutMs: 60_000 },
  chercheur:     { provider: "claude", model: "sonnet", timeoutMs: 90_000 },
}

export const AGENT_IDS = Object.keys(DEFAULT_REGISTRY) as AgentId[]

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>(
  ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"],
)

/** Chemin du registre, surchargeable par env (testabilité). Résolu paresseusement. */
function registryFile(): string {
  return process.env.BRAIN_REGISTRY_FILE
    ?? path.join(import.meta.dirname, "..", "data", "brain-registry.json")
}

/** Valide un objet brut en BrainConfig sûr, en repliant champ par champ sur `fallback`. */
function coerceConfig(raw: unknown, fallback: BrainConfig): BrainConfig {
  if (!raw || typeof raw !== "object") return { ...fallback }
  const r = raw as Record<string, unknown>
  const provider = typeof r.provider === "string" && VALID_PROVIDERS.has(r.provider)
    ? (r.provider as LLMProvider)
    : fallback.provider
  const out: BrainConfig = { provider }
  const model = typeof r.model === "string" && r.model.trim() ? r.model.trim() : fallback.model
  if (model) out.model = model
  const baseUrl = typeof r.baseUrl === "string" && r.baseUrl.trim() ? r.baseUrl.trim() : fallback.baseUrl
  if (baseUrl) out.baseUrl = baseUrl
  const apiKeyEnv = typeof r.apiKeyEnv === "string" && r.apiKeyEnv.trim() ? r.apiKeyEnv.trim() : fallback.apiKeyEnv
  if (apiKeyEnv) out.apiKeyEnv = apiKeyEnv
  const timeoutMs = typeof r.timeoutMs === "number" && Number.isFinite(r.timeoutMs) && r.timeoutMs > 0
    ? r.timeoutMs
    : fallback.timeoutMs
  if (timeoutMs) out.timeoutMs = timeoutMs
  if (typeof r.localOnly === "boolean") out.localOnly = r.localOnly
  else if (fallback.localOnly) out.localOnly = fallback.localOnly
  return out
}

/**
 * Charge le registre depuis disque. Toujours un registre COMPLET et valide :
 * - fichier absent → DEFAULT_REGISTRY ;
 * - JSON invalide → warning + DEFAULT_REGISTRY ;
 * - entrées partielles → merge champ par champ par-dessus les défauts.
 */
export function loadBrainRegistry(): Record<AgentId, BrainConfig> {
  const file = registryFile()
  let parsed: unknown
  try {
    if (!fs.existsSync(file)) return cloneDefaults()
    parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    console.warn(`[brain-registry] registre corrompu (${file}) → repli sur les défauts :`, (err as Error).message)
    return cloneDefaults()
  }
  if (!parsed || typeof parsed !== "object") return cloneDefaults()
  const raw = parsed as Record<string, unknown>
  const out = {} as Record<AgentId, BrainConfig>
  for (const id of AGENT_IDS) out[id] = coerceConfig(raw[id], DEFAULT_REGISTRY[id])
  return out
}

/** Persiste un registre (atomique). Valide/normalise avant écriture. */
export function saveBrainRegistry(registry: Record<AgentId, BrainConfig>): void {
  const out = {} as Record<AgentId, BrainConfig>
  for (const id of AGENT_IDS) out[id] = coerceConfig(registry?.[id], DEFAULT_REGISTRY[id])
  const file = registryFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  atomicWriteFileSync(file, JSON.stringify(out, null, 2))
}

/** Le cerveau d'un agent donné (toujours défini, repli sur le défaut). */
export function getBrain(agentId: AgentId): BrainConfig {
  return loadBrainRegistry()[agentId] ?? { ...DEFAULT_REGISTRY[agentId] }
}

function cloneDefaults(): Record<AgentId, BrainConfig> {
  const out = {} as Record<AgentId, BrainConfig>
  for (const id of AGENT_IDS) out[id] = { ...DEFAULT_REGISTRY[id] }
  return out
}
