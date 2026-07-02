// Helpers PURS du crawler (#159 Phase 1) — isolés de vision.ts (qui tire
// Playwright) pour rester testables sans navigateur. Ré-exportés par
// site-crawler.ts pour préserver l'API publique.

/** Normalise une URL (absolue via base) : retire le fragment, garde query.
 * Le préfixe `www.` de tête est retiré de l'hôte pour que `www.exemple.com`
 * et `exemple.com` soient considérés comme la même page (L12 — dédup www/apex).
 * "" si invalide. */
export function normalizeUrl(href: string, base?: string): string {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    if (u.hostname.startsWith("www.")) u.hostname = u.hostname.slice(4);
    return u.toString();
  } catch {
    return "";
  }
}

/** Domaine de base (2 derniers labels) — sub.exemple.com → exemple.com. */
export function baseDomain(urlOrHost: string): string {
  let host = urlOrHost;
  try {
    host = new URL(urlOrHost).hostname;
  } catch {
    /* déjà un hostname */
  }
  const parts = host.toLowerCase().split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

/** Deux URLs sont-elles sur le même domaine de base ? */
export function sameSite(a: string, b: string): boolean {
  return baseDomain(a) === baseDomain(b) && baseDomain(a) !== "";
}

/** Score de pertinence DÉTERMINISTE : nb de mots-clés présents dans le texte. */
export function relevanceScore(haystack: string, keywords: string[]): number {
  const h = haystack.toLowerCase();
  let s = 0;
  for (const k of keywords) if (k.length >= 3 && h.includes(k)) s++;
  return s;
}

/** Liens de service universels (jamais du contenu) : on ne les suit pas. */
const BOILERPLATE_RE = /\b(log\s?in|sign\s?[ui]p|create account|my account|privacy|cookies?|terms of|newsletter|subscribe|download the app)\b/i;
export function isBoilerplateLink(label: string, url: string): boolean {
  if (BOILERPLATE_RE.test(label)) return true;
  return /[?&](returnto|action|redirect|fromsignup)=|special:|\/(login|signin|signup|account|register)(\/|$|\?)/i.test(url);
}

/** Signal de pertinence d'un lien : libellé + CHEMIN (pas la query, qui rejoue
 * souvent le titre dans returnto=… et fausse le score). */
export function linkText(label: string, url: string): string {
  let path = "";
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    /* ignore */
  }
  return `${label} ${path}`;
}
