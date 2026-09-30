// Preuve déterministe des constellations (idée #74) : résolution (défauts +
// overrides JSON), chargement tolérant, détection sur le prompt (mot entier +
// normalisation accents), section injectée + cap, validation de la config, et
// gating dans assembleSystemPrompt (présent elite/mvp/nocturne, absent
// finition/esthetique). fs en tmpdir, zéro réseau.
//
// Lancer :  npx tsx src/test-constellations.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  CONSTELLATIONS_FILE_NAME,
  DEFAULT_CONSTELLATIONS,
  loadCustomConstellations,
  resolveConstellations,
  loadConstellationsConfig,
  saveConstellationsConfig,
  detectConstellations,
  constellationsSection,
  isDefaultConstellation,
} from "../constellations.js";
import { assembleSystemPrompt } from "../scenario.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));
const mkdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "cons-"));
const writeConfig = (dir: string, obj: unknown) =>
  fs.writeFileSync(path.join(dir, CONSTELLATIONS_FILE_NAME), JSON.stringify(obj), "utf8");

line("═");
console.log("constellations — super-skills par composition (#74)");
line();

// 1) resolveConstellations : défauts + overrides ──────────────────────────────
console.log("resolveConstellations :");
const d1 = mkdir();
check("défauts seuls quand pas de config", resolveConstellations(d1).length === DEFAULT_CONSTELLATIONS.length);
check("'form' est un défaut", isDefaultConstellation("form") && !isDefaultConstellation("zzz"));

const d2 = mkdir();
writeConfig(d2, [{ id: "auth", label: "Auth", emoji: "🔒", keywords: ["auth", "login"], rules: "régles auth" }]);
const r2 = resolveConstellations(d2);
check("ajout d'une constellation perso (id nouveau)", r2.some((c) => c.id === "auth") && r2.length === DEFAULT_CONSTELLATIONS.length + 1);

const d3 = mkdir();
writeConfig(d3, [{ id: "form", label: "Form custom", keywords: ["formulaire", "wizard"], rules: "régles surchargées" }]);
const form3 = resolveConstellations(d3).find((c) => c.id === "form");
check("surcharge d'un défaut par même id (champs mergés)", form3?.label === "Form custom" && form3?.rules === "régles surchargées");
check("surcharge garde l'origine 'défaut'", isDefaultConstellation("form"));

const d4 = mkdir();
writeConfig(d4, [{ id: "form", enabled: false }]);
check("désactivation via enabled:false (override partiel)", !resolveConstellations(d4).some((c) => c.id === "form"));

// 2) loadCustomConstellations : tolérant ──────────────────────────────────────
line();
console.log("loadCustomConstellations :");
const d5 = mkdir();
check("fichier absent → []", loadCustomConstellations(d5).length === 0);
fs.writeFileSync(path.join(d5, CONSTELLATIONS_FILE_NAME), "{ pas du json", "utf8");
check("JSON invalide → [] (tolérant)", loadCustomConstellations(d5).length === 0);
const d6 = mkdir();
writeConfig(d6, [{ label: "sans id" }, { id: "ok", rules: "x" }]);
const c6 = loadCustomConstellations(d6);
check("entrée sans id filtrée, entrée valide gardée", c6.length === 1 && c6[0].id === "ok");

// 3) detectConstellations : mot entier + accents ──────────────────────────────
line();
console.log("detectConstellations :");
const d7 = mkdir();
check("'crée un formulaire de contact' → form déclenchée", detectConstellations("Crée un formulaire de contact", "webapp", d7).some((c) => c.id === "form"));
check("'un jeu de plateforme' → aucune", detectConstellations("un jeu de plateforme arcade", "jeu", d7).length === 0);
check("matching insensible à la casse/accents (FORMULAIRE)", detectConstellations("Ajoute un FORMULAIRE", "webapp", d7).some((c) => c.id === "form"));
check("pas de faux positif mot-dans-mot ('information' ne déclenche pas 'form')", detectConstellations("affiche une information", "webapp", d7).length === 0);

// 2026-09-30 — constellation `interface` (généralisation a11y/tests/archi).
// Mesure de départ : 9/21 projets red, toujours sur tests (6), accessibility (5),
// architecture (5), parce que seul le pack `form` portait des règles a11y.
const dInt = mkdir();
check("'un catalogue de vélos' → interface déclenchée", detectConstellations("Crée un catalogue de vélos", "webapp", dInt).some((c) => c.id === "interface"));
check("'un tableau de bord' → interface déclenchée", detectConstellations("ajoute un tableau de bord", "dashboard", dInt).some((c) => c.id === "interface"));
check("'une galerie photo' → interface déclenchée", detectConstellations("une galerie photo", "vitrine", dInt).some((c) => c.id === "interface"));
check("interface ne se déclenche pas sur un simple formulaire", !detectConstellations("un formulaire de contact", "webapp", dInt).some((c) => c.id === "interface"));
const secInt = constellationsSection("Crée un catalogue de vélos", "webapp", dInt);
check("section interface porte l'a11y (aria-label) et les tests", secInt.includes("Constellation INTERFACE") && secInt.includes("aria-label") && secInt.includes("Vitest"));

// projectTypes en signal complémentaire
const d8 = mkdir();
writeConfig(d8, [{ id: "dash", label: "Dash", emoji: "📊", keywords: [], projectTypes: ["dashboard"], rules: "régles dashboard" }]);
check("déclenchement par projectType (sans keyword)", detectConstellations("ajoute une colonne", "dashboard", d8).some((c) => c.id === "dash"));
check("pas de déclenchement si type différent", !detectConstellations("ajoute une colonne", "vitrine", d8).some((c) => c.id === "dash"));

// 4) constellationsSection : règles / vide / cap ──────────────────────────────
line();
console.log("constellationsSection :");
const d9 = mkdir();
const sec = constellationsSection("formulaire d'inscription", "webapp", d9);
check("déclenchée → section contient les règles FORMULAIRE", sec.includes("Constellation FORMULAIRE") && sec.includes("Validation"));
check("aucune → section vide", constellationsSection("un portfolio d'images", "vitrine", d9) === "");

// 5) saveConstellationsConfig : validation ────────────────────────────────────
line();
console.log("saveConstellationsConfig :");
const d10 = mkdir();
let threw = false;
try { saveConstellationsConfig(d10, "{ pas du json"); } catch { threw = true; }
check("JSON invalide → throw", threw);
threw = false;
try { saveConstellationsConfig(d10, JSON.stringify({ not: "array" })); } catch { threw = true; }
check("JSON valide mais pas un tableau → throw", threw);
saveConstellationsConfig(d10, JSON.stringify([{ id: "x", rules: "y" }]));
check("tableau valide → écrit + round-trip", loadConstellationsConfig(d10).includes('"id"') && loadCustomConstellations(d10).length === 1);

// 6) Gating dans assembleSystemPrompt ─────────────────────────────────────────
line();
console.log("Gating (assembleSystemPrompt) :");
const MARK = "CONSTELLATION-GATING-MARKER";
const base = { model: "sonnet", projectDir: mkdir(), constellationsSection: `\n${MARK}\n` } as const;
const has = (mode: "mvp" | "elite" | "finition" | "nocturne" | "esthetique") =>
  assembleSystemPrompt({ ...base, mode }).includes(MARK);
check("présent en elite", has("elite"));
check("présent en mvp", has("mvp"));
check("présent en nocturne", has("nocturne"));
check("ABSENT en finition", !has("finition"));
check("ABSENT en esthetique", !has("esthetique"));

// ── Bilan ─────────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ constellations — toutes les assertions vertes");
} else {
  console.log(`❌ constellations — ${failures} assertion(s) en échec`);
  process.exitCode = 1;
}
