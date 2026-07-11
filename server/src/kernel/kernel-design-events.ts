// MangoOS Kernel — Événements design sur le Bus (nourrit l'Œil par le flux).
//
// L'Œil Design (MangoQA Visage 3) mesure déjà le RENDU à partir des fichiers
// (sur phase-complete). Mais sa mesure de CONFORMITÉ À LA RÉFÉRENCE Sharingan
// (`briefDrift`) restait dormante : le chemin par fichiers ne lui donne aucune
// CIBLE à comparer. Ce module publie deux événements design sur l'Event Bus :
//
//   design.reference  → la CIBLE (palette extraite par Sharingan / Perfect Plan)
//   design.produced   → le RENDU (palette déclarée + couleurs + paires de contraste)
//
// MangoQA observe via '*'. L'Œil lit la dernière `design.reference` du flux et la
// passe en `brief` → la conformité au brief devient enfin mesurable. Le RÔLE du
// producteur (MangoOS) est de RÉSUMER ; la MESURE reste chez l'Œil (qui possède
// le WCAG et l'adhérence aux tokens). Fire-and-forget : publier ne casse rien.

import { getBus, type KernelBus } from './kernel-bus.js'
import type { PerfectPlanContract } from '../perfect-plan.js'

export const DESIGN_REFERENCE_EVENT = 'design.reference'
export const DESIGN_PRODUCED_EVENT = 'design.produced'
// (2026-07-11) casse visuelle DÉTERMINISTE (render-integrity.ts) — jamais publiée
// jusqu'ici alors que MangoOS la calcule déjà intégralement (débordement/chevauchement/
// images cassées). MangoQA n'a AUCUNE dépendance de rendu (pas de Playwright) — c'est
// le SEUL moyen pour lui de connaître un fait dur de rendu réel, pas une déduction CSS.
export const RENDER_INTEGRITY_EVENT = 'render.integrity'
// (2026-07-11) résultat RÉEL de teste_parcours (eleve-parcours.ts) — un vrai
// navigateur a joué le flux utilisateur (clics/saisies) et capté les erreurs
// console. MangoQA (branche "tests") ne pouvait jusqu'ici que constater la
// PRÉSENCE de fichiers de test dans le code, jamais si un parcours a RÉUSSI.
export const PARCOURS_RESULT_EVENT = 'parcours.result'
// (2026-07-11) verdict COMPLET du Gardien de clôture (eleve-gate.ts) — MangoQA
// re-devine aujourd'hui (branches design-system/accessibility) ce que MangoOS a
// déjà vérifié en production ; ce résumé chiffré lui donne un vrai point de départ.
export const GATE_VERDICT_EVENT = 'gate.verdict'

/** Une paire texte/fond extraite du CSS (forme lue par l'Œil). */
export interface DesignPair {
  fg: string
  bg: string
  fontPx?: number
  bold?: boolean
  where?: string
}

/** Contexte design résumé, publié sur le Bus. */
export interface ProducedDesign {
  palette: string[]
  usedColors: string[]
  pairs: DesignPair[]
}

// ── Extracteurs déterministes (le producteur résume) ─────────────────────────
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g
const STYLE_EXT = ['.css', '.scss', '.jsx', '.tsx', '.html', '.vue', '.svelte']

function isStyle(p: string): boolean {
  return STYLE_EXT.some((e) => p.endsWith(e))
}

/** Toutes les couleurs hex (dédupliquées, minuscules), telles quelles. */
export function extractCssColors(css: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of css.match(HEX) ?? []) {
    const v = m.toLowerCase()
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** Palette DÉCLARÉE = hex assignés à des variables CSS (`--x: #hex`). */
export function extractDeclaredPalette(css: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,6})\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const v = m[1].toLowerCase()
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

/** Paires `color` + `background[-color]` règle par règle (avec taille/graisse). */
export function extractContrastPairs(css: string): DesignPair[] {
  const pairs: DesignPair[] = []
  const ruleRe = /([^{}]*)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRe.exec(css)) !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    const body = m[2]
    const fg = /(?:^|[;\s])color\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(body)?.[1]
    const bg = /background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/.exec(body)?.[1]
    if (!fg || !bg) continue
    const fontPx = parseFloat(/font-size\s*:\s*([\d.]+)px/.exec(body)?.[1] ?? '')
    const weight = /font-weight\s*:\s*(bold|[5-9]\d\d)/.exec(body)?.[1]
    pairs.push({
      fg: fg.toLowerCase(),
      bg: bg.toLowerCase(),
      fontPx: Number.isFinite(fontPx) ? fontPx : undefined,
      bold: weight !== undefined,
      where: selector || undefined,
    })
  }
  return pairs
}

/** Construit le résumé design depuis des fichiers (style uniquement). */
export function buildProducedDesign(files: { path: string; content: string }[]): ProducedDesign {
  const css = files.filter((f) => isStyle(f.path)).map((f) => f.content).join('\n')
  return {
    palette: extractDeclaredPalette(css),
    usedColors: extractCssColors(css),
    pairs: extractContrastPairs(css),
  }
}

/** Palette de référence d'un contrat Perfect Plan (refs `kind:"palette"`). */
export function paletteFromContract(contract: PerfectPlanContract | null): string[] {
  if (!contract) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const ref of contract.refs) {
    if (ref.kind !== 'palette') continue
    for (const m of ref.value.match(HEX) ?? []) {
      const v = m.toLowerCase()
      if (!seen.has(v)) {
        seen.add(v)
        out.push(v)
      }
    }
  }
  return out
}

export interface DesignEventDeps {
  bus?: KernelBus
}

/** Publie la CIBLE design (palette de référence). Fire-and-forget. Renvoie
 * true si quelque chose a été publié (palette non vide). */
export function publishDesignReference(
  info: { project: string; palette: string[]; source: string },
  deps: DesignEventDeps = {},
): boolean {
  if (info.palette.length === 0) return false
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: DESIGN_REFERENCE_EVENT,
      sender: info.project,
      kind: 'progress',
      payload: { project: info.project, palette: info.palette, source: info.source },
    })
    return true
  } catch {
    return false
  }
}

/** Publie la casse visuelle DÉTERMINISTE d'un rendu (render-integrity.ts). Fire-and-
 * forget. Renvoie true si quelque chose a été publié (le rapport n'est jamais vide). */
export function publishRenderIntegrity(
  info: { project: string; broken: boolean; faults: string[] },
  deps: DesignEventDeps = {},
): boolean {
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: RENDER_INTEGRITY_EVENT,
      sender: info.project,
      kind: info.broken ? 'error' : 'progress',
      payload: { project: info.project, broken: info.broken, faults: info.faults },
    })
    return true
  } catch {
    return false
  }
}

/** Publie le résultat d'un teste_parcours RÉEL (eleve-parcours.ts). Fire-and-forget.
 * Renvoie true si quelque chose a été publié (jamais vide — au moins l'étape de clôture). */
export function publishParcoursResult(
  info: { project: string; ok: boolean; etapesOk: number; etapesTotal: number; consoleErrors: string[] },
  deps: DesignEventDeps = {},
): boolean {
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: PARCOURS_RESULT_EVENT,
      sender: info.project,
      kind: info.ok ? 'success' : 'error',
      payload: {
        project: info.project,
        ok: info.ok,
        etapesOk: info.etapesOk,
        etapesTotal: info.etapesTotal,
        consoleErrors: info.consoleErrors,
      },
    })
    return true
  } catch {
    return false
  }
}

/** Publie le verdict complet du Gardien de clôture (eleve-gate.ts). Fire-and-forget. */
export function publishGateVerdict(
  info: {
    project: string; ok: boolean;
    intentOk: boolean; wcagOk: boolean; balanceOk: boolean; placeholdersOk: boolean; testsOk: boolean;
    tasteScored: boolean; tasteOverall: number | null;
  },
  deps: DesignEventDeps = {},
): boolean {
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: GATE_VERDICT_EVENT,
      sender: info.project,
      kind: info.ok ? 'success' : 'error',
      payload: { ...info },
    })
    return true
  } catch {
    return false
  }
}

/** Publie le RENDU design extrait des fichiers changés. Fire-and-forget.
 * Renvoie true si le tour a touché au design (au moins une couleur). */
export function publishDesignProduced(
  info: { project: string; files: { path: string; content: string }[] },
  deps: DesignEventDeps = {},
): boolean {
  const produced = buildProducedDesign(info.files)
  if (produced.usedColors.length === 0 && produced.palette.length === 0) return false
  try {
    const bus = deps.bus ?? getBus()
    void bus.publish({
      type: DESIGN_PRODUCED_EVENT,
      sender: info.project,
      kind: 'progress',
      payload: { project: info.project, ...produced },
    })
    return true
  } catch {
    return false
  }
}
