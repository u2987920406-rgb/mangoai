// ─── YES I CAN TOEIC — Façade de données (rétro-compatible) ──────────────────
// La banque réelle vit désormais dans data/bank/ (taguée level/part/moduleId/
// skill/difficulty) et le parcours dans data/curriculum.js. Ce fichier RECONSTRUIT
// l'API historique (QUESTIONS.{listening,reading,vocab}, MODE_INFO, BADGES,
// xpForLevel, levelFromXP) pour que les 3 modes libres et tout le code existant
// continuent SANS modification. On n'ajoute que des barèmes pondérés.

import { questionsBySkill, QUESTION_BANK } from "./bank/index.js";

// ─── API historique : 3 modes regroupés par compétence ───────────────────────
export const QUESTIONS = questionsBySkill();

// ─── Badges débloquables (inchangés) ─────────────────────────────────────────
export const BADGES = [
  { id: "first_session", name: "Premier Pas", emoji: "🎯", description: "Compléter votre première session", condition: (s) => s.totalSessions >= 1 },
  { id: "streak_3", name: "Régulier", emoji: "🔥", description: "Maintenir un streak de 3 jours", condition: (s) => s.streak >= 3 },
  { id: "streak_7", name: "Semaine Parfaite", emoji: "⚡", description: "Maintenir un streak de 7 jours", condition: (s) => s.streak >= 7 },
  { id: "level_5", name: "Apprenti TOEIC", emoji: "🎓", description: "Atteindre le niveau 5", condition: (s) => s.level >= 5 },
  { id: "level_10", name: "Expert TOEIC", emoji: "🏆", description: "Atteindre le niveau 10", condition: (s) => s.level >= 10 },
  { id: "score_600", name: "Score 600+", emoji: "📈", description: "Atteindre un score estimé de 600", condition: (s) => s.estimatedScore >= 600 },
  { id: "score_800", name: "Score 800+", emoji: "🌟", description: "Atteindre un score estimé de 800", condition: (s) => s.estimatedScore >= 800 },
  { id: "perfect_session", name: "Sans Faute", emoji: "💯", description: "Réussir une session sans aucune erreur", condition: (s) => s.perfectSessions >= 1 },
  { id: "listening_master", name: "Maître Listening", emoji: "🎧", description: "Répondre correctement à 10 questions Listening", condition: (s) => (s.skillStats?.listening?.correct || 0) >= 10 },
  { id: "reading_master", name: "Maître Reading", emoji: "📖", description: "Répondre correctement à 10 questions Reading", condition: (s) => (s.skillStats?.reading?.correct || 0) >= 10 },
  { id: "vocab_master", name: "Maître Vocabulaire", emoji: "📚", description: "Répondre correctement à 10 questions Vocabulaire", condition: (s) => (s.skillStats?.vocab?.correct || 0) >= 10 },
  { id: "xp_1000", name: "Mille XP", emoji: "✨", description: "Accumuler 1000 XP", condition: (s) => s.totalXP >= 1000 },
];

// ─── Niveaux (inchangés) ─────────────────────────────────────────────────────
export function xpForLevel(level) {
  return Math.floor(100 * level * (1 + level * 0.15));
}

export function levelFromXP(totalXP) {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpInLevel: remaining, xpForNext: xpForLevel(level) };
}

// ─── Barèmes pondérés par difficulté (NOUVEAU) ───────────────────────────────
// XP différencié : une question difficile rapporte plus.
export const XP_PER_CORRECT = { 1: 10, 2: 15, 3: 25 };

// Poids de difficulté pour le score estimé (une bonne réponse difficile « pèse » plus).
export const DIFFICULTY_WEIGHTS = { 1: 0.6, 2: 1.0, 3: 1.6 };

// XP d'une session à partir du détail des réponses (fallback : 15/bonne réponse).
export function xpForResults(results) {
  if (!Array.isArray(results)) return 0;
  let xp = 0;
  for (const r of results) {
    if (r?.correct) xp += XP_PER_CORRECT[r.difficulty] ?? 15;
  }
  return xp;
}

// Score TOEIC estimé réaliste : précision PONDÉRÉE par la difficulté + couverture.
// Atteindre 800+ exige donc de réussir des questions difficiles ET d'en voir un volume.
//   weightedCorrect = Σ(correct · W[d]) · weightedTotal = Σ(W[d]) · hardSeen = #(difficulty≥2 vues)
export function estimateScore(weightedCorrect, weightedTotal, hardSeen) {
  if (!weightedTotal) return 250;
  const weightedAccuracy = weightedCorrect / weightedTotal;
  const coverage = Math.max(0, Math.min(1, (hardSeen || 0) / 150));
  const score = 250 + weightedAccuracy * 600 + coverage * weightedAccuracy * 150;
  return Math.round(Math.max(250, Math.min(990, score)));
}

// ─── Images & métadonnées de mode (counts dynamiques) ────────────────────────
export const MODE_IMAGES = {
  listening: "/assets/pexels/7116329.jpeg",
  reading: "/assets/pexels/7654178.jpeg",
  vocab: "/assets/pexels/8547344.jpeg",
};

export const MODE_INFO = {
  listening: { name: "Listening", emoji: "🎧", color: "listening", description: "Compréhension orale avec audio", count: QUESTIONS.listening.length },
  reading: { name: "Reading", emoji: "📖", color: "reading", description: "Compréhension écrite business", count: QUESTIONS.reading.length },
  vocab: { name: "Vocabulary & Grammar", emoji: "📚", color: "vocab", description: "Grammaire et vocabulaire", count: QUESTIONS.vocab.length },
};

// Ré-export pratique de la banque complète.
export { QUESTION_BANK };
