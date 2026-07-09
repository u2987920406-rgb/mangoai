import { useState } from "react";
import { Check, Footprints, Loader2, Plus, X } from "lucide-react";
import Section from "./Section.jsx";

// Idée #75 — Mémoire procédurale (schémas de résolution).
// Extrait verbatim de Knowledge.jsx (état procExpanded/procBody/creatingProc/
// procForm/savingProc local).
export default function ProceduresSection({ data, setData }) {
  const [procExpanded, setProcExpanded] = useState(null);
  const [procBody, setProcBody] = useState({}); // slug -> body PROCEDURE.md
  const [creatingProc, setCreatingProc] = useState(false);
  const [procForm, setProcForm] = useState({ name: "", problem: "", tags: "", body: "" });
  const [savingProc, setSavingProc] = useState(false);

  return (
    <Section
      icon={Footprints}
      title="Procédures"
      action={
        !creatingProc && (
          <button
            onClick={() => { setProcForm({ name: "", problem: "", tags: "", body: "" }); setCreatingProc(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Ajouter une procédure"
          >
            <Plus size={12} />
          </button>
        )
      }
    >
      {(data.procedures || []).length === 0 && !creatingProc ? (
        <p className="text-xs text-faint italic">
          Vide — Mango mémorise ici ses démarches de résolution (pagination, auth, drag-and-drop…) pour les rejouer face à une situation similaire. Le réviseur en arrière-plan en capture automatiquement.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {(data.procedures || []).map((p) => (
            <li key={p.slug} className="rounded-lg border border-edge bg-bg p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <button
                  onClick={async () => {
                    const next = procExpanded === p.slug ? null : p.slug;
                    setProcExpanded(next);
                    if (next && procBody[p.slug] === undefined) {
                      try {
                        const r = await fetch(`/api/procedures/${encodeURIComponent(p.slug)}`);
                        const d = r.ok ? await r.json() : { body: "" };
                        setProcBody((m) => ({ ...m, [p.slug]: d.body || "" }));
                      } catch {
                        setProcBody((m) => ({ ...m, [p.slug]: "" }));
                      }
                    }
                  }}
                  className="flex-1 min-w-0 text-left space-y-0.5"
                >
                  <span className="font-semibold text-ink">{p.name}</span>
                  <p className="text-[10px] text-dim">{p.problem}</p>
                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {p.tags.map((t) => (
                        <span key={t} className="rounded bg-edge-soft px-1 py-0.5 text-[10px] text-faint">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
                <button
                  onClick={async () => {
                    await fetch(`/api/procedures/${encodeURIComponent(p.slug)}`, { method: "DELETE" });
                    setData((d) => ({ ...d, procedures: (d.procedures || []).filter((x) => x.slug !== p.slug) }));
                  }}
                  className="shrink-0 rounded p-0.5 text-faint hover:text-red-400 transition-colors"
                  title="Supprimer la procédure"
                >
                  <X size={11} />
                </button>
              </div>
              {procExpanded === p.slug && (
                <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-dim">
                  {procBody[p.slug] ?? "Chargement…"}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
      {creatingProc && (
        <div className="mt-2 space-y-1.5">
          <input
            value={procForm.name}
            onChange={(e) => setProcForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nom (ex: Pagination côté client)"
            className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <input
            value={procForm.problem}
            onChange={(e) => setProcForm((f) => ({ ...f, problem: e.target.value }))}
            placeholder="Situation déclencheuse (ex: paginer une longue liste)"
            className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <input
            value={procForm.tags}
            onChange={(e) => setProcForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="Tags séparés par des virgules (ex: liste, état, ux)"
            className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <textarea
            value={procForm.body}
            onChange={(e) => setProcForm((f) => ({ ...f, body: e.target.value }))}
            rows={6}
            placeholder={"## Problème\n…\n\n## Démarche\n1. … (raisonnement + pièges évités)\n\n## Validation\n…"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setCreatingProc(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingProc || !procForm.name.trim() || !procForm.problem.trim()}
              onClick={async () => {
                setSavingProc(true);
                try {
                  const r = await fetch("/api/procedures", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: procForm.name.trim(),
                      problem: procForm.problem.trim(),
                      tags: procForm.tags.split(",").map((s) => s.trim()).filter(Boolean),
                      body: procForm.body,
                    }),
                  });
                  if (r.ok) {
                    const saved = await r.json();
                    setData((d) => ({ ...d, procedures: [...(d.procedures || []).filter((x) => x.slug !== saved.slug), saved] }));
                    setCreatingProc(false);
                  }
                } finally {
                  setSavingProc(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingProc ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingProc ? "Sauvegarde…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
