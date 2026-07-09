// Preuve de selectAxioms v2 (récupération par pertinence, jalon D).
//   - Sans contexte (Claude) : le registre COMPLET, comportement inchangé.
//   - Avec contexte (Élève)  : seuls les axiomes PERTINENTS pour la tâche,
//     plafonnés — un petit modèle ne doit pas être saturé.
//
// Lancer :  npx tsx src/test-axioms.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AXIOMS_FILE_NAME, selectAxioms } from "../axioms.js";
import { detectProjectType } from "../blueprints.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });
const countAxioms = (s: string) => (s.match(/AXIOME-/g) ?? []).length;
const has = (s: string, id: string) => s.includes(id);

// Registre synthétique : 7 axiomes, catégories et maturités variées.
const REGISTRY = [
  `AXIOME-DATA-01 (maturité: confirmé · vu: 2026-06-10)
- Contexte : afficher de grandes listes de données dans un tableau
- Piège : tout rendre d'un coup fige le navigateur
- Règle d'or : paginer ou virtualiser tout tableau de données volumineux`,
  `AXIOME-UIUX-01 (maturité: candidat · vu: 2026-06-11)
- Contexte : densité visuelle d'une interface
- Piège : un padding incohérent casse le rythme vertical
- Règle d'or : utiliser une échelle d'espacement unique`,
  `AXIOME-VISION-01 (maturité: confirmé · vu: 2026-06-09)
- Contexte : animation de sprites dans un jeu canvas
- Piège : recalculer la collision à chaque frame sature le CPU
- Règle d'or : limiter la détection de collision aux entités proches`,
  `AXIOME-PERF-01 (maturité: candidat · vu: 2026-06-12)
- Contexte : re-rendus React inutiles
- Piège : recréer des objets en props casse la mémoïsation
- Règle d'or : stabiliser les références passées en props`,
  `AXIOME-ARCH-01 (maturité: candidat · vu: 2026-06-12)
- Contexte : gestion d'état d'un agent IA
- Piège : un état global non borné fuit entre sessions
- Règle d'or : isoler l'état par session`,
  `AXIOME-BUILD-01 (maturité: candidat · vu: 2026-06-13)
- Contexte : projet Vite en ESM
- Piège : module.exports/require casse le build
- Règle d'or : toujours import/export en ESM`,
  `AXIOME-A11Y-01 (maturité: candidat · vu: 2026-06-11)
- Contexte : lisibilité du texte
- Piège : un contraste insuffisant échoue WCAG
- Règle d'or : viser un ratio de contraste ≥ 4.5:1`,
].join("\n\n");

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axioms-"));
  try {
    fs.writeFileSync(path.join(dir, AXIOMS_FILE_NAME), REGISTRY);

    line("═");
    console.log("selectAxioms v2 — pertinence + plafond");
    line();

    // 1) Claude : pas de contexte → registre complet, inchangé
    const full = selectAxioms(dir);
    console.log("\n  [1] Sans contexte (Claude) :");
    check("les 7 axiomes sont présents", countAxioms(full) === 7);
    check("inclut l'axiome VISION (non filtré)", has(full, "AXIOME-VISION-01"));

    // 2) Élève sur une tâche dashboard, plafond 3
    const dash = selectAxioms(dir, {
      task: "Crée un dashboard avec un graphique et un tableau de données paginé",
      max: 3,
    });
    console.log("\n  [2] Contexte dashboard (Élève, max 3) :");
    check("plafonné à 3 axiomes", countAxioms(dash) === 3);
    check("DATA-01 retenu (pertinent + confirmé)", has(dash, "AXIOME-DATA-01"));
    check("VISION-01 (jeu/sprite) écarté", !has(dash, "AXIOME-VISION-01"));
    check("ARCH-01 (agent IA) écarté", !has(dash, "AXIOME-ARCH-01"));

    // 3) Élève sur une tâche jeu, plafond 3 → priorité VISION/PERF
    const game = selectAxioms(dir, {
      task: "Crée un jeu en canvas avec des sprites et des collisions",
      max: 3,
    });
    console.log("\n  [3] Contexte jeu (Élève, max 3) :");
    check("plafonné à 3", countAxioms(game) === 3);
    check("VISION-01 retenu (pertinent ici)", has(game, "AXIOME-VISION-01"));
    check("DATA-01 (tableaux) écarté", !has(game, "AXIOME-DATA-01"));

    // 4) v2.1 — tâche NEUTRE + type de projet venu de la mémoire (dashboard).
    // "ajoute un bouton" ne contient aucun mot-clé de type → sans le type, la
    // pertinence par catégorie serait aveugle. Avec projectType="dashboard"
    // (détecté depuis .memory.md), DATA prime, VISION (jeu) est écarté.
    const neutralDash = selectAxioms(dir, {
      task: "Ajoute un bouton de rafraîchissement en haut à droite",
      projectType: "dashboard",
      max: 3,
    });
    console.log("\n  [4] Tâche neutre + type 'dashboard' depuis la mémoire (max 3) :");
    check("DATA-01 retenu via le type projet", has(neutralDash, "AXIOME-DATA-01"));
    check("VISION-01 (jeu) écarté", !has(neutralDash, "AXIOME-VISION-01"));

    // 5) v2.1 — type "webapp" (jadis silencieusement non-matché par les regex
    // de mots-clés) est désormais autoritaire → ses catégories sont prises.
    const webapp = selectAxioms(dir, {
      task: "Ajoute la persistance",
      projectType: "webapp",
      max: 4,
    });
    console.log("\n  [5] Type 'webapp' autoritaire (max 4) :");
    check("ARCH-01 retenu (catégorie webapp)", has(webapp, "AXIOME-ARCH-01"));
    check("DATA-01 retenu (catégorie webapp)", has(webapp, "AXIOME-DATA-01"));
    check("VISION-01 (jeu) écarté", !has(webapp, "AXIOME-VISION-01"));

    // 6) detectProjectType : tâche neutre → fallback mémoire ; tâche typée prime
    check(
      "detectProjectType: tâche neutre → type depuis la mémoire",
      detectProjectType("ajoute un bouton", "Ce projet est un dashboard admin avec recharts") === "dashboard",
    );
    check(
      "detectProjectType: tâche typée prime sur la mémoire",
      detectProjectType("crée un jeu en canvas", "Ce projet est un dashboard") === "jeu",
    );
    check(
      "detectProjectType: aucun signal → 'autre'",
      detectProjectType("ajoute un bouton", "") === "autre",
    );

    // 7) Registre vide → chaîne vide
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "axioms-empty-"));
    check("registre absent → ''", selectAxioms(empty, { task: "x", max: 5 }) === "");
    fs.rmSync(empty, { recursive: true, force: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  line("═");
  if (failures === 0) {
    console.log("✅ selectAxioms v2 : Claude reçoit tout, l'Élève reçoit le pertinent plafonné.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures} vérification(s) en échec.`);
    process.exit(1);
  }
})();
