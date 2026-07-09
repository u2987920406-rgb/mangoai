import { useEffect, useState } from "react";

// Fetch central du panneau Knowledge — extrait verbatim de Knowledge.jsx.
// Charge le knowledge agrégé (`data`) et les runs d'évolution des règles
// (`evoRuns`, endpoint séparé). Remonte au conteneur les setters pour que les
// sections mettent à jour l'état localement après leurs mutations.
export function useKnowledge(projectName) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Évolution des règles (idée #76) — null = pas encore chargé
  const [evoRuns, setEvoRuns] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/knowledge/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erreur HTTP ${r.status}`))))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message ?? String(e)));
    // Idée #76 — runs d'évolution des règles (endpoint séparé du knowledge agrégé)
    fetch("/api/prompt-evolution")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => alive && setEvoRuns(d.runs ?? []))
      .catch(() => alive && setEvoRuns([]));
    return () => {
      alive = false;
    };
  }, [projectName]);

  return { data, setData, error, evoRuns, setEvoRuns };
}
