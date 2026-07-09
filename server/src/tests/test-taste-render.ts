// Tests de l'orchestrateur de rendu (taste-render.ts) — TOUTES les deps faussées
// (Sharingan / GLM / aperçu / capture) → déterministe, sans réseau ni navigateur.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findTokensFile, walkStyleFiles, findHeroFile, deriveSubject, generateTasteSkins, type TasteRenderDeps } from "../taste/taste-render.js";
import type { CaptureDeps } from "../taste/taste-engine.js";
import type { SkinAsk } from "../taste/taste-generate.js";
import { sampleCompositions } from "../taste/taste-compositions.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

// ── Faux projet ──
const PROJ = fs.mkdtempSync(path.join(os.tmpdir(), "mango-proj-"));
fs.mkdirSync(path.join(PROJ, "src", "theme"), { recursive: true });
fs.mkdirSync(path.join(PROJ, "src", "pages"), { recursive: true });
const TOKENS = path.join(PROJ, "src", "theme", "tokens.css");
const PAGE = path.join(PROJ, "src", "pages", "Accueil.tsx");
const TOKENS_SRC = ":root {\n  --color-mango: #F5821F;\n  --color-cream: #FFF8EC;\n}\n";
const PAGE_SRC = `export const x = { background: "#F5821F" };\n`;
fs.writeFileSync(TOKENS, TOKENS_SRC);
fs.writeFileSync(PAGE, PAGE_SRC);
const REF_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mango-refs-")); // vide → fallback catalogue

// ── helpers ──
check("findTokensFile trouve src/theme/tokens.css", findTokensFile(PROJ) === TOKENS);
check("findTokensFile → null si absent", findTokensFile(os.tmpdir() + "/nope-xyz") === null);
const styles = walkStyleFiles(path.join(PROJ, "src"), TOKENS);
check("walkStyleFiles inclut la page", styles.includes(PAGE));
check("walkStyleFiles exclut le fichier de tokens", !styles.includes(TOKENS));

// ── deps faussées ──
const captureDeps: CaptureDeps = {
  analyzeUrl: async () => ({ palette: ["#5e6ad2", "#0b0d12"], cssVars: { "--color-accent": "#5e6ad2" }, fonts: ["Inter"], families: ["Inter Variable"] }),
  analyzeImage: async () => ({ palette: ["#abcdef"], ambiance: "sombre · vif · froid" }),
};
const ask: SkinAsk = async (system) => {
  if (/remappeur/i.test(system)) return JSON.stringify({ "#F5821F": "#5e6ad2" });
  return ":root {\n  --color-mango: #5e6ad2;\n  --color-cream: #0b0d12;\n}\n";
};
let started = 0, stopped = 0, shots = 0;
const deps: TasteRenderDeps = {
  captureDeps, ask, refDir: REF_DIR, hmrSettleMs: 0,
  startPreview: async () => { started++; return { url: "http://127.0.0.1:5174" }; },
  stopPreview: async () => { stopped++; },
  capture: async () => { shots++; return Buffer.from([0xff, 0xd8, 0xff]); },
};

const OUT = path.join(PROJ, ".skins");
const events: string[] = [];
const skins = await generateTasteSkins(PROJ, { directions: ["minimal-froid", "glass-sombre"], outDir: OUT }, (ev) => events.push(ev.type), deps);

check("rend 2 skins", skins.length === 2 && skins.every((s) => s.ok));
check("écrit les images des skins", fs.existsSync(path.join(OUT, "minimal-froid.jpg")) && fs.existsSync(path.join(OUT, "glass-sombre.jpg")));
check("expose le nom de fichier + palette", !!skins[0].file && skins[0].palette.includes("#5e6ad2"));
check("aperçu démarré 1x, arrêté 1x, 2 captures", started === 1 && stopped === 1 && shots === 2);
check("émet des events skin", events.filter((e) => e === "skin").length === 2);
check("RESTAURE le fichier de tokens", fs.readFileSync(TOKENS, "utf8") === TOKENS_SRC);
check("RESTAURE la page (couleur en dur remappée pendant, restaurée après)", fs.readFileSync(PAGE, "utf8") === PAGE_SRC);

// ── garde-fous ──
let threw = false;
try { await generateTasteSkins(os.tmpdir() + "/no-such-proj", { directions: ["minimal-froid"], outDir: OUT }, () => {}, deps); }
catch { threw = true; }
check("projet sans fichier de tokens → throw", threw);

// skin en échec (cerveau renvoie du vide) → enregistré ok:false, pas de crash
const badAsk: SkinAsk = async (system) => (/remappeur/i.test(system) ? "{}" : "désolé");
const bad = await generateTasteSkins(PROJ, { directions: ["minimal-froid"], outDir: OUT, k: 1 }, () => {}, { ...deps, ask: badAsk });
check("skin invalide → ok:false sans crash", bad.length === 1 && bad[0].ok === false);
check("tokens restaurés même après skin invalide", fs.readFileSync(TOKENS, "utf8") === TOKENS_SRC);

// ── findHeroFile / deriveSubject ──
check("deriveSubject extrait le sujet du nom de projet", deriveSubject(path.join("x", "mango-cafe-ts")) === "cafe");
check("deriveSubject repli si rien d'utile", deriveSubject(path.join("x", "mango")) === "modern interior");
check("findHeroFile → null si aucune <section>", findHeroFile(PROJ) === null); // la page du test n'a pas de <section>
fs.writeFileSync(path.join(PROJ, "src", "pages", "Home.tsx"), "export default () => (<section><h1>hi</h1></section>);\n");
check("findHeroFile repère une page avec <section>", findHeroFile(PROJ)?.endsWith("Home.tsx") === true);

// ── Maille « héros » : STYLE fixe, K COMPOSITIONS de hero (PROJ a maintenant un <section>) ──
let skinTokenCalls = 0, heroComposed = 0, heroPlain = 0;
const heroCapture: CaptureDeps = {
  analyzeUrl: async () => ({ palette: ["#5e6ad2", "#0b0d12"], cssVars: {}, fonts: ["Inter"], families: ["Inter"] }),
  analyzeImage: async () => ({ palette: ["#abcdef"], ambiance: "sombre" }),
};
const heroAsk: SkinAsk = async (system) => {
  if (/remappeur/i.test(system)) return "{}";
  if (/COMPOSITION IMPOSÉE/.test(system)) { heroComposed++; return "<section><h1>composed</h1></section>"; }
  if (/designer-développeur/i.test(system)) { heroPlain++; return "<section><h1>plain</h1></section>"; }
  skinTokenCalls++; // SKIN_SYSTEM (skinner de tokens) : 1 fois par direction
  return ":root {\n  --color-mango: #5e6ad2;\n  --color-cream: #0b0d12;\n}\n";
};
const heroDeps: TasteRenderDeps = {
  ...deps, captureDeps: heroCapture, ask: heroAsk, image: async () => "http://img/test.jpg",
};
const OUT2 = path.join(PROJ, ".skins-hero");
const heroSkins = await generateTasteSkins(PROJ, { maille: "hero", k: 2, outDir: OUT2 }, () => {}, heroDeps);
const expectComp = sampleCompositions(2).map((c) => c.id);

check("maille héros rend 2 variantes ok", heroSkins.length === 2 && heroSkins.every((s) => s.ok));
check("maille héros : ids = compositions (pas directions)",
  JSON.stringify([...heroSkins.map((s) => s.id)].sort()) === JSON.stringify([...expectComp].sort()));
check("maille héros : skin des tokens CALCULÉ 1x (style fixe en cache)", skinTokenCalls === 1);
check("maille héros : composition IMPOSÉE à chaque hero", heroComposed === 2 && heroPlain === 0);
check("maille héros : images écrites sous les ids de composition",
  expectComp.every((id) => fs.existsSync(path.join(OUT2, `${id}.jpg`))));
check("maille héros : tokens restaurés", fs.readFileSync(TOKENS, "utf8") === TOKENS_SRC);

// ── Non-régression : maille skin (défaut) avec hero présent → composition LIBRE (system plain) ──
heroComposed = 0; heroPlain = 0;
const OUT3 = path.join(PROJ, ".skins-plain");
const skinSkins = await generateTasteSkins(PROJ, { directions: ["minimal-froid"], k: 1, outDir: OUT3 }, () => {}, heroDeps);
check("maille skin : 1 variante portant l'id de direction", skinSkins.length === 1 && skinSkins[0].id === "minimal-froid");
check("maille skin : hero redessiné en composition LIBRE (system plain)", heroPlain === 1 && heroComposed === 0);

// ── Boucle fermée (#149 v2) : favorIds amorce le sampler de l'axe qui varie ──
{
  // hero : « split-image-gauche » n'est pas dans le top-2 par défaut → le favori l'injecte.
  const OUT4 = path.join(PROJ, ".skins-fav-hero");
  const favHero = await generateTasteSkins(PROJ, { maille: "hero", k: 2, outDir: OUT4, favorIds: ["split-image-gauche"] }, () => {}, heroDeps);
  check("favorIds (héros) injecte la composition favorite", favHero.some((s) => s.id === "split-image-gauche"));
}
{
  // skin : « cinematique-gradient » seed le sampler de directions.
  const OUT5 = path.join(PROJ, ".skins-fav-skin");
  const favSkin = await generateTasteSkins(PROJ, { maille: "skin", k: 2, outDir: OUT5, favorIds: ["cinematique-gradient"] }, () => {}, heroDeps);
  check("favorIds (skin) injecte la direction favorite", favSkin.some((s) => s.id === "cinematique-gradient"));
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
