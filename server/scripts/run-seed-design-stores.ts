// Seed des magasins design VIDES (N11 — audit nuit 2026-07-03). One-shot.
//
// CONSTAT d'audit : workspace/.design-system.md, workspace/.preferences.md et
// workspace/.layouts/ n'existaient PAS alors que leurs RULES sont injectées à
// chaque tour — des tokens brûlés pour des magasins vides, et ZÉRO capitalisation
// des compositions réussies. Ce script les amorce depuis la RÉALITÉ du projet :
// les conventions observées dans 4 projets récents jugés réussis (maison-onyx,
// mission-ares, abysse-vivante, neon-drift) — tokens CSS réels, polices réelles,
// patterns de structure réels. Rien d'inventé : chaque puce est ancrée dans un
// fichier existant du workspace.
//
// Idempotent : un magasin déjà présent n'est JAMAIS réécrit (l'agent et Raf y
// capitalisent au fil des sessions — écraser = perdre), sauf --force explicite.
//
// Lancer :  npx tsx src/run-seed-design-stores.ts [--force]

import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../src/projects.js";
import { DESIGN_SYSTEM_FILE_NAME, loadDesignSystem, saveDesignSystem } from "../src/design-system.js";
import { LAYOUTS_DIR_NAME, listLayouts, loadLayout, saveLayout, type LayoutEntry } from "../src/layouts.js";
import { PREFERENCES_FILE_NAME, loadPreferences, savePreferences } from "../src/preferences.js";

const FORCE = process.argv.includes("--force");
const NOW = new Date().toISOString();

function log(msg: string): void {
  console.log(`[seed-design-stores] ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// (a) .design-system.md — conventions RÉELLEMENT observées (format attendu par
// design-system.ts : sections ## Palette · ## Typographie · ## Composants ·
// ## Conventions, puces factuelles, < 2000 caractères visés).
// ─────────────────────────────────────────────────────────────────────────────

const DESIGN_SYSTEM_SEED = `# Design system cross-projet
(seed 2026-07-03 — observé sur maison-onyx, mission-ares, abysse-vivante, neon-drift)

## Palette
- Fonds sombres par PALIERS de 3-6 tons proches, jamais de #000 pur (ex. #0a0a0c→#232328 ; #141017→#261f2e).
- Textes en blanc cassé à 3 niveaux fort/dim/faible, jamais #fff pur (ex. #e8e6e1/#c4c2bc/#8a8983).
- UN accent dominant par app, tiré du SUJET : or champagne #d4b072 (parfum), rouille #c1440e (Mars), téal #5fc8e0 (abysses).
- Bordures et halos = rgba() de l'accent à faible alpha (0.12-0.28), pas de gris opaque.

## Typographie
- Duo display + labeur : serif d'affichage (Cormorant Garamond) OU display géométrique (Space Grotesk, Orbitron) + Inter en labeur.
- JetBrains Mono pour les données chiffrées (dashboards, télémétrie) avec font-variant-numeric: tabular-nums.
- 2-3 familles MAX par app, déclarées en custom properties (--serif / --sans / --mono).

## Composants
- Panneaux translucides : fond rgba sombre + bordure rgba accent + radius ~14px + ombre douce (0 8px 30px rgba(0,0,0,.35)).
- Nav fixe qui se densifie au scroll (classe .scrolled) ; hero plein écran avec calques grain/vignette aria-hidden.
- États sémantiques nommés (--ok / --warn / --alert / --crit / --info) sur les dashboards.

## Conventions
- TOUS les tokens dans :root de src/index.css ; les composants consomment var(--x), zéro couleur littérale.
- Easing signature cubic-bezier(0.22, 1, 0.36, 1) ; transitions 150-250ms UI, 400-700ms pour les moments héros.
- @media (prefers-reduced-motion: reduce) toujours honoré.
`;

// ─────────────────────────────────────────────────────────────────────────────
// (a-bis) .preferences.md — tendances RÉCURRENTES (format learnPreferences :
// "# Préférences apprises" + puces courtes). Seed déterministe : uniquement des
// récurrences visibles sur PLUSIEURS des 4 projets — learnPreferences (LLM) le
// régénérera plus finement au fil des projets validés.
// ─────────────────────────────────────────────────────────────────────────────

const PREFERENCES_SEED = `# Préférences apprises
(seed 2026-07-03 — récurrences observées sur maison-onyx, mission-ares, abysse-vivante, neon-drift)
- Thèmes sombres par paliers de gris teintés ; jamais de noir ni de blanc purs.
- Un seul accent fort par projet, choisi dans l'univers du sujet (or/rouille/téal/néon).
- Inter revient en police de labeur sur 3 projets ; display serif (Cormorant Garamond) pour le luxe/organique, géométrique (Space Grotesk, Orbitron) pour le technique.
- JetBrains Mono + tabular-nums dès qu'un écran affiche des chiffres.
- Tokens CSS centralisés dans :root ; composants en var(--x).
- Micro-interactions systématiques, easing cubic-bezier(0.22,1,0.36,1).
`;

// ─────────────────────────────────────────────────────────────────────────────
// (b) .layouts/ — 2-3 squelettes de page extraits des mêmes projets (format
// layouts.ts : <LayoutName>/layout.tsx + meta.json conforme à LayoutMeta).
// Les squelettes sont GÉNÉRIQUES (structure prouvée, zéro copie projet) : on
// capitalise la COMPOSITION, l'identité visuelle se rejoue à chaque app.
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_SEEDS: LayoutEntry[] = [
  {
    meta: {
      name: "LandingImmersive",
      description: "Landing narrative plein écran : nav fixe densifiée au scroll, hero à calques (grain/vignette), sections alternées, bandeau de preuves chiffrées, CTA unique, footer.",
      tags: ["landing", "vitrine", "immersif", "narratif", "dark"],
      structure: ["nav", "hero", "sections-alternees", "chiffres", "cta", "footer"],
      usedIn: ["maison-onyx"],
      createdAt: NOW,
      updatedAt: NOW,
    },
    code: `// LANDING IMMERSIVE — squelette extrait de maison-onyx (seed N11, 2026-07-03).
// Composition prouvée : nav fixe (se densifie au scroll) → hero plein écran à
// calques d'ambiance (grain + vignette, aria-hidden) → sections de fond alternées
// → bandeau de preuves chiffrées → UN SEUL CTA → footer. Remplir les slots avec
// l'identité du sujet ; garder l'ossature et le rythme.
export default function LandingImmersive() {
  return (
    <main>
      <nav className="nav" aria-label="Navigation principale">
        <a href="#top" className="nav-brand">{/* marque */}</a>
        <ul className="nav-links">{/* ancres vers les sections */}</ul>
      </nav>

      <header className="hero" id="top">
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-inner">
          <p className="hero-eyebrow">{/* surtitre court */}</p>
          <h1 className="hero-title">{/* promesse en une phrase */}</h1>
          <p className="hero-mystery">{/* sous-texte d'ambiance */}</p>
        </div>
        <div className="hero-scroll" aria-hidden="true">{/* indicateur de scroll */}</div>
      </header>

      <section aria-label="Matière du sujet">{/* section de fond n°1 */}</section>
      <section aria-label="Pièce maîtresse interactive">{/* LE moment mémorable de la page */}</section>
      <section className="chiffres" aria-label="Preuves chiffrées">{/* 3-4 chiffres clés, tabular-nums */}</section>
      <section className="cta-section" aria-label="Appel à l'action">{/* CTA unique, pas trois */}</section>

      <footer className="footer">{/* marque + liens + méta discrète */}</footer>
    </main>
  );
}
`,
  },
  {
    meta: {
      name: "DashboardControlRoom",
      description: "Salle de contrôle : topbar marque + stats clés, grille de panneaux menée par UNE métrique reine, journal d'événements, footer de statut.",
      tags: ["dashboard", "data", "telemetrie", "controle", "dark"],
      structure: ["topbar", "metrique-reine", "panneaux-grille", "journal", "footer-statut"],
      usedIn: ["mission-ares"],
      createdAt: NOW,
      updatedAt: NOW,
    },
    code: `// DASHBOARD CONTROL ROOM — squelette extrait de mission-ares (seed N11, 2026-07-03).
// Composition prouvée : topbar (marque + 2-4 stats clés en tabular-nums) → grille
// de panneaux où UNE métrique REINE domine visuellement (les autres la servent) →
// journal d'événements/alertes → footer de statut. Hiérarchie avant couleur :
// la reine est plus GRANDE, pas juste plus colorée.
export default function DashboardControlRoom() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">{/* glyphe + titre + sous-titre de mission */}</div>
        <div className="topbar-meta">{/* 2-4 stats clés (tabular-nums) */}</div>
      </header>

      <main className="dashboard">
        {/* métrique REINE en premier — le panneau qui gouverne la lecture */}
        {/* puis les panneaux satellites : télémétrie, vitals, timeline */}
        {/* journal d'événements/alertes en flux, horodaté */}
      </main>

      <footer className="footer">
        <span>{/* statut système */}</span>
        <span>{/* horloge / compteur temps réel */}</span>
      </footer>
    </div>
  );
}
`,
  },
  {
    meta: {
      name: "SimulationImmersive",
      description: "Scène temps réel : canvas plein écran, panneau de contrôle en overlay (curseurs/presets), HUD discret de lectures.",
      tags: ["simulation", "canvas", "jeu", "temps-reel", "immersif"],
      structure: ["canvas-fullscreen", "control-panel-overlay", "hud"],
      usedIn: ["abysse-vivante", "neon-drift"],
      createdAt: NOW,
      updatedAt: NOW,
    },
    code: `// SIMULATION IMMERSIVE — squelette extrait d'abysse-vivante / neon-drift (seed N11).
// Composition prouvée : le canvas EST la page (plein écran, rien ne le concurrence) ;
// les contrôles flottent en overlay translucide (panneau rgba + bordure accent) ;
// le HUD reste discret et aria-hidden (lectures d'ambiance, pas d'interaction).
export default function SimulationImmersive() {
  return (
    <div className="stage">
      <canvas className="sim-canvas" aria-label="Simulation temps réel" />

      <aside className="control-panel">
        {/* curseurs / presets qui pilotent la simulation — panneau translucide */}
      </aside>

      <div className="hud" aria-hidden="true">
        {/* lectures temps réel discrètes (fps, profondeur, score…) */}
      </div>
    </div>
  );
}
`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Exécution : seed idempotent + vérification de relecture par les VRAIES
// fonctions des modules (pas un simple existsSync — on prouve le format).
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  log(`workspace : ${WORKSPACE_DIR}${FORCE ? " (--force : réécriture autorisée)" : ""}`);

  // (a) .design-system.md
  if (loadDesignSystem(WORKSPACE_DIR) && !FORCE) {
    log(`${DESIGN_SYSTEM_FILE_NAME} déjà présent — conservé (utiliser --force pour réécrire)`);
  } else {
    saveDesignSystem(WORKSPACE_DIR, DESIGN_SYSTEM_SEED);
    log(`${DESIGN_SYSTEM_FILE_NAME} seedé (${DESIGN_SYSTEM_SEED.length} car.)`);
  }

  // (a-bis) .preferences.md
  if (loadPreferences(WORKSPACE_DIR) && !FORCE) {
    log(`${PREFERENCES_FILE_NAME} déjà présent — conservé`);
  } else {
    savePreferences(WORKSPACE_DIR, PREFERENCES_SEED);
    log(`${PREFERENCES_FILE_NAME} seedé (${PREFERENCES_SEED.length} car.)`);
  }

  // (b) .layouts/ — idempotence PAR layout : on n'écrase jamais un layout existant
  // (il a pu être raffiné par l'agent), on ajoute seulement les manquants.
  for (const entry of LAYOUT_SEEDS) {
    if (loadLayout(WORKSPACE_DIR, entry.meta.name) && !FORCE) {
      log(`${LAYOUTS_DIR_NAME}/${entry.meta.name} déjà présent — conservé`);
    } else {
      saveLayout(WORKSPACE_DIR, entry);
      log(`${LAYOUTS_DIR_NAME}/${entry.meta.name} seedé (${entry.meta.structure.join("→")})`);
    }
  }

  // Vérification finale : relecture par les fonctions réelles des modules.
  log("── vérification de relecture ──");
  const ds = loadDesignSystem(WORKSPACE_DIR);
  if (!ds) throw new Error(`échec : ${DESIGN_SYSTEM_FILE_NAME} illisible après seed`);
  log(`loadDesignSystem OK (${ds.length} car., sections: ${(ds.match(/^## /gm) ?? []).length})`);

  const prefs = loadPreferences(WORKSPACE_DIR);
  if (!prefs) throw new Error(`échec : ${PREFERENCES_FILE_NAME} illisible après seed`);
  log(`loadPreferences OK (${prefs.length} car.)`);

  const layouts = listLayouts(WORKSPACE_DIR);
  if (layouts.length < LAYOUT_SEEDS.length) throw new Error(`échec : ${layouts.length} layout(s) listé(s), ${LAYOUT_SEEDS.length} attendus`);
  for (const m of layouts) {
    const full = loadLayout(WORKSPACE_DIR, m.name);
    if (!full || !full.code.includes("export default function")) throw new Error(`échec : layout ${m.name} incomplet`);
    log(`layout ${m.name} OK (${m.structure.length} sections, tags: ${m.tags.join(",")})`);
  }

  // Trace disque pour l'œil humain.
  log(`fichiers : ${[DESIGN_SYSTEM_FILE_NAME, PREFERENCES_FILE_NAME].map((f) => fs.existsSync(path.join(WORKSPACE_DIR, f)) ? f : `${f} MANQUANT`).join(" · ")} · ${LAYOUTS_DIR_NAME}/ (${layouts.length})`);
  log("✅ magasins design seedés et relus sans erreur");
}

main();
