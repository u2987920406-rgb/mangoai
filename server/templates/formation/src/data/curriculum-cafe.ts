// Starter `formation` (#181 É2) — banque D'EXEMPLE ("les bases du café") pour
// PROUVER que le starter fonctionne bout-en-bout. Sujet volontairement simple
// et neutre (aucune vérité formelle en jeu) ; la Fabrique (É3) remplacera ce
// fichier par un curriculum/banque générés pour le VRAI sujet demandé.
import type { Curriculum, Item } from "../lib/engine";

export const curriculum: Curriculum = {
  sujet: "Les bases du café",
  langue: "fr",
  niveau: "débutant",
  modules: [
    {
      id: "origines",
      titre: "Origines et grains",
      skillIds: ["cafe.origines"],
      prerequis: [],
      typesAttendus: ["lecon", "qcm"],
    },
    {
      id: "torrefaction",
      titre: "Torréfaction",
      skillIds: ["cafe.torrefaction"],
      prerequis: ["origines"],
      typesAttendus: ["lecon", "flashcard", "texte-a-trous"],
    },
    {
      id: "extraction",
      titre: "Méthodes d'extraction",
      skillIds: ["cafe.extraction"],
      prerequis: ["torrefaction"],
      typesAttendus: ["lecon", "qcm", "appariement"],
    },
    {
      id: "degustation",
      titre: "Dégustation",
      skillIds: ["cafe.degustation"],
      prerequis: ["extraction"],
      typesAttendus: ["qcm", "flashcard"],
    },
  ],
};

export const items: Item[] = [
  // --- origines ---
  {
    id: "origines-lecon-1",
    moduleId: "origines",
    skillIds: ["cafe.origines"],
    difficulty: 1,
    type: "lecon",
    titre: "D'où vient le café ?",
    contenu:
      "Le caféier est originaire des hauts plateaux d'Éthiopie. Deux espèces dominent le marché mondial : " +
      "Coffea arabica (environ 60% de la production, arômes plus fins, moins de caféine) et Coffea canephora, " +
      "dit robusta (plus résistant, plus corsé, plus caféiné). La légende attribue la découverte des vertus " +
      "stimulantes du café à un berger nommé Kaldi, dont les chèvres seraient devenues agitées après avoir " +
      "mangé des baies de caféier.",
    sources: ["https://fr.wikipedia.org/wiki/Café", "https://fr.wikipedia.org/wiki/Coffea_arabica"],
  },
  {
    id: "origines-qcm-1",
    moduleId: "origines",
    skillIds: ["cafe.origines"],
    difficulty: 1,
    type: "qcm",
    question: "Le caféier est originaire de quelle région ?",
    choix: ["Les hauts plateaux d'Éthiopie", "Le nord de l'Italie", "Les Andes péruviennes", "Le sud de la Chine"],
    reponse: 0,
    explication: "Le caféier (Coffea) est originaire des hauts plateaux d'Éthiopie, avant de se répandre via la péninsule arabique.",
  },
  {
    id: "origines-qcm-2",
    moduleId: "origines",
    skillIds: ["cafe.origines"],
    difficulty: 2,
    type: "qcm",
    question: "Quelle espèce de caféier est réputée plus corsée et plus riche en caféine ?",
    choix: ["Coffea arabica", "Coffea canephora (robusta)", "Coffea liberica", "Coffea excelsa"],
    reponse: 1,
    explication: "Le robusta (Coffea canephora) contient environ deux fois plus de caféine que l'arabica et donne un café plus corsé et amer.",
  },
  // --- torrefaction ---
  {
    id: "torrefaction-lecon-1",
    moduleId: "torrefaction",
    skillIds: ["cafe.torrefaction"],
    difficulty: 2,
    type: "lecon",
    titre: "La torréfaction, du grain vert au grain brun",
    contenu:
      "Le grain de café vert est inodore et non torréfié : c'est la torréfaction (chauffage entre 180°C et 240°C) " +
      "qui développe les arômes via la réaction de Maillard et provoque le \"premier crack\" (le grain gonfle et " +
      "craque). Une torréfaction claire préserve l'acidité et les notes fruitées ; une torréfaction foncée développe " +
      "des notes plus amères et grillées mais réduit la caféine perçue et l'acidité.",
    sources: ["https://fr.wikipedia.org/wiki/Torréfaction_du_café"],
  },
  {
    id: "torrefaction-flash-1",
    moduleId: "torrefaction",
    skillIds: ["cafe.torrefaction"],
    difficulty: 1,
    type: "flashcard",
    recto: "Premier crack",
    verso: "Le moment où le grain de café, chauffé, gonfle et craque avec un bruit sec — marqueur clé de la torréfaction.",
  },
  {
    id: "torrefaction-flash-2",
    moduleId: "torrefaction",
    skillIds: ["cafe.torrefaction"],
    difficulty: 2,
    type: "flashcard",
    recto: "Réaction de Maillard",
    verso: "Réaction chimique entre sucres et acides aminés sous l'effet de la chaleur, responsable des arômes de la torréfaction (et du pain grillé, de la viande saisie...).",
  },
  {
    id: "torrefaction-trous-1",
    moduleId: "torrefaction",
    skillIds: ["cafe.torrefaction"],
    difficulty: 2,
    type: "texte-a-trous",
    texte: "Une torréfaction ___ préserve l'acidité et les notes fruitées, tandis qu'une torréfaction ___ développe des notes amères et grillées.",
    reponses: ["claire", "foncée"],
  },
  // --- extraction ---
  {
    id: "extraction-lecon-1",
    moduleId: "extraction",
    skillIds: ["cafe.extraction"],
    difficulty: 2,
    type: "lecon",
    titre: "Les grandes méthodes d'extraction",
    contenu:
      "L'espresso extrait le café sous pression (environ 9 bars) en 25-30 secondes, donnant une boisson concentrée " +
      "avec la crema. Les méthodes douces (filtre V60, Chemex, piston/French press) infusent par gravité ou immersion, " +
      "à pression atmosphérique, et donnent une tasse plus légère qui révèle davantage les nuances aromatiques.",
    sources: ["https://fr.wikipedia.org/wiki/Espresso", "https://fr.wikipedia.org/wiki/Cafetière_à_piston"],
  },
  {
    id: "extraction-qcm-1",
    moduleId: "extraction",
    skillIds: ["cafe.extraction"],
    difficulty: 2,
    type: "qcm",
    question: "Sous quelle pression environ est extrait un espresso ?",
    choix: ["9 bars", "1 bar", "30 bars", "0,5 bar"],
    reponse: 0,
    explication: "L'espresso est traditionnellement extrait à environ 9 bars de pression, en 25 à 30 secondes.",
  },
  {
    id: "extraction-appariement-1",
    moduleId: "extraction",
    skillIds: ["cafe.extraction"],
    difficulty: 3,
    type: "appariement",
    paires: [
      { gauche: "V60", droite: "Filtre en cône, versé manuellement" },
      { gauche: "French press", droite: "Immersion avec piston filtrant" },
      { gauche: "Espresso", droite: "Extraction sous pression" },
      { gauche: "Cold brew", droite: "Infusion à froid, longue durée" },
    ],
  },
  // --- degustation ---
  {
    id: "degustation-qcm-1",
    moduleId: "degustation",
    skillIds: ["cafe.degustation"],
    difficulty: 2,
    type: "qcm",
    question: "En dégustation, que désigne le terme \"corps\" (body) d'un café ?",
    choix: [
      "La sensation de texture/densité en bouche",
      "Le taux de caféine",
      "La couleur de la crema",
      "La température de la boisson",
    ],
    reponse: 0,
    explication: "Le \"corps\" décrit la sensation tactile en bouche (léger, soyeux, sirupeux...), indépendante du goût ou de l'arôme.",
  },
  {
    id: "degustation-flash-1",
    moduleId: "degustation",
    skillIds: ["cafe.degustation"],
    difficulty: 2,
    type: "flashcard",
    recto: "Acidité (en dégustation)",
    verso: "Sensation vive, pétillante en bouche (souvent citrique ou fruitée) — recherchée, à ne pas confondre avec l'amertume d'une sur-extraction.",
  },
];
