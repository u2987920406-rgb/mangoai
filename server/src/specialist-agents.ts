// La Forge — registre des AGENTS SPÉCIALISÉS que Mango se fabrique sur mesure.
//
// Demande de Raf (2026-06-28) : « dix agents spécialisés, fabriqués sur mesure pour
// aider Mango dans ses lacunes — et c'est MANGO qui crée ses agents via GLM ».
//
// Décisions (AskUserQuestion) : un agent = un CERVEAU DU REGISTRE (provider+modèle+rôle,
// comme les 12 cerveaux de brain-registry) ENRICHI d'un prompt système et d'outils ;
// le MÉCANISME est générique (GLM lit une lacune → rédige une spec → validée → persistée
// → invocable), puis on l'utilise pour forger les 10 premiers.
//
// Pourquoi un registre SÉPARÉ de brain-registry.ts ? Parce que `AgentId` y est une union
// FIGÉE à la compilation (12 agents) ; les agents forgés sont DYNAMIQUES (créés au runtime
// par GLM). On réutilise le même pattern robuste : load/save atomique, validation champ par
// champ, jamais de crash. La forme s'aligne sur `data/super-agents.json` (déjà présent) en
// l'enrichissant (lacune ciblée, cerveau, déclencheur, traçabilité).

import fs from "node:fs"
import path from "node:path"
import { atomicWriteFileSync } from "./safe-io.js"
import { askLLM, type LLMProvider } from "./llm-engine.js"
import { sanitizeExternal } from "./agent-contract.js"

/** Un « outil » d'un spécialiste = une capacité DÉCRITE (nom + description) qui cadre
 *  son comportement (pas un outil exécutable du moteur — il oriente le raisonnement). */
export interface SpecialistTool {
  name: string
  desc: string
}

/** Spec complète d'un agent spécialisé forgé par Mango. */
export interface SpecialistAgent {
  id: string
  /** Nom court et parlant (ex. « Gardien des régressions »). */
  name: string
  /** Rôle / domaine en une phrase. */
  role: string
  /** La LACUNE ciblée (ex. « L35 — sur-exploration sur app riche » ou « régressions »). */
  lacune: string
  /** Prompt système : l'expertise et les règles de l'agent. */
  systemPrompt: string
  /** Capacités décrites (orientent le raisonnement). */
  tools: SpecialistTool[]
  /** Quand déclencher cet agent (condition lisible). */
  triggers: string
  /** Exemples de requêtes typiques. */
  examples: string[]
  tags: string[]
  /** Cerveau de l'agent (réutilise la forme BrainConfig). */
  provider: LLMProvider
  model?: string
  timeoutMs?: number
  /** Traçabilité : quel agent l'a forgé (ex. « codeur » = l'Élève GLM). */
  createdByAgent: string
  createdAt: string
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>(
  ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"],
)

const MAX_PROMPT = 6000
const MAX_TOOLS = 10
const MAX_EXAMPLES = 6
const MAX_TAGS = 8

/** Chemin du registre, surchargeable par env (testabilité). Résolu paresseusement. */
function registryFile(): string {
  return process.env.SPECIALIST_AGENTS_FILE
    ?? path.join(import.meta.dirname, "..", "data", "specialist-agents.json")
}

const clip = (s: unknown, n: number): string =>
  typeof s === "string" ? s.trim().slice(0, n) : ""

/** Slug sûr pour un id, dérivé du nom. */
function slugify(name: string): string {
  return (name || "agent")
    .toLowerCase()
    .normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "agent"
}

/**
 * Valide/normalise un objet brut en SpecialistAgent sûr, ou `null` si l'essentiel manque
 * (nom, rôle, prompt système). PUR (hors `now`/`seq` injectés pour l'id). Ne lève jamais.
 */
export function validateSpec(
  raw: unknown,
  opts: { now?: number; seq?: number; defaultProvider?: LLMProvider; defaultModel?: string } = {},
): SpecialistAgent | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const name = clip(r.name, 80)
  const role = clip(r.role ?? r.domain, 200)
  const systemPrompt = clip(r.systemPrompt, MAX_PROMPT)
  if (!name || !role || systemPrompt.length < 20) return null

  const provider = typeof r.provider === "string" && VALID_PROVIDERS.has(r.provider)
    ? (r.provider as LLMProvider)
    : (opts.defaultProvider ?? "openai")

  const tools: SpecialistTool[] = Array.isArray(r.tools)
    ? r.tools
        .map((t): SpecialistTool | null => {
          if (!t || typeof t !== "object") return null
          const tn = clip((t as Record<string, unknown>).name, 60)
          const td = clip((t as Record<string, unknown>).desc ?? (t as Record<string, unknown>).description, 400)
          return tn ? { name: tn, desc: td } : null
        })
        .filter((t): t is SpecialistTool => t !== null)
        .slice(0, MAX_TOOLS)
    : []

  const examples = Array.isArray(r.examples)
    ? r.examples.map((e) => clip(e, 400)).filter(Boolean).slice(0, MAX_EXAMPLES)
    : []
  const tags = Array.isArray(r.tags)
    ? r.tags.map((t) => clip(t, 30)).filter(Boolean).slice(0, MAX_TAGS)
    : []

  const now = opts.now ?? Date.now()
  const id = typeof r.id === "string" && /^sa_[a-z0-9_-]+$/i.test(r.id)
    ? r.id
    : `sa_${now}_${opts.seq ?? 0}_${slugify(name)}`

  const model = clip(r.model, 80) || opts.defaultModel
  const timeoutMs = typeof r.timeoutMs === "number" && Number.isFinite(r.timeoutMs) && r.timeoutMs > 0
    ? r.timeoutMs
    : 120_000

  const out: SpecialistAgent = {
    id,
    name,
    role,
    lacune: clip(r.lacune, 200),
    systemPrompt,
    tools,
    triggers: clip(r.triggers, 300),
    examples,
    tags,
    provider,
    createdByAgent: clip(r.createdByAgent, 40) || "codeur",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(now).toISOString(),
  }
  if (model) out.model = model
  if (timeoutMs) out.timeoutMs = timeoutMs
  return out
}

/** Charge le registre des spécialistes. Toujours un tableau valide (entrées invalides filtrées). */
export function loadSpecialists(): SpecialistAgent[] {
  const file = registryFile()
  let parsed: unknown
  try {
    if (!fs.existsSync(file)) return []
    parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  } catch (err) {
    console.warn(`[specialist-agents] registre corrompu (${file}) → repli sur [] :`, (err as Error).message)
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: SpecialistAgent[] = []
  for (const raw of parsed) {
    const spec = validateSpec(raw)
    if (spec) out.push(spec)
  }
  return out
}

/** Persiste la liste (atomique). Valide/normalise avant écriture. */
export function saveSpecialists(list: SpecialistAgent[]): void {
  const clean = (Array.isArray(list) ? list : [])
    .map((s) => validateSpec(s))
    .filter((s): s is SpecialistAgent => s !== null)
  const file = registryFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  atomicWriteFileSync(file, JSON.stringify(clean, null, 2))
}

export function getSpecialist(id: string): SpecialistAgent | undefined {
  return loadSpecialists().find((s) => s.id === id)
}

export function removeSpecialist(id: string): boolean {
  const list = loadSpecialists()
  const next = list.filter((s) => s.id !== id)
  if (next.length === list.length) return false
  saveSpecialists(next)
  return true
}

/**
 * Ajoute (ou met à jour) des spécialistes, en DÉDUPLIQUANT par nom (insensible à la casse) :
 * un re-forge n'empile pas de doublons, il remplace. Renvoie la liste persistée.
 */
export function upsertSpecialists(specs: SpecialistAgent[]): SpecialistAgent[] {
  const byName = new Map<string, SpecialistAgent>()
  for (const s of loadSpecialists()) byName.set(s.name.toLowerCase(), s)
  for (const s of specs) byName.set(s.name.toLowerCase(), s)
  const merged = [...byName.values()]
  saveSpecialists(merged)
  return merged
}

/** Transport injectable (tests). */
export type AskText = (system: string, user: string) => Promise<string>

/**
 * Invoque un spécialiste sur une tâche : son cerveau (provider+modèle) répond en prose,
 * cadré par son prompt système. L'entrée est traitée comme DONNÉE (sanitizeExternal).
 * Ne lève jamais — renvoie `{ ok, text }`.
 */
export async function runSpecialist(
  id: string,
  task: string,
  deps: { ask?: AskText } = {},
): Promise<{ ok: boolean; text: string; agent?: SpecialistAgent }> {
  const agent = getSpecialist(id)
  if (!agent) return { ok: false, text: `Spécialiste introuvable : ${id}` }
  const ask: AskText = deps.ask
    ?? ((system, user) =>
      askLLM(system, user, {
        provider: agent.provider,
        model: agent.model,
        timeoutMs: agent.timeoutMs,
      }))
  try {
    const safe = sanitizeExternal(String(task ?? ""))
    const text = await ask(agent.systemPrompt, safe)
    return { ok: true, text: (text ?? "").trim(), agent }
  } catch (err) {
    return { ok: false, text: `Échec de l'invocation : ${(err as Error).message}`, agent }
  }
}
