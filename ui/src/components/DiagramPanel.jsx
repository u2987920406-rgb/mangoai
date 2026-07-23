// #196 partie D (2026-07-23) — panneau des diagrammes avant/après (« /illustre »).
// Liste ce qui a déjà été généré (auto avant/après un build, cf. Chat.jsx/chat-route.ts)
// + bouton d'action directe pour en régénérer un — PAS un toggle opt-in (contrairement
// à Multi-Projet/Loop Design), une vraie action, comme le reste des panneaux d'action.
import { useEffect, useState } from "react";
import { Loader2, Workflow } from "lucide-react";

export default function DiagramPanel({ projectName, intention }) {
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(null); // "avant" | "apres" | null
  const [error, setError] = useState(null);

  const refresh = () => {
    if (!projectName) return;
    setLoading(true);
    fetch(`/api/diagram/${encodeURIComponent(projectName)}/list`)
      .then((r) => (r.ok ? r.json() : { diagrams: [] }))
      .then((d) => setDiagrams(d.diagrams ?? []))
      .catch(() => setDiagrams([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [projectName]);

  async function generate(kind) {
    setGenerating(kind);
    setError(null);
    try {
      const r = await fetch(`/api/diagram/${encodeURIComponent(projectName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, intention: intention || projectName }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `Erreur ${r.status}`);
      refresh();
    } catch (e) {
      setError(e.message ?? "Échec de génération");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex gap-2">
        <button
          onClick={() => generate("avant")}
          disabled={generating !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-edge px-2 py-1.5 text-[11px] text-dim hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
        >
          {generating === "avant" ? <Loader2 size={12} className="animate-spin" /> : <Workflow size={12} />}
          Avant (prévu)
        </button>
        <button
          onClick={() => generate("apres")}
          disabled={generating !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-edge px-2 py-1.5 text-[11px] text-dim hover:border-accent hover:text-accent disabled:opacity-50 transition-colors"
        >
          {generating === "apres" ? <Loader2 size={12} className="animate-spin" /> : <Workflow size={12} />}
          Après (réel)
        </button>
      </div>

      {error && <p className="text-[11px] text-err">{error}</p>}

      {loading && (
        <div className="flex items-center gap-1.5 py-4 text-xs text-dim">
          <Loader2 size={12} className="animate-spin" /> Chargement…
        </div>
      )}

      {!loading && diagrams.length === 0 && (
        <p className="text-xs italic text-faint">Aucun diagramme encore — génère « Avant » ou « Après », ou laisse MangoOS le faire automatiquement.</p>
      )}

      <div className="flex flex-col gap-3">
        {diagrams.map((d) => (
          <div key={d.name} className="overflow-hidden rounded-lg border border-edge bg-bg">
            <img src={d.url} alt={d.caption || d.kind} className="w-full object-contain" />
            <div className="flex flex-col gap-0.5 px-2.5 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-faint">{d.kind === "avant" ? "Avant (prévu)" : "Après (réel)"}</span>
              {d.caption && <span className="text-[11px] leading-snug text-dim">{d.caption}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
