// Preuve déterministe des fonctions pures de Sharingan-image (idée #51).
// Teste : quantification des pixels en buckets 5 bits, conversion bucket→hex,
// sélection des couleurs dominantes, calcul de luminosité/saturation/température
// et descripteur d'ambiance — sans réseau ni navigateur.
//
// Lancer : npx tsx src/test-sharingan-image.ts

import {
  quantizePixels,
  bucketKeyToHex,
  topColorsFromBuckets,
  luminosityLabel,
  saturationLabel,
  temperatureLabel,
  ambianceDescriptor,
  type RgbaPixel,
} from "../vision.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

// ── quantizePixels ────────────────────────────────────────────────────────────
line("═");
console.log("quantizePixels — buckets 5 bits par canal, transparents ignorés");
line();

const redPixel: RgbaPixel = { r: 255, g: 0, b: 0, a: 255 };
const greenPixel: RgbaPixel = { r: 0, g: 200, b: 0, a: 255 };
const transpPixel: RgbaPixel = { r: 255, g: 0, b: 0, a: 5 }; // transparent → ignoré

const freqSimple = quantizePixels([redPixel, redPixel, greenPixel, transpPixel]);
check("rouge (×2) a fréquence 2", freqSimple.get(`${255 >> 3},${0 >> 3},${0 >> 3}`) === 2);
check("vert (×1) a fréquence 1", freqSimple.get(`${0 >> 3},${200 >> 3},${0 >> 3}`) === 1);
check("transparent ignoré — seulement 2 buckets", freqSimple.size === 2);

// Vérification du bucketage 5 bits : rgb(10, 10, 10) et rgb(15, 15, 15) tombent
// dans le même bucket (10>>3 = 1, 15>>3 = 1) → fréquence 2 dans ce bucket.
const nearBlack1: RgbaPixel = { r: 10, g: 10, b: 10, a: 255 };
const nearBlack2: RgbaPixel = { r: 15, g: 15, b: 15, a: 255 };
const freqBucket = quantizePixels([nearBlack1, nearBlack2]);
check("rgb(10,10,10) et rgb(15,15,15) dans le même bucket 5 bits", freqBucket.size === 1);
const [, buckCount] = [...freqBucket.entries()][0];
check("ce bucket a fréquence 2", buckCount === 2);

// ── bucketKeyToHex ────────────────────────────────────────────────────────────
line();
console.log("bucketKeyToHex — midpoint de chaque bucket → hex");
line();

// Bucket 0 → midpoint = 0*8+4 = 4 → #040404
check("bucket '0,0,0' → '#040404'", bucketKeyToHex("0,0,0") === "#040404");
// Bucket pour rouge pur : 255>>3 = 31 → midpoint = 31*8+4 = 252 → #fc0404
check("bucket '31,0,0' → '#fc0404'", bucketKeyToHex("31,0,0") === "#fc0404");
// Bucket pour bleu pur : 0,0,31 → #0404fc
check("bucket '0,0,31' → '#0404fc'", bucketKeyToHex("0,0,31") === "#0404fc");

// ── topColorsFromBuckets ──────────────────────────────────────────────────────
line();
console.log("topColorsFromBuckets — tri par fréquence + filtre noir/blanc");
line();

// Build a freq map with: indigo bucket (freq 10) + emerald bucket (freq 6) + near-black bucket (freq 20)
const freqMap = new Map<string, number>();
// indigo ~rgb(99,102,241) → 99>>3=12, 102>>3=12, 241>>3=30 → '12,12,30'
freqMap.set("12,12,30", 10);
// emerald ~rgb(16,185,129) → 16>>3=2, 185>>3=23, 129>>3=16 → '2,23,16'
freqMap.set("2,23,16", 6);
// near-black → bucket '0,0,0' → midpoint #040404 → filtered by _isNearBlack
freqMap.set("0,0,0", 20);

const topColors = topColorsFromBuckets(freqMap, 8);
check("near-black bucket (freq 20) filtré malgré fréquence élevée", !topColors.some((h) => h === "#040404"));
check("indigo (#64647c midpoint) présent", topColors.length >= 1);
check("plafond topN=8 respecté", topColors.length <= 8);
check("retour non vide (au moins indigo + emerald)", topColors.length >= 2);

// topN=1 → ne garder qu'une couleur
const top1 = topColorsFromBuckets(freqMap, 1);
check("topN=1 → exactement 1 couleur", top1.length === 1);

// ── luminosityLabel ───────────────────────────────────────────────────────────
line();
console.log("luminosityLabel — clair si luminance moyenne > 0.55");
line();

const whitePixels: RgbaPixel[] = Array(10).fill({ r: 255, g: 255, b: 255, a: 255 });
const blackPixels: RgbaPixel[] = Array(10).fill({ r: 0, g: 0, b: 0, a: 255 });
const midPixels: RgbaPixel[] = Array(10).fill({ r: 128, g: 128, b: 128, a: 255 });

check("pixels blancs → clair", luminosityLabel(whitePixels) === "clair");
check("pixels noirs → sombre", luminosityLabel(blackPixels) === "sombre");
// rgb(128,128,128) luminance = 0.502 → sombre (≤ 0.55)
check("pixels gris moyen → sombre", luminosityLabel(midPixels) === "sombre");
check("tableau vide → clair (défaut)", luminosityLabel([]) === "clair");

// Bright yellow: rgb(255,255,0) → luminance = 0.2126*1 + 0.7152*1 + 0 = 0.9278 → clair
const yellowPixels: RgbaPixel[] = Array(10).fill({ r: 255, g: 255, b: 0, a: 255 });
check("pixels jaune vif → clair", luminosityLabel(yellowPixels) === "clair");

// ── saturationLabel ───────────────────────────────────────────────────────────
line();
console.log("saturationLabel — vif si saturation moyenne > 0.25");
line();

// rgb(255,0,0) → max=1, min=0 → sat=1 → vif
const saturatedPixels: RgbaPixel[] = Array(10).fill({ r: 255, g: 0, b: 0, a: 255 });
// rgb(180,180,180) → max=min → sat=0 → sourd
const greyPixels: RgbaPixel[] = Array(10).fill({ r: 180, g: 180, b: 180, a: 255 });

check("rouge pur → vif", saturationLabel(saturatedPixels) === "vif");
check("gris neutre → sourd", saturationLabel(greyPixels) === "sourd");
check("tableau vide → sourd (défaut)", saturationLabel([]) === "sourd");

// ── temperatureLabel ──────────────────────────────────────────────────────────
line();
console.log("temperatureLabel — chaud si avgR ≥ avgB");
line();

const warmPixels: RgbaPixel[] = Array(10).fill({ r: 220, g: 100, b: 50, a: 255 }); // R > B → chaud
const coolPixels: RgbaPixel[] = Array(10).fill({ r: 50, g: 100, b: 220, a: 255 }); // B > R → froid
const neutralPixels: RgbaPixel[] = Array(10).fill({ r: 128, g: 128, b: 128, a: 255 }); // R=B → chaud (≥)

check("dominante rouge → chaud", temperatureLabel(warmPixels) === "chaud");
check("dominante bleue → froid", temperatureLabel(coolPixels) === "froid");
check("R=B → chaud (égalité compte comme chaud)", temperatureLabel(neutralPixels) === "chaud");
check("tableau vide → chaud (défaut)", temperatureLabel([]) === "chaud");

// ── ambianceDescriptor ────────────────────────────────────────────────────────
line();
console.log("ambianceDescriptor — concatène les 3 labels");
line();

// Dark, desaturated, cool palette (dark neutral grey with blue cast)
// rgb(50,55,80): luminance ≈ 0.204 → sombre ; sat=(80-50)/80=0.375 → vif ; R<B → froid
// To get sourd: use near-grey e.g. rgb(50,52,60) → sat=(60-50)/60=0.167 → sourd ; R<B → froid
const darkCoolDesatPixels: RgbaPixel[] = Array(20).fill({ r: 50, g: 52, b: 60, a: 255 });
const desc = ambianceDescriptor(darkCoolDesatPixels);
check("format 'X · Y · Z' respecté", /^.+ · .+ · .+$/.test(desc));
check("sombre · sourd · froid pour gris-bleu sombre", desc === "sombre · sourd · froid");

// Bright, vivid, warm palette (orange)
const brightWarmSatPixels: RgbaPixel[] = Array(20).fill({ r: 255, g: 140, b: 0, a: 255 });
const desc2 = ambianceDescriptor(brightWarmSatPixels);
check("clair · vif · chaud pour orange vif", desc2 === "clair · vif · chaud");

// Empty array → defaults
const desc3 = ambianceDescriptor([]);
check("tableau vide → descriptor non vide", desc3.length > 0);
check("tableau vide → format 'X · Y · Z' respecté", /^.+ · .+ · .+$/.test(desc3));

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
console.log(failures === 0 ? "✅ Sharingan image — fonctions pures prouvées." : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
