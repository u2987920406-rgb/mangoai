import { useState, useEffect } from "react";
import { ArrowLeft, Layers, Sparkles, RefreshCw, Search } from "lucide-react";
import CategoryFilters from "./multiproject/CategoryFilters.jsx";
import Toast from "./multiproject/Toast.jsx";
import ProjectCard from "./multiproject/ProjectCard.jsx";
import SemanticResultRow from "./multiproject/SemanticResultRow.jsx";

// --- Page principale ---
export default function MultiProject({ onBack }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState(new Set());

  // Recherche sémantique (Phase 3 idée #26)
  const [searchMode, setSearchMode] = useState("name"); // "name" | "semantic"
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] = useState([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [needsIndex, setNeedsIndex] = useState(false);
  const [indexing, setIndexing] = useState(false);

  useEffect(() => {
    fetch("/api/multi-project/components")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => setLoading(false));
  }, []);

  function handleCopied(message) {
    setToast(message);
  }

  function toggleCategory(cat) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

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
      setToast(
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
      setToast(err instanceof Error ? err.message : "Erreur d'indexation");
    } finally {
      setIndexing(false);
    }
  }

  // Filtrage textuel
  const filtered = search.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.components.some((c) => c.file.toLowerCase().includes(search.toLowerCase()))
      )
    : projects;

  const totalComponents = projects.reduce((acc, p) => acc + p.componentCount, 0);

  // Compter les catégories présentes dans les projets chargés
  const presentCategories = new Set(
    projects.flatMap((p) => p.components.map((c) => c.category ?? "other"))
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-edge bg-panel/90 backdrop-blur px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-dim hover:text-ink hover:bg-bg transition-colors"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
          <div className="h-5 w-px bg-edge" />
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Layers size={18} style={{ color: "#9678ff" }} />
            <h1 className="font-bold text-ink truncate">Multi-projets — Bibliothèque de fichiers</h1>
          </div>
          {!loading && (
            <span className="text-xs text-dim flex-shrink-0">
              {projects.length} projet{projects.length > 1 ? "s" : ""} · {totalComponents} fichiers
            </span>
          )}
        </div>
      </header>

      {/* Contenu */}
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Barre d'outils : toggle mode de recherche + ré-indexer */}
          {!loading && projects.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-lg border border-edge bg-panel p-0.5">
                  <button
                    onClick={() => setSearchMode("name")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "name" ? "bg-bg text-ink" : "text-dim hover:text-ink"
                    }`}
                  >
                    <Search size={13} />
                    Par nom
                  </button>
                  <button
                    onClick={() => setSearchMode("semantic")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "semantic" ? "bg-bg text-ink" : "text-dim hover:text-ink"
                    }`}
                  >
                    <Sparkles size={13} style={searchMode === "semantic" ? { color: "#9678ff" } : undefined} />
                    Recherche sémantique
                  </button>
                </div>

                <button
                  onClick={runReindex}
                  disabled={indexing}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs text-dim hover:text-ink hover:border-accent-soft transition-colors disabled:opacity-50"
                  title="Re-générer l'index sémantique (résumés des fichiers)"
                >
                  <RefreshCw size={13} className={indexing ? "animate-spin" : ""} />
                  {indexing ? "Indexation…" : "Ré-indexer"}
                </button>
              </div>

              {/* Mode : recherche par nom (existante) */}
              {searchMode === "name" && (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un projet ou un fichier…"
                      className="w-full rounded-xl border border-edge bg-panel px-4 py-3 pl-10 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-dim"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </div>

                  {/* Toggles catégories (uniquement si des catégories multiples existent) */}
                  {presentCategories.size > 1 && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-dim">Filtrer :</span>
                      <CategoryFilters
                        active={activeCategories}
                        onChange={toggleCategory}
                      />
                      {activeCategories.size > 0 && (
                        <button
                          onClick={() => setActiveCategories(new Set())}
                          className="text-xs text-dim hover:text-ink transition-colors underline underline-offset-2"
                        >
                          Tout afficher
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Mode : recherche sémantique */}
              {searchMode === "semantic" && (
                <div className="space-y-3">
                  <form onSubmit={runSemanticSearch} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        placeholder="Décris ce que tu cherches (ex. « bouton de copie avec confirmation »)…"
                        className="w-full rounded-xl border border-edge bg-panel px-4 py-3 pl-10 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
                      />
                      <Sparkles size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
                    </div>
                    <button
                      type="submit"
                      disabled={semanticLoading || !semanticQuery.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-sm font-medium transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: "#9678ff", color: "#0b0d12" }}
                    >
                      {semanticLoading ? (
                        <span className="animate-spin inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full" />
                      ) : (
                        <Search size={14} />
                      )}
                      Rechercher
                    </button>
                  </form>

                  {needsIndex && (
                    <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-5 py-4 flex items-start gap-3">
                      <Sparkles size={16} className="text-yellow-300 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-yellow-300 font-medium">Index sémantique vide</p>
                        <p className="text-xs text-dim mt-1">
                          Lance une première indexation pour générer les résumés de tes fichiers, puis recherche par intention.
                        </p>
                        <button
                          onClick={runReindex}
                          disabled={indexing}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/40 px-3 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={indexing ? "animate-spin" : ""} />
                          {indexing ? "Indexation…" : "Indexer maintenant"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Résultats sémantiques */}
                  {semanticLoading ? (
                    <div className="text-center py-8 text-sm text-dim animate-pulse">Recherche en cours…</div>
                  ) : semanticResults.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-dim">
                        {semanticResults.length} résultat{semanticResults.length > 1 ? "s" : ""} trié{semanticResults.length > 1 ? "s" : ""} par pertinence
                      </p>
                      {semanticResults.map((r) => (
                        <SemanticResultRow key={`${r.project}/${r.file}`} result={r} />
                      ))}
                    </div>
                  ) : (
                    semanticQuery.trim() && !needsIndex && (
                      <div className="text-center py-8 text-sm text-dim">
                        Aucun résultat pour «&nbsp;<span className="text-ink">{semanticQuery}</span>&nbsp;».
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* États */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-edge border-t-accent-soft" style={{ borderTopColor: "#9678ff" }} />
              <p className="text-sm text-dim">Scan des projets…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <Layers size={40} className="text-faint" />
              <p className="text-ink font-medium">Aucun fichier trouvé</p>
              <p className="text-sm text-dim max-w-sm">
                Génère d'abord des projets dans MangoOS. Les fichiers{" "}
                <code className="text-faint">.jsx</code>, <code className="text-faint">.tsx</code>,{" "}
                <code className="text-faint">.ts</code> et <code className="text-faint">.js</code>{" "}
                apparaîtront ici automatiquement.
              </p>
            </div>
          )}

          {searchMode === "name" && !loading && !error && filtered.length === 0 && projects.length > 0 && (
            <div className="text-center py-12 text-sm text-dim">
              Aucun résultat pour "<span className="text-ink">{search}</span>"
            </div>
          )}

          {/* Liste des projets (mode recherche par nom uniquement) */}
          {searchMode === "name" && !loading && !error && (
            <div className="space-y-4">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.name}
                  project={project}
                  allProjects={projects}
                  onCopied={handleCopied}
                  activeCategories={activeCategories}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
