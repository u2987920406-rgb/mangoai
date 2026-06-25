// Crawler borné pour #159 « Sharingan complet » — PHASE 1 (navigation + texte).
//
// Explore un site web en profondeur de façon BORNÉE et SÛRE : à partir d'une URL
// graine, suit les liens utiles (même domaine par défaut + quelques sauts externes
// très pertinents), lit N pages, et renvoie leur contenu texte. Socle de l'outil
// `extraire_site` ; les couches design/vision/synthèse viennent aux phases 2-4.
//
// SÉCURITÉ : anti-SSRF (`isCloneableUrl`) sur CHAQUE url ; confinement même-domaine
// + budget de sauts externes ; bornes pages/profondeur ; politesse (délai). Le
// contenu est de la DONNÉE non fiable — le `sanitizeExternal` est appliqué par
// l'appelant (`extraire_site`), pas ici. Ne lève JAMAIS : toute panne d'une page
// devient une entrée `skipped`.

import { isCloneableUrl, scrapeExternal, type ScrapedPage } from "./vision.js";

export interface PageContent {
  url: string;
  title: string;
  text: string;
  links: { href: string; label: string }[];
  depth: number;
  external: boolean;
}

export interface CrawlReport {
  seed: string;
  pages: PageContent[];
  skipped: { url: string; reason: string }[];
  truncated: boolean; // une borne (pages/profondeur) a coupé l'exploration
}

export interface CrawlOptions {
  maxPages?: number; // défaut 8
  maxDepth?: number; // défaut 2
  maxExternalHops?: number; // défaut 3
  objectif?: string; // oriente la pertinence des liens suivis
  politeDelayMs?: number; // défaut 250 (délai entre requêtes)
  maxLinksPerPage?: number; // candidats liens examinés par page (défaut 60)
}

export interface CrawlDeps {
  scrape: (url: string) => Promise<ScrapedPage>;
  isAllowed: (url: string) => boolean; // anti-SSRF
  sleep: (ms: number) => Promise<void>;
}

const realDeps: CrawlDeps = {
  scrape: (u) => scrapeExternal(u),
  isAllowed: isCloneableUrl,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

// ── Helpers PURS (testables) ─────────────────────────────────────────────────

/** Normalise une URL (absolue via base) : retire le fragment, garde query. "" si invalide. */
export function normalizeUrl(href: string, base?: string): string {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
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

/** Mots-clés pour juger la pertinence d'un saut : objectif + nom du domaine graine. */
function keywordsFor(seed: string, objectif?: string): string[] {
  const fromObj = (objectif ?? "").toLowerCase().match(/[a-zà-ÿ0-9]{3,}/gi) ?? [];
  const dom = baseDomain(seed).split(".")[0] ?? "";
  return [...new Set([...fromObj, dom].filter(Boolean))];
}

/** Met le rapport de crawl en texte lisible (PUR) : un bloc par page, borné. */
export function formatCrawlDigest(report: CrawlReport, maxCharsPerPage = 1200, maxLinks = 6): string {
  const blocks = report.pages.map((p) => {
    const head = `${p.external ? "↗ " : ""}${p.title || p.url}`;
    const body = p.text.length > maxCharsPerPage ? p.text.slice(0, maxCharsPerPage) + " …" : p.text;
    const links = p.links
      .map((l) => l.label)
      .filter((l) => l && l.length > 1)
      .slice(0, maxLinks)
      .join(" · ");
    return `### ${head}\n${p.url}\n${body.trim()}${links ? `\nLiens : ${links}` : ""}`;
  });
  return blocks.join("\n\n");
}

// ── Crawl BFS borné ──────────────────────────────────────────────────────────

/**
 * Explore un site depuis `seed` : BFS borné, même-domaine + sauts externes
 * pertinents (budget), anti-SSRF par url, politesse. Ne lève jamais.
 */
export async function crawlSite(
  seed: string,
  opts: CrawlOptions = {},
  deps: CrawlDeps = realDeps,
): Promise<CrawlReport> {
  const maxPages = Math.min(20, Math.max(1, Math.floor(opts.maxPages ?? 8)));
  const maxDepth = Math.min(4, Math.max(0, Math.floor(opts.maxDepth ?? 2)));
  let externalBudget = Math.min(8, Math.max(0, Math.floor(opts.maxExternalHops ?? 3)));
  const maxLinksPerPage = Math.max(1, Math.floor(opts.maxLinksPerPage ?? 60));
  const delay = Math.max(0, Math.floor(opts.politeDelayMs ?? 250));
  const keywords = keywordsFor(seed, opts.objectif);

  const report: CrawlReport = { seed, pages: [], skipped: [], truncated: false };
  const normSeed = normalizeUrl(seed);
  if (!normSeed) {
    report.skipped.push({ url: seed, reason: "URL invalide" });
    return report;
  }

  const seen = new Set<string>([normSeed]);
  const queue: Array<{ url: string; depth: number; external: boolean }> = [
    { url: normSeed, depth: 0, external: false },
  ];

  while (queue.length > 0) {
    if (report.pages.length >= maxPages) {
      report.truncated = true;
      break;
    }
    const { url, depth, external } = queue.shift()!;

    if (!deps.isAllowed(url)) {
      report.skipped.push({ url, reason: "bloqué (anti-SSRF / non-http)" });
      continue;
    }

    let scraped: ScrapedPage;
    try {
      scraped = await deps.scrape(url);
    } catch (e) {
      report.skipped.push({ url, reason: `inaccessible : ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    report.pages.push({
      url,
      title: scraped.title ?? "",
      text: scraped.text ?? "",
      links: scraped.links ?? [],
      depth,
      external,
    });
    if (delay > 0) await deps.sleep(delay);

    if (depth >= maxDepth) continue;

    // Classer les liens de cette page : même-domaine d'abord, externes pertinents ensuite.
    const candidates = (scraped.links ?? []).slice(0, maxLinksPerPage);
    const internal: Array<{ url: string; score: number }> = [];
    const externals: Array<{ url: string; score: number }> = [];
    for (const l of candidates) {
      const n = normalizeUrl(l.href, url);
      if (!n || seen.has(n)) continue;
      if (isBoilerplateLink(l.label, n)) continue; // login/signup/legal… jamais du contenu
      const score = relevanceScore(linkText(l.label, n), keywords);
      if (sameSite(n, normSeed)) internal.push({ url: n, score });
      else externals.push({ url: n, score });
    }
    // Internes : les plus PERTINENTS d'abord (objectif), pour ne pas gaspiller le
    // budget de pages sur la navigation/boilerplate. Sans objectif → ordre du DOM.
    internal.sort((a, b) => b.score - a.score);
    for (const it of internal) {
      if (seen.has(it.url)) continue;
      seen.add(it.url);
      queue.push({ url: it.url, depth: depth + 1, external: false });
    }
    // Externes : seulement les plus PERTINENTS (score > 0), dans la limite du budget.
    externals.sort((a, b) => b.score - a.score);
    for (const ext of externals) {
      if (externalBudget <= 0) break;
      if (ext.score <= 0 || seen.has(ext.url)) continue;
      seen.add(ext.url);
      queue.push({ url: ext.url, depth: depth + 1, external: true });
      externalBudget--;
    }
  }

  return report;
}
