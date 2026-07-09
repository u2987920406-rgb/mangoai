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
} from "./vision.js";

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

line("═");
console.log(failures === 0 ? "✅ scrape_url : post-traitement prouvé." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
