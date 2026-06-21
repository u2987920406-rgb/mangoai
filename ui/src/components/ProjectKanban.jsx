import { useCallback, useEffect, useState } from "react";
import { Hammer, Plus, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Route as RouteIcon } from "lucide-react";

// #139 Mode Gros Projet — le Kanban de pages/stages câblé au cockpit.
// Source de vérité = .project-plan.json (serveur). 1 carte = 1 incrément borné.
// « Construire » envoie un tour /api/chat (mode projet) limité à cet incrément.

const COLUMNS = [
  { id: "todo", label: "À faire", tone: "text-faint" },
  { id: "doing", label: "En cours", tone: "text-warn" },
  { id: "done", label: "Fait", tone: "text-ok" },
];

const ORDER = ["todo", "doing", "done"];

export default function ProjectKanban({ projectName, onBuild, refreshKey = 0, busy = false }) {
  const [plan, setPlan] = useState(null);
  const [flux, setFlux] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState("");

  const fetchPlan = useCallback(async () => {
    if (!projectName) return;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/plan`);
      const data = await res.json().catch(() => ({}));
      setPlan(data.plan ?? null);
      setFlux(data.flux ?? null);
    } catch {
      setPlan(null);
      setFlux(null);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    setLoading(true);
    fetchPlan();
  }, [fetchPlan, refreshKey]);

  async function putIncrements(increments) {
    if (!plan) return;
    setPlan({ ...plan, increments }); // optimiste
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ increments }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.plan) setPlan(data.plan);
    } catch {
      fetchPlan(); // resynchronise en cas d'échec
    }
  }

  function moveStatus(inc, dir) {
    const idx = ORDER.indexOf(inc.status);
    const next = ORDER[idx + dir];
    if (!next) return;
    putIncrements(plan.increments.map((i) => (i.id === inc.id ? { ...i, status: next } : i)));
  }

  function addIncrement() {
    const title = adding.trim();
    if (!title || !plan) return;
    const slug = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    if (!slug || plan.increments.some((i) => i.id === slug)) { setAdding(""); return; }
    putIncrements([...plan.increments, { id: slug, kind: "page", title, status: "todo" }]);
    setAdding("");
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-dim">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Hammer size={26} className="text-faint" />
        <p className="text-sm text-dim">Pas encore de chantier pour ce projet.</p>
        <p className="text-[12px] leading-relaxed text-faint">
          Sélectionne le mode <span className="text-accent-soft">🏗️ Gros Projet</span> dans l'en-tête et décris
          ton site multi-pages ou ton jeu. Le 1ᵉʳ tour pose le squelette (router + design system + pages
          placeholder) et remplit ce Kanban.
        </p>
      </div>
    );
  }

  const done = plan.increments.filter((i) => i.status === "done").length;
  const total = plan.increments.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      {/* En-tête : squelette + avancement + cohérence flux */}
      <div className="shrink-0 border-b border-edge px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            Squelette {plan.skeleton.status === "done" ? "✅" : "⏳"}
          </span>
          <span className="text-[12px] text-dim">
            {done}/{total} · {pct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-edge-soft">
          <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
        </div>
        {flux && (flux.fluxMeasured > 0 || flux.fluxConvergence > 0) && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <AlertTriangle size={12} className="text-warn" />
            <span className="text-faint">
              Cohérence flux : {flux.fluxMeasured} route(s) morte(s) · {flux.fluxConvergence} suspect(s)
            </span>
          </div>
        )}
      </div>

      {/* Colonnes */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-2">
        {COLUMNS.map((col) => {
          const items = plan.increments.filter((i) => i.status === col.id);
          return (
            <div key={col.id} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <span className={`text-[11px] font-semibold ${col.tone}`}>{col.label}</span>
                <span className="text-[11px] text-faint">{items.length}</span>
              </div>
              {items.length === 0 && (
                <div className="rounded-lg border border-dashed border-edge px-2 py-3 text-center text-[10px] text-faint">
                  —
                </div>
              )}
              {items.map((inc) => (
                <div
                  key={inc.id}
                  className="flex flex-col gap-1.5 rounded-lg border border-edge bg-panel/60 p-2 transition-colors hover:border-faint"
                >
                  <span className="text-[12px] font-medium leading-snug text-ink">{inc.title}</span>
                  {inc.route && (
                    <span className="flex items-center gap-1 truncate font-mono text-[10px] text-faint">
                      <RouteIcon size={9} /> {inc.route}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => moveStatus(inc, -1)}
                        disabled={inc.status === "todo"}
                        title="Reculer"
                        className="rounded p-0.5 text-dim hover:bg-edge-soft hover:text-ink disabled:opacity-25"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <button
                        onClick={() => moveStatus(inc, 1)}
                        disabled={inc.status === "done"}
                        title="Avancer"
                        className="rounded p-0.5 text-dim hover:bg-edge-soft hover:text-ink disabled:opacity-25"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                    {inc.status !== "done" && (
                      <button
                        onClick={() => onBuild?.(inc)}
                        disabled={busy || plan.skeleton.status !== "done"}
                        title={plan.skeleton.status !== "done" ? "Pose d'abord le squelette" : "Construire cet incrément"}
                        className="flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-soft hover:bg-accent/20 disabled:opacity-40"
                      >
                        <Hammer size={10} /> Construire
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Ajout d'incrément */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-edge p-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addIncrement()}
          placeholder="Ajouter une page / un stage…"
          className="min-w-0 flex-1 rounded-lg border border-edge bg-panel px-2.5 py-1.5 text-[12px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          onClick={addIncrement}
          disabled={!adding.trim()}
          className="flex items-center gap-1 rounded-lg border border-edge bg-panel px-2 py-1.5 text-[12px] text-dim hover:border-faint hover:text-ink disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}
