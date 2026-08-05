// Moteur de diversité des sujets — extrait de `train-loop.ts` le 2026-08-05 (refonte v3,
// lot 1). `train-loop` était classé ⚪ ARCHIVE au § H du registre, mais `nocturnal.ts` —
// GARDÉ au même paragraphe — en importait `generateUniquePrompts`. Archiver le module
// aurait cassé le lot nocturne. Le générateur rejoint donc le sous-système qui s'en sert,
// conformément à la règle anti-rechute : une capacité rejoint une structure existante.
//
// Rien n'a été réécrit : le code est repris À L'IDENTIQUE de train-loop.ts (lignes 63-167).
// Le reste de train-loop (boucle d'entraînement, CLI, circuit breaker Ollama) est archivé.
import { inferProjectType } from "./blueprints.js";

// ── Moteur de diversité : fond (domaine) × forme/UX (style) × type ───────────
export const DOMAINS = [
  "un restaurant italien", "un coach de fitness", "un cabinet d'avocats d'affaires",
  "une startup SaaS d'analytics", "un studio de jeux vidéo indé", "une boulangerie artisanale",
  "une agence immobilière", "un podcast tech", "une ONG environnementale", "une équipe e-sport",
  "une clinique vétérinaire", "un photographe de mariage", "un paysagiste", "une marque de café de spécialité",
  "une école de musique", "un food truck de tacos", "une salle d'escalade", "un cabinet d'architectes",
  "une marque de cosmétiques bio", "un festival de musique", "une plateforme de cours en ligne",
  "un fleuriste haut de gamme", "un constructeur de tiny houses", "une brasserie artisanale",
  "un institut de yoga", "une agence de voyage d'aventure", "un disquaire vinyle", "une marque de vélos électriques",
  "un traiteur événementiel", "une boutique de jeux de société",
];

export const STYLES = [
  "minimaliste, beaucoup de blanc, une seule couleur d'accent",
  "sombre néon, dégradés violet/cyan, glassmorphism",
  "éditorial, typographie sérif, mise en page deux colonnes",
  "brutaliste, bordures épaisses, contrastes francs, monospace",
  "pastel ludique, formes arrondies, illustrations douces",
  "corporate sobre, bleu nuit, dense en informations",
  "rétro années 80, couleurs saturées, grille synthwave",
  "swiss/international, grille stricte, Helvetica-like",
  "luxe, noir et or, espaces généreux, sérif fin",
  "nature, tons terre et vert, texture organique",
  "terminal/hacker, fond noir, texte vert phosphore",
  "magazine vibrant, gros titres, photos plein cadre",
  "néo-rétro papier, beige, ombres douces, tampons",
  "tech épuré façon Linear, gris fins, micro-animations",
  "enfantin coloré, gros boutons, emojis, arrondis",
  "monochrome contrasté, noir/blanc, accent rouge unique",
  "aquarelle, dégradés doux, sérif manuscrite",
  "industriel, métal, jaune sécurité, stencils",
  "scandinave, bois clair, beige, minimal chaleureux",
  "cyberpunk, glitch, rose magenta, scanlines",
  "art déco, motifs géométriques dorés, symétrie",
  "flat coloré façon dashboard, cartes nettes, ombres légères",
  "néomorphisme, reliefs doux, monochrome pastel",
  "presse quotidienne, colonnes serrées, sérif, filets",
];

export type TaskKind = "webapp" | "slides" | "cv" | "doc" | "devis" | "dashboard" | "multipage" | "wizard";
export const TASK_KINDS: TaskKind[] = ["webapp", "slides", "cv", "doc", "devis", "dashboard", "multipage", "wizard"];

// Construit la requête envoyée à l'Élève — pure (testable). Le domaine porte le
// FOND, le style porte la FORME et l'UX → chaque combinaison est unique.
// Les kinds dashboard/multipage/wizard sont plus difficiles (multi-composants,
// état complexe, routing) pour stresser l'Élève et déclencher davantage d'escalades.
export function composeTask(kind: TaskKind, domain: string, style: string): string {
  // style vide ("") = lot "free style" : pas de DA imposée → l'agent conçoit
  // lui-même la charte (sert à juger l'apport réel du moodboard Sharingan).
  const ux = style
    ? `Direction artistique/UX imposée : ${style}.`
    : `Aucune direction artistique imposée : conçois TOI-MÊME une identité visuelle soignée et distinctive — sers-toi du moodboard pour ancrer une vraie charte graphique (couleurs, typographie, ambiance) sur des leaders réels du domaine.`;
  switch (kind) {
    case "webapp":
      return `Crée une petite web app React pour ${domain} (1 fonctionnalité claire et utile, données factices). ${ux}`;
    case "slides":
      return `Crée une présentation de slides (deck 16:9, navigation clavier) qui pitche ${domain} en 5 diapos. ${ux}`;
    case "cv":
      return `Crée un CV web d'une page pour une personne travaillant chez ${domain} (profil, expériences, compétences factices). ${ux}`;
    case "doc":
      return `Crée un document web imprimable (type PDF, format A4) — une plaquette de présentation de ${domain}. ${ux}`;
    case "devis":
      return `Crée un générateur de devis (tableau type Excel, lignes + total qui se calcule) pour ${domain}. ${ux}`;
    case "dashboard":
      return `Crée un dashboard analytics complet pour ${domain} : barre latérale de navigation, au moins 3 sections (vue d'ensemble avec KPIs chiffrés, graphiques en barres et en courbes avec données factices, tableau de données filtrable), états loading et empty gérés. ${ux} Utilise Tailwind v4.`;
    case "multipage":
      return `Crée une application React MULTI-PAGES pour ${domain} avec react-router-dom (installe si absent) : page Accueil (hero + features), page À propos (équipe + valeurs), page Contact (formulaire avec validation), page 404. Navigation responsive en header. ${ux} Utilise Tailwind v4.`;
    case "wizard":
      return `Crée un formulaire multi-étapes (wizard 4 étapes avec barre de progression) pour ${domain} : étape 1 infos de base, étape 2 détails, étape 3 options/préférences, étape 4 récapitulatif + confirmation. Validation à chaque étape, boutons Précédent/Suivant, état global partagé entre étapes. ${ux} Utilise Tailwind v4.`;
  }
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export interface GenPrompt {
  kind: TaskKind;
  domain: string;
  style: string;
  task: string;
  projectType: string;
}

/** Tire des combinaisons UNIQUES (kind×domain×style). Cap = nb de combos.
 * opts.freeStyle = aucune DA imposée (style "") → unicité sur kind×domain. */
export function generateUniquePrompts(n: number, opts: { freeStyle?: boolean } = {}): GenPrompt[] {
  const seen = new Set<string>();
  const out: GenPrompt[] = [];
  const styleCount = opts.freeStyle ? 1 : STYLES.length;
  const maxCombos = TASK_KINDS.length * DOMAINS.length * styleCount;
  const target = Math.min(n, maxCombos);
  let guard = 0;
  while (out.length < target && guard < maxCombos * 20) {
    guard++;
    const kind = pick(TASK_KINDS);
    const domain = pick(DOMAINS);
    const style = opts.freeStyle ? "" : pick(STYLES);
    const key = `${kind}|${domain}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const task = composeTask(kind, domain, style);
    out.push({ kind, domain, style, task, projectType: inferProjectType(task) });
  }
  return out;
}
