import { useEffect, useState } from "react";
import { ArrowLeft, Webhook } from "lucide-react";

// (#172, Phase 4) Onglet « Hooks » — inspection LECTURE SEULE des gardes déclaratives
// d'un projet (event + matcher + handler), lues depuis <projet>/.hooks/hooks.json via
// GET /api/hooks. L'édition se fait dans le fichier (V1, pas d'éditeur graphique).

const EVENT_LABELS = {
  PreToolUse: "Avant un outil",
  PostToolUse: "Après un outil",
  PreFinish: "Avant de finir",
  OnBlock: "Sur blocage",
  OnEscalate: "Sur escalade",
  OnGapRecorded: "Sur lacune notée",
};

export default function HooksPanel({ onBack }) {
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((list) => {
        const names = Array.isArray(list) ? list.map((p) => p?.name ?? p).filter(Boolean) : [];
        setProjects(names);
        setProject((cur) => cur || names[0] || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!project) return;
    setErr("");
    setData(null);
    fetch(`/api/hooks?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((d) => (d?.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, [project]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
          <ArrowLeft size={16} /> Accueil
        </button>
        <Webhook size={16} className="text-accent-soft" />
        <span className="text-sm font-semibold text-ink">Hooks</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-6 py-5">
        <p className="mb-4 max-w-2xl text-sm leading-relaxed text-dim">
          Gardes déclaratives exécutées autour des actions de l'Élève (#172) : un{" "}
          <em>événement</em> + un <em>matcher</em> + un <em>handler</em>. Édition dans{" "}
          <code className="mx-0.5 rounded bg-edge-soft px-1 text-ink">&lt;projet&gt;/.hooks/hooks.json</code>. Actifs
          seulement si <code className="rounded bg-edge-soft px-1 text-ink">ELEVE_HOOKS=on</code>.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs text-faint">Projet</label>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="rounded-lg border border-edge bg-panel px-2 py-1 text-sm text-ink"
          >
            {projects.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {data && (
            <span className={`text-xs ${data.enabled ? "text-accent" : "text-faint"}`}>
              {data.enabled ? "● gate ELEVE_HOOKS ON" : "○ gate off (hooks inertes)"}
            </span>
          )}
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}
        {data && data.hooks.length === 0 && !err && (
          <p className="text-sm text-muted">Aucun hook déclaré pour ce projet.</p>
        )}
        {data && data.hooks.length > 0 && (
          <div className="flex max-w-2xl flex-col gap-2">
            {data.hooks.map((h, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-edge bg-panel/60 px-3 py-2">
                <span className="rounded bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">
                  {EVENT_LABELS[h.event] ?? h.event}
                </span>
                <span className="text-xs text-dim">
                  matcher <code className="text-ink">{h.matcher}</code>
                </span>
                {h.ref && <span className="text-xs text-faint">→ {h.ref}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
