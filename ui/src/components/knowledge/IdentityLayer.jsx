import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Loader2, Lock, Pencil, X } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Idée #42 — one editable identity layer (inline editor, same pattern as the
// Design system / Architecture sections). `manual` adds a "Manuel" badge for
// .vision.md, which the background review never curates.
export default function IdentityLayer({ icon, title, layer, value, placeholder, emptyHint, manual = false, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Section
      icon={icon}
      title={title}
      badge={manual ? <span className="flex items-center gap-1 rounded bg-edge-soft px-1.5 py-0.5 text-[10px] font-medium text-dim"><Lock size={9} /> Manuel</span> : null}
      action={
        !editing ? (
          <button
            onClick={() => { setDraft(value || ""); setEditing(true); }}
            className="rounded p-0.5 text-faint hover:text-ink transition-colors"
            title={`Modifier — ${title}`}
          >
            <Pencil size={11} />
          </button>
        ) : null
      }
    >
      {!editing ? (
        value ? (
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(value)}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-faint italic">{emptyHint}</p>
        )
      ) : (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder={placeholder}
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <X size={11} /> Annuler
            </button>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await fetch(`/api/identity/${layer}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: draft }),
                  });
                  onSaved(draft);
                  setEditing(false);
                } finally {
                  setSaving(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
