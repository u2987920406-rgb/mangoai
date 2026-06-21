// #140 — Logique de tutoriel extraite du god-component App.jsx.
// Cohésive : progression (nextTutorialId), session active (id + flag), et les
// transitions (start / next / exit / complete). Dépend de la navigation
// (setScreen) et des toasts — injectés par l'appelant pour rester découplé.
import { useState, useEffect, useCallback } from "react";
import { SCREENS } from "../nav.js";

export function useTutorial({ setScreen, pushToast }) {
  const [active, setActive] = useState(false);
  const [id, setId] = useState(null);
  const [nextId, setNextId] = useState(1);

  const refreshProgress = useCallback(() => {
    fetch("/api/tutorial/progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNextId(d ? d.nextTutorialId : 1))
      .catch(() => {});
  }, []);

  useEffect(() => { refreshProgress(); }, [refreshProgress]);

  const start = useCallback((tutId) => {
    setId(tutId);
    setActive(true);
  }, []);

  // Le tutoriel peut amener l'utilisateur sur un écran précis (ex. metrics).
  const enterContext = useCallback((ctx) => {
    if (ctx) setScreen(ctx);
  }, [setScreen]);

  const exit = useCallback(() => {
    setActive(false);
    setId(null);
    setScreen(SCREENS.HOME);
    refreshProgress();
  }, [setScreen, refreshProgress]);

  const startNext = useCallback((tutId) => {
    refreshProgress();
    setId(tutId);
    setActive(true);
  }, [refreshProgress]);

  const complete = useCallback((next) => {
    setNextId(next);
    setActive(false);
    setId(null);
    setScreen(SCREENS.HOME);
    if (next) {
      pushToast("success", `Tutoriel terminé 🎓 — prochain : ${next}/10`);
    } else {
      pushToast("success", "Tous les tutoriels sont terminés 🎉");
    }
  }, [setScreen, pushToast]);

  return { active, id, nextId, refreshProgress, start, enterContext, exit, startNext, complete };
}
