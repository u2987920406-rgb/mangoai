import { useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import Section from "./Section.jsx";

// Idée #50 — Banque de références perso (mood library, workspace-level).
// Extrait verbatim de Knowledge.jsx (état creatingRef/refForm/savingRef local).
export default function ReferencesSection({ data, setData }) {
  const references = data.references || [];
  const [creatingRef, setCreatingRef] = useState(false);
  const [refForm, setRefForm] = useState({ title: "", kind: "url", url: "", palette: "", tags: "", note: "" });
  const [savingRef, setSavingRef] = useState(false);

  return (
    <Section
      icon={Sparkles}
      title="Banque de références"
      action={
        <span className="text-[10px] font-medium text-faint">{references.length > 0 ? `${references.length}` : ""}</span>
      }
    >
      {references.length === 0 ? (
        <p className="text-xs text-faint italic">
          Vide — sauvegarde ici tes URLs d'inspiration, images d'ambiance et palettes validées pour les réutiliser au cadrage de tes prochains projets.
        </p>
      ) : (
        <ul className="space-y-2">
          {references.map((r) => (
            <li key={r.slug} className="rounded-lg border border-edge bg-bg p-2 text-xs space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-ink">{r.title}</span>
                    <span className="rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-faint">{r.kind}</span>
                    {r.tags?.map((t) => (
                      <span key={t} className="rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-faint">{t}</span>
                    ))}
                  </div>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[10px] text-accent truncate hover:underline"
                    >
                      {r.url}
                    </a>
                  )}
                  {r.note && <p className="text-[10px] text-dim">{r.note}</p>}
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/references/${encodeURIComponent(r.slug)}`, { method: "DELETE" });
                    setData((d) => ({ ...d, references: (d.references || []).filter((x) => x.slug !== r.slug) }));
                  }}
                  className="shrink-0 rounded p-0.5 text-faint hover:text-red-400 transition-colors"
                  title="Supprimer la référence"
                >
                  <X size={11} />
                </button>
              </div>
              {r.image && (
                <img
                  src={`/api/references/${encodeURIComponent(r.slug)}/image`}
                  alt={r.title}
                  className="mt-1 max-h-20 rounded border border-edge object-cover"
                />
              )}
              {r.palette?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.palette.map((hex) => (
                    <div
                      key={hex}
                      className="flex items-center gap-1 rounded-md border border-edge bg-bg px-1.5 py-0.5"
                      title={hex}
                    >
                      <span className="h-3 w-3 rounded-sm border border-edge/60" style={{ backgroundColor: hex }} />
                      <span className="font-mono text-[10px] text-dim">{hex}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Formulaire d'ajout manuel */}
      <div className="border-t border-edge mt-2 pt-1">
        {!creatingRef ? (
          <button
            onClick={() => setCreatingRef(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-faint hover:bg-edge-soft hover:text-dim transition-colors"
          >
            <Plus size={13} />
            Ajouter une référence
          </button>
        ) : (
          <div className="space-y-2 py-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Nouvelle référence</p>
            <input
              placeholder="Titre (ex: Linear.app — dark SaaS)"
              value={refForm.title}
              onChange={(e) => setRefForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <select
              value={refForm.kind}
              onChange={(e) => setRefForm((f) => ({ ...f, kind: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink focus:border-accent focus:outline-none transition-colors"
            >
              <option value="url">URL</option>
              <option value="image">Image</option>
              <option value="palette">Palette</option>
            </select>
            {refForm.kind === "url" && (
              <input
                placeholder="https://..."
                value={refForm.url}
                onChange={(e) => setRefForm((f) => ({ ...f, url: e.target.value }))}
                className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
              />
            )}
            <input
              placeholder="Palette hex séparés par des virgules (ex: #1A1A2E, #FF6B35)"
              value={refForm.palette}
              onChange={(e) => setRefForm((f) => ({ ...f, palette: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <input
              placeholder="Tags séparés par des virgules (ex: dark, SaaS, minimaliste)"
              value={refForm.tags}
              onChange={(e) => setRefForm((f) => ({ ...f, tags: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <input
              placeholder="Note optionnelle"
              value={refForm.note}
              onChange={(e) => setRefForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCreatingRef(false); setRefForm({ title: "", kind: "url", url: "", palette: "", tags: "", note: "" }); }}
                className="flex-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
              >
                Annuler
              </button>
              <button
                disabled={!refForm.title.trim() || savingRef}
                onClick={async () => {
                  setSavingRef(true);
                  try {
                    const r = await fetch("/api/references", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: refForm.title.trim(),
                        kind: refForm.kind,
                        url: refForm.url.trim() || undefined,
                        palette: refForm.palette.split(",").map((s) => s.trim()).filter(Boolean),
                        tags: refForm.tags.split(",").map((s) => s.trim()).filter(Boolean),
                        note: refForm.note.trim() || undefined,
                      }),
                    });
                    if (r.ok) {
                      const saved = await r.json();
                      setData((d) => ({ ...d, references: [...(d.references || []), saved] }));
                      setCreatingRef(false);
                      setRefForm({ title: "", kind: "url", url: "", palette: "", tags: "", note: "" });
                    }
                  } finally {
                    setSavingRef(false);
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
              >
                <Sparkles size={12} />
                {savingRef ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
