// Couche IMAGES CONTEXTUELLES du « Sharingan complet » (#159 Phase 5).
//
// Le dossier dit ce QU'EST le site (concept, mécaniques, mood) ; ici on l'ILLUSTRE :
// on dérive des requêtes du dossier et on rapporte de VRAIES photos pertinentes
// (Pexels, #149/#153) — le SOUVERAIN par défaut, gratuit, pas de placeholder
// aléatoire. La GÉNÉRATION via une API externe reste ACTIVABLE (gate + clé), jamais
// imposée : on prépare des prompts de génération depuis le dossier (palette+mood+
// concept) et, si un backend de génération est branché, on l'appelle.
//
// Tout est PUR côté dérivation (testable) ; les appels réseau sont injectables et
// GRACIEUX (ne lève jamais). Les images ne sont PAS persistées dans l'artefact
// (URLs éphémères, spécifiques au build courant) : ce sont des suggestions pour GLM.

import { searchPexelsImages, pexelsConfigured } from "./taste-images.js";
import type { SiteDossier } from "./site-dossier.js";

const STOP = new Set([
  "site", "officiel", "de", "du", "des", "la", "le", "les", "un", "une", "et", "ou", "pour", "par", "en", "sur", "avec",
  "the", "of", "and", "a", "an", "to", "for", "plateforme", "application", "app", "web", "page", "ligne", "online",
]);

/** Mots-clés significatifs d'un texte (stopwords retirés, bornés). PUR. */
function keywords(text: string, max = 5): string[] {
  const ws = (text ?? "").toLowerCase().match(/[a-zà-ÿ0-9]{3,}/gi) ?? [];
  const out: string[] = [];
  for (const w of ws) {
    if (STOP.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Dérive jusqu'à `max` requêtes d'image du dossier (concept+mood, puis mécaniques). PUR. */
export function imageQueriesFromDossier(d: SiteDossier, max = 3): string[] {
  const queries: string[] = [];
  const conceptKw = keywords(d.concept, 4);
  const moodKw = keywords(d.mood, 2);
  const head = [...conceptKw, ...moodKw].join(" ").trim();
  if (head) queries.push(head);
  for (const m of d.mecaniques.slice(0, max)) {
    const k = keywords(m, 3).join(" ").trim();
    if (k) queries.push(k);
  }
  return [...new Set(queries)].slice(0, Math.max(1, max));
}

/** Prompts de génération descriptifs depuis le dossier (palette+mood+concept). PUR. */
export function generationPromptsFromDossier(d: SiteDossier): string[] {
  const pal = d.design.palette.slice(0, 4).join(", ");
  const base = [d.concept, d.mood].filter(Boolean).join(", ");
  if (!base && !pal) return [];
  const tone = d.tonEditorial ? `${d.tonEditorial} tone, ` : "";
  const prompts = [`Hero image illustrating: ${base || "this website"}.${pal ? ` Color palette: ${pal}.` : ""} ${tone}modern, high quality, no text.`];
  if (d.mecaniques[0]) {
    prompts.push(`Illustration of "${d.mecaniques[0]}".${pal ? ` Palette: ${pal}.` : ""} ${tone}clean, minimal.`);
  }
  return prompts;
}

export interface SiteImagePhoto {
  query: string;
  url: string;
  alt: string;
}

export interface SiteImages {
  queries: string[];
  photos: SiteImagePhoto[]; // souverain : vraies photos Pexels
  pexelsConfigured: boolean;
  genEnabled: boolean;
  genPrompts: string[]; // prompts prêts pour une API de génération (gaté)
  generated: string[]; // URLs générées si un backend de génération est branché
}

/** Dépendances injectables (tests sans réseau). */
export interface SiteImagesDeps {
  searchImages: (query: string, count: number) => Promise<{ url: string; alt: string }[]>;
  isPexelsConfigured: () => boolean;
  /** Backend de génération externe (gaté). Absent → on ne fournit que des prompts. */
  generate?: (prompt: string) => Promise<{ url: string } | null>;
}

const realDeps: SiteImagesDeps = {
  searchImages: (q, n) => searchPexelsImages(q, n).then((r) => r.map((p) => ({ url: p.url, alt: p.alt }))),
  isPexelsConfigured: () => pexelsConfigured(),
};

async function safeAsync<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Propose des images contextuelles pour un dossier. Souverain par défaut (Pexels) ;
 * génération seulement si `genEnabled`. Ne lève jamais.
 */
export async function suggestSiteImages(
  d: SiteDossier,
  opts: { perQuery?: number; genEnabled?: boolean } = {},
  deps: SiteImagesDeps = realDeps,
): Promise<SiteImages> {
  const queries = imageQueriesFromDossier(d);
  const perQuery = Math.max(1, Math.min(3, opts.perQuery ?? 1));
  const genEnabled = opts.genEnabled ?? false;

  let configured = false;
  try {
    configured = deps.isPexelsConfigured();
  } catch {
    configured = false;
  }

  const photos: SiteImagePhoto[] = [];
  if (configured) {
    for (const q of queries) {
      const imgs = await safeAsync(() => deps.searchImages(q, perQuery), [] as { url: string; alt: string }[]);
      for (const im of imgs) if (im.url) photos.push({ query: q, url: im.url, alt: im.alt ?? "" });
    }
  }

  const genPrompts = genEnabled ? generationPromptsFromDossier(d) : [];
  const generated: string[] = [];
  if (genEnabled && deps.generate) {
    for (const p of genPrompts) {
      const g = await safeAsync(() => deps.generate!(p), null);
      if (g?.url) generated.push(g.url);
    }
  }

  return { queries, photos, pexelsConfigured: configured, genEnabled, genPrompts, generated };
}

/** Nettoie un texte externe (alt Pexels) → une ligne courte. */
function cleanAlt(s: string): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}

/** Rend les images en bloc « ## Images contextuelles » (PUR). "" si rien d'utile. */
export function formatSiteImages(img: SiteImages): string {
  if (img.queries.length === 0) return "";
  const L: string[] = ["## Images contextuelles (pour illustrer ce site)"];

  if (img.photos.length > 0) {
    L.push("Vraies photos pertinentes (Pexels — utilise ces URLs telles quelles dans <img> / background) :");
    for (const p of img.photos) {
      L.push(`- [${p.query}] ${p.url}${p.alt ? `  (${cleanAlt(p.alt)})` : ""}`);
    }
  } else if (!img.pexelsConfigured) {
    L.push(
      `Pexels non configuré (PEXELS_API_KEY absente). Pour de vraies images, utilise l'outil chercher_image avec ces requêtes : ${img.queries
        .map((q) => `« ${q} »`)
        .join(", ")}.`,
    );
  } else {
    L.push(`Aucune photo trouvée pour : ${img.queries.map((q) => `« ${q} »`).join(", ")}. Reformule via chercher_image si besoin.`);
  }

  if (img.genEnabled) {
    if (img.generated.length > 0) {
      L.push("", "Images GÉNÉRÉES (API externe) :");
      for (const u of img.generated) L.push(`- ${u}`);
    } else if (img.genPrompts.length > 0) {
      L.push("", "Génération activée mais aucun backend branché — prompts prêts (à passer à une API de génération) :");
      for (const p of img.genPrompts) L.push(`- ${p}`);
    }
  }

  return L.join("\n");
}
