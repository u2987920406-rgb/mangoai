// MangoOS Kernel — Artefacts réels dans le Blackboard (cf. fondation.md).
//
// Le Blackboard #115 est persistant (node:sqlite) mais tournait à vide. Ici on y
// branche les PREMIERS vrais artefacts : les événements design qui coulent déjà
// sur le Bus (#113). Un observateur écoute `design.reference` (palette Sharingan
// cible) et `design.produced` (palette du rendu) et les DÉPOSE dans le Blackboard
// — durable, et surtout CROSS-PROJET : une palette capturée sur un projet devient
// réutilisable et retrouvable depuis n'importe quel autre.
//
// Le « vec » s'exerce enfin sur des vraies données : chaque artefact porte un
// EMBEDDING de palette DÉTERMINISTE (histogramme RGB 3×3×3 = 27 dims, normalisé,
// invariant à l'ordre des couleurs). La recherche du Blackboard (cosinus) trouve
// alors « les designs aux couleurs proches » — sans Ollama, sans réseau, pur.
import type { Express, Request, Response } from 'express'
import { getBus, type KernelBus, type MangoEnvelope } from './kernel-bus.js'
import { getBlackboard, type Blackboard, type BlackboardRef } from './kernel-blackboard.js'

/** Scope unique du store d'artefacts design (cross-projet). */
export const ARTIFACT_SCOPE = 'artifact:design'

export interface DesignArtifact {
  type: 'design.reference' | 'design.produced'
  project: string
  colors: string[]
  source?: string
  at: number
}

// ── Embedding de palette : histogramme RGB 3×3×3 (déterministe, pur) ─────────
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) }
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
  }
  return null
}

/** Histogramme RGB 27 bins normalisé. Vide si aucune couleur valide. Invariant à
 * l'ordre → deux palettes de mêmes couleurs ont le même vecteur. */
export function paletteEmbedding(colors: string[]): number[] {
  const hist = new Array(27).fill(0)
  let n = 0
  for (const c of colors) {
    const rgb = parseHex(c)
    if (!rgb) continue
    const rb = Math.min(2, Math.floor(rgb.r / 86))
    const gb = Math.min(2, Math.floor(rgb.g / 86))
    const bb = Math.min(2, Math.floor(rgb.b / 86))
    hist[rb * 9 + gb * 3 + bb] += 1
    n++
  }
  if (n === 0) return []
  return hist.map((v) => v / n)
}

/** Hash stable d'une liste de couleurs (dédup : même palette → même clé). */
export function paletteHash(colors: string[]): string {
  const norm = colors.map((c) => c.trim().toLowerCase()).sort().join(',')
  let h = 5381
  for (let i = 0; i < norm.length; i++) h = (((h << 5) + h) ^ norm.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── Extraction des couleurs depuis un payload design ─────────────────────────
function colorsFrom(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const pal = Array.isArray(p.palette) ? (p.palette as unknown[]) : []
  const used = Array.isArray(p.usedColors) ? (p.usedColors as unknown[]) : []
  const src = pal.length > 0 ? pal : used // la palette déclarée prime sur les couleurs employées
  return src.filter((c): c is string => typeof c === 'string')
}

function projectFrom(env: MangoEnvelope): string {
  const p = env.payload as Record<string, unknown> | undefined
  return (p && typeof p.project === 'string' && p.project) || env.sender || 'unknown'
}

/** Dépose un artefact design dans le Blackboard. Renvoie sa ref (ou null si pas
 * de couleur exploitable — on ne stocke pas un artefact vide). */
export function recordDesignArtifact(
  env: MangoEnvelope,
  bb: Blackboard = getBlackboard(),
  now: () => number = () => Date.now(),
): BlackboardRef | null {
  const colors = colorsFrom(env.payload)
  if (colors.length === 0) return null
  const type = env.type === 'design.produced' ? 'design.produced' : 'design.reference'
  const project = projectFrom(env)
  const source = (env.payload as Record<string, unknown>)?.source
  const artifact: DesignArtifact = {
    type,
    project,
    colors,
    source: typeof source === 'string' ? source : undefined,
    at: now(),
  }
  // Clé : type + projet + hash de palette → dédup (re-capturer la même palette
  // sur le même projet n'empile pas de doublons).
  const key = `${type}:${project}:${paletteHash(colors)}`
  return bb.put(ARTIFACT_SCOPE, key, artifact, paletteEmbedding(colors))
}

// ── Observateur : design.* du Bus → Blackboard ───────────────────────────────
let unsubs: Array<() => void> = []

/** Branche l'observateur : chaque design.reference/produced est persisté dans le
 * Blackboard. Idempotent. Fire-and-forget (une erreur de dépôt ne casse rien).
 * `bb` non fourni → résolu via getBlackboard() À CHAQUE événement (le boot bascule
 * sur le store SQLite de façon ASYNC après l'install ; on doit voir le store courant). */
export function installArtifactStore(bus: KernelBus = getBus(), bb?: Blackboard): void {
  if (unsubs.length > 0) return
  for (const type of ['design.reference', 'design.produced'] as const) {
    unsubs.push(
      bus.subscribe(type, 'artifact-store', (env) => {
        try {
          recordDesignArtifact(env, bb ?? getBlackboard())
        } catch {
          /* le dépôt d'artefact ne doit jamais casser le flux */
        }
      }),
    )
  }
}

export function uninstallArtifactStore(): void {
  for (const u of unsubs) u()
  unsubs = []
}

// ── Lecture / recherche ──────────────────────────────────────────────────────
export interface ArtifactHit {
  key: string
  artifact: DesignArtifact
  score?: number
}

/** Tous les artefacts design persistés (cross-projet), plus récents en tête. */
export function listArtifacts(bb: Blackboard = getBlackboard()): ArtifactHit[] {
  return bb
    .keys(ARTIFACT_SCOPE)
    .map((key) => ({ key, artifact: bb.get<DesignArtifact>(ARTIFACT_SCOPE, key)! }))
    .filter((h) => h.artifact)
    .sort((a, b) => (b.artifact.at ?? 0) - (a.artifact.at ?? 0))
}

/** Les k artefacts dont la palette est la plus proche (cosinus) de `colors`. */
export function searchArtifacts(colors: string[], k = 5, bb: Blackboard = getBlackboard()): ArtifactHit[] {
  const emb = paletteEmbedding(colors)
  if (emb.length === 0) return []
  return bb
    .search(ARTIFACT_SCOPE, emb, k)
    .map((hit) => ({ key: hit.key, artifact: hit.value as DesignArtifact, score: hit.score }))
}

// ── Réinjection : la bibliothèque reboucle vers la génération ─────────────────
/** Bloc de system prompt rappelant à l'agent les palettes DÉJÀ créées proches de
 * la cible du projet courant → réutiliser au lieu de réinventer. "" si pas de
 * cible, ou aucune palette proche (au-dessus du seuil), ou seulement celles du
 * projet courant. Pur et synchrone (embedding = histogramme, pas d'Ollama). */
export function relevantArtifactsSection(
  currentProject: string,
  targetColors: string[],
  opts: { k?: number; threshold?: number; bb?: Blackboard } = {},
): string {
  if (targetColors.length === 0) return ''
  const k = opts.k ?? 4
  const threshold = opts.threshold ?? 0.6
  const hits = searchArtifacts(targetColors, k + 8, opts.bb)
    .filter((h) => h.artifact.project !== currentProject) // pas la cible du projet courant
    .filter((h) => (h.score ?? 0) >= threshold)
    .slice(0, k)
  if (hits.length === 0) return ''
  const lines = hits.map((h) => {
    const a = h.artifact
    const role = a.type === 'design.reference' ? 'cible' : 'rendu'
    const pct = Math.round((h.score ?? 0) * 100)
    return `- ${a.project} (${role}, ~${pct}% proche) : ${a.colors.slice(0, 8).join(' ')}`
  })
  return (
    `\n\n## Palettes réutilisables — mémoire du Blackboard\n` +
    `Tu as déjà travaillé des palettes proches de la cible de ce projet (capturées ou produites ailleurs). ` +
    `Pour la cohérence de ton univers visuel, RÉUTILISE-les de préférence plutôt que d'en réinventer une — sauf demande explicite contraire :\n` +
    lines.join('\n') +
    `\n`
  )
}

// ── Recherche de palette par TEXTE (L3, priorité faible) ─────────────────────
// Une palette est intrinsèquement une chose COULEUR (l'embedding histogramme la
// sert très bien). Mais l'Élève raisonne parfois en MOTS (« ambiance chaleureuse
// café », « tons sombres et électriques ») sans hex sous la main. On dérive donc
// de chaque palette un TEXTE déterministe (projet + adjectifs de couleur) pour la
// rendre retrouvable par sens — repli mots-clés pur, indépendant d'Ollama.

/** Adjectifs déterministes d'une couleur (chaleur, clarté, saturation, famille). */
function colorWords(hex: string): string[] {
  const rgb = parseHex(hex)
  if (!rgb) return []
  const { r, g, b } = rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  const sat = max === 0 ? 0 : (max - min) / max
  const words: string[] = []
  // Clarté
  if (lum < 0.25) words.push('sombre', 'foncé', 'dark')
  else if (lum > 0.8) words.push('clair', 'lumineux', 'light')
  else words.push('moyen')
  // Saturation
  const neutral = sat < 0.15
  if (neutral) words.push('neutre', 'gris', 'muted')
  else if (sat > 0.6) words.push('vif', 'saturé', 'vivid', 'électrique')
  // Chaleur + famille dominante — UNIQUEMENT si la couleur a une vraie teinte
  // (un noir/blanc/gris R≈G≈B n'est ni chaud ni froid : ne pas polluer).
  if (!neutral) {
    if (r >= g && r >= b) words.push('chaud', 'rouge', 'warm')
    if (g >= r && g >= b) words.push('vert', 'naturel')
    if (b >= r && b >= g) words.push('froid', 'bleu', 'cool')
    if (r > 180 && g > 120 && b < 100) words.push('ambre', 'orangé', 'doré')
    if (r > 150 && b > 150 && g < 120) words.push('violet', 'pourpre')
  }
  return words
}

/** Texte représentatif d'une palette pour le matching mots-clés (déterministe). */
export function paletteText(a: DesignArtifact): string {
  const adj = new Set<string>()
  for (const c of a.colors) for (const w of colorWords(c)) adj.add(w)
  const role = a.type === 'design.reference' ? 'cible inspiration' : 'palette produite rendu'
  return `${a.project}. ${role}. ${[...adj].join(' ')}`
}

/** Repli mots-clés déterministe (chevauchement de tokens requête ↔ texte palette). */
function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-zàâäéèêëîïôöùûüç0-9]+/g) ?? []).filter((t) => t.length >= 3)
}

/** Deux tokens « se correspondent » s'ils sont égaux OU partagent un préfixe d'au
 * moins 4 lettres (chaud↔chaude, froid↔froide, sombre↔sombres) — tolérance aux
 * variantes morphologiques pour du texte libre, sans dépendre d'Ollama. */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true
  const n = Math.min(a.length, b.length)
  return n >= 4 && a.slice(0, n) === b.slice(0, n)
}

/** Les k palettes les plus PERTINENTES à une requête TEXTE (par sens, pas par hex).
 * Pur, déterministe, zéro réseau (repli mots-clés sur le texte dérivé). [] si vide
 * ou requête sans token. Ne lève jamais. Complète searchArtifacts (par couleur). */
export function searchPalettesByText(query: string, k = 5, bb: Blackboard = getBlackboard()): ArtifactHit[] {
  const q = [...new Set(tokenize(query))]
  if (q.length === 0) return []
  const all = listArtifacts(bb)
  if (all.length === 0) return []
  const scored = all.map((h, i) => {
    const toks = [...new Set(tokenize(paletteText(h.artifact)))]
    let overlap = 0
    for (const t of toks) if (q.some((qt) => tokenMatch(qt, t))) overlap++
    return { h, overlap, i }
  })
  return scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.i - b.i)
    .slice(0, k)
    .map((s) => ({ ...s.h, score: undefined }))
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerArtifactRoutes(app: Express): void {
  app.get('/api/artifacts', (_req: Request, res: Response) => {
    res.json({ artifacts: listArtifacts() })
  })
  app.post('/api/artifacts/search', (req: Request, res: Response) => {
    const colors = Array.isArray((req.body as { colors?: unknown })?.colors)
      ? ((req.body as { colors: unknown[] }).colors.filter((c) => typeof c === 'string') as string[])
      : []
    const k = Number((req.body as { k?: unknown })?.k) || 5
    res.json({ hits: searchArtifacts(colors, k) })
  })
}
