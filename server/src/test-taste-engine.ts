// Tests de l'ingestion (taste-refs.ts) + de la capture (taste-engine.ts) du Moteur de Goût (#149).
// Déterministe : dossier temporaire pour l'ingestion, transports Sharingan FAUX pour la capture.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTasteReferences, extractUrls, allUrls, pendingBriefs } from "./taste-refs.js";
import { captureDirectionRefs, buildSkinBrief, catalogDirection, type CaptureDeps } from "./taste-engine.js";
import type { DirectionRefs } from "./taste-refs.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── Dossier temporaire de références ──
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mango-taste-"));
fs.mkdirSync(path.join(ROOT, "minimal-froid"));
fs.writeFileSync(
  path.join(ROOT, "minimal-froid", "refs.json"),
  JSON.stringify({ direction: "minimal-froid", name: "Minimal froid", urls: ["https://linear.app"], images: [], notes: "calme et net" }),
);
fs.writeFileSync(path.join(ROOT, "minimal-froid", "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47])); // fichier image factice
fs.mkdirSync(path.join(ROOT, "url_Raf"));
fs.writeFileSync(path.join(ROOT, "url_Raf", "site.txt"), "https://apple.com/fr/.\nhttps://mi.com\nune ligne sans url");
fs.writeFileSync(path.join(ROOT, "url_Raf", "resto.txt"), "Septime — Paris\nNoma — Copenhague\nMirazur — Menton");
fs.writeFileSync(path.join(ROOT, "README.md"), "# ignoré");

const refs = loadTasteReferences(ROOT);

// ── Ingestion ──
check("une direction détectée", refs.directions.length === 1);
const dir0 = refs.directions[0];
check("id + name lus depuis refs.json", dir0.id === "minimal-froid" && dir0.name === "Minimal froid");
check("urls lues", dir0.urls.length === 1 && dir0.urls[0] === "https://linear.app");
check("image globée en chemin absolu", dir0.images.length === 1 && dir0.images[0].endsWith("shot.png") && path.isAbsolute(dir0.images[0]));
check("notes lues", dir0.notes === "calme et net");
check("fromCatalog (a un refs.json)", dir0.fromCatalog === true);
check("kind par défaut = direction", dir0.kind === "direction");

check("une source libre détectée", refs.loose.length === 1 && refs.loose[0].folder === "url_Raf");
const looseFiles = refs.loose[0].files;
const siteFile = looseFiles.find((f) => f.name === "site.txt")!;
check("URLs extraites du .txt (ponctuation élaguée)", siteFile.urls.includes("https://apple.com/fr/") && siteFile.urls.includes("https://mi.com"));
check("ligne sans URL comptée comme texte", siteFile.otherTextLines === 1);
const restoFile = looseFiles.find((f) => f.name === "resto.txt")!;
check("brief sans URL → 0 url, lignes de texte", restoFile.urls.length === 0 && restoFile.otherTextLines === 3);

check("extractUrls strippe la ponctuation finale", extractUrls("voir https://x.com, et https://y.com.").join(",") === "https://x.com,https://y.com");
check("allUrls fusionne directions + libres", allUrls(refs).length === 3);
check("pendingBriefs repère le brief resto à rechercher", pendingBriefs(refs).some((b) => b.file === "resto.txt" && b.lines === 3));

// ── Capture (transports FAUX) ──
const fakeDeps: CaptureDeps = {
  analyzeUrl: async (url) => {
    if (url.includes("fail")) throw new Error("timeout réseau");
    return {
      palette: ["#5e6ad2", "#0b0d12"],
      cssVars: { "--color-accent": "#5e6ad2", "--font-size-title1": "2.25rem", "--unrelated-zzz": "x" },
      fonts: ["Inter Variable"],
      families: ["Inter Variable"],
    };
  },
  analyzeImage: async () => ({ palette: ["#abcdef"], ambiance: "sombre · vif · froid" }),
};

const sample: DirectionRefs = {
  id: "minimal-froid", name: "Minimal froid", kind: "direction",
  urls: ["https://linear.app", "https://fail.example"],
  images: [dir0.images[0]],
  notes: "calme et net", fromCatalog: true,
};

const cap = await captureDirectionRefs(sample, fakeDeps);
check("URL OK capturée", cap.urls[0].ok && cap.urls[0].palette.includes("#5e6ad2"));
check("tokens CSS filtrés (garde color/font, jette unrelated)", cap.urls[0].tokens.some(([k]) => k === "--color-accent") && cap.urls[0].tokens.some(([k]) => k === "--font-size-title1") && !cap.urls[0].tokens.some(([k]) => k === "--unrelated-zzz"));
check("URL en échec → ok:false sans throw", cap.urls[1].ok === false && !!cap.urls[1].error);
check("image capturée (palette + ambiance)", cap.images[0].ok && cap.images[0].ambiance === "sombre · vif · froid");
check("palette fusionnée URL+image, dédupliquée", cap.palette.includes("#5e6ad2") && cap.palette.includes("#abcdef"));

// ── buildSkinBrief ──
const direction = catalogDirection("minimal-froid");
check("catalogDirection résout le catalogue", direction !== null && direction.id === "minimal-froid");
check("catalogDirection custom → null", catalogDirection("inconnue-xyz") === null);
const brief = buildSkinBrief(direction, cap);
check("brief marque les références réelles comme prioritaires", /PRIMENT sur le repli/.test(brief));
check("brief inclut la palette mesurée", brief.includes("#5e6ad2"));
check("brief inclut la typo réelle", brief.includes("Inter Variable"));
check("brief inclut l'ambiance image", brief.includes("sombre · vif · froid"));
check("brief reporte la note de Raf", brief.includes("calme et net"));

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
