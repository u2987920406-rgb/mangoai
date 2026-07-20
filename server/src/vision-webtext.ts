// Extraction texte/HTML PURE, extraite de vision.ts (#190 tâche #6). Zéro I/O — pas
// de fetch/navigateur ici, uniquement du post-traitement de chaînes déjà en mémoire.
// Re-exporté par vision.ts pour que les fichiers qui importent déjà `from "./vision.js"`
// restent inchangés.

// Accepts only public http(s) URLs — blocks localhost/private ranges so the tool
// can't be turned against the user's own preview/backend (light SSRF hygiene).
// Pure → unit-testable.
export function isCloneableUrl(s: string): boolean {
  let u: URL;
  try {
    u = new URL((s ?? "").trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h === "::1") return false;
  if (/^(127\.|10\.|0\.0\.0\.0|169\.254\.|192\.168\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

export const SCRAPE_MAX_TEXT = 16_000; // caractères — borne le coût en tokens
export const SCRAPE_MAX_LINKS = 60;

export interface ScrapedPage {
  title: string;
  text: string;
  links: { href: string; label: string }[];
  truncated: boolean;
}

/** Post-traitement PUR du brut extrait du DOM (→ testable sans réseau) :
 * tronque le texte à la borne, dédoublonne les liens par href, écarte les
 * `javascript:`/href vides, et plafonne le nombre. */
export function processScraped(
  rawText: string,
  rawLinks: { href: string; label: string }[],
): { text: string; links: { href: string; label: string }[]; truncated: boolean } {
  const truncated = rawText.length > SCRAPE_MAX_TEXT;
  const text = truncated ? rawText.slice(0, SCRAPE_MAX_TEXT) : rawText;
  const seen = new Set<string>();
  const links: { href: string; label: string }[] = [];
  for (const l of rawLinks) {
    if (!l.href || l.href.startsWith("javascript:") || seen.has(l.href)) continue;
    seen.add(l.href);
    links.push(l);
    if (links.length >= SCRAPE_MAX_LINKS) break;
  }
  return { text, links, truncated };
}

/** Décode les entités HTML courantes (nommées + numériques). PUR. */
export function decodeHtmlEntities(s: string): string {
  return (s ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** Extrait titre + texte visible + liens d'un HTML brut, SANS navigateur (pas de
 * JS exécuté — un getter statique, comme un robot d'indexation). PUR, testable
 * sans réseau. `baseUrl` résout les liens relatifs. */
export function extractTextFromHtml(html: string, baseUrl: string): { title: string; text: string; links: { href: string; label: string }[] } {
  // `<textarea>` retiré au même titre : des sites y planquent des payloads JS
  // (masqués en `display:none`, ex. ludum.fr) — un regex n'a pas la cascade CSS
  // pour le savoir, donc autant l'écarter comme du bruit non-éditorial.
  const cleaned = (html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim() : "";

  const links: { href: string; label: string }[] = [];
  const linkRe = /<a\s+[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(cleaned))) {
    let href: string;
    try {
      href = new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
    const label = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ href, label });
  }

  // (2026-07-13, cas réel ludum.fr) — le CHROME de page (menu, en-tête, pied de
  // page, panneaux latéraux) est presque toujours du bruit, jamais ce qu'on est
  // venu lire ; sur les gros sites e-commerce il peut à lui seul remplir toute
  // la fenêtre de texte (`SCRAPE_MAX_TEXT`) avant que le contenu réel n'ait sa
  // chance. On le retire du flux narratif (pas des LIENS, extraits juste avant :
  // un lien de menu reste un lien valide).
  const withoutChrome = cleaned
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");

  // Contenu PRINCIPAL en priorité : la balise sémantique <main>/<article> (quand
  // présente — cas courant, y compris ludum.fr) porte le contenu qu'on cherche
  // vraiment. On le met en TÊTE du texte renvoyé pour qu'il survive à la
  // troncature en aval, puis le reste de la page suit en second (contexte
  // secondaire) — sans le dupliquer.
  let primaryHtml = "";
  let bodyHtml = withoutChrome;
  const mainMatch = withoutChrome.match(/<main[\s\S]*?<\/main>/i) ?? withoutChrome.match(/<article[\s\S]*?<\/article>/i);
  if (mainMatch && mainMatch.index !== undefined) {
    primaryHtml = mainMatch[0];
    bodyHtml = withoutChrome.slice(0, mainMatch.index) + withoutChrome.slice(mainMatch.index + mainMatch[0].length);
  }

  const toPlainText = (fragment: string): string => {
    const withBreaks = fragment.replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
    const stripped = withBreaks.replace(/<[^>]+>/g, " ");
    return decodeHtmlEntities(stripped)
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const primaryText = primaryHtml ? toPlainText(primaryHtml) : "";
  const restText = toPlainText(bodyHtml);
  // Seuil bas (juste anti-vide, pas anti-court) : un <main> non-vide est déjà un
  // signal de pertinence bien plus fort qu'une absence de balise sémantique.
  const text = primaryText.length > 20 ? `${primaryText}\n\n${restText}`.trim() : restText;

  return { title, text, links };
}
