import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, GitBranch, Loader2, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Chantier #38 — Carte d'architecture vivante (par projet).
// Extrait verbatim de Knowledge.jsx (état editingArch/archDraft/savingArch local).
export default function ArchitectureSection({ data, setData, projectName }) {
  const [editingArch, setEditingArch] = useState(false);
  const [archDraft, setArchDraft] = useState("");
  const [savingArch, setSavingArch] = useState(false);

  return (
    <Section
      icon={GitBranch}
      title="Architecture"
      action={
        !editingArch ? (
          <button
            onClick={() => { setArchDraft(data.architecture || ""); setEditingArch(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Modifier la carte d'architecture"
          >
            <Pencil size={11} />
          </button>
        ) : null
      }
    >
      {!editingArch ? (
        data.architecture ? (
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.architecture)}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-faint italic">
            Vide — l'agent remplit automatiquement cette carte après chaque changement structurel.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={archDraft}
            onChange={(e) => setArchDraft(e.target.value)}
            rows={8}
            placeholder={"## Stack\n- React + Vite + Tailwind v4\n\n## Composants\n- Header : navigation\n- Hero : section principale\n\n## API\n- (aucune pour l'instant)"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditingArch(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingArch}
              onClick={async () => {
                setSavingArch(true);
                try {
                  await fetch(`/api/architecture/${encodeURIComponent(projectName)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: archDraft }),
                  });
                  setData((d) => ({ ...d, architecture: archDraft }));
                  setEditingArch(false);
                } finally {
                  setSavingArch(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingArch ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingArch ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
