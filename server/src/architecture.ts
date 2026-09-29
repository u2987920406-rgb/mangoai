// Carte d'architecture vivante (Chantier #38).
// Per-project file .architecture.md that maps the technical structure of a
// generated app: components, pages, data flows, API endpoints, stack choices,
// key decisions. Lives at the project root (same level as .memory.md).
// The main agent reads it at the start of every turn on an existing project
// and updates it after significant structural changes — creating it on first
// encounter if absent.
import path from "node:path";
import fs from "node:fs";

export const ARCHITECTURE_FILE_NAME = ".architecture.md";
const ARCHITECTURE_MAX_CHARS = 5000;

function loadCapped(file: string, maxChars: number): string {
  try {
    const text = fs.readFileSync(file, "utf8").trim();
    return text.length > maxChars
      ? `${text.slice(0, maxChars)}\n[... tronqué à ${maxChars} caractères — condense le fichier]`
      : text;
  } catch {
    return "";
  }
}

export function loadArchitecture(dir: string): string {
  return loadCapped(path.join(dir, ARCHITECTURE_FILE_NAME), ARCHITECTURE_MAX_CHARS);
}

export const ARCHITECTURE_RULES = `
Project architecture map (${ARCHITECTURE_FILE_NAME}):
- This file is your living map of the project's technical structure. Read it at the START of every turn on an EXISTING project (when the file already exists) BEFORE touching any code — it tells you what's there and why.
- Update it (Write or Edit it directly) after any significant structural change: new component or page created, new API endpoint, new data model, new library added, major refactor. Keep entries concise (name + purpose + key detail). Target < 3000 chars — curated, not exhaustive.
- Sections to use: ## Stack, ## Composants, ## Pages, ## API, ## Données, ## Décisions clés.
- Create it when you first understand the full structure of a project (typically after the first substantial feature is built), NOT on trivial one-liner tweaks.`;

// ── CHANTIER 4 (2026-09-29) — la règle structurelle que le juge APPLIQUE ────
// Mesure sur 15 rejets MangoQA : la branche `architecture` pèse 9/15 (60 %), et
// 6 de ces 9 sont « Séparation des responsabilités ». Projets visés : nova-wing
// (`src/game/assets.js` monolithe), mango-quest (canvas monolithique),
// abyss/robot-lab (`monolithic-app-component`), voyage-improviser (data-fetching
// + état + présentation dans le même composant).
//
// L'auditeur MangoQA (branches/architecture.ts) juge sur des critères PRÉCIS :
// fichier monolithe > ~300 lignes, logique mêlée au rendu, composant qui mélange
// data-fetching + état + présentation, duplication, code mort. Le générateur,
// lui, n'en disait pas un mot : le prompt `architecture` ne parlait QUE de tenir
// la carte ARCHITECTURE.md. Une règle absente côté générateur = un rejet
// STRUCTUREL côté auditeur, à chaque tour. Corrigé ici, dans le bloc injecté par
// toutes les phases (elite / mvp / finition), pas seulement en mode `projet`.
export const MODULARITY_RULES = `
Séparation des responsabilités — RÈGLE STRUCTURELLE (contrôlée à l'audit, un
manquement est bloquant ; elle vaut pour les jeux comme pour les apps) :
- UN FICHIER = UNE RESPONSABILITÉ. Plafond dur : aucun fichier de code au-delà de
  ~300 lignes. Si un fichier approche ce seuil, DÉCOUPE-le en modules avant de
  continuer — un « assets.js » qui fabrique toutes les textures du jeu, un
  « canvas » qui dessine et met à jour, un « App » qui contient l'app entière sont
  des rejets d'audit ANNONCÉS.
- NE MÉLANGE JAMAIS data-fetching + état + présentation dans le même composant.
  Un composant qui appelle l'API ET garde l'état ET rend le JSX doit être scindé :
  la récupération/le calcul dans un module ou un hook dédié, la présentation dans
  un composant séparé.
- Zéro duplication : une constante, un composant, une icône ou un helper partagé
  est défini UNE fois puis importé. Pas de constantes recopiées, pas de code mort
  ni d'import inutilisé.
- Jeu 2D : \`src/game/\` est découpé par responsabilité (loop, entities, input,
  render) et les ASSETS aussi (\`assets/player.js\`, \`assets/enemies.js\`,
  \`assets/fx.js\`… avec une fonction d'orchestration \`buildTextures\` qui les
  appelle) — un unique fichier d'assets est le rejet le plus fréquent sur les
  jeux. Le composant canvas monte la boucle, il ne l'implémente pas.
- Découper tôt coûte moins cher que découper après : la structure se pose au
  PREMIER tour, quand les fichiers sont encore courts.`;

/** System-prompt section injecting the architecture map ("" if not yet created). */
export function architecturePromptSection(dir: string): string {
  const content = loadArchitecture(dir);
  if (!content) return "";
  return `\n\nProject architecture map (${ARCHITECTURE_FILE_NAME}) — read this before editing any existing code:\n${content}`;
}
