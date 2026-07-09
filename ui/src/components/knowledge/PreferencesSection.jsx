import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Loader2, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Idée #49 — Préférences apprises (cross-projet).
// Extrait verbatim de Knowledge.jsx (état editingPref/prefDraft/savingPref/learningPref local).
export default function PreferencesSection({ data, setData }) {
  const [editingPref, setEditingPref] = useState(false);
  const [prefDraft, setPrefDraft] = useState("");
  const [savingPref, setSavingPref] = useState(false);
  const [learningPref, setLearningPref] = useState(false);

  return (
    <Section
      icon={Sparkles}
      title="Préférences apprises"
      action={
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              setLearningPref(true);
              try {
                const r = await fetch("/api/preferences/learn", { method: "POST" });
                if (r.ok) {
                  const d = await r.json();
                  setData((prev) => ({ ...prev, preferences: d.content }));
                }
              } finally {
                setLearningPref(false);
              }
            }}
            disabled={learningPref}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink transition-colors disabled:opacity-40"
            title="Ré-apprendre les préférences depuis les projets"
          >
            <RefreshCw size={10} className={learningPref ? "animate-spin" : ""} />
            Ré-apprendre
          </button>
          {!editingPref && (
            <button
              onClick={() => { setPrefDraft(data.preferences || ""); setEditingPref(true); }}
              className="rounded p-0.5 text-faint hover:text-ink transition-colors"
              title="Modifier les préférences"
            >
              <Pencil size={11} />
            </button>
          )}
        </div>
      }
    >
      {!editingPref ? (
        data.preferences ? (
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.preferences)}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-faint italic">
            Vide — MangoOS apprend tes préférences récurrentes (ton, police, layout, palette) au fil de tes projets, puis les hérite au démarrage des nouveaux. Clique sur Ré-apprendre pour les déduire maintenant.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={prefDraft}
            onChange={(e) => setPrefDraft(e.target.value)}
            rows={8}
            placeholder={"# Préférences apprises\n- Dark mode systématique\n- Police sans-serif (Inter)\n- Layout centré max-w-2xl\n- Boutons arrondis (radius 8px)"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditingPref(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingPref}
              onClick={async () => {
                setSavingPref(true);
                try {
                  await fetch("/api/preferences", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: prefDraft }),
                  });
                  setData((d) => ({ ...d, preferences: prefDraft }));
                  setEditingPref(false);
                } finally {
                  setSavingPref(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingPref ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingPref ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
