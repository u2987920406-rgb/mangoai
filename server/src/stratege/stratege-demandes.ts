// #176-global — Stratège GLOBAL proactif : capteur « REMISE EN QUESTION DE LA
// DEMANDE » (É6, gate STRATEGE_QUESTION_DEMANDE, dépend de STRATEGE_GLOBAL).
//
// HUITIÈME collecteur, MÊME contrat que les 7 d'É2 (stratege-collecteurs.ts) :
// renvoie TOUJOURS un `Signal[]` (source "demandes"), NE LÈVE JAMAIS, fail-open
// par sous-source. La détection est 100% DÉTERMINISTE — ZÉRO LLM (plan #176 D5 :
// « le LLM rédige, il ne détecte pas seul »). Le spine (É1) sait déjà transformer
// un signal `source:"demandes"` en `question-demande` (kind auto), borner à
// `maxQuestions` (défaut 2) et sauter tout `sig` déjà `rejete`/`accepte`.
//
// MÉCANISME DE CORRÉLATION DÉTERMINISTE (D5, seuil N≥2 configurable) :
//   1. On lit les `.chat-history.json` de chaque projet du workspace (role "user"
//      = une DEMANDE de Raf ; les entrées qui suivent jusqu'à la demande suivante
//      = son ISSUE).
//   2. Chaque demande est réduite à un TYPE stable (les `typeTokens` premiers mots
//      normalisés — coarse, honnête : cf. plan §4.3 « heuristique, pas vérité »),
//      p.ex. « génère une image de chat » et « … de chien » → même type.
//   3. Une OCCURRENCE-PROBLÈME est comptée quand l'issue d'une demande a ÉCHOUÉ
//      (une entrée `error`, ou un marqueur d'échec dans le texte) OU quand la
//      demande CONTREDIT une préférence apprise (magasin `.preferences.md` :
//      directives négatives « jamais/évite/pas de … <token> »).
//   4. Un TYPE cumulant ≥ N occurrences-problème DISTINCTES (runs distincts) →
//      UN signal agrégé `demandes:<slug>` (un seul par type : le spine en fait
//      alors une question-demande, jamais une tendance/alerte). Le détail cite
//      PRÉCISÉMENT les runs concernés (sourçage obligatoire, patron Œil Design).
//
// « JAMAIS RE-QUESTIONNÉ SI DÉJÀ TRANCHÉ PAR RAF » — DOUBLE VERROU :
//   (a) ici : on lit l'état persistant et on N'ÉMET PAS un signal dont le `sig`
//       est déjà `rejete`/`accepte` (Raf a répondu « non, c'est voulu »).
//   (b) dans le spine (É1) : `synthesize` re-filtre les `sig` `rejete`/`accepte`.
//   Les deux garantissent le respect du verdict de Raf, même si le pattern brut
//   réapparaît. Le `sig` est STABLE (`demandes:<slug>`) → la dédup opère.

import { WORKSPACE_DIR } from "../projects.js"
import { listProjects as listProjectsReal, projectDir as projectDirReal } from "../projects.js"
import { loadHistory as loadHistoryReal, type ChatEntry } from "../history.js"
import { loadPreferences as loadPreferencesReal } from "../preferences.js"
import { loadStrategistState } from "./stratege-store.js"
import { flag } from "../flags.js"
import type { Signal } from "./stratege-global-model.js"
import type { StrategistState } from "./stratege-global-model.js"

// ————————————————————————————————————————————————————————————————
// Réglages (surchargeables pour les tests — patron ObserverOptions/SynthOptions).
// ————————————————————————————————————————————————————————————————

export interface CollectDemandesOptions {
  /** Seuil de corrélation : nombre d'occurrences-problème DISTINCTES d'un même
   *  type de demande à partir duquel on questionne. Défaut 2 (plan D5 : N≥2). */
  threshold?: number
  /** Nombre de mots normalisés retenus pour la clé de TYPE (coarse). Défaut 4. */
  typeTokens?: number
  /** Fenêtre glissante (ms) : on ignore les demandes plus vieilles. Défaut 30 j. */
  windowMs?: number
  /** Marqueurs d'échec cherchés dans l'issue d'une demande (regex). */
  failureMarkers?: RegExp
  /** Nombre max de runs cités dans le détail d'une question. Défaut 4. */
  maxCitations?: number
}

// NB : testé contre le texte NORMALISÉ (accents retirés, minuscules, ponctuation
// → espaces) — d'où des marqueurs SANS accents. Tester sur le texte brut casserait
// les fins de mot accentuées (« raté » : le `\b` final échoue car « é » n'est pas
// un caractère de mot).
const DEFAULT_FAILURE_MARKERS =
  /\b(echec|erreur|impossible|rate|rater|ratee|abandon|failed|error|insatisfais|pas satisfait|ne (?:fonctionne|marche)|pas (?:pu|reussi)|recommenc|refai[st]|a refaire)\b/

const DEFAULTS: Required<CollectDemandesOptions> = {
  threshold: 2,
  typeTokens: 4,
  windowMs: 30 * 24 * 60 * 60 * 1000,
  failureMarkers: DEFAULT_FAILURE_MARKERS,
  maxCitations: 4,
}

// ————————————————————————————————————————————————————————————————
// Deps injectables (tests : historique fake, zéro vrai fichier).
// ————————————————————————————————————————————————————————————————

export interface CollectDemandesDeps {
  /** Liste des projets du workspace. Défaut : listProjects réel. */
  listProjects?: () => string[]
  /** Répertoire d'un projet. Défaut : projectDir réel. */
  projectDir?: (name: string) => string
  /** Historique de chat d'un projet. Défaut : loadHistory réel (fail-open → []). */
  loadHistory?: (dir: string) => ChatEntry[]
  /** Préférences apprises (markdown). Défaut : loadPreferences(WORKSPACE_DIR). */
  loadPreferences?: () => string
  /** État persistant (pour le verrou anti-re-question). Défaut : loadStrategistState. */
  loadState?: () => StrategistState
  /** Horloge injectable. Défaut : Date.now. */
  now?: () => number
  options?: CollectDemandesOptions
}

// ————————————————————————————————————————————————————————————————
// Helpers déterministes (pas de LLM, pas d'I/O).
// ————————————————————————————————————————————————————————————————

const stripAccents = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "")

function normalizeText(s: unknown): string {
  return stripAccents(typeof s === "string" ? s : "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Réduit une demande à une clé de TYPE stable : les `typeTokens` premiers mots
 *  normalisés. Coarse par conception (plan §4.3) — deux demandes qui commencent
 *  pareil (« génère une image de … ») partagent le même type malgré l'objet. */
function demandeType(text: string, typeTokens: number): string {
  const tokens = normalizeText(text).split(" ").filter(Boolean)
  if (tokens.length === 0) return ""
  return tokens.slice(0, Math.max(1, typeTokens)).join(" ")
}

const slug = (s: string): string => s.replace(/\s+/g, "-").slice(0, 60)

/** Extrait des préférences un ensemble de tokens INTERDITS (directives négatives
 *  « jamais/évite/pas de/sans … <token> »). Déterministe, borné. */
function forbiddenTokens(preferences: string): Set<string> {
  const out = new Set<string>()
  const norm = normalizeText(preferences)
  if (!norm) return out
  // capture le mot qui suit une négation de directive
  const re = /\b(?:jamais|evite|eviter|pas de|sans|proscri\w*|interdi\w*|ne pas)\s+([a-z0-9]+)/g
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(norm)) && guard++ < 200) {
    const w = m[1]
    if (w && w.length >= 3) out.add(w)
  }
  return out
}

interface Occurrence {
  /** Référence lisible du run concerné (cité dans la question — sourçage). */
  run: string
  /** Cause : échec constaté ou contradiction de préférence. */
  cause: "echec" | "contradiction"
  ts: number
  /** Texte brut de la demande (échantillon pour la rédaction). */
  demande: string
}

// ————————————————————————————————————————————————————————————————
// Détection PURE (deps injectées) — le cœur testable.
// ————————————————————————————————————————————————————————————————

/**
 * Capteur `demandes` (huitième collecteur). Détection déterministe de corrélation
 * demande↔issue cross-session. Renvoie TOUJOURS un `Signal[]`, NE LÈVE JAMAIS.
 * Un seul signal agrégé par type de demande corrélé (le spine en fait 1 question).
 */
export function collectDemandes(deps: CollectDemandesDeps = {}): Signal[] {
  try {
    const listProjects = deps.listProjects ?? listProjectsReal
    const projectDir = deps.projectDir ?? projectDirReal
    const loadHistory = deps.loadHistory ?? loadHistoryReal
    const loadPreferences = deps.loadPreferences ?? (() => loadPreferencesReal(WORKSPACE_DIR))
    const loadState = deps.loadState ?? (() => loadStrategistState())
    const now = (deps.now ?? Date.now)()
    const opts: Required<CollectDemandesOptions> = { ...DEFAULTS, ...deps.options }
    const windowFrom = now - opts.windowMs

    // Verrou (a) : ne jamais re-questionner un `sig` déjà tranché par Raf.
    let settled = new Set<string>()
    try {
      const state = loadState()
      settled = new Set(
        (state?.items ?? [])
          .filter((i) => i.status === "rejete" || i.status === "accepte")
          .map((i) => i.sig),
      )
    } catch {
      settled = new Set()
    }

    let forbidden = new Set<string>()
    try {
      forbidden = forbiddenTokens(loadPreferences())
    } catch {
      forbidden = new Set()
    }

    let projects: string[] = []
    try {
      projects = listProjects()
    } catch {
      projects = []
    }
    if (!Array.isArray(projects)) projects = []

    // type → occurrences-problème (dédupliquées par run).
    const byType = new Map<string, Map<string, Occurrence>>()

    const record = (type: string, occ: Occurrence): void => {
      if (!type) return
      const m = byType.get(type) ?? new Map<string, Occurrence>()
      // dédup par run (une même demande ne compte qu'une fois, même si écho).
      if (!m.has(occ.run)) m.set(occ.run, occ)
      byType.set(type, m)
    }

    for (const name of projects.slice(0, 50)) {
      let history: ChatEntry[] = []
      try {
        history = loadHistory(projectDir(name))
      } catch {
        history = []
      }
      if (!Array.isArray(history) || history.length === 0) continue

      for (let i = 0; i < history.length; i++) {
        const e = history[i]!
        if (!e || e.role !== "user" || typeof e.text !== "string") continue
        const tsRaw = Date.parse(e.ts)
        const ts = Number.isFinite(tsRaw) ? tsRaw : now
        if (ts < windowFrom || ts > now) continue

        const type = demandeType(e.text, opts.typeTokens)
        if (!type) continue
        const run = `${name}@${new Date(ts).toISOString().slice(0, 10)}#${i}`

        // ISSUE : scanner les entrées suivantes jusqu'à la prochaine demande.
        let failed = false
        for (let j = i + 1; j < history.length; j++) {
          const f = history[j]!
          if (!f || f.role === "user") break
          if (f.role === "error") { failed = true; break }
          if (typeof f.text === "string" && opts.failureMarkers.test(normalizeText(f.text))) { failed = true; break }
        }
        if (failed) {
          record(type, { run, cause: "echec", ts, demande: e.text })
          continue
        }

        // CONTRADICTION : la demande touche un token interdit par les préférences.
        if (forbidden.size > 0) {
          const words = new Set(normalizeText(e.text).split(" "))
          for (const w of forbidden) {
            if (words.has(w)) {
              record(type, { run, cause: "contradiction", ts, demande: e.text })
              break
            }
          }
        }
      }
    }

    // Émission : un signal agrégé par type ≥ seuil, non déjà tranché.
    const out: Signal[] = []
    for (const [type, occMap] of byType) {
      const occs = [...occMap.values()].sort((a, b) => a.ts - b.ts)
      if (occs.length < opts.threshold) continue // N=1 (sous le seuil) → pas de faux positif

      const sig = `demandes:${slug(type)}`
      if (settled.has(sig)) continue // verrou (a) : déjà tranché par Raf → jamais re-questionné

      const runs = occs.map((o) => o.run).slice(0, opts.maxCitations)
      const cause = occs.every((o) => o.cause === "contradiction")
        ? "contredit une préférence apprise"
        : "a buté / été insatisfaisant"
      const sample = occs[occs.length - 1]!.demande
      const lastTs = occs[occs.length - 1]!.ts

      // Détail = observation SOURCÉE en question ouverte (patron Œil Design D5).
      const detail =
        `Tu m'as demandé « ${sample.trim().slice(0, 100)} » ; les ${occs.length} dernières fois ` +
        `(${runs.join(", ")}) ça ${cause} — je change d'approche / propose une variante, ou c'est voulu ?`

      out.push({
        sig,
        source: "demandes",
        // saillance ≥ minSaillance du spine (0.5) dès 2 occurrences.
        poids: Math.max(0, Math.min(1, 0.5 + 0.2 * occs.length)),
        ts: lastTs,
        type,
        nature: "probleme",
        subject: type,
        detail,
        value: occs.length,
      })
    }
    return out
  } catch {
    return [] // fail-open TOTAL (contrat des collecteurs É2).
  }
}

// ————————————————————————————————————————————————————————————————
// Entrée GATÉE — dépend de STRATEGE_QUESTION_DEMANDE, lui-même dépendant de
// STRATEGE_GLOBAL (voir dépendance ci-dessous).
// ————————————————————————————————————————————————————————————————

/**
 * Version GATÉE du capteur, à câbler dans le pipeline (stratege-run.ts).
 *
 * DÉPENDANCE DE GATES (documentée aussi dans flags.ts) : ce capteur n'est atteint
 * QUE depuis le cycle du Stratège, lequel n'est déclenché que si `STRATEGE_GLOBAL`
 * est ON (`maybeRunStrategistCycle` retourne false avant tout I/O sinon). Donc :
 *   - STRATEGE_GLOBAL OFF → le cycle ne tourne pas → ce capteur n'est jamais
 *     appelé, PEU IMPORTE l'état de STRATEGE_QUESTION_DEMANDE (dépendance stricte).
 *   - STRATEGE_GLOBAL ON + STRATEGE_QUESTION_DEMANDE OFF → ce capteur renvoie []
 *     (aucune question émise, comportement du briefing inchangé).
 *   - Les DEUX ON → le capteur détecte et émet ses signaux.
 */
export function collectDemandesGated(deps: CollectDemandesDeps = {}): Signal[] {
  if (!flag("STRATEGE_QUESTION_DEMANDE")) return []
  return collectDemandes(deps)
}
