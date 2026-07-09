// MangoOS — Mesure de la RÉUTILISATION EFFECTIVE des artefacts (#121).
//
// #118→#120 réinjectent les artefacts pertinents (palettes, composants, skills…)
// avant un build. Mais l'agent les utilise-t-il VRAIMENT ? Ce module ferme la
// boucle de preuve. Signal concret et objectif : l'agent LIT le fichier d'un
// artefact de bibliothèque (`.components/`, `.skills/`, `.procedures/`) pendant un
// tour → c'est une réutilisation effective (les règles disent « READ its code and
// adapt it »). On agrège : taux de tours avec réutilisation + artefacts les plus
// réutilisés. Live sur le Bus, en mémoire, déterministe.
import type { Express, Request, Response } from 'express'
import { getBus, type KernelBus } from './kernel-bus.js'
import { CHAT_TURN_EVENT } from './kernel-chat-bridge.js'
import { listArtifacts } from './kernel-artifacts.js'
import { getBlackboard, type Blackboard } from './kernel-blackboard.js'

/** Événement Bus émis quand un tour a réutilisé ≥ 1 artefact de bibliothèque. */
export const REUSE_EVENT = 'artifact.reuse'

export type ReuseKind = 'component' | 'skill' | 'procedure' | 'palette' | 'artifact'
export interface ReuseHit {
  kind: ReuseKind
  name: string
}

const PATTERNS: Array<{ kind: ReuseKind; re: RegExp }> = [
  { kind: 'component', re: /[\\/]\.components[\\/]([^\\/]+)/ },
  { kind: 'skill', re: /[\\/]\.skills[\\/]([^\\/]+)/ },
  { kind: 'procedure', re: /[\\/]\.procedures[\\/]([^\\/]+)/ },
]

/** Réutilisation via la MÉMOIRE d'artefacts (#156 `chercher_artefact`, L29). Chaque
 * PROVENANCE distincte servie par l'outil ce tour (≠ projet courant) = un artefact
 * réutilisé. Signal COMPLÉMENTAIRE au recouvrement de palette : il ne dépend pas de
 * hex littéraux dans le rendu, donc capte la réutilisation d'identité que l'Élève
 * applique via des classes utilitaires (Tailwind). Couvre palettes ET dossiers de
 * site (#159 P4) puisque les deux remontent dans `chercher_artefact`. Pur, déduplique. */
export function detectArtefactReuse(sources: string[], currentProject?: string): ReuseHit[] {
  const seen = new Set<string>()
  const hits: ReuseHit[] = []
  for (const s of sources ?? []) {
    const name = (s ?? '').trim()
    if (!name || name === currentProject || seen.has(name)) continue
    seen.add(name)
    hits.push({ kind: 'artifact', name })
  }
  return hits
}

/** Détecte les artefacts réutilisés à partir des CHEMINS lus par l'agent ce tour.
 * Pur. Déduplique (lire deux fois le même artefact = une réutilisation). */
export function detectArtifactReads(readPaths: string[]): ReuseHit[] {
  const seen = new Set<string>()
  const hits: ReuseHit[] = []
  for (const p of readPaths) {
    for (const { kind, re } of PATTERNS) {
      const m = re.exec(p)
      if (m) {
        const key = `${kind}:${m[1]}`
        if (!seen.has(key)) {
          seen.add(key)
          hits.push({ kind, name: m[1] })
        }
        break
      }
    }
  }
  return hits
}

// ── Réutilisation de PALETTE (signal par recouvrement de couleurs) ───────────
//
// Une palette n'est pas un FICHIER que l'agent lit : elle est réinjectée dans le
// prompt (#118). Son signal de réutilisation est donc différent — c'est le
// RECOUVREMENT de couleurs réelles entre la palette PRODUITE par le build
// (design.produced) et une palette déjà en mémoire d'un AUTRE projet. Si une part
// suffisante des couleurs produites existe littéralement dans une palette gardée,
// l'agent a réutilisé cet univers visuel plutôt que d'en réinventer un. Honnête
// (couleur portée à l'identique, pas une simple ressemblance d'histogramme) et
// déterministe. On ignore les neutres purs (#000/#fff) : partager seulement du
// noir/blanc n'est pas « réutiliser une palette ».
const NEUTRAL = new Set(['#000000', '#ffffff'])

/** Canonise un hex en #rrggbb minuscule (3 → 6 chiffres). null si invalide. */
function canonHex(c: string): string | null {
  const h = c.trim().toLowerCase().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/.test(h)) return '#' + h.split('').map((x) => x + x).join('')
  if (/^[0-9a-f]{6}$/.test(h)) return '#' + h
  return null
}

/** Couleurs produites non-neutres, canonisées et dédupliquées. */
function meaningfulColors(colors: string[]): string[] {
  const out = new Set<string>()
  for (const c of colors) {
    const h = canonHex(c)
    if (h && !NEUTRAL.has(h)) out.add(h)
  }
  return [...out]
}

/** Recouvrement palette produite → palette candidate : combien de couleurs
 * produites (non-neutres) existent littéralement dans la candidate. Pur. */
export function paletteOverlap(produced: string[], candidate: string[]): { ratio: number; shared: number } {
  const prod = meaningfulColors(produced)
  if (prod.length === 0) return { ratio: 0, shared: 0 }
  const cand = new Set<string>()
  for (const c of candidate) {
    const h = canonHex(c)
    if (h) cand.add(h)
  }
  const shared = prod.filter((c) => cand.has(c)).length
  return { ratio: shared / prod.length, shared }
}

export interface PaletteCandidate {
  project: string
  colors: string[]
}

/** Détecte la réutilisation de palette parmi des candidates (pur, testable).
 * Renvoie AU PLUS un hit (la palette la mieux recouverte) : un build produit une
 * palette, il en réutilise au plus une → comptage propre. */
export function detectPaletteReuseAmong(
  producedColors: string[],
  candidates: PaletteCandidate[],
  opts: { threshold?: number; minShared?: number } = {},
): ReuseHit[] {
  const threshold = opts.threshold ?? 0.5
  const minShared = opts.minShared ?? 2
  let best: { project: string; ratio: number } | null = null
  for (const cand of candidates) {
    const { ratio, shared } = paletteOverlap(producedColors, cand.colors)
    if (shared >= minShared && ratio >= threshold && (!best || ratio > best.ratio)) {
      best = { project: cand.project, ratio }
    }
  }
  return best ? [{ kind: 'palette', name: best.project }] : []
}

/** Réutilisation de palette pour le tour courant : compare les couleurs produites
 * aux palettes du Blackboard d'AUTRES projets. "" / [] si rien de probant. */
export function detectPaletteReuse(
  producedColors: string[],
  opts: { exclude?: string; threshold?: number; minShared?: number; bb?: Blackboard } = {},
): ReuseHit[] {
  if (!producedColors || producedColors.length === 0) return []
  const bb = opts.bb ?? getBlackboard()
  const candidates = listArtifacts(bb)
    .filter((h) => h.artifact.project !== opts.exclude)
    .map((h) => ({ project: h.artifact.project, colors: h.artifact.colors }))
  return detectPaletteReuseAmong(producedColors, candidates, opts)
}

export interface ReuseSnapshot {
  totalTurns: number
  reuseTurns: number
  reuseRatePct: number
  totalReuses: number
  byKind: Record<string, number>
  topReused: Array<{ key: string; count: number }>
}

export class ReuseCollector {
  private totalTurns = 0
  private reuseTurns = 0
  private totalReuses = 0
  private byKind = new Map<string, number>()
  private byName = new Map<string, number>()

  /** Un tour de chat a eu lieu (dénominateur du taux). */
  recordTurn(): void {
    this.totalTurns++
  }

  /** Les artefacts réutilisés pendant un tour (numérateur + détail). */
  recordReuse(hits: ReuseHit[]): void {
    if (!hits || hits.length === 0) return
    this.reuseTurns++
    for (const h of hits) {
      this.totalReuses++
      this.byKind.set(h.kind, (this.byKind.get(h.kind) ?? 0) + 1)
      const key = `${h.kind}:${h.name}`
      this.byName.set(key, (this.byName.get(key) ?? 0) + 1)
    }
  }

  snapshot(): ReuseSnapshot {
    const top = [...this.byName.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    return {
      totalTurns: this.totalTurns,
      reuseTurns: this.reuseTurns,
      reuseRatePct: this.totalTurns ? Math.round((this.reuseTurns / this.totalTurns) * 100) : 0,
      totalReuses: this.totalReuses,
      byKind: Object.fromEntries(this.byKind),
      topReused: top,
    }
  }

  reset(): void {
    this.totalTurns = 0
    this.reuseTurns = 0
    this.totalReuses = 0
    this.byKind.clear()
    this.byName.clear()
  }
}

// ── Singleton + branchement Bus ──────────────────────────────────────────────
let collector: ReuseCollector | null = null
let unsubs: Array<() => void> = []

export function getReuseCollector(): ReuseCollector {
  if (!collector) collector = new ReuseCollector()
  return collector
}

/** Abonne le collecteur : compte les tours (chat.turn) et les réutilisations
 * (artifact.reuse). Le taux = reuseTurns / totalTurns. Idempotent. */
export function installReuseCollector(bus: KernelBus = getBus()): void {
  if (unsubs.length > 0) return
  const c = getReuseCollector()
  unsubs.push(bus.subscribe(CHAT_TURN_EVENT, 'reuse-collector', () => c.recordTurn()))
  unsubs.push(
    bus.subscribe(REUSE_EVENT, 'reuse-collector', (env) => {
      const hits = (env.payload as { hits?: ReuseHit[] })?.hits
      if (Array.isArray(hits)) c.recordReuse(hits)
    }),
  )
}

export function uninstallReuseCollector(): void {
  for (const u of unsubs) u()
  unsubs = []
}

/** Publie une réutilisation détectée sur le Bus (rien si aucun hit). */
export function publishReuse(project: string, hits: ReuseHit[], bus: KernelBus = getBus()): void {
  if (!hits || hits.length === 0) return
  try {
    void bus.publish({ type: REUSE_EVENT, sender: project, kind: 'progress', payload: { project, hits } })
  } catch {
    /* la mesure ne casse jamais un tour */
  }
}

// ── Corrélation réutilisation ↔ coût / qualité (#123) ────────────────────────
//
// #121/#122 prouvent QUE la mémoire sert. Reste la vraie question de valeur :
// est-ce que réutiliser RAPPORTE ? Un tour qui réutilise un artefact coûte-t-il
// moins de tokens, va-t-il plus vite, réussit-il mieux ? On apparie deux signaux
// qui coulent déjà sur le Bus dans le MÊME tour : `artifact.reuse` (part juste
// AVANT, marque le tour comme réutilisateur) puis `chat.turn` (issue + coût/durée/
// succès). On range chaque tour dans un seau « avec réutilisation » ou « sans »,
// et on compare les moyennes. L'appariement est par PROJET (consommé au chat.turn),
// l'ordre étant garanti : le bus dispatche les handlers synchrones avant de rendre
// la main, et publishReuse précède finishChatTurn dans le même bloc finally.

export interface ReuseImpactBucket {
  turns: number
  avgCostUsd: number
  avgDurationMs: number
  avgAgentTurns: number
  successRatePct: number
}

/** Comparatif « avec » vs « sans » réutilisation (global ou par famille). */
export interface ReuseImpactDelta {
  costSavingPct: number | null // (sans − avec) / sans · économie de coût
  durationSavingPct: number | null
  successRatePts: number | null // points de % de succès en plus
}

export interface ReuseImpactComparison {
  with: ReuseImpactBucket
  without: ReuseImpactBucket
  /** Positif = la réutilisation est MEILLEURE. null si un seau est vide. */
  delta: ReuseImpactDelta
  /** Assez de tours dans les DEUX seaux pour que la comparaison soit lisible ? */
  sampleSufficient: boolean
}

export interface ReuseImpactSnapshot {
  // Vue GLOBALE (rétro-compatible #123) : le tour a réutilisé QUELQUE CHOSE vs rien.
  reuse: ReuseImpactBucket
  noReuse: ReuseImpactBucket
  delta: ReuseImpactDelta
  sampleSufficient: boolean
  // Segmentation PAR FAMILLE (#124) : pour chaque famille, les tours qui ont
  // réutilisé CETTE famille vs ceux qui ne l'ont pas. Un même tour peut être
  // « avec » pour une famille et « sans » pour une autre → quelle dimension
  // (composants/skills/procédures/palettes) rapporte le plus ?
  byKind: Array<{ kind: ReuseKind } & ReuseImpactComparison>
}

interface RawBucket {
  turns: number
  cost: number
  durationMs: number
  agentTurns: number
  success: number
}
const emptyRaw = (): RawBucket => ({ turns: 0, cost: 0, durationMs: 0, agentTurns: 0, success: 0 })
function addTo(b: RawBucket, m: TurnMetrics): void {
  b.turns++
  b.cost += m.costUsd
  b.durationMs += m.durationMs
  b.agentTurns += m.agentTurns
  if (m.success) b.success++
}

const IMPACT_KINDS: ReuseKind[] = ['component', 'skill', 'procedure', 'palette', 'artifact']

/** Taille par défaut de la fenêtre glissante du rendement RÉCENT (#128). Le
 * cumulé lisse toute l'histoire ; le fenêtré ne regarde que les N derniers tours
 * → signal causal pour le verdict #126 et le réglage #127. Surcharger via env. */
export const REUSE_WINDOW = (() => {
  const n = Number(process.env.REUSE_IMPACT_WINDOW)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120
})()

export interface TurnMetrics {
  costUsd: number
  durationMs: number
  agentTurns: number
  success: boolean
}

// Un tour conclu, mémorisé pour la fenêtre glissante : familles réutilisées +
// métriques. Léger (≤ MAX_HISTORY entrées).
interface TurnRecord {
  kinds: ReuseKind[]
  reusedAny: boolean
  m: TurnMetrics
}

export class ReuseImpactCollector {
  // Familles réutilisées par le PROCHAIN chat.turn de chaque projet (marquées à
  // artifact.reuse, consommées au chat.turn → une marque ne sert qu'une fois).
  private pending = new Map<string, Set<ReuseKind>>()
  private reuse = emptyRaw()
  private noReuse = emptyRaw()
  // Par famille : seau « a réutilisé cette famille » et seau « ne l'a pas ».
  private withKind = new Map<ReuseKind, RawBucket>(IMPACT_KINDS.map((k) => [k, emptyRaw()] as [ReuseKind, RawBucket]))
  private withoutKind = new Map<ReuseKind, RawBucket>(IMPACT_KINDS.map((k) => [k, emptyRaw()] as [ReuseKind, RawBucket]))
  private minSample = 3
  // Anneau borné des tours récents → rendement fenêtré (#128).
  private history: TurnRecord[] = []
  private maxHistory = 1000

  /** Le tour à venir de ce projet a réutilisé ces familles d'artefact. */
  markReuse(project: string, kinds: ReuseKind[] = []): void {
    const set = this.pending.get(project) ?? new Set<ReuseKind>()
    for (const k of kinds) set.add(k)
    this.pending.set(project, set) // présent même vide → le tour a réutilisé (vue globale)
  }

  /** Un tour s'est conclu : le ranger dans le seau global + dans chaque famille
   * (cumulé) ET dans l'anneau d'historique (fenêtré). */
  recordTurn(project: string, m: TurnMetrics): void {
    const kinds = this.pending.get(project)
    this.pending.delete(project)
    const reusedAny = kinds !== undefined
    addTo(reusedAny ? this.reuse : this.noReuse, m)
    for (const k of IMPACT_KINDS) {
      const used = kinds?.has(k) ?? false
      addTo((used ? this.withKind : this.withoutKind).get(k)!, m)
    }
    this.history.push({ kinds: kinds ? [...kinds] : [], reusedAny, m })
    if (this.history.length > this.maxHistory) this.history.shift()
  }

  private avg(b: RawBucket): ReuseImpactBucket {
    const n = b.turns || 1
    return {
      turns: b.turns,
      avgCostUsd: b.cost / n,
      avgDurationMs: b.durationMs / n,
      avgAgentTurns: b.agentTurns / n,
      successRatePct: b.turns ? Math.round((b.success / b.turns) * 100) : 0,
    }
  }

  /** Compare deux seaux bruts (avec vs sans) → moyennes + deltas + suffisance. */
  private compare(withRaw: RawBucket, withoutRaw: RawBucket): ReuseImpactComparison {
    const w = this.avg(withRaw)
    const wo = this.avg(withoutRaw)
    const both = withRaw.turns > 0 && withoutRaw.turns > 0
    const saving = (a: number, b: number): number | null =>
      both && b > 0 ? Math.round(((b - a) / b) * 100) : null
    return {
      with: w,
      without: wo,
      delta: {
        costSavingPct: saving(w.avgCostUsd, wo.avgCostUsd),
        durationSavingPct: saving(w.avgDurationMs, wo.avgDurationMs),
        successRatePts: both ? w.successRatePct - wo.successRatePct : null,
      },
      sampleSufficient: withRaw.turns >= this.minSample && withoutRaw.turns >= this.minSample,
    }
  }

  /** Assemble un snapshot à partir de quatre seaux (global + par famille). */
  private buildSnapshot(
    reuse: RawBucket,
    noReuse: RawBucket,
    withKind: Map<ReuseKind, RawBucket>,
    withoutKind: Map<ReuseKind, RawBucket>,
  ): ReuseImpactSnapshot {
    const overall = this.compare(reuse, noReuse)
    return {
      reuse: overall.with,
      noReuse: overall.without,
      delta: overall.delta,
      sampleSufficient: overall.sampleSufficient,
      byKind: IMPACT_KINDS.map((kind) => ({
        kind,
        ...this.compare(withKind.get(kind)!, withoutKind.get(kind)!),
      })),
    }
  }

  /** Vue CUMULÉE (depuis le démarrage). C'est la vue « durée de vie » #124. */
  snapshot(): ReuseImpactSnapshot {
    return this.buildSnapshot(this.reuse, this.noReuse, this.withKind, this.withoutKind)
  }

  /** Vue FENÊTRÉE (#128) : même analyse, mais sur les `window` derniers tours
   * seulement → reflète le rendement RÉCENT (causal), pas la moyenne de toute la
   * vie. C'est cette vue qui alimente le verdict #126 et le réglage #127. */
  windowedSnapshot(window: number = REUSE_WINDOW): ReuseImpactSnapshot {
    const recent = window > 0 ? this.history.slice(-window) : this.history
    const reuse = emptyRaw()
    const noReuse = emptyRaw()
    const withKind = new Map<ReuseKind, RawBucket>(IMPACT_KINDS.map((k) => [k, emptyRaw()] as [ReuseKind, RawBucket]))
    const withoutKind = new Map<ReuseKind, RawBucket>(IMPACT_KINDS.map((k) => [k, emptyRaw()] as [ReuseKind, RawBucket]))
    for (const r of recent) {
      addTo(r.reusedAny ? reuse : noReuse, r.m)
      for (const k of IMPACT_KINDS) {
        addTo((r.kinds.includes(k) ? withKind : withoutKind).get(k)!, r.m)
      }
    }
    return this.buildSnapshot(reuse, noReuse, withKind, withoutKind)
  }

  /** Nombre de tours actuellement dans la fenêtre (diagnostic / UI). */
  historySize(): number {
    return this.history.length
  }

  reset(): void {
    this.pending.clear()
    this.reuse = emptyRaw()
    this.noReuse = emptyRaw()
    this.history = []
    for (const k of IMPACT_KINDS) {
      this.withKind.set(k, emptyRaw())
      this.withoutKind.set(k, emptyRaw())
    }
  }
}

let impact: ReuseImpactCollector | null = null
let impactUnsubs: Array<() => void> = []

export function getReuseImpactCollector(): ReuseImpactCollector {
  if (!impact) impact = new ReuseImpactCollector()
  return impact
}

/** Abonne le collecteur d'impact : artifact.reuse marque le projet, chat.turn
 * range le tour (coût/durée/succès) dans le bon seau. Idempotent. */
export function installReuseImpactCollector(bus: KernelBus = getBus()): void {
  if (impactUnsubs.length > 0) return
  const c = getReuseImpactCollector()
  impactUnsubs.push(
    bus.subscribe(REUSE_EVENT, 'reuse-impact', (env) => {
      const payload = env.payload as { project?: string; hits?: ReuseHit[] }
      const project = payload?.project ?? env.sender
      if (!project) return
      const kinds = Array.isArray(payload?.hits) ? payload.hits.map((h) => h.kind) : []
      c.markReuse(project, kinds)
    }),
  )
  impactUnsubs.push(
    bus.subscribe(CHAT_TURN_EVENT, 'reuse-impact', (env) => {
      const p = env.payload as { project?: string; costUsd?: number; durationMs?: number; turns?: number }
      const project = p?.project ?? env.sender
      if (!project) return
      c.recordTurn(project, {
        costUsd: typeof p?.costUsd === 'number' ? p.costUsd : 0,
        durationMs: typeof p?.durationMs === 'number' ? p.durationMs : 0,
        agentTurns: typeof p?.turns === 'number' ? p.turns : 0,
        success: env.kind === 'success',
      })
    }),
  )
}

export function uninstallReuseImpactCollector(): void {
  for (const u of impactUnsubs) u()
  impactUnsubs = []
}

export function registerReuseRoutes(app: Express): void {
  app.get('/api/reuse', (_req: Request, res: Response) => {
    res.json(getReuseCollector().snapshot())
  })
  app.get('/api/reuse/impact', (_req: Request, res: Response) => {
    const c = getReuseImpactCollector()
    // Cumulé (durée de vie #124) + fenêtré (récent #128, ce qui pilote la curation).
    res.json({ ...c.snapshot(), window: REUSE_WINDOW, windowTurns: c.historySize(), windowed: c.windowedSnapshot() })
  })
}
