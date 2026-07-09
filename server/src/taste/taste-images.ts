// Moteur de Goût (#149) — source d'images RÉELLES et pertinentes pour le redesign.
// Pexels (clé gratuite, PEXELS_API_KEY dans .env, posture Supabase/GitHub) avec repli
// loremflickr (sans clé) si aucune clé. Transport fetch injectable → testable.

const PEXELS_ENDPOINT = "https://api.pexels.com/v1/search";

export interface PexelsDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function pexelsConfigured(deps?: PexelsDeps): boolean {
  return !!(deps?.apiKey ?? process.env["PEXELS_API_KEY"]);
}

/** Image loremflickr thématique (repli sans clé), graine unique par direction. */
export function loremflickrUrl(keywords: string, seed: number, w = 1600, h = 1000): string {
  const kw = keywords.split(/[\s,]+/).filter(Boolean).map(encodeURIComponent).join(",");
  return `https://loremflickr.com/${w}/${h}/${kw}?lock=${Math.abs(seed) % 1000}`;
}

/**
 * Cherche une vraie photo pertinente via Pexels. `index` choisit une photo différente
 * (unicité par direction). Renvoie une URL d'image, ou null (→ le repli loremflickr).
 * Ne lève jamais.
 */
export async function fetchPexelsImage(query: string, opts: { index?: number; deps?: PexelsDeps } = {}): Promise<string | null> {
  const key = opts.deps?.apiKey ?? process.env["PEXELS_API_KEY"];
  if (!key) return null;
  const f = opts.deps?.fetchImpl ?? fetch;
  const url = `${PEXELS_ENDPOINT}?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
  try {
    const res = await f(url, { headers: { Authorization: key } });
    if (!res.ok) return null;
    const data = (await res.json()) as { photos?: { src?: { large2x?: string; large?: string; original?: string } }[] };
    const photos = data.photos ?? [];
    if (photos.length === 0) return null;
    const i = (((opts.index ?? 0) % photos.length) + photos.length) % photos.length;
    const src = photos[i]?.src;
    return src?.large2x ?? src?.large ?? src?.original ?? null;
  } catch {
    return null;
  }
}

/**
 * URL d'image pour une direction : Pexels si configuré (pertinent), sinon loremflickr.
 * `query` = sujet du projet + mood de la direction (ex. "coffee shop dark moody").
 */
export async function imageForDirection(query: string, seed: number, deps?: PexelsDeps): Promise<string> {
  const pexels = await fetchPexelsImage(query, { index: seed, deps });
  return pexels ?? loremflickrUrl(query, seed);
}

export interface PexelsResult { url: string; alt: string; photographer: string }

/**
 * Cherche plusieurs vraies photos Pexels pour une scène, EN UN SEUL appel. Renvoie au plus
 * `count` résultats (url + description + auteur). Tableau vide si pas de clé / aucun résultat.
 * Ne lève jamais. C'est la brique de l'outil `chercher_image` donné à l'Élève (souveraineté :
 * Mango trouve ses propres images au lieu de placeholders aléatoires).
 */
export async function searchPexelsImages(query: string, count = 3, deps?: PexelsDeps): Promise<PexelsResult[]> {
  const key = deps?.apiKey ?? process.env["PEXELS_API_KEY"];
  if (!key) return [];
  const f = deps?.fetchImpl ?? fetch;
  const url = `${PEXELS_ENDPOINT}?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`;
  try {
    const res = await f(url, { headers: { Authorization: key } });
    if (!res.ok) return [];
    const data = (await res.json()) as { photos?: { alt?: string; photographer?: string; src?: { large2x?: string; large?: string; original?: string } }[] };
    return (data.photos ?? [])
      .slice(0, Math.max(1, count))
      .map((p) => ({ url: p.src?.large2x ?? p.src?.large ?? p.src?.original ?? "", alt: p.alt ?? "", photographer: p.photographer ?? "" }))
      .filter((r) => r.url);
  } catch {
    return [];
  }
}
