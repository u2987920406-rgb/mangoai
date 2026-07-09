import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Loader2, Palette, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Chantier A — Design system persistant (cross-projet).
// Extrait verbatim de Knowledge.jsx (état editingDS/dsDraft/savingDS local).
export default function DesignSystemSection({ data, setData }) {
  const [editingDS, setEditingDS] = useState(false);
  const [dsDraft, setDsDraft] = useState("");
  const [savingDS, setSavingDS] = useState(false);

  return (
    <Section
      icon={Palette}
      title="Design system"
      action={
        !editingDS ? (
          <button
            onClick={() => { setDsDraft(data.designSystem || ""); setEditingDS(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Modifier le design system"
          >
            <Pencil size={11} />
          </button>
        ) : null
      }
    >
      {!editingDS ? (
        data.designSystem ? (
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.designSystem)}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-faint italic">
            Vide — l'agent le remplit quand tu valides un choix visuel, ou clique ✏ pour initialiser.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={dsDraft}
            onChange={(e) => setDsDraft(e.target.value)}
            rows={8}
            placeholder={"## Palette\n- Primaire : #6366f1\n\n## Typographie\n- Police : Inter\n\n## Conventions\n- Arrondis : 8px"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditingDS(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingDS}
              onClick={async () => {
                setSavingDS(true);
                try {
                  await fetch("/api/design-system", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: dsDraft }),
                  });
                  setData((d) => ({ ...d, designSystem: dsDraft }));
                  setEditingDS(false);
                } finally {
                  setSavingDS(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingDS ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingDS ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
