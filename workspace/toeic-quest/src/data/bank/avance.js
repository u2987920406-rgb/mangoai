// ─── Banque Avancé ───────────────────────────────────────────────────────────
// Échantillons des types les plus difficiles (P3 rapide, P7 double passage).
// GLM démultiplie le volume + ajoute les examens blancs en Phase 6.

export const AVANCE = [
  // ── P3 · Conversations rapides — M40 ──
  {
    id: "P3-M40-01", moduleId: "M40", level: "avance", part: "P3", skill: "listening", difficulty: 3,
    image: "https://images.pexels.com/photos/3182812/pexels-photo-3182812.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    lines: [
      { speaker: "M", gender: "male", text: "I heard the client pushed back on our proposal again." },
      { speaker: "W", gender: "female", text: "They did, but honestly, I think it's a negotiating tactic. They want a lower price." },
      { speaker: "M", gender: "male", text: "So should we hold firm or offer a small discount to close the deal?" },
      { speaker: "W", gender: "female", text: "Let's hold firm for now. If they walk away, we can revisit it next week." },
    ],
    transcript: "M: I heard the client pushed back on our proposal again. W: They did, but honestly, I think it's a negotiating tactic. They want a lower price. M: So should we hold firm or offer a small discount to close the deal? W: Let's hold firm for now. If they walk away, we can revisit it next week.",
    question: "What does the woman suggest they do?",
    choices: ["Keep their current price for now", "Offer an immediate discount", "Cancel the deal entirely", "Raise the price further"],
    answer: 0,
    explanation: "La femme dit « Let's hold firm for now » → elle suggère de maintenir le prix actuel pour l'instant. C'est une inférence sur « hold firm » = ne pas céder.",
  },

  // ── P7 · Double passage — M44 ──
  {
    id: "P7-M44-01", moduleId: "M44", level: "avance", part: "P7", skill: "reading", difficulty: 3,
    passages: [
      { label: "Email 1 — Logistics", text: "From: logistics@brightpack.com\nTo: orders@meridian-retail.com\nSubject: Shipment MR-4192 — delay notice\n\nDear Meridian team,\n\nUnfortunately, the shipment scheduled to arrive on June 10 will be delayed due to a customs inspection at the port. The new estimated delivery date is June 17. We understand this may affect your store opening and apologize for the inconvenience. Please let us know how you would like to proceed." },
      { label: "Email 2 — Reply", text: "From: orders@meridian-retail.com\nTo: logistics@brightpack.com\nSubject: RE: Shipment MR-4192 — delay notice\n\nThank you for the update. Since our new store opens on June 15, a June 17 delivery is too late. Could you split the shipment and send the display units by express so they arrive before June 14? The remaining stock can follow on the original revised date." },
    ],
    passage: "Email 1 — Logistics\nFrom: logistics@brightpack.com ... the shipment scheduled to arrive on June 10 will be delayed ... new estimated delivery date is June 17.\n\nEmail 2 — Reply\n... our new store opens on June 15, a June 17 delivery is too late. Could you split the shipment and send the display units by express so they arrive before June 14?",
    question: "Why does the Meridian team request an express partial shipment?",
    choices: ["Their store opens on June 15, before the delayed delivery date", "They want to reduce shipping costs", "The customs inspection was cancelled", "They no longer need the remaining stock"],
    answer: 0,
    explanation: "Il faut croiser les deux emails : le 1er annonce une livraison repoussée au 17 juin ; le 2nd explique que le magasin ouvre le 15 juin, donc le 17 est trop tard → ils demandent les présentoirs en express avant le 14.",
  },
];
