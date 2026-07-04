// #176-global — Stratège GLOBAL proactif : le SPINE PUR de synthèse (É1).
//
// `synthesize(signals, previousState, now) → Briefing` est une fonction PURE :
// zéro I/O, zéro réseau, zéro LLM, `now` injecté. Elle transforme des signaux
// bruts (émis par les collecteurs É2, hors périmètre ici) en un briefing conseil
// borné, en appliquant des RÈGLES DE SAILLANCE DÉTERMINISTES — même esprit que
// `analyzeEvents` de l'Observateur-Conseil (MangoQA) et la dédup par `sig` de
// `self-evolution.ts` (#168).
//
// Principes gravés (plan #176, D4/D7) :
//  - Le déterminisme TRIE (ce qui monte au briefing) ; aucun LLM ici.
//  - Dédup STRICTE par `sig` : un signal déjà vu incrémente `hits`, jamais de doublon.
//  - Un `sig` déjà `rejete` (ou `accepte`) dans `previousState` n'est JAMAIS re-proposé.
//  - Un item ne « monte » qu'après ré-observation (bonus de `hits`) — anti-bruit.
//  - Bornage anti-spam : un briefing utile est COURT (cap par catégorie).
//  - Dégradation propre : une entrée manquante/vide/corrompue ne lève JAMAIS.

import {
  type Alerte,
  type Briefing,
  type BriefingItem,
  type ItemKind,
  type Proposition,
  type QuestionDemande,
  type SeenSignal,
  type Signal,
  type StrategistState,
  isSignal,
  normalizeState,
} from "./stratege-global-model.js"

// ————————————————————————————————————————————————————————————————
// Réglages de saillance (surchargeables pour les tests — patron ObserverOptions).
// ————————————————————————————————————————————————————————————————

export interface SynthOptions {
  /** Fenêtre glissante (ms) : on ignore les signaux plus vieux. Défaut 7 j. */
  windowMs?: number
  /** Saillance minimale pour qu'un item monte au briefing. */
  minSaillance?: number
  /** Nombre de signaux d'une même FAMILLE (source+type) qui fait une TENDANCE. */
  trendMin?: number
  /** Bonus de saillance appliqué à une tendance montante. */
  trendBonus?: number
  /** Poids d'une ré-observation (par `hits` au-delà du premier). */
  hitsWeight?: number
  /** Plafond de `hits` pris en compte dans la saillance (anti-emballement). */
  hitsCap?: number
  /** Bornes anti-spam par catégorie. */
  maxPropositions?: number
  maxAlertes?: number
  maxQuestions?: number
}

const DEFAULTS: Required<SynthOptions> = {
  windowMs: 7 * 24 * 60 * 60 * 1000,
  minSaillance: 0.5,
  trendMin: 3,
  trendBonus: 0.6,
  hitsWeight: 0.25,
  hitsCap: 4,
  maxPropositions: 5,
  maxAlertes: 5,
  maxQuestions: 2,
}

// ————————————————————————————————————————————————————————————————
// Cœur d'analyse (interne) — partagé par synthesize ET advanceState.
// ————————————————————————————————————————————————————————————————

interface Candidate {
  sig: string
  kind: ItemKind
  titre: string
  corps: string
  sources: string[]
  hits: number
  saillance: number
  /** Renseigné pour les questions de demande (É6). */
  demande?: string
  correlations?: string[]
}

interface Analysis {
  candidates: Candidate[]
  /** Tous les `sig` observés cette synthèse (y compris sous le seuil et tendances). */
  observed: Set<string>
  windowFrom: number
}

const clip = (s: unknown, n: number): string => (typeof s === "string" ? s.trim().slice(0, n) : "")

/** Le statut connu d'un `sig` dans l'état précédent, ou undefined si inédit. */
function statusOf(state: StrategistState, sig: string): string | undefined {
  return state.items.find((i) => i.sig === sig)?.status
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

/** Rédige (déterministe, zéro LLM) le corps d'un item à partir de son groupe. */
function drafts(source: string, subject: string, count: number, sample: Signal): { titre: string; corps: string } {
  const subj = subject || sample.type || source
  const detail = clip(sample.detail, 200)
  const val = typeof sample.value === "number" ? ` (${sample.value})` : ""
  return {
    titre: `${source} — ${subj}`.slice(0, 90),
    corps: `${count} observation(s) sur « ${subj} »${val}${detail ? ` : ${detail}` : ""}.`,
  }
}

/** Le moteur déterministe. PUR. Ne lève jamais (entrées filtrées en amont). */
function analyze(signals: Signal[], state: StrategistState, now: number, opts: Required<SynthOptions>): Analysis {
  const windowFrom = now - opts.windowMs
  const valid = signals.filter((s) => isSignal(s) && s.ts >= windowFrom && s.ts <= now)

  // Regroupement par FAMILLE (source+type) pour la détection de tendance…
  const families = new Map<string, Signal[]>()
  for (const s of valid) {
    const key = `${s.source}:${s.type ?? ""}`
    const arr = families.get(key) ?? []
    arr.push(s)
    families.set(key, arr)
  }

  const candidates: Candidate[] = []
  const observed = new Set<string>()

  const bump = (sig: string): number => (state.seen[sig]?.hits ?? 0) + 1
  const rejected = (sig: string): boolean => {
    const st = statusOf(state, sig)
    // rejeté OU accepté → traité, jamais re-proposé (D7). reporté/pending → réapparaît.
    return st === "rejete" || st === "accepte"
  }

  for (const [famKey, famSignals] of families) {
    const [source] = famKey.split(":")
    const rising = famSignals.length >= opts.trendMin

    if (rising) {
      // Une TENDANCE montante devient UNE alerte agrégée (jamais N items spammy).
      const sig = `trend:${famKey}`
      observed.add(sig)
      if (!rejected(sig)) {
        const hits = bump(sig)
        const subjects = [...new Set(famSignals.map((s) => clip(s.subject, 40)).filter(Boolean))].slice(0, 3)
        const avgPoids = famSignals.reduce((a, s) => a + s.poids, 0) / famSignals.length
        candidates.push({
          sig,
          kind: "alerte",
          titre: `Tendance ${source} — ${famSignals[0]!.type ?? "récurrent"}`.slice(0, 90),
          corps: `${famSignals.length} signaux « ${famSignals[0]!.type ?? source} » sur la fenêtre${
            subjects.length ? ` (ex. ${subjects.join(", ")})` : ""
          } — tendance montante à surveiller.`,
          sources: famSignals.map((s) => s.sig).slice(0, 8),
          hits,
          saillance: avgPoids + opts.trendBonus + opts.hitsWeight * Math.min(hits - 1, opts.hitsCap),
        })
      }
      continue
    }

    // Pas de tendance : chaque `sig` distinct est évalué individuellement.
    const bySig = new Map<string, Signal[]>()
    for (const s of famSignals) {
      const arr = bySig.get(s.sig) ?? []
      arr.push(s)
      bySig.set(s.sig, arr)
    }
    for (const [sig, group] of bySig) {
      observed.add(sig)
      if (rejected(sig)) continue
      const hits = bump(sig)
      const basePoids = Math.max(...group.map((s) => s.poids))
      const saillance = basePoids + opts.hitsWeight * Math.min(hits - 1, opts.hitsCap)
      if (saillance < opts.minSaillance) continue // seuil : sous le seuil, on ne monte pas (mais on l'a « vu »)
      const sample = group[0]!
      const subject = clip(sample.subject, 60)
      const { titre, corps } = drafts(source!, subject, group.length, sample)
      const kind: ItemKind =
        sample.source === "demandes"
          ? "question-demande"
          : sample.nature === "opportunite"
            ? "suggestion"
            : "alerte"
      candidates.push({
        sig,
        kind,
        titre,
        corps,
        sources: group.map((s) => s.sig).slice(0, 8),
        hits,
        saillance,
        ...(kind === "question-demande" ? { demande: clip(sample.detail, 200), correlations: group.map((s) => s.sig) } : {}),
      })
    }
  }

  // Tri déterministe : saillance ↓ puis hits ↓ (les faits récurrents remontent).
  candidates.sort((a, b) => b.saillance - a.saillance || b.hits - a.hits)
  return { candidates, observed, windowFrom }
}

/** Construit un item de briefing (statut pending) en réutilisant l'id/createdAt
 *  d'un item pending/reporte préexistant de même `sig` (dédup, pas de doublon). */
function toItem(c: Candidate, state: StrategistState, iso: string): BriefingItem {
  const prev = state.items.find((i) => i.sig === c.sig && (i.status === "pending" || i.status === "reporte"))
  const base = {
    id: prev?.id ?? `strat_${c.sig}`.slice(0, 90),
    sig: c.sig,
    titre: c.titre,
    corps: c.corps,
    sources: c.sources,
    status: (prev?.status ?? "pending") as "pending" | "reporte",
    hits: c.hits,
    saillance: c.saillance,
    createdAt: prev?.createdAt ?? iso,
    updatedAt: iso,
  }
  if (c.kind === "question-demande") {
    return { ...base, kind: "question-demande", demande: c.demande, correlations: c.correlations } as QuestionDemande
  }
  if (c.kind === "suggestion") return { ...base, kind: "suggestion" } as Proposition
  return { ...base, kind: "alerte" } as Alerte
}

// ————————————————————————————————————————————————————————————————
// API PUBLIQUE.
// ————————————————————————————————————————————————————————————————

/**
 * SPINE PUR. Synthétise un briefing conseil à partir de signaux bruts et de
 * l'état précédent. Déterministe, `now` injecté, NE LÈVE JAMAIS.
 */
export function synthesize(
  signals: Signal[] | null | undefined,
  previousState: StrategistState | null | undefined,
  now: number,
  options: SynthOptions = {},
): Briefing {
  const opts: Required<SynthOptions> = { ...DEFAULTS, ...options }
  const state = normalizeState(previousState)
  const nowMs = Number.isFinite(now) ? now : Date.now()
  const iso = new Date(nowMs).toISOString()

  let candidates: Candidate[] = []
  let windowFrom = nowMs - opts.windowMs
  try {
    const list = Array.isArray(signals) ? signals.filter(isSignal) : []
    const a = analyze(list, state, nowMs, opts)
    candidates = a.candidates
    windowFrom = a.windowFrom
  } catch {
    candidates = [] // dégradation propre : jamais de throw remonté à l'appelant.
  }

  const propositions: Proposition[] = []
  const alertes: Alerte[] = []
  const questions: QuestionDemande[] = []
  for (const c of candidates) {
    const item = toItem(c, state, iso)
    if (item.kind === "suggestion" && propositions.length < opts.maxPropositions) propositions.push(item)
    else if (item.kind === "alerte" && alertes.length < opts.maxAlertes) alertes.push(item)
    else if (item.kind === "question-demande" && questions.length < opts.maxQuestions) questions.push(item)
  }

  const total = propositions.length + alertes.length + questions.length
  const resume =
    total === 0
      ? "Rien de saillant sur la fenêtre — aucun item au-dessus du seuil (bruit normal)."
      : `Depuis la dernière synthèse : ${alertes.length} alerte(s), ${propositions.length} proposition(s), ${questions.length} question(s).`

  return {
    generatedAt: iso,
    windowFrom: new Date(windowFrom).toISOString(),
    windowTo: iso,
    propositions,
    alertes,
    questions,
    resume,
  }
}

/**
 * Fait avancer l'état durable après une synthèse : incrémente `hits`/`lastSeen`
 * de TOUS les `sig` observés (y compris sous le seuil — un item ne monte qu'après
 * ré-observation), fusionne les items du briefing (dédup par `sig`, jamais de
 * doublon), préserve les statuts pilotés par Raf (accepte/rejete/reporte),
 * journalise, et borne la taille. PUR, ne lève jamais.
 *
 * Ce helper est le pont vers le store (É3) ; le spine `synthesize` reste pur et
 * autonome, mais l'accumulation cross-session des `hits` passe par ici.
 */
export function advanceState(
  previousState: StrategistState | null | undefined,
  signals: Signal[] | null | undefined,
  briefing: Briefing,
  now: number,
  options: SynthOptions & { maxItems?: number; maxJournal?: number } = {},
): StrategistState {
  const opts: Required<SynthOptions> = { ...DEFAULTS, ...options }
  const maxItems = options.maxItems ?? 200
  const maxJournal = options.maxJournal ?? 100
  const state = normalizeState(previousState)
  const nowMs = Number.isFinite(now) ? now : Date.now()
  const iso = new Date(nowMs).toISOString()

  // 1. Mettre à jour `seen` pour tout `sig` observé (même sous le seuil).
  const seen: Record<string, SeenSignal> = { ...state.seen }
  try {
    const list = Array.isArray(signals) ? signals.filter(isSignal) : []
    const { observed } = analyze(list, state, nowMs, opts)
    for (const sig of observed) {
      const prev = seen[sig]
      seen[sig] = {
        hits: (prev?.hits ?? 0) + 1,
        firstSeen: prev?.firstSeen || iso,
        lastSeen: iso,
      }
    }
  } catch {
    // dégradation : on garde `seen` inchangé.
  }

  // 2. Fusionner les items du briefing (dédup par `sig`), préserver les statuts.
  const byId = new Map<string, BriefingItem>()
  for (const i of state.items) byId.set(i.sig, i)
  const briefItems: BriefingItem[] = [...briefing.propositions, ...briefing.alertes, ...briefing.questions]
  for (const bi of briefItems) {
    const existing = byId.get(bi.sig)
    if (existing && existing.status !== "pending") {
      // statut piloté par Raf (accepte/rejete/reporte) : on ne l'écrase pas,
      // on remonte juste hits/updatedAt.
      byId.set(bi.sig, { ...existing, hits: bi.hits, updatedAt: iso } as BriefingItem)
    } else {
      byId.set(bi.sig, bi)
    }
  }

  const items = [...byId.values()]
    .sort((a, b) => b.hits - a.hits || (b.updatedAt < a.updatedAt ? -1 : 1))
    .slice(0, maxItems)

  const journal = [
    ...state.journal,
    {
      at: iso,
      propositions: briefing.propositions.length,
      alertes: briefing.alertes.length,
      questions: briefing.questions.length,
      resume: briefing.resume,
    },
  ].slice(-maxJournal)

  return {
    version: state.version,
    items,
    seen,
    lastRunAt: iso,
    windowFrom: briefing.windowFrom,
    journal,
  }
}
