// Test e2e du Sharingan sur un vrai site public.
// Appelle sharinganAnalyze directement (pas via le chat) pour vérifier que
// les 6 couches ramènent bien des données exploitables.
//
// Lancer : npx tsx src/test-sharingan-live.ts

import fs from "node:fs";
import path from "node:path";
import { sharinganAnalyze, type SharinganResult } from "../vision.js";

const TARGET = "https://stripe.com";

const line = (c = "─") => console.log(c.repeat(64));
let failures = 0;
const check = (label: string, cond: boolean, extra?: string) => {
  const sym = cond ? "✓" : "✗";
  console.log(`  ${sym} ${label}${extra ? `  → ${extra}` : ""}`);
  if (!cond) failures++;
};

console.log(`\nSharingan e2e — cible : ${TARGET}`);
console.log("(Playwright / Edge headless — peut prendre ~10 s)\n");

let r: SharinganResult;
try {
  r = await sharinganAnalyze(TARGET);
} catch (err) {
  console.error("❌ sharinganAnalyze a échoué :", err instanceof Error ? err.message : err);
  process.exit(1);
}

line("═");
console.log("Couche 1 — Screenshot");
line();
check("screenshot Buffer non vide", r.screenshot.length > 0, `${Math.round(r.screenshot.length / 1024)} Ko`);
check("hauteur plausible (> 400px)", r.screenshotHeight > 400, `${r.screenshotHeight}px`);

// Sauvegarde pour inspection visuelle
const outPath = path.join("workspace", "sharingan-test.jpg");
fs.mkdirSync("workspace", { recursive: true });
fs.writeFileSync(outPath, r.screenshot);
console.log(`  → capture sauvegardée : ${outPath}`);

line();
console.log("Couche 2 — CSS calculé (typographie)");
line();
check("familles de polices détectées", r.typography.families.length > 0, r.typography.families.join(", "));
check("tailles de polices détectées",  r.typography.sizes.length > 0,    r.typography.sizes.slice(0, 4).join(", "));
check("graisses détectées",            r.typography.weights.length > 0,  r.typography.weights.join(", "));

line();
console.log("Couche 3 — Variables CSS (design tokens)");
line();
const varCount = Object.keys(r.cssVars).length;
check("variables CSS présentes", varCount > 0, `${varCount} variables`);
if (varCount > 0) {
  console.log("  Extrait :");
  Object.entries(r.cssVars).slice(0, 6).forEach(([k, v]) => console.log(`    ${k}: ${v}`));
}

line();
console.log("Couche 4 — Structure sémantique");
line();
check("titre de page non vide",       r.structure.title.length > 0,       r.structure.title);
check("nav items détectés",           r.structure.navItems.length > 0,    r.structure.navItems.join(" | "));
check("headings détectés",            r.structure.headings.length > 0,    `${r.structure.headings.length} headings`);
check("landmarks ARIA détectés",      r.structure.landmarks.length > 0,   `${r.structure.landmarks.length} landmarks`);
if (r.structure.headings.length > 0) {
  console.log("  Headings :");
  r.structure.headings.slice(0, 5).forEach((h) => console.log(`    H${h.level}: ${h.text}`));
}
if (r.structure.ctaTexts.length > 0) {
  console.log(`  CTAs : ${r.structure.ctaTexts.join(" | ")}`);
}

line();
console.log("Couche 5 — Fonts");
line();
check("fonts détectées", r.fonts.length > 0, r.fonts.join(", ") || "(aucune)");

line();
console.log("Couche 6 — Palette couleurs");
line();
check("palette non vide", r.palette.length > 0, r.palette.join(", ") || "(vide)");
if (r.palette.length > 0) {
  console.log("  Couleurs :");
  r.palette.forEach((c) => console.log(`    ${c}`));
}

if (r.pseudoElements.length > 0) {
  line();
  console.log("Bonus — Pseudo-éléments");
  line();
  console.log(`  ${r.pseudoElements.length} pseudo-élément(s) détecté(s)`);
  r.pseudoElements.slice(0, 3).forEach((p) => console.log(`    ${p.selector}${p.pseudo} → ${p.content}`));
}

line("═");
if (failures === 0) {
  console.log("✅ Sharingan e2e — toutes les couches ont renvoyé des données.");
} else {
  console.log(`❌ ${failures} couche(s) vide(s) ou en échec.`);
}
console.log(`Capture visuelle → ${outPath}  (ouvre pour vérifier)\n`);
process.exit(failures === 0 ? 0 : 1);
