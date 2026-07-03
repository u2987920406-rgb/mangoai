// #140 — Pilotage du backend Express généré (api/) extrait du god-component.
// Cohésif : statut + scaffold/start/stop, suit le projet courant. Dépend de
// projectName et des toasts (injectés). Rafraîchit le statut à chaque action.
import { useState, useEffect, useCallback } from "react";

export function useBackendServer({ projectName, pushToast }) {
  const [status, setStatus] = useState(null);
  // (Un, 2026-07-03) U7 — garde in-flight : un double-clic sur « Démarrer »
  // lançait DEUX npm install + deux serveurs Express → process orphelin qui
  // squatte le port. Tant qu'un démarrage est en cours, on refuse le second.
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(() => {
    if (!projectName.trim()) { setStatus(null); return; }
    fetch(`/api/backend-server/${encodeURIComponent(projectName)}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, [projectName]);

  useEffect(() => { refresh(); }, [refresh]);

  const scaffold = useCallback(async () => {
    await fetch(`/api/backend-server/${encodeURIComponent(projectName)}/scaffold`, { method: "POST" });
    pushToast("ok", "Backend Express scaffoldé dans api/ — cliquer 'Démarrer api' pour le lancer");
    refresh();
  }, [projectName, pushToast, refresh]);

  const start = useCallback(async () => {
    if (starting) return; // (Un, 2026-07-03) U7 — un démarrage à la fois
    setStarting(true);
    pushToast("info", "Démarrage du backend (npm install si nécessaire)…");
    try {
      const r = await fetch(`/api/backend-server/${encodeURIComponent(projectName)}/start`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        pushToast("ok", `Backend actif sur ${d.url}`);
      } else {
        pushToast("err", `Erreur backend : ${d.error}`);
      }
      refresh();
    } finally {
      setStarting(false);
    }
  }, [starting, projectName, pushToast, refresh]);

  const stop = useCallback(async () => {
    await fetch(`/api/backend-server/${encodeURIComponent(projectName)}/stop`, { method: "POST" });
    pushToast("ok", "Backend arrêté");
    refresh();
  }, [projectName, pushToast, refresh]);

  return { status, starting, refresh, scaffold, start, stop };
}
