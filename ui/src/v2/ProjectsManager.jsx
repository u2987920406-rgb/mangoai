// « Mes projets » — vue de gestion des projets du workspace (shell 2.0). Porte ce que la V1
// avait dans ProjectsWindow + les demandes de Raf : étoiles de revue par projet (#93),
// poubelle par projet, sélection multiple + suppression en lot, filtre « revus uniquement ».
// Données : GET /api/projects → { projects: string[], reviews: { nom: { score } } } (déjà servi).
import { useCallback, useEffect, useState } from "react";
import { Star, Trash2, FolderOpen, RefreshCw, CheckSquare, Square, Boxes } from "lucide-react";
import { useAppState } from "../state/AppState";
import { api } from "../api";
import ConfirmDelete from "../components/ConfirmDelete.jsx";
import { Button, EmptyState, cx, TEXT, SECTION_LABEL } from "../design";

/* Étoiles de revue : `score` pleines (jaune) + le reste en creux → note /5 lisible d'un coup d'œil. */
function Stars({ score }) {
  if (!score) return <span className="text-[11px] text-faint">non noté</span>;
  return (
    <span className="flex shrink-0 items-center gap-px" title={`Revu — ${score}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          strokeWidth={0}
          className={i < score ? "fill-warn text-warn" : "fill-edge text-edge"}
        />
      ))}
    </span>
  );
}

export default function ProjectsManager() {
  const { openProject, pushToast } = useAppState();
  const [projects, setProjects] = useState(null); // null = chargement
  const [reviews, setReviews] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api("/api/projects")
      .then((d) => { setProjects(d.projects ?? []); setReviews(d.reviews ?? {}); })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const shown = (projects ?? []).filter((p) => (reviewedOnly ? (reviews[p]?.score ?? 0) > 0 : true));

  const toggle = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allShownSelected) { const n = new Set(prev); shown.forEach((p) => n.delete(p)); return n; }
      const n = new Set(prev); shown.forEach((p) => n.add(p)); return n;
    });
  };

  const deleteOne = async (name) => {
    try {
      await api(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
      setProjects((prev) => (prev ?? []).filter((x) => x !== name));
      setSelected((prev) => { const n = new Set(prev); n.delete(name); return n; });
      pushToast("ok", `Projet « ${name} » supprimé`);
    } catch {
      pushToast("error", `Suppression de « ${name} » impossible`);
    }
  };

  const deleteSelected = async () => {
    const names = shown.filter((p) => selected.has(p));
    if (names.length === 0) return;
    setBusy(true);
    let ok = 0;
    for (const name of names) {
      try { await api(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" }); ok++; }
      catch { /* on continue les autres */ }
    }
    setBusy(false);
    setSelected(new Set());
    refresh();
    pushToast(ok === names.length ? "ok" : "error", `${ok}/${names.length} projet(s) supprimé(s)`);
  };

  const selectedShownCount = shown.filter((p) => selected.has(p)).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre du haut : titre + filtre + rafraîchir */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-edge-soft px-5 py-2.5">
        <h2 className={cx(TEXT.base, "font-medium text-ink")}>Mes projets</h2>
        <span className="text-[11px] text-faint">{(projects ?? []).length} projet{(projects ?? []).length > 1 ? "s" : ""}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setReviewedOnly((v) => !v)}
            className={cx(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
              reviewedOnly ? "border-accent/50 bg-accent/10 text-accent" : "border-edge text-dim hover:border-faint hover:text-ink",
            )}
            title="N'afficher que les projets déjà notés (apps revues)"
          >
            <Star size={12} className={reviewedOnly ? "fill-accent" : ""} /> Revus uniquement
          </button>
          <Button variant="ghost" size="sm" iconOnly icon={<RefreshCw size={14} />} title="Rafraîchir" aria-label="Rafraîchir" onClick={refresh} />
        </div>
      </div>

      {/* Barre de sélection en lot (n'apparaît que si une sélection existe) */}
      {selectedShownCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-edge-soft bg-accent/[0.05] px-5 py-2">
          <span className={cx(TEXT.base, "text-ink")}>{selectedShownCount} sélectionné{selectedShownCount > 1 ? "s" : ""}</span>
          <button onClick={() => setSelected(new Set())} className="text-[12px] text-dim hover:text-ink">Tout désélectionner</button>
          <ConfirmDelete
            className="ml-auto"
            onConfirm={deleteSelected}
            confirmLabel={busy ? "Suppression…" : `Supprimer les ${selectedShownCount}`}
            message={`Supprimer ${selectedShownCount} projet(s) ? Cette action est irréversible.`}
            triggerClassName="flex items-center gap-1.5 rounded-lg bg-err/90 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-err transition-colors"
            triggerTitle="Supprimer la sélection"
          >
            <Trash2 size={13} /> Supprimer la sélection
          </ConfirmDelete>
        </div>
      )}

      {/* Liste */}
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {projects === null ? (
          <div className={cx(TEXT.base, "py-10 text-center text-faint")}>Chargement…</div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Boxes size={30} />}
            title={reviewedOnly ? "Aucun projet noté" : "Aucun projet"}
            description={reviewedOnly ? "Note un projet dans la Revue du build pour le voir apparaître ici." : "Crée un projet depuis l'App Builder."}
            action={reviewedOnly ? <Button variant="secondary" onClick={() => setReviewedOnly(false)}>Voir tous les projets</Button> : null}
          />
        ) : (
          <div className="mx-auto w-full max-w-[820px]">
            {/* En-tête de tableau : tout sélectionner */}
            <div className="mb-2 flex items-center gap-2 px-1">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-[11px] text-dim hover:text-ink" title="Tout sélectionner">
                {allShownSelected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
                <span className={SECTION_LABEL}>Tout</span>
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {shown.map((p) => {
                const score = reviews[p]?.score ?? 0;
                const isSel = selected.has(p);
                return (
                  <div
                    key={p}
                    className={cx(
                      "group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors",
                      isSel ? "border-accent/50 bg-accent/[0.06]" : "border-edge bg-panel hover:border-faint",
                    )}
                  >
                    <button onClick={() => toggle(p)} title={isSel ? "Désélectionner" : "Sélectionner"} className="shrink-0 text-dim hover:text-accent">
                      {isSel ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                    </button>
                    <button onClick={() => openProject(p)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" title="Ouvrir dans l'App Builder">
                      <FolderOpen size={15} className="shrink-0 text-faint group-hover:text-accent" />
                      <span className="truncate text-[13px] font-medium text-ink">{p}</span>
                      <Stars score={score} />
                    </button>
                    <Button variant="ghost" size="sm" icon={<FolderOpen size={13} />} onClick={() => openProject(p)} className="shrink-0">Ouvrir</Button>
                    <ConfirmDelete
                      onConfirm={() => deleteOne(p)}
                      message={`Supprimer « ${p} » ? Cette action est irréversible.`}
                      triggerClassName="shrink-0 rounded-lg p-1.5 text-faint opacity-0 transition-opacity hover:text-err group-hover:opacity-100"
                      triggerTitle="Supprimer ce projet"
                    >
                      <Trash2 size={14} />
                    </ConfirmDelete>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
