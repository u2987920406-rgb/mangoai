// Tests de la couche génération (taste-generate.ts) — cerveau de skinning FAUX (déterministe).

import {
  extractCssVarNames, extractRootCss, skinTokens,
  collectColorLiterals, applyColorMap, parseColorMap, remapLiterals,
  type SkinAsk,
} from "./taste-generate.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const SRC = `:root {
  --color-mango: #F5821F;
  --color-cream: #FFF8EC;
  --color-brown: #3D1C02;
  --font-heading: "Playfair Display", serif;
  --font-body: "Inter", sans-serif;
  --radius-md: 8px;
}`;

// ── helpers ──
check("extractCssVarNames trouve toutes les variables", extractCssVarNames(SRC).length === 6 && extractCssVarNames(SRC).includes("--font-heading"));
check("extractRootCss isole un bloc :root nu", extractRootCss(":root { --x: 1px; }") === ":root { --x: 1px; }");
check("extractRootCss tolère les fences markdown", extractRootCss("```css\n:root { --x: 1px; }\n```")?.includes("--x") === true);
check("extractRootCss tolère la prose autour", extractRootCss("Voici le CSS:\n:root {\n--a: red;\n}\nVoilà.")?.startsWith(":root") === true);
check("extractRootCss → null si pas de CSS", extractRootCss("désolé je ne peux pas") === null);

// ── skinTokens : succès ──
const goodAsk: SkinAsk = async () => `:root {
  --color-mango: #5e6ad2;
  --color-cream: #0b0d12;
  --color-brown: #e8eaf0;
  --font-heading: "Inter Variable", sans-serif;
  --font-body: "Inter", sans-serif;
  --radius-md: 6px;
}`;
const ok = await skinTokens(SRC, "Direction: minimal froid", goodAsk);
check("skin valide accepté", ok.ok === true && !!ok.css);
check("skin valide change les valeurs", ok.css!.includes("#5e6ad2") && ok.css!.includes("Inter Variable"));
check("skin valide garde tous les noms de variables", ok.dropped !== undefined && ok.dropped.length === 0);

// ── skinTokens : tolère un drop mineur (≤15%) ──
const minorDrop: SkinAsk = async () => `:root {
  --color-mango: #111; --color-cream: #fff; --color-brown: #000;
  --font-heading: "X", serif; --font-body: "Y", sans-serif; --radius-md: 2px;
  --extra-bonus: 1px;
}`;
check("skin avec variable EN PLUS reste accepté", (await skinTokens(SRC, "x", minorDrop)).ok === true);

// ── skinTokens : rejet si trop de variables perdues ──
const lossyAsk: SkinAsk = async () => `:root { --color-mango: #111; }`;
const lossy = await skinTokens(SRC, "x", lossyAsk);
check("skin qui perd trop de variables → rejeté", lossy.ok === false && (lossy.dropped?.length ?? 0) >= 4);

// ── skinTokens : rejet si sortie sans CSS / cerveau en échec ──
check("sortie sans CSS → rejet propre", (await skinTokens(SRC, "x", async () => "je ne peux pas")).ok === false);
const throwAsk: SkinAsk = async () => { throw new Error("timeout cerveau"); };
check("cerveau qui throw → rejet propre sans crash", (await skinTokens(SRC, "x", throwAsk)).ok === false);
check("fichier source sans variable → rejet", (await skinTokens("body{}", "x", goodAsk)).ok === false);

// ── remap des couleurs en dur ──
const HARD = `background: "linear-gradient(150deg, #3D1C02 0%, #C15A00 72%, #F5821F 100%)";
overlay: "rgba(255,179,71,0.16)"; text: var(--color-mango);`;
const lits = collectColorLiterals(HARD);
check("collectColorLiterals trouve hex + rgba", lits.includes("#3D1C02") && lits.includes("#F5821F") && lits.some((l) => l.startsWith("rgba(")));
check("collectColorLiterals ignore les var()", !lits.some((l) => l.includes("--color")));

const map = { "#F5821F": "#5e6ad2", "#3D1C02": "#171717", "rgba(255,179,71,0.16)": "rgba(94,106,210,0.16)" };
const applied = applyColorMap(HARD, map);
check("applyColorMap remplace l'hex", applied.includes("#5e6ad2") && !applied.includes("#F5821F"));
check("applyColorMap remplace le rgba", applied.includes("rgba(94,106,210,0.16)"));
check("applyColorMap ne casse pas un hex non mappé", applied.includes("#C15A00"));
check("applyColorMap n'écrase pas un hex plus long par un préfixe", applyColorMap("#F5821FAB et #F5821F", { "#F5821F": "#000000" }) === "#F5821FAB et #000000");

check("parseColorMap tolère les fences", Object.keys(parseColorMap('```json\n{"#fff":"#000"}\n```')).length === 1);
check("parseColorMap → {} si invalide", Object.keys(parseColorMap("pas de json ici")).length === 0);

const remapAsk: SkinAsk = async () => JSON.stringify({ "#3D1C02": "#171717", "#C15A00": "#3a3a5a", "#F5821F": "#5e6ad2", "rgba(255,179,71,0.16)": "rgba(94,106,210,0.16)" });
const rr = await remapLiterals([{ path: "Accueil.tsx", content: HARD }], SRC, ok.css!, remapAsk);
check("remapLiterals renvoie une correspondance", Object.keys(rr.map).length >= 3);
check("remapLiterals édite le fichier (hero remappé)", rr.edits.length === 1 && rr.edits[0].content.includes("#5e6ad2") && !rr.edits[0].content.includes("#F5821F"));
check("remapLiterals sans littéral → aucun édit", (await remapLiterals([{ path: "x.ts", content: "const a = 1;" }], SRC, ok.css!, remapAsk)).edits.length === 0);
const failRemap: SkinAsk = async () => { throw new Error("down"); };
check("remapLiterals fail-open (cerveau down → map vide, pas de crash)", (await remapLiterals([{ path: "a", content: HARD }], SRC, ok.css!, failRemap)).edits.length === 0);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
