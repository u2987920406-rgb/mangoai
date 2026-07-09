import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookText, Check, Loader2, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Idée #45 — Contrat de langage (Ubiquitous Language, par projet).
// Extrait verbatim de Knowledge.jsx (état editingLex/lexDraft/savingLex local).
export default function LexiqueSection({ data, setData, projectName }) {
  const [editingLex, setEditingLex] = useState(false);
  const [lexDraft, setLexDraft] = useState("");
  const [savingLex, setSavingLex] = useState(false);

  return (
    <Section
      icon={BookText}
      title="Contrat de langage"
      action={
        !editingLex ? (
          <button
            onClick={() => { setLexDraft(data.lexique || ""); setEditingLex(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title="Modifier le contrat de langage"
          >
            <Pencil size={11} />
          </button>
        ) : null
      }
    >
      {!editingLex ? (
        data.lexique ? (
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.lexique)}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-faint italic">
            Vide — le lexique du projet (un concept = un nom = un composant) se construit
            tout seul depuis ton intention, puis s'enrichit à chaque nouveau composant.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={lexDraft}
            onChange={(e) => setLexDraft(e.target.value)}
            rows={8}
            placeholder={"# Contrat de langage\n\n| Terme naturel (humain) | Terme technique (domaine) | Composant / fichier | Description |\n|---|---|---|---|\n| barre de vie | HealthPoints | HealthBar.jsx — HUD/ | Jauge de PV du joueur |"}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditingLex(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={savingLex}
              onClick={async () => {
                setSavingLex(true);
                try {
                  await fetch(`/api/lexique/${encodeURIComponent(projectName)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: lexDraft }),
                  });
                  setData((d) => ({ ...d, lexique: lexDraft }));
                  setEditingLex(false);
                } finally {
                  setSavingLex(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {savingLex ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {savingLex ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
