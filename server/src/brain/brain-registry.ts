// Brain-Dispatch #150 — Couche 2 : le registre des cerveaux par agent.
//
// Chaque agent de MangoOS (orchestrateur, codeur, vision…) a SON propre cerveau
// (provider + modèle), configurable dans data/brain-registry.json SANS toucher au
// code. Ce module charge, valide et expose ce registre. Robuste par conception :
// un fichier absent, corrompu ou partiellement invalide retombe toujours sur des
// valeurs par défaut saines (DEFAULT_REGISTRY) — jamais de crash, jamais de blocage.
import fs from "node:fs"
import path from "node:path"
import { atomicWriteFileSync } from "../safe-io.js"
import { flag } from "../flags.js"
import type { LLMProvider } from "../llm/llm-engine.js"

/** (C2) Une cible de REPLI : un mini-cerveau (provider + éventuels endpoint/clé/
 *  timeout) essayé si le cerveau principal échoue en disponibilité. PAS de champ
 *  `fallback` imbriqué (une chaîne, pas un arbre) ni `localOnly` (hérité du rôle). */
export interface BrainFallback {
  provider: LLMProvider
  model?: string
  baseUrl?: string
  apiKeyEnv?: string
  timeoutMs?: number
}

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
  /** (C2) Chaîne de repli ORDONNÉE (bornée à 2) essayée sur timeout/erreur
   *  transport, seulement si le flag BRAIN_FALLBACK est actif. */
  fallback?: BrainFallback[]
}

/** Nombre max de cibles de repli par rôle (au-delà → tronqué). */
export const MAX_FALLBACK_CHAIN = 2

export type AgentId =
  | "orchestrateur" | "architecte" | "codeur" | "vision"
  | "designer_ux" | "extracteur" | "testeur" | "auditeur"
  | "optimiseur" | "chercheur" | "juge" | "stratege" | "forgeron" | "routeur"
  | "accueil" | "codeur_frontiere"

/** Valeurs par défaut — la vérité de repli si le registre est absent ou corrompu. */
export const DEFAULT_REGISTRY: Record<AgentId, BrainConfig> = {
  orchestrateur: { provider: "claude", model: "opus", timeoutMs: 30_000 },
  architecte:    { provider: "claude", model: "opus", timeoutMs: 45_000 },
  // #162 — `codeur` EST l'Élève (les « mains » qui codent en Construire/Discuter) :
  // Source de vérité UNIQUE du cerveau Élève, lue en DIRECT par tout le serveur
  // (globalFallback() + eleve/provider.ts::syncEleveFromBrainRegistry(), sans
  // redémarrage — Raf, 2026-07-11 : « un seul endroit pour changer de modèle »).
  // Qwythos-9B-v2 Q6_K via Ollama LOCAL : souveraineté prouvée en réel (galerie
  // générée, coût $0, 0 image cassée). Ce défaut n'intervient QUE si brain-registry.json
  // est absent/corrompu (repli de dernier recours) ; en usage normal, la valeur
  // vivante vient du fichier, éditable dans Réglages → Atelier des cerveaux.
  // (2026-07-14) Tag "qwythos-tools:q6" — mêmes poids, Modelfile réparé (tool-calling
  // natif réel, vérifié) ; voir .env pour le détail de la découverte/preuve.
  codeur:        { provider: "ollama", model: "qwythos-tools:q6", timeoutMs: 120_000 },
  vision:        { provider: "ollama", model: "qwen3.5:cloud", timeoutMs: 60_000 },
  designer_ux:   { provider: "claude", model: "sonnet", timeoutMs: 30_000 },
  extracteur:    { provider: "claude", model: "haiku", timeoutMs: 30_000 },
  testeur:       { provider: "claude", model: "sonnet", timeoutMs: 45_000 },
  auditeur:      { provider: "claude", model: "sonnet", timeoutMs: 30_000 },
  // (2026-07-14) gemma4:12b désinstallé localement — repli de dernier recours
  // réaligné sur le cerveau Élève courant (le fichier vivant brain-registry.json
  // porte déjà qwythos-tools:q6 ; ce défaut n'intervient QUE si ce fichier disparaît).
  optimiseur:    { provider: "ollama", model: "qwythos-tools:q6", timeoutMs: 60_000 },
  chercheur:     { provider: "claude", model: "sonnet", timeoutMs: 90_000 },
  // #161 — juge de clôture (intention↔livré) : souverain ($0) et DISTINCT de
  // l'exécutant GLM (provider openai), pour éviter l'auto-jugement biaisé.
  juge:          { provider: "ollama", model: "qwen3.5:cloud", timeoutMs: 45_000 },
  // #164 Phase 3 — Le Stratège (cas AMBIGUS). Leçon TRINITY (veille Sakana) : un
  // petit cerveau LOCAL suffit à *classer* un blocage (il ne résout rien lui-même,
  // il choisit une classe du catalogue). Barreau 1 de l'échelle d'escalade :
  // (2026-07-14) gemma4:12b désinstallé — repli sur qwythos-tools:q6 (déjà chargé,
  // évite un swap VRAM supplémentaire). Le barreau 2 (cloud supérieur, GLM 5.2 via
  // le rôle `routeur`) est un AUTRE agent, configurable par env
  // (STRATEGE_ESCALATE_AGENT) — voir stratege-brain.ts.
  stratege:      { provider: "ollama", model: "qwythos-tools:q6", timeoutMs: 90_000 },
  // La Forge — le FORGERON qui CONÇOIT les agents (méta-prompting). Décision Raf
  // (2026-06-29) : c'est l'acte le PLUS exigeant (lire une lacune abstraite → rédiger
  // un prompt système d'expert + JSON valide) et il est RARE → on y met le meilleur
  // raisonneur, Opus, via l'abonnement Claude ($0). Distinct du `codeur` (GLM) qui,
  // lui, EXÉCUTE. Réassignable à chaud dans l'Atelier comme tout cerveau.
  forgeron:      { provider: "claude", model: "opus", timeoutMs: 120_000 },
  // #182 D2 — le ROUTEUR de capacités (étage 3, gaté INTENT_ROUTER_LLM=off par défaut) :
  // repli d'AMBIGUÏTÉ SEULE quand le signal déterministe (URL/mots-clés/pièce jointe) est
  // muet. Léger et rapide : GLM cloud, repli C2 (BRAIN_FALLBACK) déjà disponible pour ce rôle.
  routeur:       { provider: "ollama", model: "glm-5.2:cloud", timeoutMs: 20_000 },
  // #182 D3/É5 suite — le cerveau CHOISI PAR RAF à l'Accueil (popup rapide, gate
  // HOME_QUICK_MODEL). Défaut = "sonnet" (alias court accepté tel quel par askClaude,
  // vérifié dans llm-engine.ts : query({model}) prend l'alias directement, aucun
  // MODEL_MAP nécessaire) → comportement identique au repli historique tant que Raf
  // n'a rien choisi dans la popup. Pas d'EXPECTED_CAPS : choix libre assumé (limites.md).
  accueil:       { provider: "claude", model: "sonnet", timeoutMs: 60_000 },
  // #193 — le cerveau FRONTIÈRE dédié de la section Code (jamais l'Élève souverain,
  // jamais un repli .env) : lu SERVEUR-CÔTÉ par /api/code-chat (code-route.ts), le
  // client ne peut jamais le contourner. Distinct de `codeur` (Élève, sémantique
  // opposée — souverain local/cloud). Défaut = le tier Claude le plus capable
  // disponible via l'abonnement, réassignable à chaud dans l'Atelier comme tout
  // cerveau, mais toujours filtré contre ALLOWED_MODELS côté route (repli "opus"
  // si le registre pointe vers un modèle non-Claude).
  codeur_frontiere: { provider: "claude", model: "opus", timeoutMs: 120_000 },
}

export const AGENT_IDS = Object.keys(DEFAULT_REGISTRY) as AgentId[]

// #162 — Garde de capacités : capabilities Ollama (/api/show) qu'un agent EXIGE.
// L'agent `vision` doit voir → capability `vision` obligatoire (le piège GLM-4.6V :
// packagé sans mmproj, pas de `vision`, HTTP 500 sur image). Les autres agents n'ont
// pas d'exigence dure ici (informatif). PUR ; la comparaison caps↔attendues se fait
// côté UI, NON-BLOQUANTE (avertit, n'impose pas — fidèle #111).
export const EXPECTED_CAPS: Partial<Record<AgentId, string[]>> = {
  vision: ["vision"],
}

// (2026-07-20) 'openrouter' AJOUTÉ — il était géré par le type LLMProvider et le
// routeur askLLM (preset tencent/hy3:free) MAIS OUBLIÉ ici : conséquence,
// coerceConfig rejetait 'openrouter' et retombait silencieusement sur le défaut
// du rôle (un autre provider). Tout registre pointant sur openrouter était donc
// neutralisé au chargement. Aligné sur le type LLMProvider (llm-engine.ts:40).
const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>(
  ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "openrouter", "litellm"],
)

/** Dossier des profils de cerveau (C4) : registres COMPLETS pré-remplis
 *  (full-local, cloud-actuel…) qu'on bascule en une commande ou une ligne d'env. */
export function brainProfileDir(): string {
  return path.join(import.meta.dirname, "..", "data", "brain-profiles")
}
export function brainProfilePath(name: string): string {
  return path.join(brainProfileDir(), `${name}.json`)
}

/**
 * Chemin du registre, résolu paresseusement. Priorité :
 *  1. `BRAIN_REGISTRY_FILE` (override explicite — testabilité) ;
 *  2. (C4-P1) `BRAIN_PROFILE=<nom>` → `data/brain-profiles/<nom>.json` s'il EXISTE
 *     (« une ligne de config » : basculer sur un profil sans toucher au registre
 *     principal ; l'enlever revient à l'état d'avant). Profil manquant → warning
 *     + registre habituel (fail-open) ;
 *  3. le registre principal `data/brain-registry.json`.
 */
function registryFile(): string {
  const explicit = process.env.BRAIN_REGISTRY_FILE
  if (explicit) return explicit
  const profile = (process.env.BRAIN_PROFILE ?? "").trim()
  if (profile) {
    const pf = brainProfilePath(profile)
    if (fs.existsSync(pf)) return pf
    console.warn(`[brain-registry] BRAIN_PROFILE="${profile}" introuvable (${pf}) → registre habituel`)
  }
  return path.join(import.meta.dirname, "..", "data", "brain-registry.json")
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
  // (C2) Chaîne de repli : validée entrée par entrée, bornée, jamais imbriquée.
  const chain = coerceFallbackChain(r.fallback) ?? fallback.fallback
  if (chain && chain.length) out.fallback = chain
  return out
}

/** Valide une chaîne de repli brute (tableau de mini-cerveaux). Entrées invalides
 *  ignorées (fail-open), tronquée à MAX_FALLBACK_CHAIN. undefined si rien d'exploitable. */
function coerceFallbackChain(raw: unknown): BrainFallback[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BrainFallback[] = []
  for (const item of raw) {
    if (out.length >= MAX_FALLBACK_CHAIN) break
    if (!item || typeof item !== "object") continue
    const it = item as Record<string, unknown>
    if (typeof it.provider !== "string" || !VALID_PROVIDERS.has(it.provider)) continue
    const fb: BrainFallback = { provider: it.provider as LLMProvider }
    if (typeof it.model === "string" && it.model.trim()) fb.model = it.model.trim()
    if (typeof it.baseUrl === "string" && it.baseUrl.trim()) fb.baseUrl = it.baseUrl.trim()
    if (typeof it.apiKeyEnv === "string" && it.apiKeyEnv.trim()) fb.apiKeyEnv = it.apiKeyEnv.trim()
    if (typeof it.timeoutMs === "number" && Number.isFinite(it.timeoutMs) && it.timeoutMs > 0) fb.timeoutMs = it.timeoutMs
    out.push(fb)
  }
  return out.length ? out : undefined
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
    if (!fs.existsSync(file)) return applyLocalOnly(cloneDefaults())
    parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    console.warn(`[brain-registry] registre corrompu (${file}) → repli sur les défauts :`, (err as Error).message)
    return applyLocalOnly(cloneDefaults())
  }
  if (!parsed || typeof parsed !== "object") return applyLocalOnly(cloneDefaults())
  const raw = parsed as Record<string, unknown>
  const out = {} as Record<AgentId, BrainConfig>
  for (const id of AGENT_IDS) out[id] = coerceConfig(raw[id], DEFAULT_REGISTRY[id])
  return applyLocalOnly(out)
}

/** (C4-P1) « Rideau de fer » : si BRAIN_LOCAL_ONLY est actif, force localOnly=true
 *  sur TOUS les rôles → le garde de dispatch refuse alors tout provider cloud.
 *  Gate off → registre inchangé (identité stricte). */
function applyLocalOnly(reg: Record<AgentId, BrainConfig>): Record<AgentId, BrainConfig> {
  if (!flag("BRAIN_LOCAL_ONLY")) return reg
  for (const id of AGENT_IDS) reg[id] = { ...reg[id], localOnly: true }
  return reg
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

/**
 * Nom court lisible d'un identifiant de modèle brut, pour affichage (statut de
 * chat, logs). Raf (2026-07-11) : Réglages (Atelier des cerveaux → brain-registry.json)
 * doit être la SEULE source du nom affiché ailleurs — jamais un libellé codé en
 * dur ni une valeur .env figée. Miroir du helper UI (ui/src/components/chat/helpers.js).
 * Ex. "hf.co/empero-ai/Qwythos-9B-v2-GGUF:Q6_K" → "Qwythos 9B v2 (Q6)".
 */
export function shortModelLabel(raw: string | undefined | null): string | null {
  if (!raw) return null
  const afterSlash = raw.split("/").pop()!
  const [name, tag] = afterSlash.split(":")
  const clean = name.replace(/-GGUF$/i, "").replace(/[-_]+/g, " ").trim()
  const quant = tag ? tag.replace(/^([Qq]\d+).*$/, "$1").toUpperCase() : ""
  if (!tag) return clean
  return quant && quant !== tag.toUpperCase() ? `${clean} (${quant})` : `${clean} ${tag}`
}

function cloneDefaults(): Record<AgentId, BrainConfig> {
  const out = {} as Record<AgentId, BrainConfig>
  for (const id of AGENT_IDS) out[id] = { ...DEFAULT_REGISTRY[id] }
  return out
}
