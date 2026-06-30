// ── Gamification data: badges, levels, score estimation ───────────────────

export const BADGES = [
  { id: "first_steps", name: "Premiers Pas", description: "Compléter ta première session", icon: "🎯", condition: (stats) => stats.totalSessions >= 1 },
  { id: "streak_3", name: "Régulier", description: "Atteindre un streak de 3 jours", icon: "🔥", condition: (stats) => stats.maxStreak >= 3 },
  { id: "streak_7", name: "Semaine Parfaite", description: "Atteindre un streak de 7 jours", icon: "⚡", condition: (stats) => stats.maxStreak >= 7 },
  { id: "xp_100", name: "Centurion", description: "Gagner 100 XP au total", icon: "💯", condition: (stats) => stats.totalXP >= 100 },
  { id: "xp_500", name: "Pro de l'XP", description: "Gagner 500 XP au total", icon: "🌟", condition: (stats) => stats.totalXP >= 500 },
  { id: "xp_1000", name: "Maître XP", description: "Gagner 1000 XP au total", icon: "👑", condition: (stats) => stats.totalXP >= 1000 },
  { id: "perfect_session", name: "Sans Faute", description: "Réussir une session sans aucune erreur", icon: "🏆", condition: (stats) => stats.perfectSessions >= 1 },
  { id: "listening_master", name: "Oreille d'Or", description: "Réussir 10 questions Listening", icon: "🎧", condition: (stats) => (stats.byMode.listening?.correct || 0) >= 10 },
  { id: "reading_master", name: "Lecteur Averti", description: "Réussir 10 questions Reading", icon: "📖", condition: (stats) => (stats.byMode.reading?.correct || 0) >= 10 },
  { id: "vocab_master", name: "Crâne d'Or", description: "Réussir 10 questions Vocabulaire/Grammaire", icon: "🧠", condition: (stats) => (stats.byMode.vocabulary?.correct || 0) >= 10 },
  { id: "level_5", name: "Grimpeur", description: "Atteindre le niveau 5", icon: "🧗", condition: (stats) => stats.level >= 5 },
  { id: "level_10", name: "Ascension", description: "Atteindre le niveau 10", icon: "🚀", condition: (stats) => stats.level >= 10 },
  { id: "score_700", name: "Score Élite", description: "Atteindre un score TOEIC estimé de 700+", icon: "💎", condition: (stats) => stats.estimatedScore >= 700 },
  { id: "sessions_10", name: "Persévérant", description: "Compléter 10 sessions", icon: "📚", condition: (stats) => stats.totalSessions >= 10 },
];

// ── Level system ────────────────────────────────────────────────────────────
// XP needed for level N: 100 * N (cumulative)
export function xpForLevel(level) {
  return 100 * level * (level + 1) / 2;
}

export function getLevelFromXP(totalXP) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXP) {
    level++;
  }
  return level;
}

export function getLevelProgress(totalXP) {
  const level = getLevelFromXP(totalXP);
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const xpInLevel = totalXP - currentLevelXP;
  const xpForNext = nextLevelXP - currentLevelXP;
  return {
    level,
    xpInLevel,
    xpForNext,
    progress: Math.min(100, (xpInLevel / xpForNext) * 100),
  };
}

// ── TOEIC score estimation (10-990) ─────────────────────────────────────────
// Base: 250, max gain from accuracy and volume
export function estimateTOEICScore(stats) {
  const base = 250;
  const totalCorrect = (stats.byMode.listening?.correct || 0) + (stats.byMode.reading?.correct || 0) + (stats.byMode.vocabulary?.correct || 0);
  const totalAnswered = (stats.byMode.listening?.total || 0) + (stats.byMode.reading?.total || 0) + (stats.byMode.vocabulary?.total || 0);

  if (totalAnswered === 0) return base;

  const accuracy = totalCorrect / totalAnswered;
  const volumeBonus = Math.min(200, totalCorrect * 8);
  const levelBonus = Math.min(150, (stats.level - 1) * 15);
  const streakBonus = Math.min(100, stats.maxStreak * 10);

  const score = Math.round(base + accuracy * 300 + volumeBonus + levelBonus + streakBonus);
  return Math.min(990, Math.max(10, score));
}

// ── XP per question ─────────────────────────────────────────────────────────
export const XP_PER_CORRECT = 15;
export const XP_BONUS_PERFECT_SESSION = 50;
export const XP_BONUS_STREAK = 5; // per day of streak

// ── Mode metadata ───────────────────────────────────────────────────────────
export const MODES = {
  listening: {
    id: "listening",
    name: "Listening",
    label: "Compréhension Orale",
    icon: "🎧",
    color: "listening",
    description: "Écoute et comprends des dialogues et annonces du monde professionnel",
    emoji: "🎧",
  },
  reading: {
    id: "reading",
    name: "Reading",
    label: "Compréhension Écrite",
    icon: "📖",
    color: "reading",
    description: "Lis et analyse des textes business : emails, rapports, annonces",
    emoji: "📖",
  },
  vocabulary: {
    id: "vocabulary",
    name: "Vocabulary & Grammar",
    label: "Vocabulaire & Grammaire",
    icon: "🧠",
    color: "vocab",
    description: "Maîtrise le vocabulaire business et la grammaire anglaise",
    emoji: "🧠",
  },
};

// ── Image mapping for topics ────────────────────────────────────────────────
export const TOPIC_IMAGES = {
  restaurant: "restaurant",
  airport: "airport",
  office: "office",
  weather: "weather",
  meeting: "meeting",
  phone: "phone",
  conference: "conference",
  shopping: "shopping",
  hotel: "hotel",
  training: "training",
  email: "email",
  notice: "notice",
  report: "report",
  job: "job",
  memo: "memo",
  ad: "ad",
  contract: "contract",
  schedule: "schedule",
  newsletter: "newsletter",
  policy: "policy",
};