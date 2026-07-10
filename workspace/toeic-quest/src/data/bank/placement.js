// ─── Test de placement ───────────────────────────────────────────────────────
// 12 questions de difficulté croissante couvrant les parties P1-P7. Le score
// situe l'utilisateur : <40 % → Débutant · 40-70 % → Intermédiaire · >70 % → Avancé.
// (cf. resolvePlacement dans bank/index.js)

export const PLACEMENT = [
  {
    id: "PL-01", part: "P5", skill: "vocab", difficulty: 1, type: "fillblank",
    sentence: "The meeting will _____ at 3 PM in the main conference room.",
    choices: ["begin", "begins", "beginning", "began"], answer: 0,
    explanation: "Après le modal « will », on emploie la base verbale → « begin ».",
  },
  {
    id: "PL-02", part: "P5", skill: "vocab", difficulty: 1, type: "fillblank",
    sentence: "Please send the invoice _____ Friday at the latest.",
    choices: ["by", "until", "since", "during"], answer: 0,
    explanation: "« by + date » = au plus tard à cette date. « until » exprimerait une continuité, ce qui ne convient pas.",
  },
  {
    id: "PL-03", part: "P2", skill: "listening", difficulty: 1,
    prompt: { text: "When does the store open?", gender: "female" },
    transcript: "When does the store open?",
    question: "Choisissez la meilleure réponse à la question entendue.",
    choices: ["At eight in the morning.", "On the second floor.", "Yes, it's open."], answer: 0,
    explanation: "« When » attend un moment → « At eight in the morning ».",
  },
  {
    id: "PL-04", part: "P7", skill: "reading", difficulty: 2,
    image: "/assets/pexels/7652049.jpeg",
    passage: "NOTICE\n\nThe staff parking lot will be repaved this Saturday. Employees are asked to use the public garage on Elm Street, which will be free of charge for the day. Normal parking resumes Monday.",
    question: "Where should employees park on Saturday?",
    choices: ["The public garage on Elm Street", "The staff parking lot", "On the street near the office", "At a nearby shopping mall"], answer: 0,
    explanation: "Le texte indique « use the public garage on Elm Street ». La bonne réponse est le garage public.",
  },
  {
    id: "PL-05", part: "P5", skill: "vocab", difficulty: 2, type: "fillblank",
    sentence: "The new policy was _____ by all department managers before its release.",
    choices: ["review", "reviewing", "reviewed", "reviews"], answer: 2,
    explanation: "Voix passive : « was + participe passé » → « reviewed ».",
  },
  {
    id: "PL-06", part: "P3", skill: "listening", difficulty: 2,
    lines: [
      { speaker: "W", gender: "female", text: "Have you booked the flight for the Tokyo conference?" },
      { speaker: "M", gender: "male", text: "Not yet. I'm waiting for finance to approve the budget." },
      { speaker: "W", gender: "female", text: "They approved it this morning, so you're clear to book." },
    ],
    transcript: "W: Have you booked the flight for the Tokyo conference? M: Not yet. I'm waiting for finance to approve the budget. W: They approved it this morning, so you're clear to book.",
    question: "Why had the man not booked the flight?",
    choices: ["He was waiting for budget approval", "The conference was cancelled", "He forgot about the trip", "The flights were full"], answer: 0,
    explanation: "L'homme dit « I'm waiting for finance to approve the budget » → il attendait l'approbation du budget.",
  },
  {
    id: "PL-07", part: "P6", skill: "reading", difficulty: 2, type: "fillblank",
    sentence: "Thank you for your application. We will contact you _____ we have reviewed all submissions.",
    choices: ["once", "despite", "unless", "during"], answer: 0,
    explanation: "« once » = dès que. Le sens : on vous contactera une fois les candidatures examinées.",
  },
  {
    id: "PL-08", part: "P5", skill: "vocab", difficulty: 2, type: "fillblank",
    sentence: "The manager praised the team for working _____ under pressure.",
    choices: ["efficient", "efficiently", "efficiency", "more efficient"], answer: 1,
    explanation: "Il faut un adverbe pour modifier le verbe « working » → « efficiently ».",
  },
  {
    id: "PL-09", part: "P7", skill: "reading", difficulty: 3,
    image: "/assets/pexels/3184292.jpeg",
    passage: "We regret to inform customers that, owing to an unexpected surge in demand, the GX-9 headphones are temporarily out of stock. Customers who pre-ordered will be prioritized once new units arrive, expected within two weeks. We appreciate your understanding and, as a gesture of goodwill, will include a complimentary carrying case with each delayed order.",
    question: "What is implied about customers who pre-ordered?",
    choices: ["They will receive their order before new general customers", "They will be refunded automatically", "They must place their order again", "They will not receive the carrying case"], answer: 0,
    explanation: "Inférence : « will be prioritized once new units arrive » implique qu'ils seront servis avant les nouveaux clients.",
  },
  {
    id: "PL-10", part: "P5", skill: "vocab", difficulty: 3, type: "fillblank",
    sentence: "_____ the report had been thoroughly proofread, several errors still made it to print.",
    choices: ["Although", "Because", "Therefore", "So that"], answer: 0,
    explanation: "Le contraste entre la relecture et les erreurs appelle un connecteur de concession → « Although ».",
  },
  {
    id: "PL-11", part: "P4", skill: "listening", difficulty: 3, voiceGender: "male",
    transcript: "Before we wrap up today's briefing, a quick reminder: the deadline for submitting your travel reimbursement forms has moved up from the 30th to the 22nd. Forms received after the 22nd won't be processed until the following month, so please plan accordingly.",
    question: "What is the main point of the reminder?",
    choices: ["The reimbursement deadline has been moved earlier", "Travel has been suspended", "Forms must be submitted online", "The briefing is cancelled"], answer: 0,
    explanation: "Le point clé : « the deadline … has moved up from the 30th to the 22nd » → l'échéance a été avancée.",
  },
  {
    id: "PL-12", part: "P5", skill: "vocab", difficulty: 3, type: "fillblank",
    sentence: "Neither the supervisor nor the technicians _____ aware of the scheduling conflict.",
    choices: ["was", "were", "is", "has been"], answer: 1,
    explanation: "Avec « neither … nor … », le verbe s'accorde avec le sujet le plus proche (« technicians », pluriel) → « were ».",
  },
];
