// Couche DESIGN du « Sharingan complet » (#159 Phase 2). Extrait l'univers visuel
// d'une page (palette · typographies · graisses · tokens CSS · ambiance · layout)
// en réutilisant `sharinganAnalyze` (vision.ts, déjà la bouche design du Moteur de
// Goût #149). L'ambiance est DÉRIVÉE de la palette (pure, déterministe). Deps
// injectables → testable sans navigateur. Ne lève jamais (fail-open).

import { sharinganAnalyze } from "../vision.js";

export interface SiteDesign {
  url: string;
  ok: boolean;
  palette: string[];
  typographies: string[]; // familles de polices
  graisses: string[]; // weights
  tokens: [string, string][]; // variables CSS de design (filtrées)
  ambiance: string; // ex. "clair · doux · chaud"
  layout: { titre: string; sections: string[]; nav: string[]; cta: string[] };
  error?: string;
}

/** Forme minimale extraite d'une URL (sous-ensemble de SharinganResult). */
export interface SiteDesignDeps {
  analyzeUrl: (url: string) => Promise<{
    palette: string[];
    cssVars: Record<string, string>;
    typography: { families: string[]; weights: string[] };
    structure: { title: string; sections: string[]; navItems: string[]; ctaTexts: string[] };
  }>;
}

const realDeps: SiteDesignDeps = {
  analyzeUrl: async (url) => {
    const r = await sharinganAnalyze(url);
    return {
      palette: r.palette,
      cssVars: r.cssVars,
      typography: { families: r.typography.families, weights: r.typography.weights },
      structure: { title: r.structure.title, sections: r.structure.sections, navItems: r.structure.navItems, ctaTexts: r.structure.ctaTexts },
    };
  },
};

const KEY_TOKEN_RE = /color|bg|background|primary|secondary|accent|text|border|font|shadow|radius/i;

// ── Ambiance dérivée de la palette (PUR, déterministe) ───────────────────────
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = (hex ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  if (/^[0-9a-fA-F]{6}$/.test(h)) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  return null;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Descripteur d'ambiance compact « luminosité · saturation · température ». PUR. */
export function paletteAmbiance(hexes: string[]): string {
  const rgbs = hexes.map(parseHex).filter((c): c is { r: number; g: number; b: number } => !!c);
  if (rgbs.length === 0) return "indéterminée";
  const lum = avg(rgbs.map((c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255));
  const light = lum > 0.6 ? "clair" : lum < 0.35 ? "sombre" : "moyen";
  const sat = avg(
    rgbs.map((c) => {
      const mx = Math.max(c.r, c.g, c.b);
      const mn = Math.min(c.r, c.g, c.b);
      return mx === 0 ? 0 : (mx - mn) / mx;
    }),
  );
  const vivid = sat > 0.5 ? "vif" : sat < 0.2 ? "désaturé" : "doux";
  const ar = avg(rgbs.map((c) => c.r));
  const ab = avg(rgbs.map((c) => c.b));
  const temp = ar - ab > 20 ? "chaud" : ab - ar > 20 ? "froid" : "neutre";
  return `${light} · ${vivid} · ${temp}`;
}

function pickTokens(cssVars: Record<string, string>, max = 10): [string, string][] {
  return Object.entries(cssVars)
    .filter(([k]) => KEY_TOKEN_RE.test(k))
    .slice(0, max);
}

/** Extrait l'univers visuel d'une page. Ne lève jamais (ok:false si échec). */
export async function extractSiteDesign(url: string, deps: SiteDesignDeps = realDeps): Promise<SiteDesign> {
  try {
    const r = await deps.analyzeUrl(url);
    return {
      url,
      ok: true,
      palette: r.palette ?? [],
      typographies: r.typography?.families ?? [],
      graisses: r.typography?.weights ?? [],
      tokens: pickTokens(r.cssVars ?? {}),
      ambiance: paletteAmbiance(r.palette ?? []),
      layout: {
        titre: r.structure?.title ?? "",
        sections: r.structure?.sections ?? [],
        nav: r.structure?.navItems ?? [],
        cta: r.structure?.ctaTexts ?? [],
      },
    };
  } catch (e) {
    return {
      url,
      ok: false,
      palette: [],
      typographies: [],
      graisses: [],
      tokens: [],
      ambiance: "indéterminée",
      layout: { titre: "", sections: [], nav: [], cta: [] },
      error: e instanceof Error ? e.message.split("\n")[0] : String(e),
    };
  }
}

/** Met le design en bloc texte lisible (PUR). "" si rien d'exploitable. */
export function formatSiteDesign(d: SiteDesign): string {
  if (!d.ok && d.palette.length === 0) {
    return `## Design (Sharingan)\n(non capté${d.error ? ` : ${d.error}` : ""})`;
  }
  const lines: string[] = ["## Design (Sharingan)"];
  if (d.palette.length) lines.push(`Palette : ${d.palette.slice(0, 12).join(" ")}  ← réutilise ces couleurs`);
  if (d.typographies.length) lines.push(`Typographies : ${d.typographies.slice(0, 6).join(", ")}`);
  if (d.graisses.length) lines.push(`Graisses : ${d.graisses.slice(0, 6).join(", ")}`);
  lines.push(`Ambiance : ${d.ambiance}`);
  const lay: string[] = [];
  if (d.layout.titre) lay.push(`titre « ${d.layout.titre} »`);
  if (d.layout.sections.length) lay.push(`sections : ${d.layout.sections.slice(0, 8).join(" · ")}`);
  if (d.layout.nav.length) lay.push(`nav : ${d.layout.nav.slice(0, 8).join(" · ")}`);
  if (d.layout.cta.length) lay.push(`CTA : ${d.layout.cta.slice(0, 5).join(" · ")}`);
  if (lay.length) lines.push(`Layout : ${lay.join(" — ")}`);
  if (d.tokens.length) lines.push(`Tokens : ${d.tokens.map(([k, v]) => `${k}:${v}`).slice(0, 8).join(" ; ")}`);
  return lines.join("\n");
}
