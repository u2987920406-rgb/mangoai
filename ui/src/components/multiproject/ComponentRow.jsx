import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, FileCode2 } from "lucide-react";
import CategoryBadge from "./CategoryBadge.jsx";
import CopyPanel from "./CopyPanel.jsx";

// Ligne de fichier avec badge catégorie, aperçu et panneau de copie —
// extrait verbatim de MultiProject.jsx.
export default function ComponentRow({ component, project, allProjects, onCopied }) {
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
