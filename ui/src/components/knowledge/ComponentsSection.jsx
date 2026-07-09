import { useState } from "react";
import { Blocks, Clipboard, ClipboardCheck, Loader2, Plus } from "lucide-react";
import Section from "./Section.jsx";

// Idée #36 — Bibliothèque de composants inter-projets.
// Extrait verbatim de Knowledge.jsx (état expandedComponent/componentCode/
// loadingComponent/copiedComponent/creatingComponent/componentForm/savingComponent local).
export default function ComponentsSection({ data, setData, projectName }) {
  const components = data.components || [];
  const [expandedComponent, setExpandedComponent] = useState(null);
  const [componentCode, setComponentCode] = useState({});
  const [loadingComponent, setLoadingComponent] = useState(null);
  const [copiedComponent, setCopiedComponent] = useState(null);
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [componentForm, setComponentForm] = useState({ name: "", description: "", tags: "", code: "" });
  const [savingComponent, setSavingComponent] = useState(false);

  return (
    <Section
      icon={Blocks}
      title="Composants réutilisables"
      action={
        <span className="text-[10px] font-medium text-faint">{components.length > 0 ? `${components.length}` : ""}</span>
      }
    >
      {components.length === 0 ? (
        <p className="text-xs text-faint italic">
          Vide — l'agent sauvegarde automatiquement les composants réutilisables qu'il crée.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {components.map((c) => (
            <li key={c.name} className="text-xs">
              <button
                onClick={async () => {
                  if (expandedComponent === c.name) {
                    setExpandedComponent(null);
                    return;
                  }
                  setExpandedComponent(c.name);
                  if (!componentCode[c.name]) {
                    setLoadingComponent(c.name);
                    try {
                      const r = await fetch(`/api/components/${encodeURIComponent(c.name)}`);
                      if (r.ok) {
                        const d = await r.json();
                        setComponentCode((prev) => ({ ...prev, [c.name]: d.code }));
                      }
                    } finally {
                      setLoadingComponent(null);
                    }
                  }
                }}
                className="flex w-full items-start gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-edge-soft transition-colors"
              >
                <span className="font-mono font-semibold text-ink">{c.name}</span>
                {c.description && <span className="text-dim truncate flex-1">{c.description}</span>}
              </button>
              {c.tags?.length > 0 && (
                <div className="ml-1.5 mt-0.5 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <span key={t} className="rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-faint">{t}</span>
                  ))}
                </div>
              )}
              {expandedComponent === c.name && (
                <div className="mt-1.5 ml-1.5 space-y-1">
                  {loadingComponent === c.name ? (
                    <Loader2 size={12} className="animate-spin text-faint" />
                  ) : componentCode[c.name] ? (
                    <>
                      <pre className="max-h-48 overflow-auto rounded-lg border border-edge bg-bg p-2 text-[10px] leading-relaxed font-mono text-ink whitespace-pre-wrap">
                        {componentCode[c.name]}
                      </pre>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(componentCode[c.name]);
                          setCopiedComponent(c.name);
                          setTimeout(() => setCopiedComponent(null), 2000);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-edge px-2 py-1 text-[10px] text-dim hover:text-ink transition-colors"
                      >
                        {copiedComponent === c.name ? <ClipboardCheck size={11} className="text-accent" /> : <Clipboard size={11} />}
                        {copiedComponent === c.name ? "Copié !" : "Copier le code"}
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* Formulaire d'ajout manuel */}
      <div className="border-t border-edge mt-1 pt-1">
        {!creatingComponent ? (
          <button
            onClick={() => setCreatingComponent(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-faint hover:bg-edge-soft hover:text-dim transition-colors"
          >
            <Plus size={13} />
            Ajouter un composant manuellement
          </button>
        ) : (
          <div className="space-y-2 py-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Nouveau composant</p>
            <input
              placeholder="Nom PascalCase (ex: SearchBar)"
              value={componentForm.name}
              onChange={(e) => setComponentForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <input
              placeholder="Description courte"
              value={componentForm.description}
              onChange={(e) => setComponentForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <input
              placeholder="Tags séparés par des virgules (ex: form, input)"
              value={componentForm.tags}
              onChange={(e) => setComponentForm((f) => ({ ...f, tags: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <textarea
              placeholder="Code JSX/TSX du composant"
              value={componentForm.code}
              onChange={(e) => setComponentForm((f) => ({ ...f, code: e.target.value }))}
              rows={5}
              className="w-full resize-none rounded-lg border border-edge bg-bg px-2.5 py-1.5 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setCreatingComponent(false); setComponentForm({ name: "", description: "", tags: "", code: "" }); }}
                className="flex-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
              >
                Annuler
              </button>
              <button
                disabled={!componentForm.name.trim() || !componentForm.code.trim() || savingComponent}
                onClick={async () => {
                  setSavingComponent(true);
                  try {
                    await fetch("/api/components", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        meta: {
                          name: componentForm.name.trim(),
                          description: componentForm.description.trim(),
                          tags: componentForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
                          props: [],
                          usedIn: [],
                        },
                        code: componentForm.code.trim(),
                      }),
                    });
                    setCreatingComponent(false);
                    setComponentForm({ name: "", description: "", tags: "", code: "" });
                    fetch(`/api/knowledge/${encodeURIComponent(projectName)}`)
                      .then((r) => r.ok ? r.json() : null)
                      .then((d) => d && setData(d))
                      .catch(() => {});
                  } finally {
                    setSavingComponent(false);
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
              >
                <Blocks size={12} />
                {savingComponent ? "Ajout…" : "Ajouter"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
