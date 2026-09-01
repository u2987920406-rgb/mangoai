import { useState } from "react";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import ComponentRow from "./ComponentRow.jsx";

// Carte projet dépliable listant ses fichiers filtrés — extrait verbatim de
// MultiProject.jsx.
export default function ProjectCard({ project, allProjects, onCopied, activeCategories }) {
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
          <Layers size={16} className="text-accent-soft" style={{ color: "#ff9500" }} />
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
            style={{ background: "rgba(255,149,0,0.15)", color: "#c96a00" }}
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
