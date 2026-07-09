// Moteur de Goût (#149) — couche CAPTURE : transforme les références (taste-refs.ts)
// en tokens/ambiance RÉELS via les deux bouches du Sharingan, puis assemble le brief
// de skin pour GLM. Transports injectés → testable sans réseau ni navigateur.
//
// (La couche GÉNÉRATION — GLM applique le skin, preview, screenshot, galerie — vient
//  ensuite et s'appuiera sur buildSkinBrief.)

import { sharinganAnalyze, analyzeImageFile } from "../vision.js";
import { getDirection, directionBrief, type TasteDirection } from "./taste-directions.js";
import type { DirectionRefs } from "./taste-refs.js";

export interface UrlCapture {
  url: string;
  ok: boolean;
  palette: string[];
  tokens: [string, string][]; // variables CSS de design (filtrées)
  fonts: string[];
  families: string[];
  error?: string;
}

export interface ImageCapture {
  image: string;
  ok: boolean;
  palette: string[];
  ambiance: string; // "clair · vif · chaud"
  error?: string;
}

export interface DirectionCapture {
  id: string;
  name: string;
  urls: UrlCapture[];
  images: ImageCapture[];
  palette: string[]; // palette fusionnée (URLs puis images), dédupliquée, plafonnée
  notes: string;
}

export interface CaptureDeps {
  analyzeUrl: (url: string) => Promise<{ palette: string[]; cssVars: Record<string, string>; fonts: string[]; families: string[] }>;
  analyzeImage: (absPath: string) => Promise<{ palette: string[]; ambiance: string }>;
}

const KEY_TOKEN_RE = /color|bg|background|primary|secondary|accent|text|border|font|shadow|radius/i;

/** Transports réels (Sharingan). Remplacés par des faux dans les tests. */
export const defaultCaptureDeps: CaptureDeps = {
  analyzeUrl: async (url) => {
    const r = await sharinganAnalyze(url);
    return { palette: r.palette, cssVars: r.cssVars, fonts: r.fonts, families: r.typography.families };
  },
  analyzeImage: async (absPath) => {
    const r = await analyzeImageFile(absPath);
    return { palette: r.palette, ambiance: r.ambiance };
  },
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0] : String(err);
}

/** Déduplication insensible à la casse, casse d'origine préservée. */
function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

function pickTokens(cssVars: Record<string, string>, max = 10): [string, string][] {
  return Object.entries(cssVars)
    .filter(([k]) => KEY_TOKEN_RE.test(k))
    .slice(0, max);
}

/**
 * Capture TOUTES les références d'une direction via les deux bouches du Sharingan.
 * Ne lève JAMAIS : une référence en échec est enregistrée `ok:false` (fail-open).
 */
export async function captureDirectionRefs(refs: DirectionRefs, deps: CaptureDeps = defaultCaptureDeps): Promise<DirectionCapture> {
  const urls: UrlCapture[] = [];
  for (const url of refs.urls) {
    try {
      const r = await deps.analyzeUrl(url);
      urls.push({ url, ok: true, palette: r.palette, tokens: pickTokens(r.cssVars), fonts: r.fonts, families: r.families });
    } catch (err) {
      urls.push({ url, ok: false, palette: [], tokens: [], fonts: [], families: [], error: errMsg(err) });
    }
  }

  const images: ImageCapture[] = [];
  for (const img of refs.images) {
    try {
      const r = await deps.analyzeImage(img);
      images.push({ image: img, ok: true, palette: r.palette, ambiance: r.ambiance });
    } catch (err) {
      images.push({ image: img, ok: false, palette: [], ambiance: "", error: errMsg(err) });
    }
  }

  // URLs d'abord (tokens CSS exacts), images ensuite (mood), dédupliqué, plafonné.
  const palette = dedupe([...urls.flatMap((u) => u.palette), ...images.flatMap((i) => i.palette)]).slice(0, 12);
  return { id: refs.id, name: refs.name, urls, images, palette, notes: refs.notes };
}

/** Récupère la TasteDirection de catalogue correspondante (null si direction custom). */
export function catalogDirection(id: string): TasteDirection | null {
  return getDirection(id) ?? null;
}

/**
 * Assemble le fragment de prompt GLM pour une skin : spec statique de la direction
 * + VRAIES références captées (qui priment sur le repli).
 */
export function buildSkinBrief(direction: TasteDirection | null, cap: DirectionCapture): string {
  const lines: string[] = [];
  lines.push(direction ? directionBrief(direction) : `Direction esthétique : « ${cap.name} ».`);

  const okUrls = cap.urls.filter((u) => u.ok);
  const okImgs = cap.images.filter((i) => i.ok);
  if (okUrls.length || okImgs.length) {
    lines.push("", "RÉFÉRENCES RÉELLES CAPTÉES (imite ces valeurs — elles PRIMENT sur le repli) :");
    if (cap.palette.length) lines.push(`- Palette mesurée : ${cap.palette.join(" · ")}`);
    const fonts = dedupe(okUrls.flatMap((u) => [...u.families, ...u.fonts])).slice(0, 6);
    if (fonts.length) lines.push(`- Typographies réelles : ${fonts.join(", ")}`);
    const tokens = okUrls.flatMap((u) => u.tokens).slice(0, 10);
    if (tokens.length) lines.push(`- Tokens CSS captés : ${tokens.map(([k, v]) => `${k}:${v}`).join(" · ")}`);
    const amb = dedupe(okImgs.map((i) => i.ambiance).filter(Boolean));
    if (amb.length) lines.push(`- Ambiance (images) : ${amb.join(" / ")}`);
  }
  if (cap.notes) lines.push("", `Note de Raf : ${cap.notes}`);
  return lines.join("\n");
}
