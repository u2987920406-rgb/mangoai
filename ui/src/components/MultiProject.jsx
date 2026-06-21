import { useState, useEffect } from "react";
import { ArrowLeft, Layers, ChevronDown, ChevronRight, Copy, Check, X, FileCode2, Sparkles, RefreshCw, Search } from "lucide-react";

// --- Badges catégorie ---
const CATEGORY_META = {
  component: { label: "composant", className: "bg-purple-500/15 text-purple-300" },
  hook:      { label: "hook",      className: "bg-blue-500/15 text-blue-300" },
  util:      { label: "utilitaire",className: "bg-teal-500/15 text-teal-300" },
  service:   { label: "service",   className: "bg-orange-500/15 text-orange-300" },
  type:      { label: "type",      className: "bg-yellow-500/15 text-yellow-300" },
  other:     { label: "autre",     className: "bg-zinc-500/15 text-zinc-400" },
};

function CategoryBadge({ category }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

// --- Toggles filtre catégorie ---
const ALL_CATEGORIES = Object.keys(CATEGORY_META);

function CategoryFilters({ active, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_CATEGORIES.map((cat) => {
        const meta = CATEGORY_META[cat];
        const isActive = active.has(cat);
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              isActive
                ? `${meta.className} border-current`
                : "border-edge text-dim hover:text-ink"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Toast ---
function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-edge bg-panel px-5 py-3 shadow-lg">
      <Check size={16} className="text-green-400" />
      <span className="text-sm text-ink">{message}</span>
      <button onClick={onClose} className="text-dim hover:text-ink transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

// --- CopyPanel avec gestion 409 ---
function CopyPanel({ projects, sourceProject, sourceFile, onClose }) {
  const [targetProject, setTargetProject] = useState("");
  const [targetFile, setTargetFile] = useState(() => {
    const parts = sourceFile.split("/");
    return parts[parts.length - 1] ?? sourceFile;
  });
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const availableTargets = projects.filter((p) => p.name !== sourceProject);

  async function doCopy(overwrite = false) {
    setCopying(true);
    setError("");
    setConfirmOverwrite(false);
    try {
      const resp = await fetch("/api/multi-project/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProject,
          sourceFile,
          targetProject,
          targetFile: `src/components/${targetFile.trim()}`,
          overwrite,
        }),
      });
      const data = await resp.json();
      if (resp.status === 409 && data.exists) {
        // Fichier cible déjà présent — demander confirmation
        setConfirmOverwrite(true);
        return;
      }
      if (!resp.ok) throw new Error(data.error ?? "Erreur inconnue");
      onClose(true, `Copié dans ${targetProject}/src/components/${targetFile.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopying(false);
    }
  }

  async function handleCopy() {
    if (!targetProject || !targetFile.trim()) {
      setError("Sélectionne un projet cible et un nom de fichier.");
      return;
    }
    await doCopy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-edge bg-bg p-4 space-y-3">
      <p className="text-xs text-dim font-medium uppercase tracking-wide">Copier vers...</p>

      <div className="space-y-2">
        <label className="block text-xs text-dim">Projet cible</label>
        <select
          value={targetProject}
          onChange={(e) => { setTargetProject(e.target.value); setConfirmOverwrite(false); }}
          className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-soft"
        >
          <option value="">-- Choisir un projet --</option>
          {availableTargets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-dim">Nom du fichier (dans src/components/)</label>
        <input
          type="text"
          value={targetFile}
          onChange={(e) => { setTargetFile(e.target.value); setConfirmOverwrite(false); }}
          placeholder="MonComposant.jsx"
          className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft"
        />
      </div>

      {/* Bandeau de confirmation écrasement (409) */}
      {confirmOverwrite && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 space-y-2">
          <p className="text-xs text-yellow-300 font-medium">
            Le fichier <code className="font-mono">{targetFile.trim()}</code> existe déjà dans {targetProject}/src/components/. Écraser ?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => doCopy(true)}
              disabled={copying}
              className="rounded-md bg-yellow-500/20 border border-yellow-500/40 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
            >
              {copying ? "Copie…" : "Oui, écraser"}
            </button>
            <button
              onClick={() => setConfirmOverwrite(false)}
              className="rounded-md border border-edge px-3 py-1 text-xs text-dim hover:text-ink transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!confirmOverwrite && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#9678ff", color: "#0b0d12" }}
          >
            {copying ? (
              <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
            ) : (
              <Copy size={13} />
            )}
            {copying ? "Copie…" : "Copier"}
          </button>
          <button
            onClick={() => onClose(false)}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-dim hover:text-ink transition-colors"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

// --- ComponentRow avec badge catégorie ---
function ComponentRow({ component, project, allProjects, onCopied }) {
  const [expanded, setExpanded] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [fullContent, setFullContent] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const fileName = component.file.split("/").pop();
  const sizeKb = (component.size / 1024).toFixed(1);

  async function loadFullContent() {
    if (fullContent !== null) return;
    setLoadingContent(true);
    try {
      const resp = await fetch(
        `/api/multi-project/file?project=${encodeURIComponent(project)}&file=${encodeURIComponent(component.file)}`
      );
      const data = await resp.json();
      setFullContent(data.content ?? "");
    } catch {
      setFullContent("// Erreur lors du chargement");
    } finally {
      setLoadingContent(false);
    }
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadFullContent();
    if (!next) setShowCopy(false);
  }

  function handleCopyClose(success, message) {
    setShowCopy(false);
    if (success) onCopied(message);
  }

  return (
    <div className="rounded-lg border border-edge bg-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FileCode2 size={14} className="text-dim flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-ink font-medium truncate">{fileName}</p>
            <CategoryBadge category={component.category ?? "other"} />
          </div>
          <p className="text-xs text-faint mt-0.5">{sizeKb} ko · {component.file}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowCopy(!showCopy); if (!expanded) { setExpanded(true); loadFullContent(); } }}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-dim hover:text-ink hover:border-accent-soft transition-colors"
          >
            <Copy size={12} />
            <span>Copier vers…</span>
          </button>
          <button
            onClick={handleExpand}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-xs text-dim hover:text-ink transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{expanded ? "Réduire" : "Aperçu"}</span>
          </button>
        </div>
      </div>

      {/* Preview 3 lignes toujours visible en aperçu rapide */}
      {!expanded && component.preview.length > 0 && (
        <div className="border-t border-edge px-4 py-3 bg-panel">
          <pre className="text-xs text-dim font-mono leading-relaxed overflow-x-auto">
            {component.preview.join("\n")}
            {component.preview.length >= 3 && <span className="text-faint">…</span>}
          </pre>
        </div>
      )}

      {/* Contenu complet */}
      {expanded && (
        <div className="border-t border-edge">
          {loadingContent ? (
            <div className="px-4 py-4 text-xs text-dim animate-pulse">Chargement…</div>
          ) : (
            <div className="px-4 py-3 bg-panel max-h-72 overflow-y-auto">
              <pre className="text-xs text-dim font-mono leading-relaxed whitespace-pre-wrap break-all">
                {fullContent ?? component.preview.join("\n")}
              </pre>
            </div>
          )}
          {showCopy && (
            <div className="border-t border-edge px-4 pb-4 bg-bg">
              <CopyPanel
                projects={allProjects}
                sourceProject={project}
                sourceFile={component.file}
                onClose={handleCopyClose}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- ProjectCard ---
function ProjectCard({ project, allProjects, onCopied, activeCategories }) {
  const [open, setOpen] = useState(false);

  // Filtrer les composants selon les catégories actives
  const visibleComponents = activeCategories.size === 0
    ? project.components
    : project.components.filter((c) => activeCategories.has(c.category ?? "other"));

  if (visibleComponents.length === 0) return null;

  return (
    <div className="rounded-xl border border-edge bg-panel overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-bg/40 transition-colors text-left"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg border border-edge flex-shrink-0">
          <Layers size={16} className="text-accent-soft" style={{ color: "#9678ff" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink truncate">{project.name}</p>
          <p className="text-xs text-dim mt-0.5">
            {visibleComponents.length} fichier{visibleComponents.length > 1 ? "s" : ""}
            {activeCategories.size > 0 && ` (filtrés sur ${project.componentCount} total)`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{ background: "rgba(150,120,255,0.15)", color: "#9678ff" }}
          >
            {visibleComponents.length}
          </span>
          {open ? (
            <ChevronDown size={16} className="text-dim" />
          ) : (
            <ChevronRight size={16} className="text-dim" />
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-edge px-4 py-4 space-y-3 bg-bg/30">
          {visibleComponents.map((comp) => (
            <ComponentRow
              key={comp.file}
              component={comp}
              project={project.name}
              allProjects={allProjects}
              onCopied={onCopied}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Ligne de résultat de recherche sémantique ---
function SemanticResultRow({ result }) {
  const fileName = result.file.split("/").pop();
  return (
    <div className="rounded-lg border border-edge bg-bg px-4 py-3">
      <div className="flex items-start gap-3">
        <FileCode2 size={14} className="text-dim flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-ink font-medium truncate">{fileName}</p>
            <CategoryBadge category={result.category ?? "other"} />
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(150,120,255,0.15)", color: "#9678ff" }}
            >
              score {result.score}
            </span>
          </div>
          <p className="text-xs text-faint mt-0.5 font-mono truncate">
            {result.project}/{result.file}
          </p>
          {result.summary && (
            <p className="text-xs text-dim mt-1.5 leading-relaxed">{result.summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}

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
