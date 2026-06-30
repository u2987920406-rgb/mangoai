// ─── TOEIC QUEST — Curriculum 1 an (52 modules) ──────────────────────────────
// Parcours pédagogique structuré vers le score 800+. Un module ≈ une semaine
// (~2h : mini-leçon + 2-3 sessions + récap). Les 7 parties officielles du TOEIC
// sont couvertes à CHAQUE niveau ; c'est la complexité (longueur audio,
// vocabulaire, distracteurs, longueur de passage) qui croît.
//
//   Parties : P1 Photos · P2 Question-Réponse · P3 Conversations H/F ·
//             P4 Short Talks · P5 Phrases incomplètes · P6 Complétion de texte ·
//             P7 Compréhension écrite (simple / double / triple passage)
//
// skill ∈ listening | reading | vocab | mixed   (les 3 premiers = clés skillStats)

export const LEVELS = {
  debutant: { id: "debutant", name: "Débutant", emoji: "🌱", scoreRange: "350–550", color: "reading", weeks: "1–16" },
  intermediaire: { id: "intermediaire", name: "Intermédiaire", emoji: "🚀", scoreRange: "550–750", color: "listening", weeks: "17–36" },
  avance: { id: "avance", name: "Avancé", emoji: "🏆", scoreRange: "750–900+", color: "mango", weeks: "37–52" },
};

export const LEVEL_ORDER = { debutant: 0, intermediaire: 1, avance: 2 };

// Emoji d'illustration par partie TOEIC (fallback si un module n'en fixe pas).
export const PART_EMOJI = { P1: "📷", P2: "💬", P3: "🎧", P4: "📢", P5: "✏️", P6: "🧩", P7: "📖" };
export const PART_NAME = {
  P1: "Part 1 · Photos", P2: "Part 2 · Question-Réponse", P3: "Part 3 · Conversations",
  P4: "Part 4 · Short Talks", P5: "Part 5 · Phrases incomplètes", P6: "Part 6 · Complétion de texte",
  P7: "Part 7 · Compréhension écrite",
};

// Couleur de thème par compétence (réutilise les tokens @theme de index.css).
const SKILL_COLOR = { listening: "listening", reading: "reading", vocab: "vocab", mixed: "mango" };

function m(id, week, level, title, parts, skill, goal, tips, extra = {}) {
  return {
    id, week, level, title, parts, skill,
    goal, tips,
    emoji: extra.emoji || PART_EMOJI[parts[0]] || "🎯",
    color: SKILL_COLOR[skill] || "mango",
    targetCount: extra.targetCount || (skill === "mixed" ? 30 : 24),
    prerequisites: extra.prerequisites !== undefined ? extra.prerequisites : (Number(id.slice(1)) > 1 ? ["M" + String(Number(id.slice(1)) - 1).padStart(2, "0")] : []),
    estMinutes: extra.estMinutes || 120,
    isExam: extra.isExam || false,
    isBilan: extra.isBilan || false,
  };
}

// ─── Les 52 modules ──────────────────────────────────────────────────────────
export const CURRICULUM = [
  // ── DÉBUTANT (semaines 1-16, cible interne ~550) ──
  m("M01", 1, "debutant", "Photos du quotidien", ["P1"], "listening",
    "Décrire une image simple : qui, quoi, où.", "Concentre-toi sur le sujet principal et l'action visible. Élimine les phrases qui décrivent un objet absent."),
  m("M02", 2, "debutant", "Photos : lieux & objets", ["P1"], "listening",
    "Reconnaître lieux, objets et positions sur une photo.", "Écoute les prépositions de lieu (on, under, next to). Une seule phrase est entièrement vraie."),
  m("M03", 3, "debutant", "Questions-Réponses simples", ["P2"], "listening",
    "Répondre à une question courte entendue (Wh- et Yes/No).", "Le mot interrogatif (Where, When, Who) annonce le type de réponse attendu. Méfie-toi des répétitions de mots-pièges."),
  m("M04", 4, "debutant", "Questions Wh- & Yes/No", ["P2"], "listening",
    "Distinguer questions ouvertes et fermées.", "« How much » attend un prix, « How long » une durée. Une réponse correcte n'est pas forcément directe."),
  m("M05", 5, "debutant", "Vocabulaire du bureau", ["P5"], "vocab",
    "Maîtriser le vocabulaire professionnel courant.", "Apprends les mots par famille (manage / manager / management) et leur place grammaticale."),
  m("M06", 6, "debutant", "Grammaire : temps de base", ["P5"], "vocab",
    "Choisir la forme verbale correcte (présent, passé, futur).", "Repère les marqueurs de temps (yesterday, next week, currently) qui imposent le temps."),
  m("M07", 7, "debutant", "Conversations courtes homme-femme", ["P3"], "listening",
    "Comprendre un échange de 3-4 répliques entre deux interlocuteurs.", "Repère QUI parle (homme / femme) et le sujet de l'échange. La question cible souvent une intention ou un besoin."),
  m("M08", 8, "debutant", "Annonces & messages", ["P4"], "listening",
    "Saisir l'essentiel d'une annonce ou d'un message vocal.", "L'objet de l'annonce est donné dès la 1re phrase. Note les chiffres (heure, numéro de porte, prix)."),
  m("M09", 9, "debutant", "Emails & mémos simples", ["P7"], "reading",
    "Lire un email ou mémo professionnel court.", "Lis d'abord la question, puis cherche l'information précise dans le texte. Ne te laisse pas piéger par les paraphrases."),
  m("M10", 10, "debutant", "Prépositions & connecteurs", ["P5"], "vocab",
    "Employer les prépositions et connecteurs logiques.", "« responsible FOR », « increase BY », « before / after / during » : mémorise les associations fixes."),
  m("M11", 11, "debutant", "Conversations : la vie au travail", ["P3"], "listening",
    "Suivre une conversation entre collègues.", "Concentre-toi sur le problème évoqué et la solution proposée."),
  m("M12", 12, "debutant", "Compléter un texte court", ["P6"], "reading",
    "Choisir le mot ou la phrase qui complète un texte.", "Relis la phrase entière avec ton choix : le sens et la grammaire doivent tenir."),
  m("M13", 13, "debutant", "Annonces & notices", ["P7"], "reading",
    "Comprendre une notice, un avis ou une publicité.", "Repère le but du document (informer, avertir, promouvoir) et les conditions (dates, restrictions)."),
  m("M14", 14, "debutant", "Messages téléphoniques", ["P4"], "listening",
    "Extraire les informations clés d'un message vocal.", "Note l'appelant, la raison de l'appel et l'action demandée."),
  m("M15", 15, "debutant", "Révision écoute", ["P1", "P2"], "listening",
    "Consolider les acquis d'écoute du niveau Débutant.", "Mélange de photos et de questions-réponses. Vise la régularité plus que la vitesse."),
  m("M16", 16, "debutant", "Bilan Débutant", ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], "mixed",
    "Valider le niveau Débutant et débloquer l'Intermédiaire.", "Examen mixte sur les 7 parties. Réussis à 75 % pour passer au niveau supérieur.",
    { isBilan: true, targetCount: 30 }),

  // ── INTERMÉDIAIRE (semaines 17-36, cible ~700) ──
  m("M17", 17, "intermediaire", "Photos : actions complexes", ["P1"], "listening",
    "Décrire des scènes avec plusieurs personnes ou actions.", "Plusieurs phrases semblent vraies : choisis celle qui décrit l'ensemble sans détail faux."),
  m("M18", 18, "intermediaire", "Réponses indirectes", ["P2"], "listening",
    "Comprendre des réponses qui ne répondent pas directement.", "« Do you know where Tom is? » → « He called in sick. » La bonne réponse est souvent implicite."),
  m("M19", 19, "intermediaire", "Vocabulaire des affaires", ["P5"], "vocab",
    "Enrichir le lexique business (finance, RH, logistique).", "Travaille les nuances : « profit » vs « revenue », « employee » vs « applicant »."),
  m("M20", 20, "intermediaire", "Conversations homme-femme multi-tours", ["P3"], "listening",
    "Suivre un dialogue de 5-6 répliques entre un homme et une femme.", "Garde en tête la chronologie : qui propose quoi, qui accepte, ce qui reste à faire."),
  m("M21", 21, "intermediaire", "Présentations & briefings", ["P4"], "listening",
    "Comprendre une présentation professionnelle structurée.", "Repère le plan annoncé et les transitions (« first », « however », « finally »)."),
  m("M22", 22, "intermediaire", "Articles & rapports", ["P7"], "reading",
    "Lire un article ou rapport d'entreprise.", "Identifie l'idée principale de chaque paragraphe avant de répondre aux détails."),
  m("M23", 23, "intermediaire", "Voix passive & conditionnels", ["P5"], "vocab",
    "Maîtriser passif et phrases conditionnelles.", "Passif = be + participe passé. Conditionnel : attention à la concordance des temps."),
  m("M24", 24, "intermediaire", "Complétion de texte", ["P6"], "reading",
    "Compléter un texte avec mots ET phrases entières.", "Pour une phrase à insérer, vérifie la cohérence avec la phrase précédente ET suivante."),
  m("M25", 25, "intermediaire", "Conversations : négociation", ["P3"], "listening",
    "Suivre une discussion avec désaccord ou compromis.", "Note les marqueurs d'opinion et de concession (« I'd rather », « on the other hand »)."),
  m("M26", 26, "intermediaire", "Annonces publiques", ["P4"], "listening",
    "Comprendre annonces de gare, magasin, événement.", "L'information utile (changement, retard, offre) arrive souvent après une formule d'introduction."),
  m("M27", 27, "intermediaire", "Mots de liaison avancés", ["P5"], "vocab",
    "Employer connecteurs logiques de niveau supérieur.", "« nevertheless », « therefore », « whereas » : chacun marque une relation logique précise."),
  m("M28", 28, "intermediaire", "Single passage avancé", ["P7"], "reading",
    "Lire un passage long avec inférence simple.", "Certaines réponses demandent de déduire, pas seulement de retrouver une phrase."),
  m("M29", 29, "intermediaire", "Questions rhétoriques & tag", ["P2"], "listening",
    "Réagir à des questions tag et rhétoriques.", "« It's a great idea, isn't it? » attend un accord ou une nuance, pas un fait."),
  m("M30", 30, "intermediaire", "Conversations à trois interlocuteurs", ["P3"], "listening",
    "Suivre une conversation à trois voix.", "Distingue chaque locuteur ; la question précise souvent « what does the man suggest »."),
  m("M31", 31, "intermediaire", "Cohérence de texte", ["P6"], "reading",
    "Assurer la cohérence d'un texte à trous.", "Le temps verbal et les pronoms doivent rester cohérents dans tout le paragraphe."),
  m("M32", 32, "intermediaire", "Emails professionnels longs", ["P7"], "reading",
    "Lire un échange d'emails professionnel.", "Repère l'expéditeur, l'objet et la demande de chaque message."),
  m("M33", 33, "intermediaire", "Extraits radio & podcasts", ["P4"], "listening",
    "Comprendre un extrait audio informatif long.", "Note le thème, l'intervenant et les 2-3 points clés développés."),
  m("M34", 34, "intermediaire", "Collocations business", ["P5"], "vocab",
    "Maîtriser les associations de mots fréquentes.", "« meet a deadline », « place an order », « reach an agreement » se mémorisent en bloc."),
  m("M35", 35, "intermediaire", "Révision écoute intermédiaire", ["P1", "P2", "P3", "P4"], "listening",
    "Consolider l'écoute sur les 4 parties.", "Travaille ta concentration sur des audios plus longs et rapides."),
  m("M36", 36, "intermediaire", "Bilan Intermédiaire", ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], "mixed",
    "Valider l'Intermédiaire et débloquer l'Avancé.", "Examen mixte. Réussis à 75 % pour accéder au niveau Avancé.",
    { isBilan: true, targetCount: 30 }),

  // ── AVANCÉ (semaines 37-52, cible 800+) ──
  m("M37", 37, "avance", "Photos : descriptions nuancées", ["P1"], "listening",
    "Choisir la description la plus précise d'une scène riche.", "Les distracteurs sont presque vrais : un seul mot peut les rendre faux."),
  m("M38", 38, "avance", "Réponses idiomatiques", ["P2"], "listening",
    "Comprendre réponses idiomatiques et familières.", "« It's not my call » = ce n'est pas à moi de décider. Apprends les expressions de bureau."),
  m("M39", 39, "avance", "Vocabulaire spécialisé", ["P5"], "vocab",
    "Maîtriser un lexique technique et juridique.", "Contrats, conformité, finance : précise le sens exact de chaque terme."),
  m("M40", 40, "avance", "Conversations rapides", ["P3"], "listening",
    "Suivre un dialogue rapide avec implicite.", "Le débit est élevé et le sens parfois implicite : anticipe grâce au contexte."),
  m("M41", 41, "avance", "Discours techniques", ["P4"], "listening",
    "Comprendre un exposé technique dense.", "Structure ton écoute autour des données chiffrées et des conclusions."),
  m("M42", 42, "avance", "Inférence & implicite", ["P7"], "reading",
    "Déduire l'intention et le ton d'un texte.", "Cherche ce que l'auteur sous-entend, pas seulement ce qu'il écrit."),
  m("M43", 43, "avance", "Complétion experte", ["P6"], "reading",
    "Compléter un texte exigeant (registre, cohésion).", "Le bon choix respecte le registre (formel / informel) et la logique d'ensemble."),
  m("M44", 44, "avance", "Double passage", ["P7"], "reading",
    "Croiser deux documents liés (email + réponse, annonce + planning).", "La réponse à certaines questions ne se trouve qu'en combinant les deux documents."),
  m("M45", 45, "avance", "Grammaire piège", ["P5"], "vocab",
    "Déjouer les pièges grammaticaux classiques.", "Accord sujet-verbe à distance, gérondif vs infinitif, comparatifs irréguliers."),
  m("M46", 46, "avance", "Conversations : accents variés", ["P3"], "listening",
    "Comprendre différents accents (US, UK, AUS).", "Habitue ton oreille : le sens prime sur la prononciation."),
  m("M47", 47, "avance", "Triple passage", ["P7"], "reading",
    "Croiser trois documents pour répondre.", "Repère vite quel document contient chaque type d'information avant de croiser."),
  m("M48", 48, "avance", "Grammaire & style", ["P5", "P6"], "vocab",
    "Affiner grammaire fine et style soutenu.", "Parallélisme, articulation logique, choix lexical précis : vise la justesse."),
  m("M49", 49, "avance", "Examen blanc — Écoute", ["P1", "P2", "P3", "P4"], "listening",
    "Passer une section Écoute complète en conditions réelles.", "Chronométré : ne reste pas bloqué sur une question, avance.",
    { isExam: true, targetCount: 30 }),
  m("M50", 50, "avance", "Examen blanc — Lecture", ["P5", "P6", "P7"], "reading",
    "Passer une section Lecture complète en conditions réelles.", "Gère ton temps : garde les passages longs pour la fin si nécessaire.",
    { isExam: true, targetCount: 30 }),
  m("M51", 51, "avance", "Examen blanc complet 1", ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], "mixed",
    "Simuler un examen TOEIC complet.", "Conditions réelles : objectif 800+. Analyse tes erreurs ensuite.",
    { isExam: true, isBilan: true, targetCount: 40 }),
  m("M52", 52, "avance", "Examen blanc complet 2", ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], "mixed",
    "Confirmer ton niveau sur un second examen complet.", "Compare ton score au précédent : la régularité prouve la maîtrise.",
    { isExam: true, isBilan: true, targetCount: 40 }),
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getModule(id) {
  return CURRICULUM.find((mod) => mod.id === id) || null;
}

export function modulesForLevel(level) {
  return CURRICULUM.filter((mod) => mod.level === level);
}

// Module débloqué ? (niveau atteint + prérequis satisfaits)
// Un prérequis d'un niveau INFÉRIEUR au module est considéré acquis : le test de
// placement (ou la réussite d'un bilan) fait entrer dans un niveau sans imposer de
// rejouer tout le niveau précédent. La chaîne stricte ne s'applique qu'À L'INTÉRIEUR
// d'un même niveau.
export function isModuleUnlocked(mod, state) {
  if (!mod) return false;
  const unlocked = state?.unlockedLevel || "debutant";
  if (LEVEL_ORDER[mod.level] > LEVEL_ORDER[unlocked]) return false;
  const prog = state?.moduleProgress || {};
  return (mod.prerequisites || []).every((pre) => {
    const preMod = getModule(pre);
    if (preMod && LEVEL_ORDER[preMod.level] < LEVEL_ORDER[mod.level]) return true;
    return prog[pre]?.completed;
  });
}

// Prochain module recommandé : 1er module débloqué et non complété.
export function nextRecommendedModule(state) {
  const prog = state?.moduleProgress || {};
  for (const mod of CURRICULUM) {
    if (!prog[mod.id]?.completed && isModuleUnlocked(mod, state)) return mod;
  }
  // Tout complété (ou rien débloqué) → premier module non complété.
  return CURRICULUM.find((mod) => !prog[mod.id]?.completed) || CURRICULUM[0];
}

// Faut-il monter le niveau débloqué après un module ? (bilan réussi à ≥75 %)
export function levelToUnlockAfter(mod, accuracy) {
  if (!mod?.isBilan || accuracy < 0.75) return null;
  if (mod.level === "debutant") return "intermediaire";
  if (mod.level === "intermediaire") return "avance";
  return null;
}
