import { useState, useEffect, useCallback } from "react";
import { BADGES, levelFromXP, estimateScore, DIFFICULTY_WEIGHTS } from "../data/questions.js";
import { getModule, levelToUnlockAfter, LEVEL_ORDER } from "../data/curriculum.js";
import { resolvePlacement } from "../data/bank/index.js";

const STORAGE_KEY = "yesicantoeic_progress_v1";
// Version de SCHÉMA embarquée dans les données elles-mêmes (pas seulement dans
// le nom de clé) — permet une migration data-driven future sans reset de clé.
const SCHEMA_VERSION = 1;
// Longueur max de la liste de questions vues par module (assez large pour tout
// module réel, ~8-30 questions ; borne pour éviter une croissance illimitée).
const MAX_SEEN_IDS = 120;

const EMPTY_PART_STATS = { P1: { correct: 0, total: 0 }, P2: { correct: 0, total: 0 }, P3: { correct: 0, total: 0 }, P4: { correct: 0, total: 0 }, P5: { correct: 0, total: 0 }, P6: { correct: 0, total: 0 }, P7: { correct: 0, total: 0 } };

const DEFAULT_STATE = {
  totalXP: 0,
  totalSessions: 0,
  streak: 0,
  lastSessionDate: null,
  badges: [],
  perfectSessions: 0,
  estimatedScore: 250,
  skillStats: {
    listening: { correct: 0, total: 0 },
    reading: { correct: 0, total: 0 },
    vocab: { correct: 0, total: 0 },
  },
  sessionHistory: [],
  // ── Parcours (additif) ──
  placementDone: false,
  placementLevel: null,
  unlockedLevel: "debutant",
  moduleProgress: {},            // { [moduleId]: { completed, bestAccuracy, stars, attempts, questionsSeen } }
  partStats: { ...EMPTY_PART_STATS },
  weightedCorrect: 0,            // Σ(correct · W[difficulty]) — pour le score pondéré
  weightedTotal: 0,             // Σ(W[difficulty])
  hardSeen: 0,                   // #questions difficulty ≥ 2 répondues (couverture)
};

// Valide la FORME des champs critiques avant de les laisser entrer dans l'état
// React (et donc dans les calculs de score). Un JSON syntaxiquement valide mais
// de forme inattendue (ex. `{"totalXP": "beaucoup"}`) ne doit jamais se
// propager silencieusement dans les calculs (NaN dans estimateScore, etc.).
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isValidShape(parsed) {
  if (!isPlainObject(parsed)) return false;
  const numericFields = ["totalXP", "totalSessions", "streak", "estimatedScore", "weightedCorrect", "weightedTotal", "hardSeen"];
  for (const f of numericFields) {
    if (f in parsed && typeof parsed[f] !== "number") return false;
  }
  const objectFields = ["skillStats", "partStats", "moduleProgress"];
  for (const f of objectFields) {
    if (f in parsed && !isPlainObject(parsed[f])) return false;
  }
  if ("badges" in parsed && !Array.isArray(parsed.badges)) return false;
  if ("sessionHistory" in parsed && !Array.isArray(parsed.sessionHistory)) return false;
  return true;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, schemaVersion: SCHEMA_VERSION };
    const parsed = JSON.parse(raw);
    if (!isValidShape(parsed)) {
      console.warn("[useProgress] progression stockée de forme invalide — repli sur l'état par défaut.");
      return { ...DEFAULT_STATE, schemaVersion: SCHEMA_VERSION };
    }
    return {
      ...DEFAULT_STATE,
      ...parsed,
      schemaVersion: SCHEMA_VERSION,
      skillStats: { ...DEFAULT_STATE.skillStats, ...(parsed.skillStats || {}) },
      partStats: { ...EMPTY_PART_STATS, ...(parsed.partStats || {}) },
      moduleProgress: { ...(parsed.moduleProgress || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE, schemaVersion: SCHEMA_VERSION };
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(d1, d2) {
  const a = new Date(d1 + "T00:00:00");
  const b = new Date(d2 + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function starsFor(accuracy) {
  if (accuracy >= 1) return 3;
  if (accuracy >= 0.85) return 2;
  if (accuracy >= 0.7) return 1;
  return 0;
}

export function useProgress() {
  const [state, setState] = useState(loadState);
  // Signal d'échec d'écriture (quota dépassé, navigation privée, storage
  // désactivé) — l'ancien comportement avalait silencieusement l'erreur et
  // l'utilisateur perdait sa progression sans jamais le savoir.
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [state]);

  const recordSession = useCallback((sessionData) => {
    setState((prev) => {
      const today = todayStr();
      let newStreak = prev.streak;
      if (prev.lastSessionDate === today) {
        // already practiced today, keep streak
      } else if (prev.lastSessionDate && daysBetween(prev.lastSessionDate, today) === 1) {
        newStreak = prev.streak + 1;
      } else {
        newStreak = 1;
      }

      const newTotalXP = prev.totalXP + (sessionData.xpEarned || 0);
      const { level } = levelFromXP(newTotalXP);

      // Détail par question : skillStats + partStats + score pondéré + couverture.
      // Les stats par compétence se déduisent du DÉTAIL des réponses (gère les
      // modules « mixed » = bilans). Repli sur sessionData.mode si pas de détail.
      const results = Array.isArray(sessionData.results) ? sessionData.results : [];
      const newlySeenIds = results.map((r) => r.questionId).filter(Boolean);
      const newSkillStats = { ...prev.skillStats };
      const newPartStats = { ...prev.partStats };
      let addWeightedCorrect = 0;
      let addWeightedTotal = 0;
      let addHardSeen = 0;
      if (results.length) {
        for (const r of results) {
          const skill = r.skill;
          if (skill && newSkillStats[skill]) {
            newSkillStats[skill] = {
              correct: newSkillStats[skill].correct + (r.correct ? 1 : 0),
              total: newSkillStats[skill].total + 1,
            };
          }
          const part = r.part;
          if (part && newPartStats[part]) {
            newPartStats[part] = {
              correct: newPartStats[part].correct + (r.correct ? 1 : 0),
              total: newPartStats[part].total + 1,
            };
          }
          const w = DIFFICULTY_WEIGHTS[r.difficulty] ?? 1.0;
          addWeightedTotal += w;
          if (r.correct) addWeightedCorrect += w;
          if ((r.difficulty ?? 1) >= 2) addHardSeen += 1;
        }
      } else if (sessionData.mode && newSkillStats[sessionData.mode]) {
        // Repli legacy (3 modes libres sans détail par question).
        newSkillStats[sessionData.mode] = {
          correct: newSkillStats[sessionData.mode].correct + sessionData.correct,
          total: newSkillStats[sessionData.mode].total + sessionData.total,
        };
        addWeightedTotal += sessionData.total;
        addWeightedCorrect += sessionData.correct;
      }
      const weightedCorrect = prev.weightedCorrect + addWeightedCorrect;
      const weightedTotal = prev.weightedTotal + addWeightedTotal;
      const hardSeen = prev.hardSeen + addHardSeen;
      const newEstimatedScore = estimateScore(weightedCorrect, weightedTotal, hardSeen);

      const accuracy = sessionData.total > 0 ? sessionData.correct / sessionData.total : 0;
      const newPerfectSessions = sessionData.correct === sessionData.total ? prev.perfectSessions + 1 : prev.perfectSessions;

      // Progression du module joué.
      let newModuleProgress = prev.moduleProgress;
      let newUnlockedLevel = prev.unlockedLevel;
      const moduleId = sessionData.moduleId;
      if (moduleId) {
        const prevMod = prev.moduleProgress[moduleId] || { completed: false, bestAccuracy: 0, stars: 0, attempts: 0, questionsSeen: 0, seenIds: [] };
        const bestAccuracy = Math.max(prevMod.bestAccuracy, accuracy);
        // Fenêtre glissante des dernières questions vues (bornée) — permet à
        // buildSession() de dé-prioriser les questions déjà jouées plutôt que
        // de retirer un lot identique à chaque session (épuisement de la
        // nouveauté après une seule partie).
        const seenIds = [...(prevMod.seenIds || []), ...newlySeenIds].slice(-MAX_SEEN_IDS);
        newModuleProgress = {
          ...prev.moduleProgress,
          [moduleId]: {
            completed: prevMod.completed || accuracy >= 0.7,
            bestAccuracy,
            stars: Math.max(prevMod.stars, starsFor(accuracy)),
            attempts: prevMod.attempts + 1,
            questionsSeen: prevMod.questionsSeen + sessionData.total,
            seenIds,
          },
        };
        // Bilan réussi → monter le niveau débloqué.
        const mod = getModule(moduleId);
        const toUnlock = levelToUnlockAfter(mod, accuracy);
        if (toUnlock && LEVEL_ORDER[toUnlock] > LEVEL_ORDER[prev.unlockedLevel]) {
          newUnlockedLevel = toUnlock;
        }
      }

      const newState = {
        ...prev,
        totalXP: newTotalXP,
        totalSessions: prev.totalSessions + 1,
        streak: newStreak,
        lastSessionDate: today,
        perfectSessions: newPerfectSessions,
        estimatedScore: newEstimatedScore,
        skillStats: newSkillStats,
        partStats: newPartStats,
        weightedCorrect,
        weightedTotal,
        hardSeen,
        moduleProgress: newModuleProgress,
        unlockedLevel: newUnlockedLevel,
        sessionHistory: [
          { mode: sessionData.mode, total: sessionData.total, correct: sessionData.correct, xpEarned: sessionData.xpEarned, moduleId: sessionData.moduleId || null, date: today, level },
          ...prev.sessionHistory,
        ].slice(0, 50),
      };

      // Badges
      const earnedBadges = [...newState.badges];
      for (const badge of BADGES) {
        if (!earnedBadges.includes(badge.id) && badge.condition(newState)) {
          earnedBadges.push(badge.id);
        }
      }
      newState.badges = earnedBadges;

      return newState;
    });
  }, []);

  // Enregistre le résultat du test de placement → fixe le niveau débloqué.
  const recordPlacement = useCallback((correct, total) => {
    const { level: placed } = resolvePlacement(correct, total);
    setState((prev) => ({
      ...prev,
      placementDone: true,
      placementLevel: placed,
      // Le placement débloque jusqu'au niveau atteint (sans rétrograder un acquis).
      unlockedLevel: LEVEL_ORDER[placed] > LEVEL_ORDER[prev.unlockedLevel] ? placed : prev.unlockedLevel,
    }));
    return placed;
  }, []);

  const resetProgress = useCallback(() => {
    setState({ ...DEFAULT_STATE, schemaVersion: SCHEMA_VERSION, partStats: { ...EMPTY_PART_STATS }, moduleProgress: {} });
  }, []);

  const { level, xpInLevel, xpForNext } = levelFromXP(state.totalXP);

  return {
    state,
    level,
    xpInLevel,
    xpForNext,
    recordSession,
    recordPlacement,
    resetProgress,
    saveError,
  };
}
