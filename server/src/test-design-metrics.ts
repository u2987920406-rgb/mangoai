// Tests des mesures design objectives (design-metrics.ts) — pures, déterministes.

import {
  parseHex, contrastRatio, isLargeText, wcagLevel,
  collectUsedColors, extractDeclaredPalette, extractContrastPairs, offPalette,
  measureDesign, measureSummary,
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

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
