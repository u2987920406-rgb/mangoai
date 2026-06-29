// La Forge (mécanisme) — Mango LIT ses propres lacunes et RÉDIGE, via GLM, des specs
// d'agents spécialisés pour les combler. C'est le cœur de la demande de Raf : « c'est
// MANGO qui crée ses agents via GLM ».
//
// Pipeline : readLacunesDigest() (limites.md ouvertes + capabilities.ts) → buildForgeOnePrompt(n)
// → cerveau `forgeron` [Opus, le meilleur raisonneur — décision Raf 2026-06-29] → parseForgedAgent()
// → validateSpec() → assignBrain() [cerveau adapté par compétence, jamais gemma seul]
// → upsertSpecialists() (persisté). Le tout INJECTABLE (ask) pour des tests sans réseau,
// et NE LÈVE JAMAIS (toute erreur → liste vide + message).

import fs from "node:fs"
import path from "node:path"
import { askLLM, type LLMProvider } from "./llm-engine.js"
import { getBrain } from "./brain-registry.js"
import { MANGOOS_CANNOT } from "./capabilities.js"
import {
  validateSpec,
  upsertSpecialists,
  loadSpecialists,
  type SpecialistAgent,
} from "./specialist-agents.js"
import type { OpenGap } from "./self-evolution.js"

/** Chemin du registre des limites, surchargeable par env (testabilité). */
function limitesFile(): string {
  return process.env.LIMITES_FILE
    ?? path.join(import.meta.dirname, "..", "..", "limites.md")
}

/** Une lacune extraite du registre, sous forme compacte. */
export interface Lacune {
  id: string
  titre: string
  bloque: string
}

/**
 * Parse `limites.md` et renvoie les lignes encore OUVERTES (statut 🟡), avec L-id, titre
 * et opération bloquée. PUR sur le contenu passé (séparé pour les tests). Ne lève jamais.
 */
export function parseLacunes(markdown: string): Lacune[] {
  const out: Lacune[] = []
  for (const line of (markdown ?? "").split("\n")) {
    if (!line.startsWith("| L")) continue
    const cells = line.split("|").map((c) => c.trim())
    // cells[0] = "" (avant le 1er |). Colonnes : [ , id, limite, chantier, bloque, …, statut]
    const id = cells[1] ?? ""
    if (!/^L\d+$/.test(id)) continue
    const statut = cells[cells.length - 2] ?? "" // dernière cellule avant le | de fin
    // On ne garde QUE l'ouvert (🟡). On écarte ✅ Résolu / 🟢 Contournée·Assumé.
    if (!statut.includes("🟡")) continue
    out.push({
      id,
      titre: (cells[2] ?? "").slice(0, 160),
      bloque: (cells[4] ?? "").slice(0, 200),
    })
  }
  return out
}

/** Lit le registre des lacunes depuis disque (best-effort). Ne lève jamais. */
export function readLacunesDigest(): { lacunes: Lacune[]; text: string } {
  let md = ""
  try {
    md = fs.readFileSync(limitesFile(), "utf8")
  } catch {
    md = ""
  }
  const lacunes = parseLacunes(md)
  const lines = lacunes.map((l) => `- ${l.id} — ${l.titre} (bloque : ${l.bloque})`)
  const cannot = MANGOOS_CANNOT.map((c) => `- HORS PÉRIMÈTRE : ${c}`)
  const text = [
    "LACUNES OUVERTES DE MANGO (registre des limites honnêtes) :",
    ...lines,
    "",
    "FRONTIÈRE DE COMPÉTENCES (ce que Mango ne sait pas faire) :",
    ...cannot,
  ].join("\n")
  return { lacunes, text }
}

export const FORGE_SYSTEM = `Tu es l'ARCHITECTE D'AGENTS de Mango (un atelier d'IA qui génère des apps web).
Ta mission : concevoir des AGENTS SPÉCIALISÉS sur mesure pour combler les LACUNES de Mango.
Chaque agent est un cerveau-expert avec un rôle pointu, un prompt système opérationnel et des
capacités décrites. Tu raisonnes en ingénieur : un agent = une lacune précise traitée à fond.
Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour.`

/** Construit le prompt de forge pour UN agent ciblant une lacune (réponse courte = jamais
 *  tronquée). `exclude` = noms déjà forgés, pour garantir la diversité. */
export function buildForgeOnePrompt(digest: string, focus: Lacune | null, exclude: string[]): string {
  const cible = focus
    ? `LACUNE À TRAITER EN PRIORITÉ : ${focus.id} — ${focus.titre} (bloque : ${focus.bloque}).`
    : `Choisis TOI-MÊME la lacune ouverte la plus utile à traiter parmi celles listées.`
  const dejaVus = exclude.length
    ? `\nAgents DÉJÀ créés (ne les répète PAS, propose un agent DIFFÉRENT) : ${exclude.join(", ")}.`
    : ""
  return `${digest}

${cible}${dejaVus}

Conçois UN SEUL agent spécialisé qui aide Mango à combler cette lacune.
Rends UNIQUEMENT un objet JSON valide (aucun texte autour), avec EXACTEMENT ces champs :
{
  "name": "nom court et parlant (ex. Gardien des régressions)",
  "role": "rôle/domaine en une phrase",
  "lacune": "la lacune ciblée (ex. ${focus?.id ?? "L35"} — ...)",
  "systemPrompt": "prompt système opérationnel et exigeant : expertise, méthode ordonnée, règles strictes, format de sortie. 150 à 350 mots.",
  "tools": [ { "name": "nom_capacite", "desc": "ce qu'elle fait" } ],
  "triggers": "quand déclencher cet agent (condition claire)",
  "examples": [ "exemple de requête typique" ],
  "tags": [ "mot-cle" ],
  "provider": "ollama",
  "model": "gemma4:12b"
}

Indique la compétence DOMINANTE dans le rôle et les tags (vision / raisonnement / code…).
Le cerveau (provider/model) sera AUTO-ASSIGNÉ par Mango selon cette compétence (vision → l'œil,
raisonnement/code → l'Élève GLM) — tes champs "provider"/"model" sont indicatifs, Mango tranche.
Aucun texte hors de l'objet JSON.`
}

/** Transport injectable (tests) : rend le texte brut du modèle. */
export type ForgeAsk = (system: string, user: string) => Promise<string>

/** Appel réel : cerveau `forgeron` (Opus via l'abonnement, décision Raf 2026-06-29 —
 *  méta-prompting = l'acte le plus exigeant, et RARE → on y met le meilleur raisonneur).
 *  Plafond de tokens RELEVÉ (le défaut 1024 d'askLLM tronquait un prompt système). */
const realForgeAsk: ForgeAsk = (system, user) => {
  const brain = getBrain("forgeron")
  return askLLM(system, user, {
    provider: brain.provider,
    model: brain.model,
    timeoutMs: brain.timeoutMs ?? 120_000,
    maxTokens: 2200,
  })
}

/**
 * AUTO-ASSIGNATION DU CERVEAU (décision Raf 2026-06-29 : « un cerveau spécifique et
 * approprié à chaque agent, pas gemma tout seul »). PURE et déterministe : on classe
 * la compétence dominante de l'agent d'après ses mots (nom/rôle/lacune/tags) et on
 * renvoie le cerveau adapté.
 *  - VISION (juge un rendu, lit une image scannée…) → l'œil `qwen3.5:cloud`.
 *  - sinon (raisonnement / code / config) → l'Élève `glm-5.2:cloud` (≈ Opus, $0-ish).
 * On NE laisse PLUS le défaut `gemma4:12b` (trop faible, sous le niveau Haiku). Le
 * forgeron peut suggérer un modèle, mais Mango tranche ici — réassignable dans l'Atelier.
 */
const VISION_HINTS: RegExp[] = [
  /\bdesign\b/i, /\bpdf\b/i, /scan/i, /\bocr\b/i, /maquette/i, /screenshot/i,
  /capture/i, /sharingan/i, /\bvisuel/i, /\bvision\b/i, /\brendu\b/i,
]
export function assignBrain(spec: SpecialistAgent): { provider: LLMProvider; model: string; timeoutMs: number } {
  const hay = `${spec.name} ${spec.role} ${spec.lacune} ${(spec.tags ?? []).join(" ")}`.toLowerCase()
  const isVision = VISION_HINTS.some((re) => re.test(hay))
  return isVision
    ? { provider: "ollama", model: "qwen3.5:cloud", timeoutMs: 60_000 }
    : { provider: "openai", model: "glm-5.2:cloud", timeoutMs: 120_000 }
}

/**
 * Extrait et valide un tableau d'agents depuis la sortie brute du modèle. Tolérant :
 * retire les fences ```…```, isole le 1er `[` … dernier `]`. Ne lève jamais.
 */
export function parseForgedAgents(raw: string, opts: { now?: number } = {}): SpecialistAgent[] {
  const now = opts.now ?? Date.now()
  let txt = (raw ?? "").trim()
  // retire d'éventuelles fences markdown
  txt = txt.replace(/```(?:json)?/gi, "").trim()
  const start = txt.indexOf("[")
  const end = txt.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  let arr: unknown
  try {
    arr = JSON.parse(txt.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: SpecialistAgent[] = []
  arr.forEach((raw, i) => {
    const spec = validateSpec(raw, { now, seq: i, defaultProvider: "openai", defaultModel: "glm-5.2:cloud" })
    if (spec) out.push(spec)
  })
  return out
}

/** Extrait et valide UN agent depuis la sortie brute (1er `{` … dernier `}`). Ne lève jamais. */
export function parseForgedAgent(raw: string, opts: { now?: number; seq?: number } = {}): SpecialistAgent | null {
  let txt = (raw ?? "").trim().replace(/```(?:json)?/gi, "").trim()
  const start = txt.indexOf("{")
  const end = txt.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  let obj: unknown
  try {
    obj = JSON.parse(txt.slice(start, end + 1))
  } catch {
    return null
  }
  return validateSpec(obj, {
    now: opts.now ?? Date.now(),
    seq: opts.seq ?? 0,
    defaultProvider: "openai",
    defaultModel: "glm-5.2:cloud",
  })
}

export interface ForgeResult {
  created: SpecialistAgent[]
  persisted: SpecialistAgent[]
  lacunesCount: number
  failures: number
}

/** Répartit N lacunes-cibles sur la liste disponible (spread régulier pour la diversité). */
export function pickFocusLacunes(lacunes: Lacune[], n: number): (Lacune | null)[] {
  const out: (Lacune | null)[] = []
  if (lacunes.length === 0) {
    for (let i = 0; i < n; i++) out.push(null)
    return out
  }
  const step = Math.max(1, Math.floor(lacunes.length / n))
  for (let i = 0; i < n; i++) out.push(lacunes[(i * step) % lacunes.length] ?? lacunes[i % lacunes.length])
  return out
}

/**
 * LE GESTE : Mango forge N agents, UN À LA FOIS (réponses courtes = jamais tronquées).
 * Lit ses lacunes → GLM rédige chaque spec en visant une lacune distincte (noms déjà pris
 * exclus) → on valide et on persiste (dédup par nom). Ne lève jamais.
 */
export async function forgeAgents(
  n: number,
  deps: { ask?: ForgeAsk; onProgress?: (msg: string) => void } = {},
): Promise<ForgeResult> {
  const ask = deps.ask ?? realForgeAsk
  const count = Math.max(1, Math.min(20, Math.floor(n) || 10))
  const { lacunes, text } = readLacunesDigest()
  const focuses = pickFocusLacunes(lacunes, count)
  const created: SpecialistAgent[] = []
  const usedNames: string[] = []
  let failures = 0
  for (let i = 0; i < count; i++) {
    const focus = focuses[i] ?? null
    const prompt = buildForgeOnePrompt(text, focus, usedNames)
    let raw = ""
    try {
      raw = await ask(FORGE_SYSTEM, prompt)
    } catch (err) {
      deps.onProgress?.(`✗ agent ${i + 1}/${count} : ${(err as Error).message}`)
      failures++
      continue
    }
    const spec = parseForgedAgent(raw, { seq: i })
    if (spec && !usedNames.includes(spec.name.toLowerCase())) {
      // Cerveau adapté à la compétence (vision vs raisonnement), jamais gemma seul.
      const brain = assignBrain(spec)
      spec.provider = brain.provider
      spec.model = brain.model
      spec.timeoutMs = brain.timeoutMs
      created.push(spec)
      usedNames.push(spec.name.toLowerCase())
      deps.onProgress?.(`✓ agent ${i + 1}/${count} : ${spec.name} (${focus?.id ?? "libre"}) → ${brain.provider}/${brain.model}`)
    } else {
      failures++
      deps.onProgress?.(`✗ agent ${i + 1}/${count} : spec invalide ou doublon`)
    }
  }
  const persisted = created.length > 0 ? upsertSpecialists(created) : []
  return { created, persisted, lacunesCount: lacunes.length, failures }
}

/**
 * #168 — Forge UN agent CIBLÉ sur une lacune ouverte rencontrée en live (boucle d'auto-
 * évolution, semi-auto : appelée APRÈS validation de Raf). Réutilise le forgeron (Opus) +
 * `assignBrain` ; le contexte de la tâche bloquée est injecté pour un agent vraiment adapté.
 * Persiste l'agent (dédup par nom). NE LÈVE JAMAIS → `{ agent, error? }`.
 */
export async function forgeForGap(
  gap: OpenGap,
  deps: { ask?: ForgeAsk } = {},
): Promise<{ agent: SpecialistAgent | null; error?: string }> {
  const ask = deps.ask ?? realForgeAsk
  const focus: Lacune = {
    id: gap.blocker || "L?",
    titre: gap.title || gap.blocker || "lacune",
    bloque: gap.detail || gap.task || "",
  }
  const { text } = readLacunesDigest()
  const context = gap.task
    ? `${text}\n\nCONTEXTE DE LA LACUNE RENCONTRÉE EN LIVE (tâche bloquée) : ${gap.task}`
    : text
  const exclude = loadSpecialists().map((s) => s.name.toLowerCase())
  const prompt = buildForgeOnePrompt(context, focus, exclude)
  let raw = ""
  try {
    raw = await ask(FORGE_SYSTEM, prompt)
  } catch (err) {
    return { agent: null, error: (err as Error).message }
  }
  const spec = parseForgedAgent(raw)
  if (!spec) return { agent: null, error: "spec invalide (forge)" }
  if (exclude.includes(spec.name.toLowerCase())) return { agent: null, error: "doublon de nom" }
  const brain = assignBrain(spec)
  spec.provider = brain.provider
  spec.model = brain.model
  spec.timeoutMs = brain.timeoutMs
  upsertSpecialists([spec])
  return { agent: spec }
}
