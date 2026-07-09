// Preuve déterministe de l'idée #49 — "Cadrage qui apprend de toi":
// load/save/cap de .preferences.md + preferencesPromptSection + learnPreferences
// avec deps mockées (aucun réseau).
//
// Lancer :  npx tsx src/test-preferences.ts

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  PREFERENCES_FILE_NAME,
  loadPreferences,
  savePreferences,
  preferencesPromptSection,
  learnPreferences,
} from "../preferences.js";

let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};
const line = (c = "─") => console.log(c.repeat(64));

line("═");
console.log("preferences — idée #49 (Cadrage qui apprend de toi)");
line();

// ── 1. load d'un dossier vide → "" ───────────────────────────────────────────
console.log("1. load/save/cap");
const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "pref-"));
check("loadPreferences dossier vide → ''", loadPreferences(dir1) === "");

// ── 2. Round-trip save→load ───────────────────────────────────────────────────
const content = "# Préférences apprises\n- Dark mode systématique\n- Police sans-serif";
savePreferences(dir1, content);
check("fichier écrit au bon nom", fs.existsSync(path.join(dir1, PREFERENCES_FILE_NAME)));
check("round-trip save→load exact", loadPreferences(dir1) === content);

// ── 3. Cap à 2500 chars ───────────────────────────────────────────────────────
const huge = "x".repeat(3000);
savePreferences(dir1, huge);
const loaded = loadPreferences(dir1);
check("contenu surdimensionné tronqué (<3000)", loaded.length < 3000);
check("message de troncature présent", loaded.includes("tronqué"));
fs.rmSync(dir1, { recursive: true, force: true });

// ── 4. preferencesPromptSection ───────────────────────────────────────────────
console.log("\n2. preferencesPromptSection");
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "pref-"));
check("section vide si dossier vide → ''", preferencesPromptSection(dir2) === "");

const pref = "# Préférences apprises\n- Fond sombre\n- Boutons arrondis";
savePreferences(dir2, pref);
const section = preferencesPromptSection(dir2);
check("section non vide quand .preferences.md présent", section.length > 0);
check("section contient le contenu", section.includes("Fond sombre"));
check("section contient le mot 'inherit'", section.includes("inherit"));
fs.rmSync(dir2, { recursive: true, force: true });

// ── 5. learnPreferences — cas (a): ask réussit → fichier écrit ───────────────
console.log("\n3. learnPreferences (deps mockées)");

// (a) ask renvoie une synthèse → fichier écrit
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "pref-"));
// Fournir un signal minimal (.design-system.md factice dans WORKSPACE_DIR)
const fakeDesignSystem = path.join(dir3, ".design-system.md");
fs.writeFileSync(fakeDesignSystem, "## Palette\n- Primaire : #6366f1\n- Fond : #1A1A2E", "utf8");
// Écrire aussi un .design-system.md dans dir3 (loadDesignSystem lit workspaceDir)
const mockContent = "# Préférences apprises\n- Dark mode\n- Police Inter";
const depsOk: { ask: (s: string, u: string) => Promise<string> } = {
  ask: async (_s, _u) => mockContent,
};
// learnPreferences utilise workspaceDir pour loadDesignSystem, listProjects, etc.
// On passe dir3 comme workspace — il a le .design-system.md factice ci-dessus.
await learnPreferences(dir3, depsOk);
check("(a) fichier .preferences.md créé", fs.existsSync(path.join(dir3, PREFERENCES_FILE_NAME)));
check("(a) contenu = synthèse mockée", loadPreferences(dir3) === mockContent);
fs.rmSync(dir3, { recursive: true, force: true });

// (b) ask throw → erreur avalée, pas de throw, pas de fichier
const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), "pref-"));
// Signal: .design-system.md pour que la garde "hasSignals" passe
fs.writeFileSync(path.join(dir4, ".design-system.md"), "## Palette\n- #000000", "utf8");
const depsKo: { ask: (s: string, u: string) => Promise<string> } = {
  ask: async (_s, _u) => { throw new Error("Simulated LLM failure"); },
};
let threw = false;
try {
  await learnPreferences(dir4, depsKo);
} catch {
  threw = true;
}
check("(b) ask throw → pas de throw propagé", !threw);
check("(b) pas de fichier écrit si ask échoue", !fs.existsSync(path.join(dir4, PREFERENCES_FILE_NAME)));
fs.rmSync(dir4, { recursive: true, force: true });

// (c) aucun signal (workspace tmp vide, pas de projets) → no-op (ask non appelé)
const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), "pref-"));
let askCalled = false;
const depsNoSignal: { ask: (s: string, u: string) => Promise<string> } = {
  ask: async (_s, _u) => { askCalled = true; return ""; },
};
await learnPreferences(dir5, depsNoSignal);
check("(c) aucun signal → ask non appelé", !askCalled);
check("(c) aucun signal → pas de fichier", !fs.existsSync(path.join(dir5, PREFERENCES_FILE_NAME)));
fs.rmSync(dir5, { recursive: true, force: true });

// ── Résultat ──────────────────────────────────────────────────────────────────
line("═");
if (failures === 0) {
  console.log("✅ Préférences : load/save/cap/section/learn — tous verts.");
  process.exit(0);
} else {
  console.log(`❌ ${failures} vérification(s) en échec.`);
  process.exit(1);
}
