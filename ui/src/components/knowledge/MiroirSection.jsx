import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Eye, Loader2, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";
import { miroirSwatches, stripFrontmatter } from "./helpers.js";

// Idée #48 — Le Miroir : compréhension validable (porte du cadrage #47).
// Extrait verbatim de Knowledge.jsx (état editingMir/mirDraft/savingMir local).
export default function MiroirSection({ data, setData, projectName }) {
  const [editingMir, setEditingMir] = useState(false);
  const [mirDraft, setMirDraft] = useState("");
  const [savingMir, setSavingMir] = useState(false);

  return (
    <Section
      icon={Eye}
      title="Le Miroir"
      action={
        !editingMir ? (
          <button
            onClick={() => { setMirDraft(data.miroir || ""); setEditingMir(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Corriger le miroir"
          >
            <Pencil size={11} />
          </button>
        ) : null
      }
    >
      {!editingMir ? (
        data.miroir ? (
          <div className="space-y-2">
            {miroirSwatches(data.miroir).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {miroirSwatches(data.miroir).map((s) => (
                  <div key={s.hex} className="flex items-center gap-1 rounded-md border border-edge bg-bg px-1.5 py-0.5" title={`${s.hex}${s.label ? " — " + s.label : ""}`}>
                    <span className="h-3 w-3 rounded-sm border border-edge/60" style={{ backgroundColor: s.hex }} />
                    <span className="font-mono text-[10px] text-dim">{s.hex}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="md text-xs leading-relaxed">
              <ReactMarkdown>{stripFrontmatter(data.miroir)}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <p className="text-xs text-faint italic">
            Vide — en mode 💎 Élite, avant de coder un nouveau projet, MangoOS te renvoie
            ici « voici ce que j'ai compris de toi » (palette extraite, ambiance, structure,
            références digérées) à valider ou corriger.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={mirDraft}
            onChange={(e) => setMirDraft(e.target.value)}
            rows={10}
            placeholder={"# Voici ce que j'ai compris de toi\n\n## Intention\n…\n\n## Palette\n- #1A1A2E — base sombre (depuis la photo du lieu)\n- #FF6B35 — accent chaud\n\n## Structure & écrans\n…"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditingMir(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingMir}
              onClick={async () => {
                setSavingMir(true);
                try {
                  await fetch(`/api/miroir/${encodeURIComponent(projectName)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: mirDraft }),
                  });
                  setData((d) => ({ ...d, miroir: mirDraft }));
                  setEditingMir(false);
                } finally {
                  setSavingMir(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingMir ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingMir ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
