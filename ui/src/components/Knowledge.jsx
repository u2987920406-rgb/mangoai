import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Blocks, BrainCircuit, Check, Clipboard, ClipboardCheck, Compass, Footprints, FolderOpen, Languages, Loader2, Pencil, Plus, RefreshCw, Sparkles, User, Wrench, X } from "lucide-react";
import Section from "./knowledge/Section.jsx";
import IdentityLayer from "./knowledge/IdentityLayer.jsx";
import BrainRegistryPanel from "./knowledge/BrainRegistryPanel.jsx";
import { miroirSwatches, stripFrontmatter, mutateProposal } from "./knowledge/helpers.js";
import { useKnowledge } from "./knowledge/useKnowledge.js";
import ArchitectureSection from "./knowledge/ArchitectureSection.jsx";
import MiroirSection from "./knowledge/MiroirSection.jsx";
import LexiqueSection from "./knowledge/LexiqueSection.jsx";
import DesignSystemSection from "./knowledge/DesignSystemSection.jsx";
import PreferencesSection from "./knowledge/PreferencesSection.jsx";

// Dropdown body showing what MangoOS has learned. Mounted only while the menu
// is open, so it re-fetches and is always fresh (the background review may
// have updated the stores seconds after the last turn).
export default function Knowledge({ projectName }) {
  const { data, setData, error, evoRuns, setEvoRuns } = useKnowledge(projectName);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", body: "" });
  const [saving, setSaving] = useState(false);
  // Conseil d'experts — rattrapage projet dévié (idée #44)
  const [councilProblem, setCouncilProblem] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilResult, setCouncilResult] = useState(null);
  const [councilError, setCouncilError] = useState(null);
  const [expandedLens, setExpandedLens] = useState(null);
  // Component library (idée #36)
  const [expandedComponent, setExpandedComponent] = useState(null);
  // Reference mood library (idée #50)
  const [creatingRef, setCreatingRef] = useState(false);
  const [refForm, setRefForm] = useState({ title: "", kind: "url", url: "", palette: "", tags: "", note: "" });
  const [savingRef, setSavingRef] = useState(false);
  // Constellations — super-skills par composition (idée #74)
  const [consEditing, setConsEditing] = useState(false);
  const [consDraft, setConsDraft] = useState("");
  const [consSaving, setConsSaving] = useState(false);
  const [consError, setConsError] = useState(null);
  const [consExpanded, setConsExpanded] = useState(null);
  // Mémoire procédurale (idée #75)
  const [procExpanded, setProcExpanded] = useState(null);
  const [procBody, setProcBody] = useState({}); // slug -> body PROCEDURE.md
  const [creatingProc, setCreatingProc] = useState(false);
  const [procForm, setProcForm] = useState({ name: "", problem: "", tags: "", body: "" });
  const [savingProc, setSavingProc] = useState(false);
  // Évolution des règles (idée #76) — evoRuns/setEvoRuns viennent de useKnowledge
  const [evoRunning, setEvoRunning] = useState(false);
  const [evoExpanded, setEvoExpanded] = useState(null); // proposalId déplié
  const [componentCode, setComponentCode] = useState({});
  const [loadingComponent, setLoadingComponent] = useState(null);
  const [copiedComponent, setCopiedComponent] = useState(null);
  const [creatingComponent, setCreatingComponent] = useState(false);
  const [componentForm, setComponentForm] = useState({ name: "", description: "", tags: "", code: "" });
  const [savingComponent, setSavingComponent] = useState(false);

  const skillForm = (
    <div className="border-t border-edge mt-1 pt-1 px-1 pb-1">
      {!creating ? (
        <button
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-faint hover:bg-edge-soft hover:text-dim transition-colors"
        >
          <Plus size={13} />
          Créer une skill manuellement
        </button>
      ) : (
        <div className="space-y-2 py-1">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Nouvelle skill</p>
          <input
            placeholder="Nom (ex: carousel-react)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <input
            placeholder="Description courte"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <textarea
            placeholder="Contenu de la skill (règles, exemples, code...)"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={4}
            className="w-full resize-none rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setCreating(false); setForm({ name: "", description: "", body: "" }); }}
              className="flex-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              Annuler
            </button>
            <button
              disabled={!form.name.trim() || !form.body.trim() || saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await fetch("/api/skill", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(form),
                  });
                  setCreating(false);
                  setForm({ name: "", description: "", body: "" });
                  // Refresh data
                  fetch(`/api/knowledge/${encodeURIComponent(projectName)}`)
                    .then((r) => r.ok ? r.json() : null)
                    .then((d) => d && setData(d))
                    .catch(() => {});
                } finally {
                  setSaving(false);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              <Sparkles size={12} />
              {saving ? "Création…" : "Créer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <div>
        <p className="px-3 py-3 text-xs text-dim">⚠ {error}</p>
        {skillForm}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-6 text-dim">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  const id = data.identity || { language: "", thinking: "", vision: "" };
  const hasIdentity = id.language || id.thinking || id.vision;
  const components = data.components || [];
  const references = data.references || [];
  const empty =
    !data.memory && !data.profile && data.skills.length === 0 && !data.axioms &&
    !data.designSystem && !data.architecture && !hasIdentity && components.length === 0 && references.length === 0;
  if (empty) {
    return (
      <div>
        <p className="px-3 py-3 text-xs leading-relaxed text-dim">
          MangoOS n'a encore rien appris ici. La mémoire se remplit toute seule,
          en arrière-plan, après chaque tâche.
        </p>
        {skillForm}
      </div>
    );
  }

  return (
    <div className="space-y-1 px-1 py-1">
      {data.memory && (
        <Section icon={FolderOpen} title="Ce projet">
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.memory)}</ReactMarkdown>
          </div>
        </Section>
      )}
      {data.profile && (
        <Section icon={User} title="Vous — tous projets">
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.profile)}</ReactMarkdown>
          </div>
        </Section>
      )}
      {data.skills.length > 0 && (
        <Section icon={Wrench} title="Skills apprises">
          <ul className="space-y-1.5">
            {data.skills.map((s) => (
              <li key={s.name} className="text-xs leading-snug">
                <span className="font-mono text-ink">{s.name}</span>
                {s.description && <span className="block text-dim">{s.description}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {/* Idée #36 — Bibliothèque de composants inter-projets */}
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

      {/* Idée #44 — Conseil d'experts : rattrapage d'un projet dévié (lecture seule) */}
      <Section icon={Wrench} title="Conseil d'experts">
        <div className="space-y-2">
          <p className="text-[11px] text-faint leading-relaxed">
            Projet parti de travers ? Convoque un conseil d'experts qui le lit chacun sous son angle
            (archi, produit, UX, données, robustesse) et fusionne leurs diagnostics en un plan de reprise priorisé.
          </p>
          <textarea
            value={councilProblem}
            onChange={(e) => setCouncilProblem(e.target.value)}
            rows={2}
            placeholder="Qu'est-ce qui a dévié ? (optionnel — ex: « parti sur une todo mais je veux un CRM »)"
            className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
          />
          <button
            disabled={councilRunning}
            onClick={async () => {
              setCouncilRunning(true);
              setCouncilError(null);
              try {
                const r = await fetch(`/api/council/${encodeURIComponent(projectName)}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ problem: councilProblem }),
                });
                if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`);
                setCouncilResult(await r.json());
              } catch (e) {
                setCouncilError(e.message ?? String(e));
              } finally {
                setCouncilRunning(false);
              }
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
          >
            {councilRunning ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
            {councilRunning ? "Le conseil délibère…" : "Convoquer le conseil"}
          </button>
          {councilError && <p className="text-[11px] text-red-400">⚠ {councilError}</p>}
          {councilResult && (
            <div className="space-y-2 pt-1">
              {councilResult.plan && (
                <div className="rounded-lg border border-accent/40 bg-accent/5 p-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Plan de reprise</p>
                  <div className="md text-xs leading-relaxed">
                    <ReactMarkdown>{stripFrontmatter(councilResult.plan)}</ReactMarkdown>
                  </div>
                </div>
              )}
              {(councilResult.diagnoses || []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Diagnostics ({councilResult.diagnoses.length})</p>
                  {councilResult.diagnoses.map((d, i) => (
                    <div key={d.key || i} className="rounded-lg border border-edge bg-bg">
                      <button
                        onClick={() => setExpandedLens(expandedLens === i ? null : i)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-medium text-dim hover:text-ink transition-colors"
                      >
                        <span>{d.lens}</span>
                        <span className="text-faint">{expandedLens === i ? "−" : "+"}</span>
                      </button>
                      {expandedLens === i && (
                        <div className="md border-t border-edge px-2 py-1.5 text-[11px] leading-relaxed">
                          <ReactMarkdown>{d.findings}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {councilResult.plan && (
                <button
                  onClick={async () => {
                    await fetch(`/api/council/${encodeURIComponent(projectName)}`, { method: "DELETE" });
                    setCouncilResult(null);
                    setCouncilProblem("");
                  }}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-[11px] text-faint hover:text-ink transition-colors"
                >
                  <Check size={11} /> Rattrapage terminé — effacer le plan
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Idée #50 — Banque de références perso (mood library, workspace-level) */}
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

      {data.axioms && (
        <Section icon={RefreshCw} title="Axiomes (flywheel)">
          <div className="md text-xs leading-relaxed">
            <ReactMarkdown>{stripFrontmatter(data.axioms)}</ReactMarkdown>
          </div>
        </Section>
      )}

      <ArchitectureSection data={data} setData={setData} projectName={projectName} />

      <MiroirSection data={data} setData={setData} projectName={projectName} />

      <LexiqueSection data={data} setData={setData} projectName={projectName} />

      {/* Idée #42 — Couches d'identité (cross-projet) */}
      <IdentityLayer
        icon={Languages}
        title="Vocabulaire personnel"
        layer="language"
        value={id.language}
        placeholder={"## Raccourcis\n- \"on attaque\" = implémente maintenant\n- \"on creuse\" = approfondir sans coder\n\n## Erreurs de transcription\n- \"Obama\" = Ollama"}
        emptyHint="Vide — la revue en arrière-plan détecte tes formulations récurrentes."
        onSaved={(v) => setData((d) => ({ ...d, identity: { ...(d.identity || {}), language: v } }))}
      />
      <IdentityLayer
        icon={BrainCircuit}
        title="Style de pensée"
        layer="thinking"
        value={id.thinking}
        placeholder={"## Décision\n- Explore avant d'agir\n- Valide par la logique\n- Pense en analogies\n- Questionne avant d'accepter"}
        emptyHint="Vide — la revue en arrière-plan détecte tes patterns de décision."
        onSaved={(v) => setData((d) => ({ ...d, identity: { ...(d.identity || {}), thinking: v } }))}
      />
      <IdentityLayer
        icon={Compass}
        title="Vision validée"
        layer="vision"
        value={id.vision}
        manual
        placeholder={"## Patterns validés\n- (ajoute ici ce que tu veux garder et réutiliser)"}
        emptyHint="Vide — 100% manuel. Note ici les approches et patterns que tu valides explicitement ; MangoOS n'y écrit jamais seul."
        onSaved={(v) => setData((d) => ({ ...d, identity: { ...(d.identity || {}), vision: v } }))}
      />

      <DesignSystemSection data={data} setData={setData} />

      <PreferencesSection data={data} setData={setData} />

      {/* Idée #74 — Constellations (super-skills par composition) */}
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

      {/* Idée #75 — Mémoire procédurale (schémas de résolution) */}
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

      {/* Idée #76 — Évolution des règles (auto-réécriture proposée, validée par l'humain) */}
      <Section
        icon={BrainCircuit}
        title="Évolution des règles"
        action={
          <button
            onClick={async () => {
              setEvoRunning(true);
              try {
                const r = await fetch("/api/prompt-evolution/run", { method: "POST" });
                if (r.ok) {
                  const d = await r.json();
                  setEvoRuns((prev) => [d.run, ...(prev || [])]);
                  setEvoExpanded(d.run?.id ?? null);
                }
              } finally {
                setEvoRunning(false);
              }
            }}
            disabled={evoRunning}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink transition-colors disabled:opacity-40"
            title="Analyser mes corrections récurrentes et proposer des évolutions"
          >
            {evoRunning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            {evoRunning ? "Analyse…" : "Analyser & proposer"}
          </button>
        }
      >
        {!evoRuns || evoRuns.length === 0 ? (
          <p className="text-xs text-faint italic">
            Mango analyse tes corrections récurrentes (axiomes, escalades) et propose des évolutions de ses propres règles — à valider avant application. Clique « Analyser & proposer ».
          </p>
        ) : (
          <ul className="space-y-2">
            {evoRuns.map((run) => (
              <li key={run.id} className="rounded-lg border border-edge bg-bg p-2 text-xs space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-faint">{run.ts?.slice(0, 16).replace("T", " ")}</p>
                    {run.summary && <p className="text-[11px] text-dim">{run.summary}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      await fetch(`/api/prompt-evolution/${encodeURIComponent(run.id)}`, { method: "DELETE" });
                      setEvoRuns((prev) => (prev || []).filter((r) => r.id !== run.id));
                    }}
                    className="shrink-0 rounded p-0.5 text-faint hover:text-red-400 transition-colors"
                    title="Supprimer cette analyse"
                  >
                    <X size={11} />
                  </button>
                </div>
                {run.proposals.length === 0 ? (
                  <p className="text-[10px] text-faint italic">Aucune évolution proposée — les règles sont saines.</p>
                ) : (
                  run.proposals.map((p) => (
                    <div key={p.id} className="rounded border border-edge/70 p-1.5">
                      <button
                        onClick={() => setEvoExpanded(evoExpanded === p.id ? null : p.id)}
                        className="flex w-full items-start gap-1.5 text-left"
                      >
                        <span className="rounded bg-edge-soft px-1 py-0.5 text-[9px] text-faint shrink-0">{p.kind}</span>
                        <span className="flex-1 min-w-0 font-medium text-ink">{p.title}</span>
                        {p.status !== "pending" && (
                          <span className={`text-[9px] shrink-0 ${p.status === "applied" ? "text-accent" : "text-faint"}`}>
                            {p.status === "applied" ? "✓ appliqué" : "✗ refusé"}
                          </span>
                        )}
                      </button>
                      {p.rationale && <p className="mt-0.5 text-[10px] text-dim">{p.rationale}</p>}
                      {p.targetIds?.length > 0 && (
                        <p className="text-[9px] text-faint">cible : {p.targetIds.join(", ")}</p>
                      )}
                      {evoExpanded === p.id && p.newText && (
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-dim">{p.newText}</pre>
                      )}
                      {p.status === "pending" && (
                        <div className="mt-1 flex items-center gap-1.5">
                          {p.kind === "scenario" ? (
                            <>
                              <span className="text-[9px] text-faint italic">suggestion à porter à la main dans scenario.ts</span>
                              <button
                                onClick={() => mutateProposal(run.id, p.id, "reject", setEvoRuns)}
                                className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink"
                              >
                                Vu
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => mutateProposal(run.id, p.id, "apply", setEvoRuns)}
                                className="rounded px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                              >
                                ✓ Appliquer
                              </button>
                              <button
                                onClick={() => mutateProposal(run.id, p.id, "reject", setEvoRuns)}
                                className="rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-red-400"
                              >
                                ✗ Refuser
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <BrainRegistryPanel />

      {skillForm}
    </div>
  );
}
