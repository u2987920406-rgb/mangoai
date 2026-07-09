// Test déterministe pour multiProjectPromptSection (idée #26 Phase 2).
// Aucun appel API — workspace temporaire créé et détruit localement.
//
// Lancer :  npx tsx src/test-multi-project.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { multiProjectPromptSection } from "./multi-project.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

/** Crée un fichier (et les dossiers parents) dans le workspace temporaire. */
function touch(base: string, rel: string): void {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `// ${rel}\n`, "utf-8");
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-mp-"));
  try {
    // ── Workspace factice ──────────────────────────────────────────────────
    // projet-a : 3 fichiers — 2 components, 1 hook
    touch(tmp, "projet-a/src/components/Button.tsx");
    touch(tmp, "projet-a/src/components/Modal.tsx");
    touch(tmp, "projet-a/src/hooks/useTheme.ts");

    // projet-b : 2 fichiers — 1 util, 1 component
    touch(tmp, "projet-b/src/utils/format.ts");
    touch(tmp, "projet-b/src/components/Card.jsx");

    // projet-courant : 2 fichiers (ne doit PAS apparaître dans la section)
    touch(tmp, "projet-courant/src/components/Hero.tsx");
    touch(tmp, "projet-courant/src/hooks/useData.ts");

    line("═");
    console.log("multiProjectPromptSection — tests déterministes");
    line();

    // ── [1] Cas nominal ───────────────────────────────────────────────────
    const section = multiProjectPromptSection(tmp, "projet-courant");
    console.log("\n  [1] Cas nominal (2 projets tiers + 1 projet courant exclu) :");
    check("retourne une chaîne non vide", section.length > 0);
    check("projet-a est listé", section.includes("projet-a"));
    check("projet-b est listé", section.includes("projet-b"));
    check("projet-courant est ABSENT", !section.includes("projet-courant"));
    check("contient des chemins forward-slash", section.includes("/"));
    // Les fichiers .tsx/.jsx doivent apparaître (catégorie 'component')
    check("Button.tsx de projet-a apparaît", section.includes("Button.tsx"));
    check("Card.jsx de projet-b apparaît", section.includes("Card.jsx"));
    // Les hooks et utils doivent aussi apparaître
    check("useTheme.ts (hook) de projet-a apparaît", section.includes("useTheme.ts"));
    check("format.ts (util) de projet-b apparaît", section.includes("format.ts"));

    // ── [2] Seul le projet courant dans le workspace ──────────────────────
    const soloTmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-solo-"));
    try {
      touch(soloTmp, "mon-projet/src/components/App.tsx");
      const soloSection = multiProjectPromptSection(soloTmp, "mon-projet");
      console.log("\n  [2] Workspace avec un seul projet (le projet courant) :");
      check("retourne '' quand aucun autre projet", soloSection === "");
    } finally {
      fs.rmSync(soloTmp, { recursive: true, force: true });
    }

    // ── [3] Workspace vide ────────────────────────────────────────────────
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-empty-"));
    try {
      const emptySection = multiProjectPromptSection(emptyTmp, "projet-courant");
      console.log("\n  [3] Workspace vide :");
      check("retourne '' sur workspace vide", emptySection === "");
    } finally {
      fs.rmSync(emptyTmp, { recursive: true, force: true });
    }

    // ── [4] Sans projet courant (currentProject omis) ─────────────────────
    console.log("\n  [4] Aucun projet courant fourni (liste tout) :");
    const allSection = multiProjectPromptSection(tmp);
    check("retourne une chaîne non vide", allSection.length > 0);
    check("projet-a présent", allSection.includes("projet-a"));
    check("projet-b présent", allSection.includes("projet-b"));
    check("projet-courant présent (aucune exclusion)", allSection.includes("projet-courant"));

    // ── [5] Workspace inexistant ──────────────────────────────────────────
    console.log("\n  [5] Workspace inexistant :");
    const noDir = path.join(os.tmpdir(), "mango-does-not-exist-" + Date.now());
    check("retourne '' sur dossier inexistant", multiProjectPromptSection(noDir) === "");

    // ── [6] Dossiers exclus (.cache, node_modules, .mango) ───────────────
    const exclTmp = fs.mkdtempSync(path.join(os.tmpdir(), "mango-excl-"));
    try {
      touch(exclTmp, "node_modules/react/src/components/Foo.tsx");
      touch(exclTmp, ".mango/cache/src/components/Bar.tsx");
      touch(exclTmp, ".git/src/components/Baz.tsx");
      touch(exclTmp, "vrai-projet/src/components/Real.tsx");
      const exclSection = multiProjectPromptSection(exclTmp, "autre");
      console.log("\n  [6] Exclusion des dossiers réservés :");
      check("node_modules absent", !exclSection.includes("node_modules"));
      check(".mango absent", !exclSection.includes(".mango"));
      check(".git absent", !exclSection.includes(".git"));
      check("vrai-projet présent", exclSection.includes("vrai-projet"));
    } finally {
      fs.rmSync(exclTmp, { recursive: true, force: true });
    }

  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  line("═");
  if (failures === 0) {
    console.log(`✅ Toutes les assertions passent.`);
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
