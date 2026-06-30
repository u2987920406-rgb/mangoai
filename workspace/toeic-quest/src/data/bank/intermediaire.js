// ─── Banque Intermédiaire ────────────────────────────────────────────────────
// Échantillons prouvant chaque type de question (P1 photo, P2 question-réponse,
// P3 conversation homme-femme). GLM démultiplie le volume en Phase 6.

export const INTERMEDIAIRE = [
  // ── P1 · Photos — M17 Actions complexes ──
  {
    id: "P1-M17-01", moduleId: "M17", level: "intermediaire", part: "P1", skill: "listening", difficulty: 2, voiceGender: "male",
    image: "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    transcript: "(A) A group of people are seated around a table reviewing documents. (B) The people are leaving the building. (C) A man is painting the wall. (D) The shelves are completely empty.",
    question: "Sélectionnez la phrase qui décrit le mieux l'image.",
    choices: ["A group of people are seated around a table reviewing documents.", "The people are leaving the building.", "A man is painting the wall.", "The shelves are completely empty."],
    answer: 0,
    explanation: "L'image montre un groupe assis autour d'une table avec des documents → réponse A. Les autres décrivent des actions absentes.",
  },

  // ── P2 · Question-Réponse — M18 Réponses indirectes (3 choix) ──
  {
    id: "P2-M18-01", moduleId: "M18", level: "intermediaire", part: "P2", skill: "listening", difficulty: 2,
    prompt: { text: "Do you know where the marketing report is?", gender: "female" },
    transcript: "Do you know where the marketing report is?",
    question: "Choisissez la meilleure réponse à la question entendue.",
    choices: ["Daniel was working on it yesterday.", "Yes, it's a very long report.", "The market opens at nine."],
    answer: 0,
    explanation: "Réponse indirecte typique du TOEIC : au lieu de donner l'emplacement, on oriente vers la personne qui l'avait (« Daniel y travaillait hier »).",
  },
  {
    id: "P2-M18-02", moduleId: "M18", level: "intermediaire", part: "P2", skill: "listening", difficulty: 2,
    prompt: { text: "Why don't we postpone the meeting until Thursday?", gender: "male" },
    transcript: "Why don't we postpone the meeting until Thursday?",
    question: "Choisissez la meilleure réponse à la question entendue.",
    choices: ["That works for me.", "The post office is closed.", "He met her last week."],
    answer: 0,
    explanation: "« Why don't we… » est une suggestion : la réponse naturelle est une acceptation (« That works for me »). Les autres jouent sur des sons proches (post/postpone, meeting/met).",
  },

  // ── P3 · Conversations homme-femme — M20 multi-tours (cœur de la demande) ──
  {
    id: "P3-M20-01", moduleId: "M20", level: "intermediaire", part: "P3", skill: "listening", difficulty: 2,
    image: "https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    lines: [
      { speaker: "M", gender: "male", text: "Hi Sarah, have you finished the quarterly report yet?" },
      { speaker: "W", gender: "female", text: "Almost. I just need the sales figures from your team to complete the last section." },
      { speaker: "M", gender: "male", text: "No problem. I'll email them to you within the hour." },
      { speaker: "W", gender: "female", text: "Great. Then I can submit the report before tomorrow's deadline." },
    ],
    transcript: "M: Hi Sarah, have you finished the quarterly report yet? W: Almost. I just need the sales figures from your team to complete the last section. M: No problem. I'll email them to you within the hour. W: Great. Then I can submit the report before tomorrow's deadline.",
    question: "What does the woman still need to finish the report?",
    choices: ["The sales figures from the man's team", "A new submission deadline", "A printed copy of the report", "Approval from her manager"],
    answer: 0,
    explanation: "La femme dit « I just need the sales figures from your team to complete the last section ». Il lui manque donc les chiffres de ventes.",
  },
  {
    id: "P3-M20-02", moduleId: "M20", level: "intermediaire", part: "P3", skill: "listening", difficulty: 3,
    image: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    lines: [
      { speaker: "W", gender: "female", text: "Good morning. I'd like to return this jacket — it's the wrong size." },
      { speaker: "M", gender: "male", text: "Of course. Do you have the receipt with you?" },
      { speaker: "W", gender: "female", text: "I do, but I paid in cash. Can I still get a refund?" },
      { speaker: "M", gender: "male", text: "Certainly. With the receipt, I can refund you in cash right away, or exchange it for the correct size." },
    ],
    transcript: "W: Good morning. I'd like to return this jacket — it's the wrong size. M: Of course. Do you have the receipt with you? W: I do, but I paid in cash. Can I still get a refund? M: Certainly. With the receipt, I can refund you in cash right away, or exchange it for the correct size.",
    question: "What does the man offer the woman?",
    choices: ["A cash refund or an exchange", "A discount on her next purchase", "Store credit only", "A free repair"],
    answer: 0,
    explanation: "L'homme dit « I can refund you in cash right away, or exchange it for the correct size » → il propose un remboursement OU un échange.",
  },
];
