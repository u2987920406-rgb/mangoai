// Tests de la banque d'images LOCALES (eleve-image-bank, L123) — garantir de VRAIES
// images même avec un Élève qui invente des URLs/chemins. Déterministe : projet temp
// réel + fetch INJECTÉ (zéro réseau). On prouve : dérivation de requêtes, curation +
// téléchargement local + manifeste, filet qui remplace les cassées (URL morte ET chemin
// local inventé) par la banque, non-régression sans clé, et zéro faux positif sur les
// chemins internes d'une URL http.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deriveQueries,
  curateImageBank,
  guaranteeLocalImages,
  formatImageBankForPrompt,
  extractLocalImageRefs,
  loadImageBank,
  type ImageBankEntry,
} from "../eleve-image-bank.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`  ❌ ${label}`); }
}

const DEAD = "https://images.pexels.com/photos/999/dead-invented.jpg";

/** fetch faux : Pexels search → 6 photos par requête (URLs uniques) ; téléchargement
 * d'image → octets non vides ; DEAD → 404 ; toute autre URL → 200. */
const fakeFetch = (async (input: RequestInfo | URL) => {
  const u = String(input);
  if (u.includes("api.pexels.com/v1/search")) {
    const q = decodeURIComponent(/query=([^&]+)/.exec(u)?.[1] ?? "x");
    const slug = encodeURIComponent(q).replace(/%20/g, "-");
    const photos = Array.from({ length: 6 }, (_, i) => ({
      src: { large2x: `https://images.pexels.com/photos/${1000 + i}/${slug}-${i}.jpeg` },
      alt: `${q} ${i}`,
      photographer: "Test",
    }));
    return new Response(JSON.stringify({ photos }), { status: 200 });
  }
  if (u.startsWith(DEAD)) return new Response(null, { status: 404 });
  // téléchargement d'image (curate) ou probe d'une URL vivante
  return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200 });
}) as unknown as typeof fetch;

async function run() {
  // ── deriveQueries ────────────────────────────────────────────────────────────
  const q = deriveQueries("Crée une galerie de luminaires en laiton et plâtre, éditions limitées");
  check("deriveQueries produit au moins 1 requête", q.length >= 1);
  check("deriveQueries filtre les mots vides / verbiage", !q.join(" ").includes("crée") && !q.join(" ").includes("une"));
  check("deriveQueries garde les mots-clés du sujet", /luminaires|laiton|galerie/.test(q.join(" ")));
  check("deriveQueries vide sur brief sans mot-clé", deriveQueries("").length === 0);

  // ── curateImageBank : télécharge en local + manifeste ────────────────────────
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgbank-"));
  fs.mkdirSync(path.join(proj, "src"), { recursive: true });
  const bank = await curateImageBank("galerie luminaires laiton plâtre éditions", proj, { fetchImpl: fakeFetch, pexelsKey: "TESTKEY" });

  check("curateImageBank remplit la banque", bank.length > 0 && bank.length <= 8);
  check("chaque entrée est un chemin local /images/", bank.every((e) => e.localPath.startsWith("/images/")));
  check("les fichiers image sont RÉELLEMENT téléchargés dans public/images/", bank.every((e) => fs.existsSync(path.join(proj, "public", e.localPath.replace(/^\//, "")))));
  check("le manifeste .mango-image-bank.json est écrit", fs.existsSync(path.join(proj, ".mango-image-bank.json")));
  check("loadImageBank relit le manifeste", loadImageBank(proj).length === bank.length);
  // (2026-07-11) alias de nommage : couvre un cerveau qui construit le nom EN JS
  // (`img-${i}.jpg`, invisible à un scan statique) au lieu de copier le chemin exact.
  check("alias 1-based non-paddé écrit (img-1.*)", fs.existsSync(path.join(proj, "public", "images", `img-1.${bank[0].localPath.split(".").pop()}`)));
  check("alias 0-based non-paddé écrit (img-0.*)", fs.existsSync(path.join(proj, "public", "images", `img-0.${bank[0].localPath.split(".").pop()}`)));
  const prompt = formatImageBankForPrompt(bank);
  check("formatImageBankForPrompt liste les chemins + interdit l'invention", prompt.includes(bank[0].localPath) && /n'invente JAMAIS/i.test(prompt));
  check("formatImageBankForPrompt vide si banque vide", formatImageBankForPrompt([]) === "");

  // ── sans clé Pexels : banque vide, zéro régression ───────────────────────────
  const projNoKey = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgbank-nokey-"));
  const bank0 = await curateImageBank("galerie luminaires", projNoKey, { fetchImpl: fakeFetch, pexelsKey: "" });
  check("sans clé Pexels → banque vide", bank0.length === 0);

  // ── extractLocalImageRefs : chemins locaux, PAS les chemins internes d'URL http ─
  const proj2 = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgbank-detect-"));
  fs.mkdirSync(path.join(proj2, "src"), { recursive: true });
  fs.mkdirSync(path.join(proj2, "public", "images"), { recursive: true });
  fs.writeFileSync(path.join(proj2, "public", "images", "img-01.jpg"), "x");
  fs.writeFileSync(path.join(proj2, "public", "images", "img-02.jpg"), "x");
  fs.writeFileSync(
    path.join(proj2, "src", "App.jsx"),
    `const DEAD = "${DEAD}";\n` +
      `export default function App(){ return (<div>` +
      `<img src={DEAD}/>` +
      `<img src="/images/inexistant.jpg"/>` +
      `<img src="/images/img-01.jpg"/>` +
      `</div>); }\n`,
    "utf8",
  );
  const localRefs = extractLocalImageRefs(proj2);
  check("détecte le chemin local absent", localRefs.has("/images/inexistant.jpg"));
  check("détecte aussi le chemin local présent (existence vérifiée ailleurs)", localRefs.has("/images/img-01.jpg"));
  check("n'attrape PAS le chemin interne d'une URL http (/photos/999/…)", ![...localRefs.keys()].some((k) => k.includes("/photos/")));

  // ── guaranteeLocalImages : remplace cassées (URL morte + chemin absent) par banque ─
  const testBank: ImageBankEntry[] = [
    { localPath: "/images/img-01.jpg", alt: "brass lamp", query: "brass" },
    { localPath: "/images/img-02.jpg", alt: "plaster", query: "plaster" },
  ];
  const gr = await guaranteeLocalImages(proj2, testBank, { fetchImpl: fakeFetch });
  const after = fs.readFileSync(path.join(proj2, "src", "App.jsx"), "utf8");
  check("2 images cassées remplacées (URL morte + chemin absent)", gr.replaced.length === 2 && gr.stillBroken.length === 0);
  check("l'URL morte n'est plus dans le code", !after.includes(DEAD));
  check("le chemin local inventé n'est plus dans le code", !after.includes("/images/inexistant.jpg"));
  check("les remplacements pointent une image de la banque", after.includes("/images/img-02.jpg"));

  // ── banque vide : rien remplacé, cassées remontées (nudge Élève en repli) ─────
  const proj3 = fs.mkdtempSync(path.join(os.tmpdir(), "mangoos-imgbank-empty-"));
  fs.mkdirSync(path.join(proj3, "src"), { recursive: true });
  fs.writeFileSync(path.join(proj3, "src", "App.jsx"), `<img src="${DEAD}"/><img src="/images/nope.jpg"/>`, "utf8");
  const gr2 = await guaranteeLocalImages(proj3, [], { fetchImpl: fakeFetch });
  check("banque vide → aucun remplacement, cassées remontées", gr2.replaced.length === 0 && gr2.stillBroken.length === 2);
  const after3 = fs.readFileSync(path.join(proj3, "src", "App.jsx"), "utf8");
  check("banque vide → fichier inchangé", after3.includes(DEAD) && after3.includes("/images/nope.jpg"));

  fs.rmSync(proj, { recursive: true, force: true });
  fs.rmSync(projNoKey, { recursive: true, force: true });
  fs.rmSync(proj2, { recursive: true, force: true });
  fs.rmSync(proj3, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-image-bank : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
