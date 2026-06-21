// Source UNIQUE des specs du run nocturne (#145 run d'entraînement).
//
// Les 3 scripts du cycle d'apprentissage importent cette liste au lieu de leurs
// constantes en dur :
//   • run-tonight.ts  → TONIGHT      (Gemma génère + escalade Claude)
//   • run-finish.ts   → FINISH_SPECS (Claude finit chaque app)
//   • run-learn.ts    → LEARN_TASKS  (Gemma distille une procédure du diff)
//
// Brand cohérente : MANGO_PALETTE_CONTRACT est concaténé à chaque prompt Gemma.
// Dry-run : TONIGHT_LIMIT=2 (env) tronque la liste aux N premières apps.

/** Une app du run : prompt Gemma complet + features (pour Claude) + tâche courte (learn). */
export interface Spec {
  name: string;
  effort: string;
  template: string;
  task: string;       // prompt complet donné à Gemma (run-tonight)
  features: string;   // résumé des features à RÉELLEMENT implémenter (run-finish)
  learnTask: string;  // tâche d'origine condensée (run-learn)
  leaders: string[];
  port: number;
}

/** Contrat de marque Mango — injecté dans chaque prompt Gemma. */
export const MANGO_PALETTE_CONTRACT =
  `\n\n## CHARTE MANGO (contrat de marque — applique-la)\n` +
  `Couleurs, à définir en variables CSS sur :root :\n` +
  `  --mango: #F2A33C (accent principal) · --charcoal: #1E1B16 (texte/fond sombre) ·\n` +
  `  --cream: #FBF3E4 (fond clair) · --teal: #2BB3A3 (succès/secondaire) · --coral: #E8624A (alerte/CTA).\n` +
  `Typo : titres en Poppins ou Sora, corps en Inter (Google Fonts si absentes). ` +
  `Coins arrondis généreux, ombres douces. Identité chaleureuse, soignée, COHÉRENTE sur toute l'app — jamais agressive.`;

const AUTONOMY =
  `\n\nIMPORTANT : session autonome. Prends toutes les décisions toi-même. ` +
  `La FONCTION prime : chaque feature listée doit MARCHER (clics, états, persistance, validation). Le build doit passer.`;

// ── Les 12 apps ────────────────────────────────────────────────────────────────
const ALL: Spec[] = [
  {
    name: "mango-todo", effort: "M", template: "shadcn", port: 5201,
    leaders: ["https://todoist.com"],
    features:
      "Liste de tâches persistée en localStorage : ajouter, cocher/décocher, éditer en double-clic, supprimer ; " +
      "filtres toutes/actives/faites ; compteur de restantes ; tout survit au refresh.",
    learnTask: "App todo en React + localStorage : ajout, coche, édition, suppression, filtres, compteur.",
    task:
      "Crée une app de liste de tâches (todo) complète et 100% FONCTIONNELLE en React + shadcn/Tailwind v4, " +
      "PERSISTÉE en localStorage (aucun backend) : (1) ajouter une tâche ; (2) la cocher/décocher ; " +
      "(3) l'éditer (double-clic → champ) ; (4) la supprimer ; (5) filtres toutes/actives/faites ; " +
      "(6) compteur de tâches restantes ; (7) bouton « effacer les terminées ». Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-dashboard", effort: "L", template: "mantine", port: 5202,
    leaders: ["https://linear.app"],
    features:
      "Dashboard analytics : sidebar de nav, toggle dark/light FONCTIONNEL, 4 cartes KPI chiffrées, " +
      "graphique courbe 30 jours + barres par catégorie (recharts, données factices), " +
      "table FONCTIONNELLE (tri colonne, recherche, pagination), états loading (skeletons) et empty.",
    learnTask: "Dashboard analytics : sidebar, dark mode, 4 KPI, graphes recharts, table triable/recherche/pagination.",
    task:
      "Crée un dashboard analytics complet et 100% FONCTIONNEL en React + Mantine v7 : barre latérale de navigation ; " +
      "toggle dark/light mode FONCTIONNEL ; page Vue d'ensemble avec 4 cartes KPI chiffrées ; un graphique en courbe sur " +
      "30 jours et un graphique en barres par catégorie (recharts, données factices réalistes) ; une table de données " +
      "FONCTIONNELLE : tri par colonne au clic, recherche texte, pagination. États loading (skeletons) et empty. " +
      "Architecture propre (composants < 200 lignes, hooks séparés).",
  },
  {
    name: "mango-kanban", effort: "L", template: "shadcn", port: 5203,
    leaders: ["https://trello.com"],
    features:
      "Tableau kanban persisté en localStorage : 3 colonnes (à faire/en cours/fait), ajouter/éditer/supprimer une carte, " +
      "déplacer une carte entre colonnes (drag & drop HTML5 natif OU boutons ←/→), compteur par colonne ; survit au refresh.",
    learnTask: "Kanban en React + localStorage : colonnes, CRUD cartes, déplacement entre colonnes, persistance.",
    task:
      "Crée un tableau kanban personnel complet et 100% FONCTIONNEL en React + shadcn/Tailwind v4, PERSISTÉ en localStorage : " +
      "(1) 3 colonnes À faire / En cours / Fait ; (2) ajouter une carte (titre + description) ; (3) éditer et supprimer une carte ; " +
      "(4) déplacer une carte d'une colonne à l'autre — drag & drop HTML5 natif, avec en repli des boutons ←/→ ; " +
      "(5) compteur de cartes par colonne. Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-notes", effort: "L", template: "radix", port: 5204,
    leaders: ["https://notion.so"],
    features:
      "App de notes persistée en localStorage : créer/renommer/supprimer une note, éditeur texte (markdown simple rendu en live), " +
      "recherche plein-texte, liste latérale triée par date de modif ; survit au refresh.",
    learnTask: "App de notes en React + localStorage : CRUD notes, éditeur markdown, recherche, tri par date.",
    task:
      "Crée une app de prise de notes complète et 100% FONCTIONNELLE en React + Radix UI, PERSISTÉE en localStorage : " +
      "(1) liste latérale des notes triées par date de modification ; (2) créer / renommer / supprimer une note ; " +
      "(3) éditeur de texte avec rendu markdown simple en live (titres, gras, listes, liens) ; " +
      "(4) recherche plein-texte qui filtre la liste ; (5) sauvegarde automatique. Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-timer", effort: "M", template: "daisy", port: 5205,
    leaders: ["https://pomofocus.io"],
    features:
      "Minuteur Pomodoro FONCTIONNEL : cycles travail 25 min / pause 5 min, démarrer/pause/reset, basculement auto travail↔pause, " +
      "compteur de pomodoros terminés (persisté localStorage), réglages des durées, anneau de progression animé.",
    learnTask: "Minuteur Pomodoro en React : cycles travail/pause, contrôles, compteur persistant, réglages.",
    task:
      "Crée un minuteur Pomodoro complet et 100% FONCTIONNEL en React + DaisyUI/Tailwind v4 : " +
      "(1) cycle travail 25 min puis pause 5 min, avec bascule automatique entre les deux ; (2) boutons Démarrer / Pause / Reset ; " +
      "(3) anneau de progression animé (SVG ou conic-gradient) ; (4) compteur de pomodoros terminés aujourd'hui, persisté en localStorage ; " +
      "(5) panneau de réglages pour changer les durées travail/pause ; (6) son ou notification visuelle à la fin d'un cycle. Responsive.",
  },
  {
    name: "mango-budget", effort: "L", template: "mantine", port: 5206,
    leaders: ["https://stripe.com"],
    features:
      "Suivi de budget persisté en localStorage : ajouter une transaction (montant, catégorie, type revenu/dépense, date), " +
      "liste filtrable, solde courant + total revenus/dépenses, répartition par catégorie (graphe recharts) ; survit au refresh.",
    learnTask: "Suivi de budget en React + localStorage : CRUD transactions, solde, totaux, graphe par catégorie.",
    task:
      "Crée une app de suivi de budget personnel complète et 100% FONCTIONNELLE en React + Mantine v7, PERSISTÉE en localStorage : " +
      "(1) ajouter une transaction (montant, libellé, catégorie, type revenu/dépense, date) ; (2) liste des transactions, " +
      "filtrable par type et catégorie, supprimable ; (3) cartes de synthèse : solde courant, total revenus, total dépenses ; " +
      "(4) graphique de répartition des dépenses par catégorie (recharts, camembert ou barres). Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-recettes", effort: "M", template: "daisy", port: 5207,
    leaders: ["https://www.hellofresh.fr"],
    features:
      "Carnet de recettes persisté en localStorage : ajouter une recette (titre, ingrédients, étapes, temps, photo URL), " +
      "grille de cartes, vue détail, recherche par titre/ingrédient, favoris ; survit au refresh.",
    learnTask: "Carnet de recettes en React + localStorage : CRUD recettes, grille, détail, recherche, favoris.",
    task:
      "Crée un carnet de recettes complet et 100% FONCTIONNEL en React + DaisyUI/Tailwind v4, PERSISTÉ en localStorage : " +
      "(1) ajouter une recette (titre, temps de préparation, liste d'ingrédients, étapes, URL d'image) ; (2) grille de cartes de recettes ; " +
      "(3) vue détail au clic ; (4) éditer / supprimer ; (5) marquer en favori (étoile) et filtrer les favoris ; " +
      "(6) recherche par titre ou ingrédient. Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-habits", effort: "L", template: "shadcn", port: 5208,
    leaders: ["https://linear.app"],
    features:
      "Suivi d'habitudes persisté en localStorage : créer/supprimer une habitude, grille de cases à cocher par jour (7 derniers jours), " +
      "streak de jours consécutifs par habitude, taux de complétion ; survit au refresh.",
    learnTask: "Habit tracker en React + localStorage : CRUD habitudes, grille jour par jour, streak, taux.",
    task:
      "Crée une app de suivi d'habitudes complète et 100% FONCTIONNELLE en React + shadcn/Tailwind v4, PERSISTÉE en localStorage : " +
      "(1) créer et supprimer une habitude (nom, couleur) ; (2) pour chaque habitude, une rangée de cases (les 7 derniers jours) " +
      "qu'on coche/décoche au clic ; (3) calcul du streak (jours consécutifs cochés) par habitude ; (4) taux de complétion " +
      "hebdomadaire affiché ; (5) date du jour mise en évidence. Tout survit au refresh. Responsive.",
  },
  {
    name: "mango-meteo", effort: "M", template: "daisy", port: 5209,
    leaders: ["https://weather.com"],
    features:
      "App météo avec DONNÉES FACTICES (aucune API, aucune clé) : recherche de ville (parmi une liste mockée), " +
      "carte météo actuelle (température, conditions, icône), prévision 5 jours, bascule °C/°F FONCTIONNELLE, villes favorites localStorage.",
    learnTask: "App météo en React avec données mockées : recherche ville, météo actuelle, prévision 5j, °C/°F, favoris.",
    task:
      "Crée une app météo complète et 100% FONCTIONNELLE en React + DaisyUI/Tailwind v4, avec des DONNÉES FACTICES intégrées " +
      "(AUCUNE API externe, AUCUNE clé) : (1) un jeu de données mockées pour ~8 villes (température, conditions, humidité, vent, " +
      "prévision 5 jours) ; (2) recherche/sélection de ville ; (3) carte météo actuelle avec icône de condition ; (4) prévision sur 5 jours ; " +
      "(5) bascule °C/°F FONCTIONNELLE qui convertit l'affichage ; (6) villes favorites persistées en localStorage. Responsive.",
  },
  {
    name: "mango-quiz", effort: "L", template: "shadcn", port: 5210,
    leaders: ["https://www.duolingo.com"],
    features:
      "Quiz interactif (questions intégrées) : démarrage, une question à la fois (QCM), feedback bon/mauvais, score, barre de progression, " +
      "écran de résultat final, rejouer ; meilleur score persisté en localStorage.",
    learnTask: "Quiz QCM en React : questions intégrées, feedback, score, progression, résultat, meilleur score localStorage.",
    task:
      "Crée une app de quiz interactive complète et 100% FONCTIONNELLE en React + shadcn/Tailwind v4 (questions intégrées dans le code) : " +
      "(1) écran d'accueil avec bouton Démarrer ; (2) une question QCM à la fois (~8 questions) avec 4 réponses ; (3) feedback immédiat " +
      "bon/mauvais au clic (couleur teal/coral) ; (4) barre de progression ; (5) score cumulé ; (6) écran de résultat final avec score et " +
      "bouton Rejouer ; (7) meilleur score persisté en localStorage. Responsive.",
  },
  {
    name: "mango-galerie", effort: "M", template: "panda", port: 5211,
    leaders: ["https://unsplash.com"],
    features:
      "Galerie d'images en mosaïque (masonry) avec données mockées (URLs picsum/placeholder) : grille responsive, filtres par catégorie, " +
      "lightbox au clic (image agrandie, navigation préc/suiv, fermeture Échap), favoris localStorage.",
    learnTask: "Galerie masonry en React : grille responsive, filtres catégorie, lightbox navigable, favoris localStorage.",
    task:
      "Crée une galerie d'images complète et 100% FONCTIONNELLE en React + Panda CSS, avec des images mockées " +
      "(URLs de type https://picsum.photos) : (1) grille en mosaïque (masonry) responsive ; (2) filtres par catégorie (boutons) ; " +
      "(3) lightbox au clic : image agrandie en overlay, navigation précédent/suivant, fermeture au clic extérieur ou touche Échap ; " +
      "(4) bouton favori par image, favoris persistés en localStorage et filtrables. Responsive.",
  },
  {
    name: "mango-calc", effort: "M", template: "daisy", port: 5212,
    leaders: ["https://www.desmos.com/scientific"],
    features:
      "Calculatrice FONCTIONNELLE : opérations +−×÷, décimales, pourcentage, +/−, effacer (C/AC), clavier physique branché, " +
      "historique des calculs persisté en localStorage, gestion des erreurs (division par zéro).",
    learnTask: "Calculatrice en React : opérations, clavier physique, historique persistant, gestion d'erreurs.",
    task:
      "Crée une calculatrice complète et 100% FONCTIONNELLE en React + DaisyUI/Tailwind v4 : (1) opérations + − × ÷ avec priorité simple, " +
      "décimales, pourcentage, inversion de signe +/− ; (2) boutons C (effacer l'entrée) et AC (tout effacer) ; (3) support du clavier " +
      "physique (chiffres, opérateurs, Entrée, Échap, Retour arrière) ; (4) historique des calculs persisté en localStorage, effaçable ; " +
      "(5) gestion des erreurs (division par zéro → message clair). Affichage soigné, grands boutons. Responsive.",
  },
];

// Dry-run : TONIGHT_LIMIT=N tronque aux N premières apps (validation avant la nuit).
const LIMIT = Number(process.env.TONIGHT_LIMIT ?? 0);
const SELECTED: Spec[] = LIMIT > 0 ? ALL.slice(0, LIMIT) : ALL;

/** La liste des apps, chaque task augmentée du contrat de marque + consigne d'autonomie. */
export const TONIGHT: Spec[] = SELECTED.map((s) => ({
  ...s,
  task: s.task + MANGO_PALETTE_CONTRACT + AUTONOMY,
}));

/** Dérivé pour run-finish.ts : name → résumé des features à implémenter. */
export const FINISH_SPECS: Record<string, string> = Object.fromEntries(
  SELECTED.map((s) => [s.name, s.features]),
);

/** Dérivé pour run-learn.ts : name → tâche d'origine condensée. */
export const LEARN_TASKS: Record<string, string> = Object.fromEntries(
  SELECTED.map((s) => [s.name, s.learnTask]),
);
