import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { BrainCircuit, Compass, FolderOpen, Languages, Loader2, Plus, RefreshCw, Sparkles, User, Wrench } from "lucide-react";
import Section from "./knowledge/Section.jsx";
import IdentityLayer from "./knowledge/IdentityLayer.jsx";
import BrainRegistryPanel from "./knowledge/BrainRegistryPanel.jsx";
import { stripFrontmatter } from "./knowledge/helpers.js";
import { useKnowledge } from "./knowledge/useKnowledge.js";
import ArchitectureSection from "./knowledge/ArchitectureSection.jsx";
import MiroirSection from "./knowledge/MiroirSection.jsx";
import LexiqueSection from "./knowledge/LexiqueSection.jsx";
import DesignSystemSection from "./knowledge/DesignSystemSection.jsx";
import PreferencesSection from "./knowledge/PreferencesSection.jsx";
import ComponentsSection from "./knowledge/ComponentsSection.jsx";
import CouncilSection from "./knowledge/CouncilSection.jsx";
import ReferencesSection from "./knowledge/ReferencesSection.jsx";
import ConstellationsSection from "./knowledge/ConstellationsSection.jsx";
import ProceduresSection from "./knowledge/ProceduresSection.jsx";
import EvolutionSection from "./knowledge/EvolutionSection.jsx";

// Dropdown body showing what MangoOS has learned. Mounted only while the menu
// is open, so it re-fetches and is always fresh (the background review may
// have updated the stores seconds after the last turn).
export default function Knowledge({ projectName }) {
  const { data, setData, error, evoRuns, setEvoRuns } = useKnowledge(projectName);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", body: "" });
  const [saving, setSaving] = useState(false);
  // Les états propres à chaque section vivent désormais dans leur composant
  // (knowledge/*Section.jsx) ; le conteneur ne garde que skillForm + evoRuns.

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
      <ComponentsSection data={data} setData={setData} projectName={projectName} />

      <CouncilSection projectName={projectName} />

      <ReferencesSection data={data} setData={setData} />

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

      <ConstellationsSection data={data} setData={setData} />

      <ProceduresSection data={data} setData={setData} />

      <EvolutionSection evoRuns={evoRuns} setEvoRuns={setEvoRuns} />

      <BrainRegistryPanel />

      {skillForm}
    </div>
  );
}
