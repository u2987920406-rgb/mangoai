// #140 — Pilotage du backend Express généré (api/) extrait du god-component.
// Cohésif : statut + scaffold/start/stop, suit le projet courant. Dépend de
// projectName et des toasts (injectés). Rafraîchit le statut à chaque action.
import { useState, useEffect, useCallback } from "react";

export function useBackendServer({ projectName, pushToast }) {
  const [status, setStatus] = useState(null);

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
    pushToast("info", "Démarrage du backend (npm install si nécessaire)…");
    const r = await fetch(`/api/backend-server/${encodeURIComponent(projectName)}/start`, { method: "POST" });
    const d = await r.json();
    if (d.ok) {
      pushToast("ok", `Backend actif sur ${d.url}`);
    } else {
      pushToast("err", `Erreur backend : ${d.error}`);
    }
    refresh();
  }, [projectName, pushToast, refresh]);

  const stop = useCallback(async () => {
    await fetch(`/api/backend-server/${encodeURIComponent(projectName)}/stop`, { method: "POST" });
    pushToast("ok", "Backend arrêté");
    refresh();
  }, [projectName, pushToast, refresh]);

  return { status, refresh, scaffold, start, stop };
}
