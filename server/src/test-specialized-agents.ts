// Tests déterministes des agents spécialisés UX/UI et Layout (#145).
// Vérifie : résolution des profils, axiomFiles, caps, escalateAppendix,
// et la surcharge de profil dans runRelay (sans réseau).
//
// Lancer : npx tsx src/test-specialized-agents.ts

import { resolveProfile } from "./models/profile.js";
import { uxuiProfile } from "./models/uxui.js";
import { layoutProfile } from "./models/layout.js";
import { runRelay, type RelayDeps } from "./eleve.js";
import type { Inspection } from "./inspection.js";

const line = (c = "─") => console.log(c.repeat(64));
let failures = 0;
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
};

line("═");
console.log("test-specialized-agents — Agents UX/UI + Layout (#145)");
line();

// ── [1] Résolution de profil via resolveProfile() ────────────────────────────
console.log("\n  [1] resolveProfile — noms virtuels :");
check('resolveProfile("uxui") → id "uxui"',        resolveProfile("uxui").id        === "uxui");
check('resolveProfile("uxui-agent") → id "uxui"',  resolveProfile("uxui-agent").id  === "uxui");
check('resolveProfile("layout") → id "layout"',    resolveProfile("layout").id      === "layout");
check('resolveProfile("layout-agent") → id "layout"', resolveProfile("layout-agent").id === "layout");
// non-régression : gemma + generic restent inchangés
check('resolveProfile("gemma4:12b") → id "gemma"', resolveProfile("gemma4:12b").id  === "gemma");
check('resolveProfile("unknown") → id "generic"',  resolveProfile("unknown").id     === "generic");

// ── [2] Profil UX/UI ────────────────────────────────────────────────────────
console.log("\n  [2] uxuiProfile :");
check('system contient <write',           uxuiProfile.system.includes("<write"));
check('system NE contient PAS <edit',     !uxuiProfile.system.includes("<edit"));
check("system mentionne shadcn",          uxuiProfile.system.toLowerCase().includes("shadcn"));
check("system mentionne accessibilité",   uxuiProfile.system.toLowerCase().includes("accessibilit"));
check("axiomFiles inclut .axioms.md",     uxuiProfile.axiomFiles.includes(".axioms.md"));
check("axiomFiles inclut .axioms.uxui.md", uxuiProfile.axiomFiles.includes(".axioms.uxui.md"));
check("axiomCap ≥ 6",                     uxuiProfile.caps.axiomCap >= 6);
check("fileBudget ≥ 14000",               uxuiProfile.caps.fileBudget >= 14000);
check("escalateAppendix route .axioms.uxui.md",
      uxuiProfile.escalateAppendix.includes(".axioms.uxui.md"));

// ── [3] Profil Layout ────────────────────────────────────────────────────────
console.log("\n  [3] layoutProfile :");
check('system contient <write',            layoutProfile.system.includes("<write"));
check('system NE contient PAS <edit',      !layoutProfile.system.includes("<edit"));
check("system mentionne Grid",             layoutProfile.system.includes("Grid"));
check("system mentionne Container Queries", layoutProfile.system.includes("Container Queries"));
check("axiomFiles inclut .axioms.md",      layoutProfile.axiomFiles.includes(".axioms.md"));
check("axiomFiles inclut .axioms.layout.md", layoutProfile.axiomFiles.includes(".axioms.layout.md"));
check("escalateAppendix route .axioms.layout.md",
      layoutProfile.escalateAppendix.includes(".axioms.layout.md"));

// ── [4] runRelay — surcharge de profil (sans réseau) ────────────────────────
console.log("\n  [4] runRelay — surcharge opts.profile (mock sans réseau) :");

const capturedSystem: string[] = [];
let capturedCallModel = "";

const mockOkInspection: Inspection = {
  ok: true, signal: "ok", detail: "", durationMs: 0,
};

const mockDeps: RelayDeps = {
  askEleve: async (system, _user) => {
    capturedSystem.push(system);
    // Réponse minimale valide (contrat mangoos)
    return "<mangoos><summary>ok</summary></mangoos>";
  },
  inspect: async () => mockOkInspection,
  ensureDeps: async () => {},
  escalate: async () => ({ axiom: false, costUsd: 0, codeChanged: true }),
};

// Utilise un répertoire temporaire inexistant — ensureDeps est mocké donc ça passe
const fakeDir = "C:/nonexistent/fake-project";

try {
  capturedSystem.length = 0;
  const result = await runRelay("créer un composant Card", fakeDir, {
    profile: uxuiProfile,
    eleveModel: "gemma4:12b", // modèle réel, mais askEleve est mocké
    maxEleveAttempts: 1,
  }, mockDeps);

  check("runRelay réussit avec profil uxui (mock)",      result.success === true);
  check("profil uxui system transmis à askEleve",
    capturedSystem.length > 0 && capturedSystem[0].includes("shadcn"));
  check("resolvedBy = eleve",                            result.resolvedBy === "eleve");
} catch (e) {
  check(`runRelay ne lève pas d'exception : ${(e as Error).message}`, false);
}

// Vérifie que Layout profile est correctement transmis aussi
try {
  capturedSystem.length = 0;
  const result2 = await runRelay("créer une grille responsive", fakeDir, {
    profile: layoutProfile,
    eleveModel: "gemma4:12b",
    maxEleveAttempts: 1,
  }, mockDeps);

  check("runRelay réussit avec profil layout (mock)",    result2.success === true);
  check("profil layout system transmis (Grid mentionné)",
    capturedSystem.length > 0 && capturedSystem[0].includes("Grid"));
} catch (e) {
  check(`runRelay layout ne lève pas : ${(e as Error).message}`, false);
}

// ── Résultat ─────────────────────────────────────────────────────────────────
line("═");
console.log(failures === 0
  ? "✅ Tous les checks sont verts — agents spécialisés UX/UI + Layout prêts."
  : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
