// #140 — Historique de versions + rollback, extrait du god-component.
// Suit le projet courant. Le rollback est destructif → il passe par le modal de
// confirmation global (injecté via `confirm`) ; après restauration, il demande
// un rafraîchissement de l'aperçu (`onRolledBack`). pushToast injecté.
import { useState, useEffect, useCallback } from "react";

export function useVersions({ projectName, pushToast, confirm, onRolledBack }) {
  const [versions, setVersions] = useState([]);

  const refresh = useCallback(() => {
    if (!projectName.trim()) {
      setVersions([]);
      return;
    }
    fetch(`/api/versions/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d) => setVersions(d.versions ?? []))
      .catch(() => setVersions([]));
  }, [projectName]);

  useEffect(() => { refresh(); }, [refresh]);

  const rollback = useCallback(
    async (hash) => {
      try {
        const res = await fetch("/api/rollback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectName, hash }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          pushToast("error", d.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setVersions(d.versions ?? []);
        onRolledBack?.();
        pushToast("success", "Version restaurée");
      } catch (err) {
        pushToast("error", String(err));
      }
    },
    [projectName, pushToast, onRolledBack],
  );

  // Le rollback étant irréversible (perte des versions plus récentes), on passe
  // par le modal de confirmation global avant d'agir.
  const askRollback = useCallback(
    (hash) => {
      const v = versions.find((x) => x.hash === hash);
      if (!v) return;
      confirm({
        title: "Revenir à cette version ?",
        body: `« ${v.message} »\nLes versions plus récentes seront définitivement perdues.`,
        confirmLabel: "Revenir",
        onConfirm: () => rollback(hash),
      });
    },
    [versions, confirm, rollback],
  );

  return { versions, refresh, askRollback };
}
