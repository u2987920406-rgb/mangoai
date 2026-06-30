import { useState, useEffect, useCallback } from "react";
import { BADGES, levelFromXP } from "../data/questions.js";

const STORAGE_KEY = "toeicquest_progress_v1";

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
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, skillStats: { ...DEFAULT_STATE.skillStats, ...(parsed.skillStats || {}) } };
  } catch {
    return { ...DEFAULT_STATE };
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

export function useProgress() {
  const [state, setState] = useState(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
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

      const newTotalXP = prev.totalXP + sessionData.xpEarned;
      const { level } = levelFromXP(newTotalXP);

      // Update skill stats
      const skillKey = sessionData.mode;
      const prevSkill = prev.skillStats[skillKey] || { correct: 0, total: 0 };
      const newSkillStats = {
        ...prev.skillStats,
        [skillKey]: {
          correct: prevSkill.correct + sessionData.correct,
          total: prevSkill.total + sessionData.total,
        },
      };

      // Update estimated score (weighted by accuracy across all skills)
      const allCorrect = newSkillStats.listening.correct + newSkillStats.reading.correct + newSkillStats.vocab.correct;
      const allTotal = newSkillStats.listening.total + newSkillStats.reading.total + newSkillStats.vocab.total;
      const accuracy = allTotal > 0 ? allCorrect / allTotal : 0;
      const newEstimatedScore = Math.round(250 + accuracy * 740);

      const newPerfectSessions = sessionData.correct === sessionData.total ? prev.perfectSessions + 1 : prev.perfectSessions;

      const newState = {
        ...prev,
        totalXP: newTotalXP,
        totalSessions: prev.totalSessions + 1,
        streak: newStreak,
        lastSessionDate: today,
        perfectSessions: newPerfectSessions,
        estimatedScore: newEstimatedScore,
        skillStats: newSkillStats,
        sessionHistory: [
          { ...sessionData, date: today, level },
          ...prev.sessionHistory,
        ].slice(0, 50),
      };

      // Check badges
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

  const resetProgress = useCallback(() => {
    setState({ ...DEFAULT_STATE });
  }, []);

  const { level, xpInLevel, xpForNext } = levelFromXP(state.totalXP);

  return {
    state,
    level,
    xpInLevel,
    xpForNext,
    recordSession,
    resetProgress,
  };
}