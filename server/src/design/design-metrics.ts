// Œil-Coach (#152) — MESURES DESIGN OBJECTIVES, déterministes et pures.
//
// Le cerveau vision (qwen3.5:cloud) donne un avis SUBJECTIF sur le rendu ; ce module
// apporte le socle OBJECTIF que l'œil ne peut pas mentir : contraste WCAG (un FAIT calculé)
// et adhérence à la palette déclarée. Injecté dans la critique pour l'ancrer sur du mesuré.
//
// Mini-réimplémentation locale de l'Œil Design #111 (MangoQA `design-eye/`) — on garde la
// boucle synchrone et sans couplage cross-repo. Aucune I/O, aucun réseau → 100% testable.

export interface Rgb { r: number; g: number; b: number }

/** Parse `#rgb` ou `#rrggbb` (robuste aux espaces/casse) → {r,g,b} 0-255, ou null. */
export function parseHex(hex: string): Rgb | null {
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/** Luminance relative WCAG (0-1). */
export function relativeLuminance(c: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Ratio de contraste WCAG entre deux couleurs hex (1..21), arrondi 2 déc., ou null. */
export function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca), lb = relativeLuminance(cb);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Gros texte au sens WCAG : ≥ 24px, ou ≥ 18.66px en gras (≥ 700). */
export function isLargeText(fontPx?: number, bold?: boolean): boolean {
  if (!fontPx) return false;
  return fontPx >= 24 || (!!bold && fontPx >= 18.66);
}

export type WcagLevel = "AAA" | "AA" | "fail";

/** Niveau WCAG d'un ratio selon la taille du texte. */
export function wcagLevel(ratio: number, large: boolean): WcagLevel {
  const aa = large ? 3 : 4.5;
  const aaa = large ? 4.5 : 7;
  if (ratio >= aaa) return "AAA";
  if (ratio >= aa) return "AA";
  return "fail";
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction depuis le CSS du projet
// ─────────────────────────────────────────────────────────────────────────────

const HEX_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;

/** Toutes les couleurs hex littérales d'un texte CSS (dédupliquées, minuscule). */
export function collectUsedColors(css: string): string[] {
  const out = new Set<string>();
  for (const m of css.matchAll(HEX_RE)) out.add(m[0].toLowerCase());
  return [...out];
}

/** Palette DÉCLARÉE = variables `--x: #hex` (le design system du projet). */
export function extractDeclaredPalette(css: string): string[] {
  const out = new Set<string>();
  for (const m of css.matchAll(/--[a-z0-9-]+\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/gi)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

export interface ColorPair { fg: string; bg: string; fontPx?: number; bold?: boolean; where?: string }

/** Mesure de taille de police en px (gère px / rem / em ; base 16). null si inconnue. */
function fontPx(decl: string): number | undefined {
  const m = decl.match(/font-size\s*:\s*([\d.]+)(px|rem|em)?/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "px").toLowerCase();
  return unit === "px" ? n : n * 16;
}
function isBold(decl: string): boolean {
  const m = decl.match(/font-weight\s*:\s*(\d{3}|bold)/i);
  if (!m) return false;
  return m[1].toLowerCase() === "bold" || parseInt(m[1], 10) >= 700;
}

/**
 * Paires (texte sur fond) à vérifier — règle CSS par règle CSS : une règle qui pose à la
 * fois une couleur de texte et une couleur de fond hex donne une paire mesurable.
 */
export function extractContrastPairs(css: string): ColorPair[] {
  const pairs: ColorPair[] = [];
  // Découpe grossière en blocs `sélecteur { ... }`.
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split("\n").pop()?.trim().slice(0, 60);
    const body = m[2];
    const fg = body.match(/(?:^|[;{\s])color\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/i)?.[1];
    const bg = body.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/i)?.[1];
    if (fg && bg) {
      pairs.push({ fg: fg.toLowerCase(), bg: bg.toLowerCase(), fontPx: fontPx(body), bold: isBold(body), where: selector });
    }
  }
  return pairs;
}

export interface ContrastFail { fg: string; bg: string; ratio: number; required: number; level: WcagLevel; where?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Mesures statiques enrichies (N15 — audit nuit 2026-07-03)
//
// POURQUOI : les lentilles de critique étaient subjectives (le VL « trouve » un
// défaut ou pas) ; ces 4 mesures sont des FAITS calculés depuis les fichiers du
// projet, que ni l'œil ni l'Élève ne peuvent contester. Toutes PURES : elles
// reçoivent des CONTENUS de fichiers (string), jamais de chemins — zéro I/O,
// 100% testable, fail-open (jamais d'exception).
// ─────────────────────────────────────────────────────────────────────────────

/** Au-delà de 3 familles, la page perd son registre typographique (bruit visuel). */
export const FONT_FAMILIES_MAX = 3;
/** Au-delà de 6 couleurs littérales dans les composants, la palette n'est plus
 *  gouvernée par les custom properties — chaque retouche dérive. */
export const LITERAL_COLORS_MAX = 6;

export interface FontFamiliesMeasure {
  families: string[]; // familles distinctes, normalisées (minuscule, dédupliquées)
  count: number;
  tooMany: boolean; // > FONT_FAMILIES_MAX → « trop »
}

export interface TypoScaleMeasure {
  usesClamp: boolean;       // clamp() sur un font-size = échelle fluide déclarée
  distinctSizesPx: number[]; // tailles distinctes converties en px, triées
  coherent: boolean;         // suite cohérente : ≥3 tailles, pas 2 tailles quasi-identiques ni de trou > ×2
  present: boolean;          // clamp OU suite cohérente = il Y A une échelle
}

export interface LiteralColorsMeasure {
  count: number;      // occurrences hex/rgb()/hsl() dans les composants (hors index.css)
  samples: string[];  // jusqu'à 8 exemples pour pointer le doigt
  threshold: number;  // LITERAL_COLORS_MAX (rappelé pour le rendu texte)
  overThreshold: boolean;
}

export interface MotionMeasure {
  hasTransition: boolean;   // au moins une `transition:` (CSS ou style inline JSX)
  hasKeyframes: boolean;    // au moins un @keyframes ou `animation:`
  hasFramerMotion: boolean; // framer-motion importé (composants) ou en dépendance
  present: boolean;         // aucune des trois = page statique
}

export interface DesignMeasure {
  contrastFails: ContrastFail[];
  offPalette: string[]; // couleurs employées hors de la palette déclarée
  paletteSize: number;
  // Champs OPTIONNELS (N15) — rétrocompat : les appelants existants construisent
  // des DesignMeasure sans eux et measureSummary les ignore quand absents.
  fontFamilies?: FontFamiliesMeasure;
  typoScale?: TypoScaleMeasure;
  literalColors?: LiteralColorsMeasure;
  motion?: MotionMeasure;
}

// Mots-clés génériques CSS qui ne sont PAS des familles (on compte les familles
// CHOISIES, pas les fallbacks système — c'est le choix design qu'on mesure).
const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded",
  "inherit", "initial", "unset", "revert",
]);

/** Normalise un nom de famille : sans guillemets, minuscule, espaces resserrés. */
function normalizeFamily(raw: string): string {
  return raw.replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * (1) Familles de polices distinctes déclarées : première famille de chaque
 * `font-family:` CSS (la famille VOULUE ; les fallbacks après la virgule ne
 * comptent pas) + familles importées via Google Fonts dans index.html
 * (`family=Nom+Compose`). Verdict : > FONT_FAMILIES_MAX = trop.
 */
export function countFontFamilies(cssFiles: string[], indexHtml: string = ""): FontFamiliesMeasure {
  const families = new Set<string>();
  const css = cssFiles.join("\n");
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = normalizeFamily(m[1].split(",")[0] ?? "");
    // var(--x) = indirection vers un token (bonne pratique) — la vraie famille
    // est comptée là où le token est défini, pas ici.
    if (!first || first.startsWith("var(") || GENERIC_FAMILIES.has(first)) continue;
    families.add(first);
  }
  // Imports Google Fonts : `family=Cormorant+Garamond:wght@…` (le `+` encode l'espace).
  for (const m of indexHtml.matchAll(/family=([^"&:]+)/gi)) {
    const name = normalizeFamily(m[1].replace(/\+/g, " "));
    if (name) families.add(name);
  }
  const list = [...families].sort();
  return { families: list, count: list.length, tooMany: list.length > FONT_FAMILIES_MAX };
}

/**
 * (2) Échelle typographique : soit clamp() sur un font-size (échelle fluide
 * déclarée = intention claire), soit une suite COHÉRENTE de tailles — au moins
 * 3 tailles distinctes, avec une vraie amplitude (max/min ≥ 1.4, sinon tout se
 * ressemble) et sans trou brutal (ratio entre tailles voisines ≤ 2.2, sinon
 * l'échelle a des marches manquantes). Verdict : present=false = pas d'échelle.
 */
export function detectTypoScale(cssFiles: string[]): TypoScaleMeasure {
  const css = cssFiles.join("\n");
  const usesClamp = /font-size\s*:\s*clamp\s*\(/i.test(css);
  const sizes = new Set<number>();
  for (const m of css.matchAll(/font-size\s*:\s*([\d.]+)(px|rem|em)\b/gi)) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const px = m[2].toLowerCase() === "px" ? n : n * 16;
    sizes.add(Math.round(px * 100) / 100);
  }
  const distinctSizesPx = [...sizes].sort((a, b) => a - b);
  let coherent = distinctSizesPx.length >= 3;
  if (coherent) {
    const min = distinctSizesPx[0], max = distinctSizesPx[distinctSizesPx.length - 1];
    if (max / min < 1.4) coherent = false; // amplitude trop faible = hiérarchie plate
    for (let i = 1; i < distinctSizesPx.length && coherent; i++) {
      if (distinctSizesPx[i] / distinctSizesPx[i - 1] > 2.2) coherent = false; // trou
    }
  }
  return { usesClamp, distinctSizesPx, coherent, present: usesClamp || coherent };
}

// Couleurs littérales dans du JSX/TSX : hex, rgb()/rgba(), hsl()/hsla().
const LITERAL_COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

/**
 * (3) Couleurs LITTÉRALES dans les composants (.jsx/.tsx, PAS index.css — le
 * fichier de tokens a le DROIT de contenir des hex, c'est sa raison d'être).
 * Une couleur en dur dans un composant échappe au design system : elle ne
 * suivra ni un changement de palette ni un thème. Verdict : > seuil = dérive.
 */
export function countLiteralColorsInComponents(componentFiles: string[]): LiteralColorsMeasure {
  let count = 0;
  const samples: string[] = [];
  for (const content of componentFiles) {
    for (const m of (content ?? "").matchAll(LITERAL_COLOR_RE)) {
      count++;
      if (samples.length < 8) samples.push(m[0]);
    }
  }
  return { count, samples, threshold: LITERAL_COLORS_MAX, overThreshold: count > LITERAL_COLORS_MAX };
}

/**
 * (4) Présence de mouvement : au moins une transition CSS (ou inline JSX), un
 * @keyframes / `animation:`, ou framer-motion importé. Verdict : rien du tout
 * = page statique (axiome MOTION : « a static page reads as unfinished »).
 */
export function detectMotion(
  cssFiles: string[],
  componentFiles: string[] = [],
  packageJson: string = "",
): MotionMeasure {
  const css = cssFiles.join("\n");
  const comps = componentFiles.join("\n");
  const hasTransition = /(^|[;{\s"'])transition(-property|-duration)?\s*:/im.test(css + "\n" + comps);
  const hasKeyframes = /@keyframes\s+[\w-]+/i.test(css) || /(^|[;{\s"'])animation\s*:/im.test(css + "\n" + comps);
  const hasFramerMotion = /from\s+["']framer-motion["']/.test(comps) || /"framer-motion"/.test(packageJson);
  return { hasTransition, hasKeyframes, hasFramerMotion, present: hasTransition || hasKeyframes || hasFramerMotion };
}

/** Entrée de la mesure enrichie : des CONTENUS de fichiers, jamais des chemins. */
export interface ProjectDesignInput {
  /** Contenus CSS (index.css et consorts) — contraste, palette, typo, motion. */
  cssFiles: string[];
  /** Contenus des composants .jsx/.tsx (SANS index.css) — couleurs littérales, framer-motion. */
  componentFiles?: string[];
  /** Contenu de index.html — imports Google Fonts. */
  indexHtml?: string;
  /** Contenu de package.json — dépendance framer-motion. */
  packageJson?: string;
}

/** Couleurs employées absentes de la palette déclarée (si une palette est déclarée). */
export function offPalette(used: string[], palette: string[]): string[] {
  if (palette.length === 0) return [];
  const set = new Set(palette.map((c) => c.toLowerCase()));
  return used.filter((c) => !set.has(c.toLowerCase()));
}

/**
 * Mesure objective d'un ensemble de fichiers CSS : paires de contraste SOUS WCAG AA +
 * couleurs hors-palette. Pur, déterministe, fail-open (jamais d'exception).
 */
export function measureDesign(cssFiles: string[]): DesignMeasure {
  const css = cssFiles.join("\n");
  const palette = extractDeclaredPalette(css);
  const used = collectUsedColors(css);
  const contrastFails: ContrastFail[] = [];
  for (const p of extractContrastPairs(css)) {
    const ratio = contrastRatio(p.fg, p.bg);
    if (ratio == null) continue;
    const large = isLargeText(p.fontPx, p.bold);
    const level = wcagLevel(ratio, large);
    if (level === "fail") {
      contrastFails.push({ fg: p.fg, bg: p.bg, ratio, required: large ? 3 : 4.5, level, where: p.where });
    }
  }
  return { contrastFails, offPalette: offPalette(used, palette), paletteSize: palette.length };
}

/**
 * Mesure ENRICHIE (N15) : contraste + palette (measureDesign) + les 4 mesures
 * statiques. Même contrat : pur, déterministe, fail-open. Les appelants qui ne
 * fournissent que du CSS obtiennent quand même familles/échelle/motion (les
 * mesures composants restent calculées sur un tableau vide → count 0, honnête).
 */
export function measureProjectDesign(input: ProjectDesignInput): DesignMeasure {
  const base = measureDesign(input.cssFiles);
  return {
    ...base,
    fontFamilies: countFontFamilies(input.cssFiles, input.indexHtml ?? ""),
    typoScale: detectTypoScale(input.cssFiles),
    literalColors: countLiteralColorsInComponents(input.componentFiles ?? []),
    motion: detectMotion(input.cssFiles, input.componentFiles ?? [], input.packageJson ?? ""),
  };
}

/** Rend la mesure en quelques lignes à injecter dans le prompt de critique (vide si RAS).
 *  Les champs N15 sont rendus SEULEMENT s'ils sont présents ET en défaut — un
 *  DesignMeasure « ancien » (sans les champs optionnels) rend exactement comme avant. */
export function measureSummary(m: DesignMeasure): string {
  const lines: string[] = [];
  for (const c of m.contrastFails.slice(0, 6)) {
    lines.push(`- Contraste SOUS WCAG AA : texte ${c.fg} sur fond ${c.bg} = ${c.ratio}:1 (requis ${c.required}:1)${c.where ? ` [${c.where}]` : ""}`);
  }
  if (m.offPalette.length) {
    lines.push(`- Hors palette déclarée : ${m.offPalette.slice(0, 8).join(", ")}`);
  }
  if (m.fontFamilies?.tooMany) {
    lines.push(`- TROP de familles de polices : ${m.fontFamilies.count} (max ${FONT_FAMILIES_MAX}) — ${m.fontFamilies.families.join(", ")}. Réduis à un duo display+labeur (+ mono si données).`);
  }
  if (m.typoScale && !m.typoScale.present) {
    lines.push(`- AUCUNE échelle typographique : ni clamp(), ni suite cohérente de tailles (${m.typoScale.distinctSizesPx.length} taille(s) distincte(s) trouvée(s)). Déclare une échelle (ex. 14/16/20/28/40 ou clamp()).`);
  }
  if (m.literalColors?.overThreshold) {
    lines.push(`- ${m.literalColors.count} couleurs LITTÉRALES dans les composants (seuil ${m.literalColors.threshold}) — ex. ${m.literalColors.samples.slice(0, 5).join(", ")}. Passe par les custom properties de index.css.`);
  }
  if (m.motion && !m.motion.present) {
    lines.push(`- AUCUNE transition/animation détectée : page STATIQUE. Ajoute au moins des micro-interactions (hover transform, entrée en fondu) — une page figée paraît inachevée.`);
  }
  return lines.join("\n");
}
