// Tests des mesures design objectives (design-metrics.ts) — pures, déterministes.

import {
  parseHex, contrastRatio, isLargeText, wcagLevel,
  collectUsedColors, extractDeclaredPalette, extractContrastPairs, offPalette,
  measureDesign, measureSummary,
  countFontFamilies, detectTypoScale, countLiteralColorsInComponents, detectMotion,
  measureProjectDesign, FONT_FAMILIES_MAX, LITERAL_COLORS_MAX,
} from "./design-metrics.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── parseHex ──
check("parseHex #fff → blanc", JSON.stringify(parseHex("#fff")) === JSON.stringify({ r: 255, g: 255, b: 255 }));
check("parseHex #000000 → noir", JSON.stringify(parseHex("#000000")) === JSON.stringify({ r: 0, g: 0, b: 0 }));
check("parseHex tolère casse/espaces", parseHex("  #FFffFF ")?.r === 255);
check("parseHex rejette invalide", parseHex("#xyz") === null && parseHex("rouge") === null);

// ── contrastRatio (valeurs WCAG de référence) ──
check("noir/blanc = 21:1", contrastRatio("#000000", "#ffffff") === 21);
check("blanc/blanc = 1:1", contrastRatio("#ffffff", "#ffffff") === 1);
check("symétrique (ordre indifférent)", contrastRatio("#000", "#fff") === contrastRatio("#fff", "#000"));
check("couleur invalide → null", contrastRatio("#zzz", "#fff") === null);
// gris #777 sur blanc ≈ 4.48 (sous AA petit texte)
{
  const r = contrastRatio("#777777", "#ffffff")!;
  check("gris moyen sur blanc ≈ 4.5 (limite)", r > 4 && r < 5);
}

// ── isLargeText / wcagLevel ──
check("isLargeText : 24px → grand", isLargeText(24, false) === true);
check("isLargeText : 18.66px gras → grand", isLargeText(19, true) === true);
check("isLargeText : 16px → petit", isLargeText(16, false) === false);
check("wcagLevel : 21 petit → AAA", wcagLevel(21, false) === "AAA");
check("wcagLevel : 4.5 petit → AA", wcagLevel(4.5, false) === "AA");
check("wcagLevel : 3 petit → fail", wcagLevel(3, false) === "fail");
check("wcagLevel : 3 grand → AA", wcagLevel(3, true) === "AA");

// ── extraction CSS ──
const css = `
:root { --color-bg: #ffffff; --color-ink: #111111; --color-accent: #7C5CFF; }
.hero { color: #999999; background: #ffffff; font-size: 14px; }
.title { color: #ffffff; background-color: #7c5cff; font-size: 2rem; font-weight: 700; }
.cta { color: #ff5577; background: #fafafa; }
`;
check("extractDeclaredPalette trouve les 3 vars", extractDeclaredPalette(css).sort().join(",") === ["#111111", "#7c5cff", "#ffffff"].sort().join(","));
check("collectUsedColors inclut les littérales", collectUsedColors(css).includes("#999999") && collectUsedColors(css).includes("#ff5577"));
const pairs = extractContrastPairs(css);
check("extractContrastPairs : 3 paires (hero/title/cta)", pairs.length === 3);
check("paire hero détecte font-size 14px", pairs.find((p) => p.where?.includes("hero"))?.fontPx === 14);
check("paire title détecte 2rem→32px + gras", (() => { const t = pairs.find((p) => p.where?.includes("title")); return t?.fontPx === 32 && t?.bold === true; })());

// ── offPalette ──
check("offPalette repère #ff5577 et #999999 hors palette", (() => {
  const op = offPalette(collectUsedColors(css), extractDeclaredPalette(css));
  return op.includes("#ff5577") && op.includes("#999999") && !op.includes("#7c5cff");
})());
check("offPalette vide si aucune palette déclarée", offPalette(["#abcabc"], []).length === 0);

// ── measureDesign (bout-à-bout) ──
const m = measureDesign([css]);
check("measureDesign détecte le contraste faible (#999 sur blanc, 14px)", m.contrastFails.some((c) => c.fg === "#999999" && c.bg === "#ffffff"));
check("measureDesign : title (blanc/violet 32px gras) PAS en échec", !m.contrastFails.some((c) => c.where?.includes("title")));
check("measureDesign remonte les hors-palette", m.offPalette.includes("#ff5577"));
check("measureSummary produit du texte quand il y a des écarts", measureSummary(m).includes("WCAG") || measureSummary(m).includes("palette"));
check("measureSummary vide si RAS", measureSummary({ contrastFails: [], offPalette: [], paletteSize: 3 }) === "");

// ═══ Mesures statiques enrichies (N15) ═══

// ── (1) familles de polices ──
{
  const cssFonts = `
:root { --serif: "Cormorant Garamond", Georgia, serif; --sans: Inter, system-ui, sans-serif; }
body { font-family: var(--sans); }
code { font-family: "JetBrains Mono", monospace; }
`;
  const html = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">`;
  const f = countFontFamilies([cssFonts], html);
  check("countFontFamilies : 3 familles (Cormorant/Inter/JetBrains, dédupliquées CSS+HTML)", f.count === 3);
  check("countFontFamilies ignore les génériques et var()", !f.families.includes("serif") && !f.families.some((x) => x.startsWith("var(")));
  check("countFontFamilies : 3 = pas trop (max " + FONT_FAMILIES_MAX + ")", f.tooMany === false);
  const g = countFontFamilies([`h1{font-family:Lobster;} h2{font-family:Pacifico;} p{font-family:Raleway;} em{font-family:Caveat;}`]);
  check("countFontFamilies : 4 familles = TROP", g.count === 4 && g.tooMany === true);
  check("countFontFamilies : vide → 0, pas trop", countFontFamilies([]).count === 0 && !countFontFamilies([]).tooMany);
}

// ── (2) échelle typographique ──
{
  const clamped = detectTypoScale([`h1 { font-size: clamp(2rem, 5vw, 4rem); }`]);
  check("detectTypoScale : clamp() → échelle présente", clamped.usesClamp === true && clamped.present === true);
  const suite = detectTypoScale([`p{font-size:14px} h3{font-size:1.25rem} h2{font-size:28px} h1{font-size:2.5rem}`]);
  check("detectTypoScale : suite 14/20/28/40 → cohérente", suite.coherent === true && suite.present === true);
  check("detectTypoScale : tailles converties en px triées", suite.distinctSizesPx.join(",") === "14,20,28,40");
  const flat = detectTypoScale([`p{font-size:15px} h2{font-size:16px} h1{font-size:17px}`]);
  check("detectTypoScale : amplitude plate (15/16/17) → PAS d'échelle", flat.present === false);
  const holed = detectTypoScale([`p{font-size:12px} h2{font-size:14px} h1{font-size:64px}`]);
  check("detectTypoScale : trou brutal (14→64) → PAS cohérente", holed.coherent === false);
  check("detectTypoScale : une seule taille → absente", detectTypoScale([`p{font-size:16px}`]).present === false);
}

// ── (3) couleurs littérales dans les composants ──
{
  const comp = `export function Card() { return <div style={{ color: "#ff5577", background: "rgba(10, 20, 30, 0.5)" }}>x</div>; }`;
  const c = countLiteralColorsInComponents([comp]);
  check("countLiteralColorsInComponents : hex + rgba comptés", c.count === 2 && c.samples.includes("#ff5577"));
  check("countLiteralColorsInComponents : 2 ≤ seuil → pas de dérive", c.overThreshold === false);
  const many = countLiteralColorsInComponents([Array.from({ length: LITERAL_COLORS_MAX + 1 }, (_, i) => `"#0${i}0${i}0${i}"`).join(";")]);
  check("countLiteralColorsInComponents : au-delà du seuil → overThreshold", many.overThreshold === true);
  check("countLiteralColorsInComponents : composant en var(--x) → 0", countLiteralColorsInComponents([`<div style={{ color: "var(--ink)" }} />`]).count === 0);
}

// ── (4) présence de mouvement ──
{
  const still = detectMotion([`.card { color: #fff; }`], [`export const A = () => <div/>;`], "{}");
  check("detectMotion : rien → page statique", still.present === false);
  const trans = detectMotion([`.card { transition: transform 0.2s ease; }`]);
  check("detectMotion : transition CSS détectée", trans.hasTransition === true && trans.present === true);
  const keyf = detectMotion([`@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }`]);
  check("detectMotion : @keyframes détecté", keyf.hasKeyframes === true && keyf.present === true);
  const framer = detectMotion([], [`import { motion } from "framer-motion";`]);
  check("detectMotion : import framer-motion détecté", framer.hasFramerMotion === true && framer.present === true);
  const pkg = detectMotion([], [], `{"dependencies":{"framer-motion":"^11.0.0"}}`);
  check("detectMotion : framer-motion en dépendance détecté", pkg.hasFramerMotion === true);
}

// ── measureProjectDesign + measureSummary enrichi (bout-à-bout) ──
{
  const staticCss = `
:root { --bg: #ffffff; --ink: #111111; }
body { font-family: Arial; font-size: 16px; }
h1 { font-family: Verdana; } h2 { font-family: Tahoma; } h3 { font-family: Georgia; }
`;
  const comp = `export const X = () => <div style={{ color: "#123456" }}/>;`;
  const pm = measureProjectDesign({ cssFiles: [staticCss], componentFiles: [comp] });
  check("measureProjectDesign : les 4 champs N15 remplis", !!pm.fontFamilies && !!pm.typoScale && !!pm.literalColors && !!pm.motion);
  check("measureProjectDesign : garde la mesure de base (paletteSize)", pm.paletteSize === 2);
  const s = measureSummary(pm);
  check("measureSummary enrichi : signale trop de polices", s.includes("TROP de familles"));
  check("measureSummary enrichi : signale l'absence d'échelle typo", s.includes("échelle typographique"));
  check("measureSummary enrichi : signale la page statique", s.includes("STATIQUE"));
  check("measureSummary enrichi : 1 couleur littérale sous seuil → PAS signalée", !s.includes("couleurs LITTÉRALES"));
  // Rétrocompat : un DesignMeasure « ancien » (sans champs N15) rend comme avant.
  check("measureSummary rétrocompat : mesure sans champs N15 → vide si RAS", measureSummary({ contrastFails: [], offPalette: [], paletteSize: 3 }) === "");
  // Projet SAIN : duo de polices, clamp, motion, composants propres → résumé vide.
  const healthy = measureProjectDesign({
    cssFiles: [`:root{--sans:Inter,sans-serif}h1{font-family:"Playfair Display";font-size:clamp(2rem,5vw,4rem)}.c{transition:opacity .2s}`],
    componentFiles: [`export const Y = () => <div className="c"/>;`],
  });
  check("measureProjectDesign : projet sain → résumé vide", measureSummary(healthy) === "");
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
