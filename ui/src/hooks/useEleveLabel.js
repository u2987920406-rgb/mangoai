import { useEffect, useState } from "react";
import { shortModelLabel } from "../components/chat/helpers.js";

// Raf (2026-07-11) : "eleve" n'a pas de nom fixe — c'est le cerveau local RÉELLEMENT
// configuré dans Réglages (brain-registry.json → orchestrateur), pas un nom codé en
// dur qui restait bloqué sur "GLM-5.2" quel que soit le choix fait. Un seul hook
// partagé (Header, composer…) : un fetch, best-effort, jamais bloquant.
export function useEleveLabel() {
  const [eleveLabel, setEleveLabel] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/brain-registry")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const label = shortModelLabel(data.registry?.orchestrateur?.model);
        if (label) setEleveLabel(label);
      })
      .catch(() => { /* repli silencieux sur le libellé statique */ });
    return () => { cancelled = true; };
  }, []);
  return eleveLabel;
}
