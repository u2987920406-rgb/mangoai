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
import { atomicWriteFileSync, dataDir } from "../safe-io.js"
import { loadSpecialists, type SpecialistAgent } from "../specialist/specialist-agents.js"

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
  /** (2026-07-07, revue Fable — recommandation #1) Nombre de tentatives d'auto-forge
   *  déjà effectuées sur cette lacune (échouées, sinon elle serait "forged"). Plafonné
   *  par SELF_EVOLVE_MAX_FORGE_ATTEMPTS — au-delà, l'auto-forge n'y retouche plus (la
   *  lacune reste "proposed" mais attend une validation manuelle dans l'Atelier au lieu
   *  de re-dépenser de l'Opus à chaque run). Absent = 0 (gaps persistées avant ce champ,
   *  ou construites à la main dans un test/appelant existant — rétrocompatible). */
  forgeAttempts?: number
  lastForgeAttemptAt?: string
  createdAt: string
  updatedAt: string
}

const MAX_GAPS = 200

/** Chemin du store, surchargeable par env (testabilité). Résolu paresseusement. */
function gapsFile(): string {
  return process.env.OPEN_GAPS_FILE ?? dataDir("open-gaps.json")
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
 * Un agent forgé COUVRE-t-il déjà ce blocage ? Recouvrement de tokens entre le BLOCAGE
 * (blocker + detail UNIQUEMENT — pas la tâche : le texte de la tâche partage trop de mots
 * banals avec des agents non pertinents → faux positifs, ex. « page d'accueil ») et
 * (lacune + tags + rôle + déclencheurs) de chaque agent. Renvoie le meilleur agent
 * couvrant (seuil souple), ou null si la lacune est NOUVELLE. PUR.
 */
export function coversGap(
  blocker: string,
  detail: string,
  agents: SpecialistAgent[],
): SpecialistAgent | null {
  const need = tokens(`${blocker} ${detail}`)
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

/**
 * (2026-07-07, revue Fable — correctif #8) Sélectionne, au-delà de MAX_GAPS, LESQUELLES
 * évincer. L'ancien `slice(0, MAX_GAPS)` gardait les 200 plus ANCIENNES et jetait
 * silencieusement toute lacune NOUVELLE (éviction inversée — bug trouvé en revue, jamais
 * constaté en pratique car le registre n'a jamais atteint 200). Ordre d'éviction : les
 * lacunes CLOSES (dismissed/forged) les plus anciennes d'abord ; si ça ne suffit pas
 * (registre saturé de lacunes encore actives), les actives les plus anciennes en dernier
 * recours — jamais les plus récentes. PUR, testable indépendamment de l'I/O.
 */
export function evictOverflow(list: OpenGap[], max: number): OpenGap[] {
  if (list.length <= max) return list
  const isClosed = (g: OpenGap) => g.status === "dismissed" || g.status === "forged"
  const byAgeAsc = (a: OpenGap, b: OpenGap) => a.updatedAt.localeCompare(b.updatedAt)
  let overflow = list.length - max
  const closedOldestFirst = list.filter(isClosed).sort(byAgeAsc)
  const dropIds = new Set(closedOldestFirst.slice(0, overflow).map((g) => g.id))
  let out = list.filter((g) => !dropIds.has(g.id))
  overflow = out.length - max
  if (overflow > 0) {
    const activeOldestFirst = out.filter((g) => !isClosed(g)).sort(byAgeAsc)
    const dropIds2 = new Set(activeOldestFirst.slice(0, overflow).map((g) => g.id))
    out = out.filter((g) => !dropIds2.has(g.id))
  }
  return out
}

/** Persiste le store (atomique, plafonné). Ne lève jamais sur des entrées vides. */
export function saveGaps(list: OpenGap[]): void {
  const clean = evictOverflow((Array.isArray(list) ? list : []).filter(isGap), MAX_GAPS)
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
    if (coversGap(blocker, detail, agents)) {
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
      forgeAttempts: 0,
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

/**
 * (2026-07-22, demande de Raf) Score de valeur 0-100 : « ça vaut le coup de forger un
 * agent pour cette lacune ? ». Aucune mesure de bénéfice réel n'existe (on ne sait pas
 * ce qu'un agent aurait évité) — ce score est un PROXY délibérément simple à partir de
 * 3 signaux déjà collectés, pas une prédiction. PUR / testable / ne lève jamais :
 *   - récurrence (`hits`) : un blocage qui revient plusieurs fois est un vrai motif,
 *     pas un accident isolé → poids dominant, plafonné à 5 récurrences (rendements
 *     décroissants au-delà).
 *   - échecs déjà tentés (`forgeAttempts`) : si l'auto-forge (ou une tentative manuelle)
 *     a déjà échoué sans combler la lacune, chaque échec baisse la confiance que retenter
 *     suffira — pénalité, plafonnée à 5 tentatives.
 *   - fraîcheur (`updatedAt`) : une lacune qui n'a plus été rencontrée depuis longtemps
 *     est probablement devenue non pertinente (le contexte qui l'a produite a changé,
 *     ex. la génération nocturne — source principale historique — s'est arrêtée) →
 *     pénalité de staleness au-delà de 14 puis 30 jours.
 */
export function gapValueScore(gap: OpenGap, now: number = Date.now()): number {
  const recurrence = Math.min(gap.hits, 5) * 20
  const failurePenalty = Math.min(gap.forgeAttempts ?? 0, 5) * 12
  const daysSinceUpdate = (now - new Date(gap.updatedAt).getTime()) / 86_400_000
  const staleness = daysSinceUpdate > 30 ? 20 : daysSinceUpdate > 14 ? 10 : 0
  return Math.max(0, Math.min(100, recurrence - failurePenalty - staleness))
}

/** Lacunes à traiter (proposed/forging), les plus VALABLES d'abord (score, puis fréquence
 *  en départage) — pas juste les plus fréquentes : une lacune fréquente mais déjà tentée
 *  3 fois sans succès et vieille de 2 mois ne doit pas dominer une lacune fraîche et jamais
 *  retentée. */
export function listOpenGaps(now: number = Date.now()): OpenGap[] {
  return loadGaps()
    .filter((g) => g.status === "proposed" || g.status === "forging")
    .sort((a, b) => gapValueScore(b, now) - gapValueScore(a, now) || b.hits - a.hits)
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

/** (2026-07-07, revue Fable — recommandation #1) Comptabilise une TENTATIVE d'auto-forge
 *  sur une lacune (avant d'appeler forgeForGap — succès ou échec, l'essai est compté).
 *  Renvoie la lacune mise à jour ou null si id inconnu. Ne lève jamais. */
export function recordForgeAttempt(id: string, now: number = Date.now()): OpenGap | null {
  const list = loadGaps()
  const i = list.findIndex((g) => g.id === id)
  if (i < 0) return null
  const iso = new Date(now).toISOString()
  list[i] = {
    ...list[i]!,
    forgeAttempts: (list[i]!.forgeAttempts ?? 0) + 1,
    lastForgeAttemptAt: iso,
    updatedAt: iso,
  }
  saveGaps(list)
  return list[i]!
}

/** Le plafond de tentatives d'auto-forge est-il atteint pour cette lacune ? PUR. */
export function forgeAttemptsExhausted(gap: OpenGap, maxAttempts: number): boolean {
  return (gap.forgeAttempts ?? 0) >= maxAttempts
}
