import { useState } from "react";

// Cluster « recherche sémantique » (Phase 3 idée #26) du panneau Multi-projets —
// extrait verbatim de MultiProject.jsx. Les messages de statut remontent au
// conteneur via onToast (qui alimente le Toast global de la page).
export function useSemanticSearch(onToast) {
  const [searchMode, setSearchMode] = useState("name"); // "name" | "semantic"
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [needsIndex, setNeedsIndex] = useState(false);
  const [indexing, setIndexing] = useState(false);

  async function runSemanticSearch(e) {
    e?.preventDefault();
    const q = semanticQuery.trim();
    if (!q) {
      setSemanticResults([]);
      return;
    }
    setSemanticLoading(true);
    try {
      const resp = await fetch(`/api/multi-project/search?q=${encodeURIComponent(q)}`);
      const data = await resp.json();
      setSemanticResults(data.results ?? []);
      setNeedsIndex(Boolean(data.needsIndex));
    } catch {
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  }

  async function runReindex() {
    setIndexing(true);
    try {
      const resp = await fetch("/api/multi-project/index", { method: "POST" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Erreur d'indexation");
      setNeedsIndex(false);
      onToast(
        `Index à jour — ${data.indexed} indexé${data.indexed > 1 ? "s" : ""}, ` +
        `${data.reused} réutilisé${data.reused > 1 ? "s" : ""}, ${data.total} au total` +
        (data.removed > 0 ? ` (${data.removed} retiré${data.removed > 1 ? "s" : ""})` : "")
      );
      // Relancer la recherche courante si une requête est en cours
      if (semanticQuery.trim()) {
        const r = await fetch(`/api/multi-project/search?q=${encodeURIComponent(semanticQuery.trim())}`);
        const d = await r.json();
        setSemanticResults(d.results ?? []);
        setNeedsIndex(Boolean(d.needsIndex));
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Erreur d'indexation");
    } finally {
      setIndexing(false);
    }
  }

  return {
    searchMode, setSearchMode,
    semanticQuery, setSemanticQuery,
    semanticResults,
    semanticLoading,
    needsIndex,
    indexing,
    runSemanticSearch,
    runReindex,
  };
}
