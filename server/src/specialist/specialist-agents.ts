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
import { atomicWriteFileSync, dataDir } from "../safe-io.js"
import { askLLM, type LLMProvider } from "../llm/llm-engine.js"
import { sanitizeExternal } from "../agent/agent-contract.js"
// Type-only (effacé à la compilation) → aucun cycle runtime avec eleve-action-tools.
import type { ToolPolicy } from "../eleve-tools/eleve-action-tools.js"

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
  /** #175 — Mode d'action : "conseil" (défaut/implicite si absent = avis texte, `runSpecialist`)
   *  ou "action" (boucle agentique `runSpecialistAgentic` avec outils scellés). Décidé à la
   *  FORGE (`assignMode`), jamais négocié par l'agent à l'exécution. */
  mode?: "conseil" | "action"
  /** #175 — Policy d'outils scellée à la forge (uniquement si `mode === "action"`). */
  toolPolicy?: ToolPolicy
  /** (2026-07-07, revue Fable — recommandation #3, axiome 11) Scorecard de valeur RÉELLE :
   *  un agent forgé n'est plus cru à vie sur sa seule existence. `consulted` s'incrémente à
   *  chaque consultation via `consultSpecialist` ; `wins` seulement quand cette consultation
   *  a mené à un `finish` réussi AVANT tout autre remède. Absent = jamais consulté. */
  stats?: { consulted: number; wins: number }
}

const VALID_PROVIDERS: ReadonlySet<string> = new Set<LLMProvider>(
  ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"],
)

const MAX_PROMPT = 6000
const MAX_TOOLS = 10
const MAX_EXAMPLES = 6
const MAX_TAGS = 8

/** Chemin du registre, surchargeable par env (testabilité). Résolu paresseusement.
 *  Ancré sur `dataDir()` (safe-io.ts) — PAS `import.meta.dirname` local (couplait le
 *  chemin à la profondeur de CE fichier, cause du registre fantôme trouvé le 2026-07-23). */
function registryFile(): string {
  return process.env.SPECIALIST_AGENTS_FILE ?? dataDir("specialist-agents.json")
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

  // #175 — mode "action" (sinon absent = conseil, rétrocompatible) + toolPolicy scellée.
  if (r.mode === "action") {
    out.mode = "action"
    const tp = r.toolPolicy
    if (tp && typeof tp === "object") {
      const t = tp as Record<string, unknown>
      const policy: ToolPolicy = {}
      if (typeof t.allowRun === "boolean") policy.allowRun = t.allowRun
      const allow = Array.isArray(t.allowedTools)
        ? t.allowedTools.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 30)
        : []
      const deny = Array.isArray(t.deniedTools)
        ? t.deniedTools.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 30)
        : []
      if (allow.length) policy.allowedTools = allow
      if (deny.length) policy.deniedTools = deny
      if (Object.keys(policy).length) out.toolPolicy = policy
    }
  }

  // (revue Fable #3) `stats` doit SURVIVRE aux re-validations (upsertSpecialists/saveSpecialists
  // re-valident TOUT le registre à chaque écriture) — sinon la scorecard repart de zéro à
  // chaque forge ou mise à jour d'un AUTRE agent.
  if (r.stats && typeof r.stats === "object") {
    const st = r.stats as Record<string, unknown>
    const consulted = typeof st.consulted === "number" && Number.isFinite(st.consulted) && st.consulted >= 0 ? st.consulted : 0
    const wins = typeof st.wins === "number" && Number.isFinite(st.wins) && st.wins >= 0 ? Math.min(st.wins, consulted) : 0
    if (consulted > 0) out.stats = { consulted, wins }
  }
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

/** Réassigne le cerveau d'un agent (provider/modèle/timeout). Renvoie l'agent màj ou null
 *  si l'id est inconnu ou le provider invalide. Utilisé par l'Atelier (slice 2a). */
export function updateSpecialistBrain(
  id: string,
  patch: { provider?: string; model?: string; timeoutMs?: number },
): SpecialistAgent | null {
  const list = loadSpecialists()
  const i = list.findIndex((s) => s.id === id)
  if (i < 0) return null
  const cur = list[i]!
  const provider = patch.provider && VALID_PROVIDERS.has(patch.provider)
    ? (patch.provider as LLMProvider)
    : cur.provider
  const next: SpecialistAgent = {
    ...cur,
    provider,
    model: typeof patch.model === "string" && patch.model.trim() ? patch.model.trim() : cur.model,
    timeoutMs: typeof patch.timeoutMs === "number" && Number.isFinite(patch.timeoutMs) && patch.timeoutMs > 0
      ? patch.timeoutMs
      : cur.timeoutMs,
  }
  list[i] = next
  saveSpecialists(list)
  return next
}

/** (revue Fable #3) Comptabilise une CONSULTATION (appelé dès que `consultSpecialist` obtient
 *  un avis exploitable de cet agent — succès ou échec de la tâche encore inconnu à ce stade).
 *  Renvoie l'agent màj ou null si id inconnu. Ne lève jamais. */
export function recordSpecialistConsulted(id: string): SpecialistAgent | null {
  const list = loadSpecialists()
  const i = list.findIndex((s) => s.id === id)
  if (i < 0) return null
  const cur = list[i]!
  const stats = cur.stats ?? { consulted: 0, wins: 0 }
  list[i] = { ...cur, stats: { consulted: stats.consulted + 1, wins: stats.wins } }
  saveSpecialists(list)
  return list[i]!
}

/** Comptabilise un SUCCÈS attribuable à cet agent (appelé UNIQUEMENT quand un `finish` réussi
 *  suit directement sa consultation, avant tout autre remède). Suppose `recordSpecialistConsulted`
 *  déjà appelé pour cet épisode — n'incrémente que `wins`, jamais `consulted` une 2ᵉ fois. */
export function recordSpecialistWin(id: string): SpecialistAgent | null {
  const list = loadSpecialists()
  const i = list.findIndex((s) => s.id === id)
  if (i < 0) return null
  const cur = list[i]!
  const stats = cur.stats ?? { consulted: 1, wins: 0 } // garde-fou : gagne implique au moins 1 consultation
  list[i] = { ...cur, stats: { consulted: Math.max(stats.consulted, 1), wins: stats.wins + 1 } }
  saveSpecialists(list)
  return list[i]!
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
