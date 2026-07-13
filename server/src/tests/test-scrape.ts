// Preuve déterministe du post-traitement de scrape_url (aspiration d'URL
// publique). La capture elle-même est réseau/Playwright (non testée ici, comme
// pour test-webclone) ; on verrouille la partie PURE : processScraped — qui
// tronque le texte à la borne et dédoublonne/plafonne les liens — plus le
// garde-fou d'URL partagé isCloneableUrl.
//
// Lancer :  npx tsx src/test-scrape.ts

import {
  processScraped,
  isCloneableUrl,
  SCRAPE_MAX_TEXT,
  SCRAPE_MAX_LINKS,
  extractTextFromHtml,
  decodeHtmlEntities,
} from "../vision.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("scrape — processScraped (troncature + dédoublonnage liens)");
line();

// Texte court : intact, non tronqué.
const short = processScraped("Bonjour le monde", []);
check("texte court intact", short.text === "Bonjour le monde" && short.truncated === false);

// Texte au-delà de la borne : tronqué exactement à SCRAPE_MAX_TEXT.
const long = processScraped("a".repeat(SCRAPE_MAX_TEXT + 500), []);
check("texte long tronqué", long.truncated === true);
check("tronqué à la borne exacte", long.text.length === SCRAPE_MAX_TEXT);

// Liens : dédoublonnage par href, javascript:/href vide écartés.
const links = processScraped("", [
  { href: "https://a.com", label: "A" },
  { href: "https://a.com", label: "A bis (doublon)" },
  { href: "https://b.com", label: "B" },
  { href: "javascript:void(0)", label: "JS écarté" },
  { href: "", label: "vide écarté" },
]);
check("doublon href fusionné", links.links.length === 2);
check("premier libellé conservé", links.links[0].label === "A");
check("javascript: et vide écartés", !links.links.some((l) => l.href.startsWith("javascript:") || l.href === ""));

// Plafond : pas plus de SCRAPE_MAX_LINKS liens.
const many = processScraped(
  "",
  Array.from({ length: SCRAPE_MAX_LINKS + 25 }, (_, i) => ({ href: `https://x.com/${i}`, label: `L${i}` })),
);
check("liens plafonnés", many.links.length === SCRAPE_MAX_LINKS);

// Garde-fou d'URL (partagé avec clone_url) : public oui, localhost/privé non.
line();
console.log("scrape — garde-fou isCloneableUrl");
line();
check("https public accepté", isCloneableUrl("https://news.ycombinator.com"));
check("localhost rejeté", !isCloneableUrl("http://localhost:5174"));
check("plage privée rejetée", !isCloneableUrl("http://192.168.0.1"));

// ── Lecture LÉGÈRE (2026-07-13, sans navigateur) ────────────────────────────
line();
console.log("scrape — extractTextFromHtml (extraction texte/titre/liens sans navigateur)");
line();

{
  const html = `<html><head><title>Ma Page &amp; Cie</title></head><body>
    <script>alert('bruit')</script>
    <style>.x{color:red}</style>
    <!-- commentaire -->
    <h1>Titre visible</h1>
    <p>Un paragraphe avec un lien <a href="/relatif">relatif</a> et un autre
    <a href="https://externe.example/page">externe</a>.</p>
  </body></html>`;
  const r = extractTextFromHtml(html, "https://site.example/dossier/page.html");
  check("titre décodé (entité &amp;)", r.title === "Ma Page & Cie");
  check("script/style/commentaire retirés du texte", !r.text.includes("bruit") && !r.text.includes("color:red") && !r.text.includes("commentaire"));
  check("texte visible conservé", r.text.includes("Titre visible") && r.text.includes("Un paragraphe"));
  check("lien relatif résolu vers l'absolu", r.links.some((l) => l.href === "https://site.example/relatif"));
  check("lien absolu conservé tel quel", r.links.some((l) => l.href === "https://externe.example/page"));
  check("libellé du lien extrait sans les balises", r.links.some((l) => l.label === "relatif"));
}

{
  // (2026-07-13, cas réel ludum.fr) — payload JS planqué en <textarea display:none>
  // (technique courante) : un regex n'a pas la cascade CSS, donc on l'écarte au
  // même titre qu'un <script>, plutôt que de le faire fuiter comme « texte visible ».
  const html = `<p>Contenu réel visible.</p><textarea style="display:none">num = $('.x').attr('y'); recablageCartAndFavorites();</textarea>`;
  const r = extractTextFromHtml(html, "https://x.example/");
  check("textarea (payload JS caché) écarté du texte", !r.text.includes("recablageCartAndFavorites"));
  check("contenu réel toujours présent", r.text.includes("Contenu réel visible"));
}

{
  // (2026-07-13, cas réel ludum.fr) — le contenu de <main> doit passer AVANT le
  // reste (nav/header/footer déjà retirés du texte), sans être dupliqué.
  const html = `
    <header><nav>Accueil > Jeux > Stratégie > Beaucoup de liens de menu ici bla bla</nav></header>
    <body>
      <main><h1>World Order</h1><p>Un jeu de stratégie géopolitique où quatre puissances s'affrontent.</p></main>
      <aside>Produits similaires : Diplomacy, Risk, Twilight Struggle...</aside>
    </body>
    <footer>Livraison, CGV, mentions légales, plan du site...</footer>`;
  const r = extractTextFromHtml(html, "https://x.example/");
  check("le contenu de <main> est en TÊTE du texte", r.text.startsWith("World Order"));
  check("nav/header/footer/aside absents du texte (bruit de chrome)", !r.text.includes("Beaucoup de liens de menu") && !r.text.includes("mentions légales") && !r.text.includes("Produits similaires"));
  check("le contenu de <main> n'est pas dupliqué", (r.text.match(/World Order/g) ?? []).length === 1);
}

{
  // Pas de <main>/<article> → repli sur le texte complet (nav/header/footer déjà
  // retirés), comportement historique préservé pour les pages sans HTML5 sémantique.
  const html = `<header><nav>menu</nav></header><div><p>Contenu sans balise sémantique.</p></div>`;
  const r = extractTextFromHtml(html, "https://x.example/");
  check("sans <main>/<article> : repli sur le texte restant", r.text.includes("Contenu sans balise sémantique"));
  check("nav toujours retiré même sans <main>", !r.text.includes("menu"));
}

{
  // Ancre pure (#section) écartée — cohérent avec processScraped (href vide/JS).
  const html = `<a href="#haut">Retour en haut</a><a href="https://x.example">ok</a>`;
  const r = extractTextFromHtml(html, "https://x.example/");
  check("ancre # seule écartée", !r.links.some((l) => l.href.includes("#haut")));
  check("lien normal conservé", r.links.some((l) => l.href === "https://x.example/"));
}

console.log("\nscrape — decodeHtmlEntities");
{
  check("entités nommées", decodeHtmlEntities("A&amp;B &lt;tag&gt; &quot;q&quot; &#39;a&#39;") === `A&B <tag> "q" 'a'`);
  check("entité numérique décimale", decodeHtmlEntities("&#233;") === "é");
  check("entité numérique hex", decodeHtmlEntities("&#xe9;") === "é");
  check("nbsp → espace", decodeHtmlEntities("a&nbsp;b") === "a b");
}

line("═");
console.log(failures === 0 ? "✅ scrape_url : post-traitement prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
