import { useState } from "react";
import { Blocks, Check, Loader2, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";

// Idée #74 — Constellations (super-skills par composition).
// Extrait verbatim de Knowledge.jsx (état consEditing/consDraft/consSaving/
// consError/consExpanded local).
export default function ConstellationsSection({ data, setData }) {
  const [consEditing, setConsEditing] = useState(false);
  const [consDraft, setConsDraft] = useState("");
  const [consSaving, setConsSaving] = useState(false);
  const [consError, setConsError] = useState(null);
  const [consExpanded, setConsExpanded] = useState(null);

  return (
    <Section
      icon={Blocks}
      title="Constellations"
      action={
        !consEditing && (
          <button
            onClick={async () => {
              setConsError(null);
              try {
                const r = await fetch("/api/constellations");
                const d = r.ok ? await r.json() : { config: "" };
                setConsDraft(d.config || "");
              } catch {
                setConsDraft("");
              }
              setConsEditing(true);
            }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Éditer les constellations (.constellations.json)"
          >
            <Pencil size={11} />
          </button>
        )
      }
    >
      {!consEditing ? (
        (data.constellations || []).length > 0 ? (
          <ul className="space-y-1.5">
            {(data.constellations || []).map((c) => (
              <li key={c.id} className="rounded-lg border border-edge bg-bg p-2 text-xs">
                <button
                  onClick={() => setConsExpanded(consExpanded === c.id ? null : c.id)}
                  className="flex w-full items-center gap-1.5 text-left"
                >
                  <span>{c.emoji}</span>
                  <span className="font-semibold text-ink">{c.label}</span>
                  <span className="rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-faint">
                    {c.isDefault ? "défaut" : "perso"}
                  </span>
                </button>
                {c.keywords?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.keywords.map((k) => (
                      <span key={k} className="rounded bg-edge-soft px-1 py-0.5 text-[10px] text-dim">{k}</span>
                    ))}
                  </div>
                )}
                {consExpanded === c.id && (
                  <pre className="mt-1.5 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-dim">{c.rules}</pre>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-faint italic">
            Aucune constellation. Une constellation = un signal détecté sur ta demande (ex. « formulaire ») qui injecte un pack de règles coordonnées avant la génération.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-faint">
            Tableau JSON de constellations. Même <code>id</code> qu'un défaut pour le surcharger ; <code>{`"enabled": false`}</code> pour le désactiver.
          </p>
          <textarea
            value={consDraft}
            onChange={(e) => setConsDraft(e.target.value)}
            rows={10}
            placeholder={'[\n  {\n    "id": "auth",\n    "label": "Authentification",\n    "emoji": "🔒",\n    "keywords": ["auth", "login", "signup", "compte"],\n    "rules": "Constellation AUTH — jamais de secret en dur, validation forte, session sûre, RLS si Supabase."\n  }\n]'}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          {consError && <p className="text-[10px] text-red-400">{consError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => { setConsEditing(false); setConsError(null); }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={consSaving}
              onClick={async () => {
                setConsSaving(true);
                setConsError(null);
                try {
                  const r = await fetch("/api/constellations", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: consDraft }),
                  });
                  if (!r.ok) {
                    const e = await r.json().catch(() => ({}));
                    setConsError(e.error || `Erreur HTTP ${r.status}`);
                    return;
                  }
                  const r2 = await fetch("/api/constellations");
                  const d2 = r2.ok ? await r2.json() : { resolved: [] };
                  setData((prev) => ({ ...prev, constellations: d2.resolved }));
                  setConsEditing(false);
                } finally {
                  setConsSaving(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {consSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {consSaving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
