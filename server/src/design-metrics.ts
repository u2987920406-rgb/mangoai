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
export interface DesignMeasure {
  contrastFails: ContrastFail[];
  offPalette: string[]; // couleurs employées hors de la palette déclarée
  paletteSize: number;
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

/** Rend la mesure en quelques lignes à injecter dans le prompt de critique (vide si RAS). */
export function measureSummary(m: DesignMeasure): string {
  const lines: string[] = [];
  for (const c of m.contrastFails.slice(0, 6)) {
    lines.push(`- Contraste SOUS WCAG AA : texte ${c.fg} sur fond ${c.bg} = ${c.ratio}:1 (requis ${c.required}:1)${c.where ? ` [${c.where}]` : ""}`);
  }
  if (m.offPalette.length) {
    lines.push(`- Hors palette déclarée : ${m.offPalette.slice(0, 8).join(", ")}`);
  }
  return lines.join("\n");
}
