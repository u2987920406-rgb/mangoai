// Analyse couleur/pixel PURE, extraite de vision.ts (#190 tâche #6 — vision.ts était
// à 1317 lignes, plusieurs sous-domaines mélangés). Zéro I/O, zéro dépendance au
// navigateur/module state de vision.ts — testable isolément. Re-exporté par vision.ts
// pour que les ~30 fichiers qui importent déjà `from "./vision.js"` restent inchangés.

/** RGBA pixel data from sampling an image via Playwright canvas (64×64 grid). */
export interface RgbaPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Converts a CSS color string (rgb/rgba/hex) to a lowercase #rrggbb hex, or
 *  null for transparent/invalid/default values. Pure → unit-testable. */
export function cssColorToHex(color: string): string | null {
  if (!color) return null;
  const s = color.trim();
  if (s === "transparent" || s === "initial" || s === "inherit" || s === "none" || s === "currentColor") return null;
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (m) {
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a === 0) return null; // fully transparent
    return `#${[parseInt(m[1]), parseInt(m[2]), parseInt(m[3])].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return null;
}

function isNearBlack(hex: string): boolean {
  return parseInt(hex.slice(1, 3), 16) < 12 && parseInt(hex.slice(3, 5), 16) < 12 && parseInt(hex.slice(5, 7), 16) < 12;
}
function isNearWhite(hex: string): boolean {
  return parseInt(hex.slice(1, 3), 16) > 243 && parseInt(hex.slice(3, 5), 16) > 243 && parseInt(hex.slice(5, 7), 16) > 243;
}

/** Deduplicates CSS color strings, filters near-black/near-white, sorts by
 *  frequency, returns up to 8 design colors as #rrggbb hex. Pure → unit-testable. */
export function dedupeColors(rawColors: string[]): string[] {
  const freq = new Map<string, number>();
  for (const c of rawColors) {
    const hex = cssColorToHex(c);
    if (!hex || hex.length !== 7) continue;
    if (isNearBlack(hex) || isNearWhite(hex)) continue;
    freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h]) => h);
}

/** Quantizes a list of RGBA pixels using 5-bit buckets per channel.
 *  Returns a map of bucket-key → frequency, ignoring fully-transparent pixels.
 *  Pure → unit-testable. */
export function quantizePixels(pixels: RgbaPixel[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const { r, g, b, a } of pixels) {
    if (a < 10) continue; // ignore near-transparent
    // 5-bit bucket: shift right by 3 → 0-31 range per channel
    const key = `${r >> 3},${g >> 3},${b >> 3}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  return freq;
}

/** Converts a quantization bucket key back to a #rrggbb hex string.
 *  Mid-point of the bucket is used (shift left 3, add 4 for centre).
 *  Pure → unit-testable. */
export function bucketKeyToHex(key: string): string {
  const [rb, gb, bb] = key.split(",").map(Number);
  const r = Math.min(255, (rb << 3) + 4);
  const g = Math.min(255, (gb << 3) + 4);
  const b = Math.min(255, (bb << 3) + 4);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Picks the top-N most frequent non-black/non-white buckets, returns hex strings.
 *  Pure → unit-testable. */
export function topColorsFromBuckets(freq: Map<string, number>, topN = 8): string[] {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => bucketKeyToHex(key))
    .filter((hex) => !isNearBlack(hex) && !isNearWhite(hex))
    .slice(0, topN);
}

/** Describes the luminosity of a pixel list: "clair" if avg luminance > 0.55,
 *  "sombre" otherwise. Pure → unit-testable. */
export function luminosityLabel(pixels: RgbaPixel[]): "clair" | "sombre" {
  if (pixels.length === 0) return "clair";
  let sum = 0;
  for (const { r, g, b } of pixels) {
    // Relative luminance (perceptual, 0-1)
    sum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return sum / pixels.length > 0.55 ? "clair" : "sombre";
}

/** Describes the saturation of a pixel list: "vif" if avg saturation > 0.25,
 *  "sourd" otherwise. Pure → unit-testable. */
export function saturationLabel(pixels: RgbaPixel[]): "vif" | "sourd" {
  if (pixels.length === 0) return "sourd";
  let sum = 0;
  for (const { r, g, b } of pixels) {
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    sum += max === 0 ? 0 : (max - min) / max;
  }
  return sum / pixels.length > 0.25 ? "vif" : "sourd";
}

/** Describes the colour temperature of a pixel list: "chaud" if avg R ≥ avg B,
 *  "froid" otherwise. Returns "chaud" for an empty list (neutral default).
 *  Pure → unit-testable. */
export function temperatureLabel(pixels: RgbaPixel[]): "chaud" | "froid" {
  if (pixels.length === 0) return "chaud";
  let sumR = 0, sumB = 0;
  for (const { r, b } of pixels) { sumR += r; sumB += b; }
  return sumR / pixels.length >= sumB / pixels.length ? "chaud" : "froid";
}

/** Combines the three perceptual labels into a short descriptor string.
 *  Pure → unit-testable. */
export function ambianceDescriptor(pixels: RgbaPixel[]): string {
  return `${luminosityLabel(pixels)} · ${saturationLabel(pixels)} · ${temperatureLabel(pixels)}`;
}
