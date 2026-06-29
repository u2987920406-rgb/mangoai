// #168 — La Boucle d'auto-évolution (SEMI-AUTO). Quand Mango se bloque pendant un build
// et qu'AUCUN agent forgé ne couvre le blocage, on l'inscrit comme LACUNE OUVERTE dans un
// store MACHINE (data/open-gaps.json) — DISTINCT de `limites.md` (curé à la main). Mango
// PROPOSE, Raf VALIDE (route /api/gaps/:id/forge), le forgeron (Opus) crée l'agent ciblé.
//
// Posture (décision Raf 2026-06-29) : semi-auto + store séparé. Disjoncteur en amont (la
// forge réelle passe par une validation humaine ; aucune création d'agent sans clic). Tout
// est PUR / robuste / injectable et NE LÈVE JAMAIS.

import fs from "node:fs"
import path from "node:path"
import { atomicWriteFileSync } from "./safe-io.js"
import { loadSpecialists, type SpecialistAgent } from "./specialist-agents.js"

export type GapStatus = "proposed" | "forging" | "forged" | "dismissed"

/** Une lacune rencontrée en live et non couverte par un agent existant. */
export interface OpenGap {
  id: string
  /** Signature de dédup (slug stable du blocage). */
  sig: string
  /** Titre lisible court. */
  title: string
  /** Classe de blocage (ex. plateau-iterations). */
  blocker: string
  /** Détail du blocage. */
  detail: string
  /** La tâche où la lacune est apparue (contexte pour le forgeron). */
  task: string
  status: GapStatus
  /** Nombre de rencontres (priorisation). */
  hits: number
  /** Agent forgé qui l'a comblée (quand status = forged). */
  agentId?: string
  createdAt: string
  updatedAt: string
}

const MAX_GAPS = 200

/** Chemin du store, surchargeable par env (testabilité). Résolu paresseusement. */
function gapsFile(): string {
  return process.env.OPEN_GAPS_FILE ?? path.join(import.meta.dirname, "..", "data", "open-gaps.json")
}

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s.trim().slice(0, n) : "")

const stripAccents = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "")

/** Slug stable d'un blocage (clé de dédup). PUR. */
export function gapSignature(blocker: string, detail: string): string {
  return (
    stripAccents(`${blocker}|${detail}`)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "gap"
  )
}

/** Tokens significatifs (mots ≥ 4 lettres) pour le recouvrement. PUR. */
function tokens(s: string): Set<string> {
  return new Set(
    stripAccents(s ?? "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  )
}

/**
 * Un agent forgé COUVRE-t-il déjà ce blocage ? Recouvrement de tokens entre le texte du
 * blocage/tâche et (lacune + tags + rôle + déclencheurs) de chaque agent. Renvoie le
 * meilleur agent couvrant (seuil souple), ou null si la lacune est NOUVELLE. PUR.
 */
export function coversGap(
  blocker: string,
  detail: string,
  task: string,
  agents: SpecialistAgent[],
): SpecialistAgent | null {
  const need = tokens(`${blocker} ${detail} ${task}`)
  if (need.size === 0) return null
  let best: SpecialistAgent | null = null
  let bestScore = 0
  for (const a of agents ?? []) {
    const have = tokens(`${a.lacune} ${(a.tags ?? []).join(" ")} ${a.role} ${a.triggers}`)
    let score = 0
    for (const t of need) if (have.has(t)) score++
    if (score > bestScore) { bestScore = score; best = a }
  }
  return bestScore >= 2 ? best : null
}

function isGap(x: unknown): x is OpenGap {
  return !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string"
    && typeof (x as { sig?: unknown }).sig === "string"
}

/** Charge le store. Toujours un tableau valide (entrées invalides filtrées). Ne lève jamais. */
export function loadGaps(): OpenGap[] {
  try {
    const f = gapsFile()
    if (!fs.existsSync(f)) return []
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"))
    return Array.isArray(parsed) ? parsed.filter(isGap) : []
  } catch {
    return []
  }
}

/** Persiste le store (atomique, plafonné). Ne lève jamais sur des entrées vides. */
export function saveGaps(list: OpenGap[]): void {
  const clean = (Array.isArray(list) ? list : []).filter(isGap).slice(0, MAX_GAPS)
  const f = gapsFile()
  fs.mkdirSync(path.dirname(f), { recursive: true })
  atomicWriteFileSync(f, JSON.stringify(clean, null, 2))
}

function gapTitle(blocker: string, detail: string): string {
  return `${blocker}${detail ? `: ${detail}` : ""}`.slice(0, 80)
}

export interface RecordResult {
  recorded: boolean
  isNew: boolean
  covered: boolean
  gap: OpenGap | null
}

/**
 * Enregistre un blocage NON COUVERT comme lacune ouverte (semi-auto). Si un agent forgé le
 * couvre déjà → on ne record rien (`covered:true`). Dédup par signature : un re-blocage
 * incrémente `hits` au lieu d'empiler. `now`/`agents` injectables pour les tests. Ne lève jamais.
 */
export function recordUncoveredGap(
  input: { blocker: string; detail?: string; task?: string },
  deps: { now?: number; agents?: SpecialistAgent[] } = {},
): RecordResult {
  try {
    const blocker = clip(input.blocker, 60) || "blocage"
    const detail = clip(input.detail, 300)
    const task = clip(input.task, 600)
    const agents = deps.agents ?? loadSpecialists()
    if (coversGap(blocker, detail, task, agents)) {
      return { recorded: false, isNew: false, covered: true, gap: null }
    }
    const now = deps.now ?? Date.now()
    const iso = new Date(now).toISOString()
    const sig = gapSignature(blocker, detail)
    const list = loadGaps()
    const existing = list.find((g) => g.sig === sig && g.status !== "dismissed" && g.status !== "forged")
    if (existing) {
      existing.hits++
      existing.updatedAt = iso
      saveGaps(list)
      return { recorded: true, isNew: false, covered: false, gap: existing }
    }
    const gap: OpenGap = {
      id: `gap_${now}_${sig}`.slice(0, 90),
      sig,
      title: gapTitle(blocker, detail),
      blocker,
      detail,
      task,
      status: "proposed",
      hits: 1,
      createdAt: iso,
      updatedAt: iso,
    }
    list.push(gap)
    saveGaps(list)
    return { recorded: true, isNew: true, covered: false, gap }
  } catch {
    return { recorded: false, isNew: false, covered: false, gap: null }
  }
}

/** Une lacune par id. */
export function getGap(id: string): OpenGap | undefined {
  return loadGaps().find((g) => g.id === id)
}

/** Lacunes à traiter (proposed/forging), les plus fréquentes d'abord. */
export function listOpenGaps(): OpenGap[] {
  return loadGaps()
    .filter((g) => g.status === "proposed" || g.status === "forging")
    .sort((a, b) => b.hits - a.hits)
}

/** Change le statut d'une lacune (+ agentId optionnel). Renvoie la lacune màj ou null. */
export function markGap(
  id: string,
  status: GapStatus,
  patch: { agentId?: string } = {},
  now: number = Date.now(),
): OpenGap | null {
  const list = loadGaps()
  const i = list.findIndex((g) => g.id === id)
  if (i < 0) return null
  list[i] = {
    ...list[i]!,
    status,
    agentId: patch.agentId ?? list[i]!.agentId,
    updatedAt: new Date(now).toISOString(),
  }
  saveGaps(list)
  return list[i]!
}
