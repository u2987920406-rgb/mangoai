// #176-global — Stratège GLOBAL proactif : MODÈLE de données (types + schémas).
//
// Ce fichier ne contient AUCUNE logique métier ni I/O : uniquement les types du
// spine et leurs gardes de validation runtime (« schémas »), dans le style du
// repo (type-guards + factory, pas de zod ici — cf. self-evolution.ts). Il est
// partagé par le spine pur (stratege-global.ts), les collecteurs (É2), le store
// (É3) et le surfaçage (É5).
//
// Rappel de portée (plan #176, D2) : « global » = cross-projet ET cross-session.
// Le spine est PUR ; toute persistance/I/O vit ailleurs. Ici, que des données.

// ————————————————————————————————————————————————————————————————
// 1. SIGNAL — une observation brute produite par UN collecteur (É2).
// ————————————————————————————————————————————————————————————————

/** Le collecteur d'origine d'un signal (D4 : 8 sondes fail-open). */
export type SignalSource =
  | "qa" // ← readObserverReport (patterns d'échec QA, déjà calculés)
  | "bus" // ← bus-events.jsonl (cost/turns/duration) + global-budget
  | "traces" // ← escalades Claude (souveraineté)
  | "reuse" // ← reuseRatePct (la mémoire paie-t-elle ?)
  | "blocages" // ← classes de blocage #164 agrégées cross-run
  | "lacunes" // ← open-gaps.json (#168 : lacunes de capacité)
  | "memoire" // ← axioms-conflicts / axioms-quarantine
  | "demandes" // ← historique demandes↔issues (É6, structure prête)

/** Un signal est-il un PROBLÈME (→ alerte) ou une OPPORTUNITÉ (→ suggestion) ?
 *  Défaut appliqué par le spine si absent : "probleme". */
export type SignalNature = "probleme" | "opportunite"

/** Une observation brute, normalisée, émise par un collecteur. C'est la SEULE
 *  entrée du spine : il ne lit jamais un fichier lui-même. */
export interface Signal {
  /** Signature de dédup STABLE (slug). Deux observations du même fait partagent
   *  le même `sig` → le spine incrémente `hits` au lieu de dupliquer. */
  sig: string
  /** Le collecteur d'origine (traçabilité + regroupement par famille). */
  source: SignalSource
  /** Poids / sévérité de l'observation, 0..1 (saillance de base). */
  poids: number
  /** Horodatage epoch ms de l'observation (fenêtre glissante). */
  ts: number
  /** Sous-type au sein de la source (ex. "escalade-claude", "cout-eleve") —
   *  sert à regrouper une FAMILLE pour la détection de tendance. */
  type?: string
  /** Nature : problème (alerte) ou opportunité (suggestion). Défaut "probleme". */
  nature?: SignalNature
  /** Sujet lisible (ex. le nom de la branche/règle/projet concerné). */
  subject?: string
  /** Détail humain court (pour la rédaction de l'item). */
  detail?: string
  /** Mesure numérique optionnelle (ex. $ dépensés, % réutilisation) — libre. */
  value?: number
}

// ————————————————————————————————————————————————————————————————
// 2. ITEMS DE BRIEFING — Proposition / Alerte / QuestionDemande.
// ————————————————————————————————————————————————————————————————

/** Statut piloté par Raf (D7 : « Mango propose, Raf valide »). */
export type ItemStatus = "pending" | "accepte" | "rejete" | "reporte"

/** Discriminant de l'item. */
export type ItemKind = "suggestion" | "alerte" | "question-demande"

/** Champs communs à tout item de briefing. */
interface BriefingItemBase {
  id: string
  /** Signature de dédup (héritée du/des signaux motivants, ou "trend:<famille>"). */
  sig: string
  kind: ItemKind
  titre: string
  corps: string
  /** Les `sig` des signaux qui l'ont motivé — traçabilité (D4). */
  sources: string[]
  status: ItemStatus
  /** Nombre de synthèses où le fait a été (ré)observé → priorisation. */
  hits: number
  /** Saillance calculée par le spine (tri + bornage anti-spam). */
  saillance: number
  createdAt: string
  updatedAt: string
}

/** Une suggestion actionnable (« voici ce que je propose de faire »). */
export interface Proposition extends BriefingItemBase {
  kind: "suggestion"
}

/** Un problème détecté (« ceci cloche avant qu'on me le signale »). */
export interface Alerte extends BriefingItemBase {
  kind: "alerte"
}

/** Une remise en question d'une DEMANDE de Raf (patron Œil Design, D5).
 *  Structure PRÉVUE ici mais non remplie avant É6 (gate STRATEGE_QUESTION_DEMANDE) :
 *  le spine sait la produire si un collecteur `demandes` émet des signaux, mais
 *  aucun tel collecteur n'existe encore. */
export interface QuestionDemande extends BriefingItemBase {
  kind: "question-demande"
  /** La demande de Raf remise en question (rempli par É6). */
  demande?: string
  /** Les faits/runs qui sourcent la question (jamais une opinion en l'air). */
  correlations?: string[]
}

export type BriefingItem = Proposition | Alerte | QuestionDemande

// ————————————————————————————————————————————————————————————————
// 3. BRIEFING — le livrable du spine (borné, conseil, jamais action).
// ————————————————————————————————————————————————————————————————

export interface Briefing {
  generatedAt: string
  /** Bornes de la fenêtre glissante analysée. */
  windowFrom: string
  windowTo: string
  propositions: Proposition[]
  alertes: Alerte[]
  questions: QuestionDemande[]
  /** Résumé une ligne (« Depuis hier : 2 observations, 1 proposition… »). */
  resume: string
}

// ————————————————————————————————————————————————————————————————
// 4. ÉTAT PERSISTANT — survit au reboot (cross-session, D2/D3).
// ————————————————————————————————————————————————————————————————

/** Trace d'un `sig` déjà vu → hits cumulés (un item ne « monte » qu'après
 *  ré-observation : mitigation du bruit, plan §4.1). */
export interface SeenSignal {
  hits: number
  firstSeen: string
  lastSeen: string
}

/** Une entrée append-only du journal des briefings émis (observabilité). */
export interface JournalEntry {
  at: string
  propositions: number
  alertes: number
  questions: number
  resume: string
}

/** L'état complet, durable, du Stratège (le « plan de contrôle », D2). */
export interface StrategistState {
  version: number
  /** Items proposés + leur statut piloté par Raf (dédup par `sig`). */
  items: BriefingItem[]
  /** Signaux vus, hits par `sig` (accumulation cross-session). */
  seen: Record<string, SeenSignal>
  lastRunAt?: string
  windowFrom?: string
  /** Trace bornée des briefings émis. */
  journal: JournalEntry[]
}

export const STRATEGIST_STATE_VERSION = 1

/** Un état neuf, vide (bootstrap). PUR. */
export function emptyStrategistState(): StrategistState {
  return { version: STRATEGIST_STATE_VERSION, items: [], seen: {}, journal: [] }
}

// ————————————————————————————————————————————————————————————————
// 5. SCHÉMAS — gardes de validation runtime (ne lèvent jamais).
// ————————————————————————————————————————————————————————————————

const ITEM_KINDS: ReadonlySet<string> = new Set(["suggestion", "alerte", "question-demande"])
const ITEM_STATUSES: ReadonlySet<string> = new Set(["pending", "accepte", "rejete", "reporte"])

/** Un signal brut est-il exploitable ? (sig non vide, poids/ts finis). PUR. */
export function isSignal(x: unknown): x is Signal {
  if (!x || typeof x !== "object") return false
  const s = x as Partial<Signal>
  return (
    typeof s.sig === "string" &&
    s.sig.trim().length > 0 &&
    typeof s.source === "string" &&
    typeof s.poids === "number" &&
    Number.isFinite(s.poids) &&
    typeof s.ts === "number" &&
    Number.isFinite(s.ts)
  )
}

/** Un item de briefing persisté est-il bien formé ? PUR. */
export function isBriefingItem(x: unknown): x is BriefingItem {
  if (!x || typeof x !== "object") return false
  const i = x as Partial<BriefingItem>
  return (
    typeof i.id === "string" &&
    typeof i.sig === "string" &&
    typeof i.kind === "string" &&
    ITEM_KINDS.has(i.kind) &&
    typeof i.status === "string" &&
    ITEM_STATUSES.has(i.status) &&
    typeof i.hits === "number"
  )
}

/** Un état persistant chargé est-il exploitable ? PUR. */
export function isStrategistState(x: unknown): x is StrategistState {
  if (!x || typeof x !== "object") return false
  const s = x as Partial<StrategistState>
  return Array.isArray(s.items) && !!s.seen && typeof s.seen === "object"
}

/** Ramène n'importe quelle valeur à un StrategistState sûr (filtre les entrées
 *  invalides, ne lève jamais). Utilisé par le spine ET le store (É3). PUR. */
export function normalizeState(x: unknown): StrategistState {
  if (!isStrategistState(x)) return emptyStrategistState()
  const s = x as StrategistState
  const items = (Array.isArray(s.items) ? s.items : []).filter(isBriefingItem)
  const seen: Record<string, SeenSignal> = {}
  for (const [k, v] of Object.entries(s.seen ?? {})) {
    if (v && typeof v === "object" && typeof (v as SeenSignal).hits === "number") {
      seen[k] = {
        hits: (v as SeenSignal).hits,
        firstSeen: (v as SeenSignal).firstSeen ?? "",
        lastSeen: (v as SeenSignal).lastSeen ?? "",
      }
    }
  }
  return {
    version: typeof s.version === "number" ? s.version : STRATEGIST_STATE_VERSION,
    items,
    seen,
    lastRunAt: typeof s.lastRunAt === "string" ? s.lastRunAt : undefined,
    windowFrom: typeof s.windowFrom === "string" ? s.windowFrom : undefined,
    journal: Array.isArray(s.journal) ? s.journal.filter((j) => !!j && typeof j === "object") : [],
  }
}
