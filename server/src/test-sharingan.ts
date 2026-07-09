// Preuve déterministe des fonctions pures du Sharingan (chantier #8).
// La capture Playwright elle-même est réseau (non testée ici) — on verrouille
// les briques pures : conversion de couleurs CSS et déduplication de palette.
//
// Lancer : npx tsx src/test-sharingan.ts

import { cssColorToHex, dedupeColors } from "./vision.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

// ── cssColorToHex ─────────────────────────────────────────────────────────────
line("═");
console.log("cssColorToHex — conversion CSS → hex");
line();

check("rgb(255,99,71)  → #ff6347", cssColorToHex("rgb(255, 99, 71)") === "#ff6347");
check("rgb(26, 26, 46) → #1a1a2e", cssColorToHex("rgb(26, 26, 46)") === "#1a1a2e");
check("rgba opaque     → couleur conservée", cssColorToHex("rgba(99, 102, 241, 0.9)") === "#6366f1");
check("rgba(0,0,0,0)   → null (transparent)", cssColorToHex("rgba(0, 0, 0, 0)") === null);
check("#1a2b3c         → conservé tel quel", cssColorToHex("#1a2b3c") === "#1a2b3c");
check("#abc (3 chiffres) → #aabbcc", cssColorToHex("#abc") === "#aabbcc");
check("transparent     → null", cssColorToHex("transparent") === null);
check("initial         → null", cssColorToHex("initial") === null);
check("inherit         → null", cssColorToHex("inherit") === null);
check("none            → null", cssColorToHex("none") === null);
check("currentColor    → null", cssColorToHex("currentColor") === null);
check("chaîne vide     → null", cssColorToHex("") === null);
check("rgb(0,0,0)      → #000000 (passé au filtre noir de dedupeColors)", cssColorToHex("rgb(0, 0, 0)") === "#000000");
check("rgb(255,255,255)→ #ffffff (passé au filtre blanc de dedupeColors)", cssColorToHex("rgb(255, 255, 255)") === "#ffffff");

// ── dedupeColors ─────────────────────────────────────────────────────────────
line();
console.log("dedupeColors — déduplique, filtre, trie par fréquence");
line();

const sample = [
  "rgb(99, 102, 241)",   // indigo ×3
  "rgb(99, 102, 241)",
  "rgb(99, 102, 241)",
  "rgb(16, 185, 129)",   // emerald ×2
  "rgb(16, 185, 129)",
  "rgb(239, 68, 68)",    // red ×1
  "rgba(0, 0, 0, 0)",    // transparent → ignoré
  "rgb(0, 0, 0)",         // near-black → filtré
  "rgb(255, 255, 255)",   // near-white → filtré
  "rgb(5, 5, 5)",         // near-black → filtré
  "rgb(252, 252, 252)",   // near-white → filtré
];

const palette = dedupeColors(sample);

check("indigo est la 1re couleur (plus fréquente)", palette[0] === "#6366f1");
check("emerald est la 2e couleur",                  palette[1] === "#10b981");
check("red est la 3e couleur",                      palette[2] === "#ef4444");
check("near-black #000000 absent",                  !palette.includes("#000000"));
check("near-white #ffffff absent",                  !palette.includes("#ffffff"));
check("transparent absent",                          !palette.includes("#000000")); // rgba(0,0,0,0) → null
check("plafond 8 couleurs respecté",                palette.length <= 8);

// Cas : tout transparent/noir/blanc → palette vide
const emptyPalette = dedupeColors(["transparent", "rgb(0,0,0)", "rgb(255,255,255)", "rgba(0,0,0,0)"]);
check("couleurs par défaut uniquement → palette vide", emptyPalette.length === 0);

// Cas : 10 couleurs distinctes → plafond 8
const manyColors = Array.from({ length: 10 }, (_, i) => `rgb(${i * 20 + 20}, ${i * 15 + 30}, ${i * 10 + 50})`);
check("10 couleurs → plafonnées à 8", dedupeColors(manyColors).length <= 8);

// Hex 3 chiffres en entrée
const hex3 = dedupeColors(["#abc", "#abc", "#def"]);
check("#abc 3 chiffres → #aabbcc reconnu", hex3[0] === "#aabbcc");

// ── Bilan ────────────────────────────────────────────────────────────────────
line("═");
console.log(failures === 0 ? "✅ Sharingan — fonctions pures prouvées." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
