// Specs du run nocturne « commande de Raf » (2026-06-30) — 4 projets ambitieux.
// Calqué sur tonight-specs.ts mais sur-mesure : 2 gros sites à fonctions, 1 app de
// formation TOEIC ludique, 1 refonte du RPG mango-quest existant.
//
// CONTRAINTES DURES de la nuit (anti-L61 = ne PAS planter le PC) :
//   • ZÉRO génération d'image Flux/GPU lourd — les vraies images viennent de Pexels
//     (outil chercher_image, $0, aucune charge GPU). genere_image est INTERDIT.
//   • « Effet wahou » : briefs ambitieux, animations codées (framer-motion/GSAP/CSS),
//     micro-interactions, vraies photos, contenu riche. Du NEUF, pas du déjà-vu.
//
// Le contrat de marque Mango est appliqué à ~50 % sur les sites (accents/chaleur),
// laissant chaque sujet imposer sa propre direction.

export interface MangoNuitSpec {
  name: string;
  effort: "M" | "L" | "XL";
  template: string; // ignoré si le projet existe déjà (refonte)
  existing?: boolean; // true = on AMÉLIORE l'existant (mango-quest), pas de scaffold
  port: number;
  leaders: string[]; // sites de référence pour le Sharingan (moodboard $0)
  task: string; // prompt complet donné à l'Élève GLM
}

/** Charte Mango appliquée à ~50 % (accents chaleureux), le sujet garde sa direction. */
const MANGO_HALF =
  `\n\n## IDENTITÉ — 50 % Mango, 50 % le sujet\n` +
  `Garde une touche de chaleur Mango dans les ACCENTS (CTA, survols, détails) : ` +
  `--mango #F2A33C, --coral #E8624A, coins arrondis généreux, ombres douces, micro-interactions soignées. ` +
  `MAIS laisse le SUJET imposer sa palette de fond, son ambiance et sa typo. ` +
  `Le résultat doit se sentir « habité par le sujet », pas « énième template mango ».`;

/** Règles communes : vraies images Pexels, zéro Flux, autonomie, build vert, QA. */
const COMMON =
  `\n\n## RÈGLES DE PRODUCTION (non négociables)\n` +
  `1. VRAIES IMAGES : utilise l'outil chercher_image (Pexels) pour CHAQUE visuel réel ` +
  `(héros, galeries, vignettes). Décris des requêtes précises en anglais. ` +
  `INTERDIT : genere_image / Flux / placeholders gris. Les micro-logos/icônes peuvent être en SVG/inline.\n` +
  `2. CONTEXTE D'ABORD : commence par cerner l'identité du sujet (chercher_web si utile), ` +
  `puis conçois autour de cette identité réelle.\n` +
  `3. PLANIFIE d'abord (outil planifier), puis exécute étape par étape.\n` +
  `4. EFFET WAHOU : animations à l'entrée (reveal au scroll), transitions fluides, ` +
  `états de survol riches, un hero mémorable. Mais la lisibilité et la performance priment.\n` +
  `5. FONCTIONNEL : chaque fonction listée doit MARCHER (clics, filtres, persistance localStorage, validation). ` +
  `Vérifie avec teste_parcours quand c'est pertinent.\n` +
  `6. Le BUILD doit passer (tsc + vite build verts). Architecture propre (composants < 200 lignes, hooks séparés). Responsive mobile→desktop.\n` +
  `\nSession AUTONOME : prends toutes les décisions toi-même. Ne demande rien, livre.`;

export const MANGO_NUIT: MangoNuitSpec[] = [
  // ── 1. ABYSS — gros site immersif à fonctions ────────────────────────────────
  {
    name: "abyss",
    effort: "XL",
    template: "shadcn",
    port: 5221,
    leaders: ["https://www.apple.com/airpods-pro/", "https://www.noaa.gov"],
    task:
      "Crée **ABYSS**, un site immersif et complet sur l'exploration des GRANDS FONDS MARINS (React + shadcn/Tailwind v4). " +
      "CONCEPT FORT, jamais vu : le SCROLL est une DESCENTE — un indicateur de profondeur (mètres) défile, et le fond " +
      "passe progressivement du bleu de surface au noir abyssal au fil du scroll, avec des particules/bioluminescence qui " +
      "s'allument dans l'obscurité. Ambiance : bleu nuit profond, noir, touches bioluminescentes cyan/vert/corail. " +
      "PAGES & SECTIONS : (1) Hero plein écran « plonge » (vraie photo océan profond, CTA « Commencer la descente ») ; " +
      "(2) un parcours par ZONES de profondeur (épipélagique→mésopélagique→bathyale→abyssale→hadale) qui se révèlent au scroll, " +
      "chacune avec sa vraie photo, sa température, sa pression, sa luminosité ; " +
      "(3) un CATALOGUE de créatures abyssales (≥12, données réalistes : nom, zone, profondeur, taille, bioluminescence) " +
      "avec FILTRES fonctionnels (par zone, par bioluminescence oui/non) + recherche texte + tri par profondeur ; " +
      "(4) FICHE créature détaillée (modale ou page) avec photo, description, faits ; " +
      "(5) « CARNET DE PLONGÉE » : l'utilisateur ajoute des créatures à ses favoris, PERSISTÉ en localStorage, " +
      "avec une page dédiée qui les liste ; " +
      "(6) un QUIZ ludique de 5 questions sur les abysses avec score final. " +
      "FONCTIONS qui doivent marcher : filtres+recherche+tri du catalogue, favoris localStorage, quiz scoré, " +
      "indicateur de profondeur synchronisé au scroll. Vraies photos Pexels partout (deep sea, jellyfish, ocean, bioluminescence, anglerfish…)." +
      MANGO_HALF +
      COMMON,
  },

  // ── 2. FORGE — gros site + configurateur interactif ──────────────────────────
  {
    name: "forge",
    effort: "XL",
    template: "shadcn",
    port: 5222,
    leaders: ["https://www.keychron.com", "https://linear.app"],
    task:
      "Crée **FORGE**, le site complet d'un atelier (fictif premium) de CLAVIERS MÉCANIQUES sur-mesure (React + shadcn/Tailwind v4). " +
      "PIÈCE MAÎTRESSE, effet wahou : un CONFIGURATEUR interactif et FONCTIONNEL où l'utilisateur compose son clavier — " +
      "(a) choix du FORMAT (60% / 65% / 75% / TKL) ; (b) choix des SWITCHES (linéaire/tactile/clicky, 3-4 options avec " +
      "caractéristiques : force, son, couleur) ; (c) choix des KEYCAPS (3-4 jeux de couleurs) ; (d) options (RGB on/off, " +
      "repose-poignet) — avec un APERÇU VISUEL du clavier qui se met à jour en direct (rendu CSS/SVG des touches selon le format " +
      "et la couleur des keycaps choisie) et un PRIX total recalculé en temps réel. " +
      "AUTRES SECTIONS : (1) Hero atelier (vraie photo clavier mécanique premium, CTA « Forge le tien ») ; " +
      "(2) galerie de claviers signature (vraies photos, filtrable par style) ; " +
      "(3) page « anatomie d'une touche » pédagogique animée ; (4) panier : ajoute la config au panier (localStorage), " +
      "récap avec total, quantités modifiables, suppression. " +
      "FONCTIONS qui doivent marcher : configurateur live (aperçu + prix), filtres galerie, panier localStorage complet. " +
      "Ambiance : sombre/industriel chic, métal, accents chauds Mango sur les CTA. Vraies photos Pexels (mechanical keyboard, keycaps, desk setup…)." +
      MANGO_HALF +
      COMMON,
  },

  // ── 3. TOEIC-QUEST — app de formation ludique ────────────────────────────────
  {
    name: "toeic-quest",
    effort: "XL",
    template: "shadcn",
    port: 5223,
    leaders: ["https://www.duolingo.com"],
    task:
      "Crée **TOEIC QUEST**, une app de formation au TOEIC INTERACTIVE et LUDIQUE (gamifiée), façon Duolingo mais pour le TOEIC " +
      "(React + shadcn/Tailwind v4, tout en localStorage, aucun backend). " +
      "OBJECTIF : rendre la prép au TOEIC addictive et fun. " +
      "MODES D'ENTRAÎNEMENT (au moins 3, chacun avec de VRAIS exercices jouables) : " +
      "(1) LISTENING — questions de compréhension (transcript affiché + audio via SpeechSynthesis du navigateur pour lire le texte), QCM ; " +
      "(2) READING — textes courts type business + questions QCM ; " +
      "(3) VOCABULARY/GRAMMAR — compléter la phrase, choisir le bon mot, paires. " +
      "Banque d'au moins 30 questions réparties, avec correction immédiate expliquée. " +
      "GAMIFICATION (le cœur ludique, doit marcher) : barre d'XP + NIVEAUX, STREAK quotidien, BADGES débloquables, " +
      "score TOEIC ESTIMÉ sur 990 qui évolue, TIMER optionnel par session (conditions réelles), " +
      "écran de fin de session avec récap animé (bonnes/mauvaises, XP gagné, célébration). " +
      "Une MASCOTTE (un petit personnage mangue, dessiné en SVG/emoji stylisé) qui réagit (encourage, félicite). " +
      "PROGRESSION PERSISTÉE en localStorage (XP, niveau, streak, badges, historique des sessions, stats par compétence). " +
      "Un tableau de bord d'accueil : niveau actuel, score estimé, streak, prochaine leçon recommandée. " +
      "Vraies photos Pexels pour le contexte (business meeting, office, airport, people working…) en illustration des leçons/écrans." +
      MANGO_HALF +
      COMMON,
  },

  // ── 4. MANGO-QUEST — refonte du RPG canvas existant ──────────────────────────
  {
    name: "mango-quest",
    effort: "XL",
    template: "shadcn", // ignoré : projet existant
    existing: true,
    port: 5224,
    leaders: [],
    task:
      "REFONTE et ENRICHISSEMENT du jeu existant **MANGO QUEST** (RPG top-down en canvas 2D natif, React + TypeScript, " +
      "moteur maison dans src/game/ : loop, entities, systems, world, render, screens — NE PAS casser l'architecture testée, " +
      "respecte les modules et leurs tests, garde `npm run build` et le runner de tests `node src/game/test/run.js` VERTS). " +
      "But : passer d'un proto jouable à un VRAI petit RPG qui donne envie d'y rejouer. Ajoute (en gardant tout testé) : " +
      "(1) un SYSTÈME DE SORTS/COMPÉTENCES (au moins 3 : soin, boule de feu, bouclier) consommant de la mana, avec cooldowns ; " +
      "(2) des PNJ avec DIALOGUES (boîte de dialogue, choix simples) et au moins 2 QUÊTES (objectif, suivi, récompense XP/objet) ; " +
      "(3) une NOUVELLE ZONE explorable (3 zones au total : village, forêt, donjon) avec transitions ; " +
      "(4) un SYSTÈME DE SAUVEGARDE (localStorage : position, niveau, inventaire, quêtes, progression) + écran charger/nouvelle partie ; " +
      "(5) un HUD enrichi (barres HP/MP/XP, mini-carte, slots de sorts, or) ; " +
      "(6) plus de JUICE (écran de transition, feedback de sorts, sons via WebAudio simples, particules, screen shake déjà présent à étendre) ; " +
      "(7) un écran de MENU principal soigné et un écran d'INVENTAIRE/équipement. " +
      "Chaque ajout = code modulaire + tests dans src/game/test/. Garde le style canvas 2D natif (zéro nouvelle dépendance lourde). " +
      "Vérifie le build ET les tests à la fin. Jouable sur le port de preview." +
      COMMON,
  },
];
