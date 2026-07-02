// App Builder DANS le shell 2.0 (Phase C3) — monte les VRAIS Chat + Preview de la 1.0
// avec l'état parent minimal (projet, previewUrl, model/mode, coût). La 1.0 reste la
// référence complète jusqu'à parité (audit-mango-2.0 §5).
//
// Revue UX 2026-07-02 : graine de l'Accueil (autoPrompt) + « Nouveau projet » (modale)
// + RAIL WORKSPACE réel (Mémoire · Revue · Dosage de style · Versions · Réflexion)
// + suppression de projet confirmée. Panneaux Backend/GitHub/PerfectPlan/Kanban :
// leurs boutons de rail restent masqués tant que leurs props ne sont pas câblées.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Boxes, Plus, Trash2, Zap, Gem, Shield, Sparkles, ChevronDown } from "lucide-react";
import { api } from "../api";
import { slugify } from "../slugify.js";
import { useAppState } from "../state/AppState";
import { useVersions } from "../hooks/useVersions.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { EmptyState, Badge, Button, Textarea, Modal, cx, TEXT } from "../design";

const Chat = lazy(() => import("../Chat.jsx"));
const Preview = lazy(() => import("../Preview.jsx"));
const WorkspaceTools = lazy(() => import("../components/WorkspaceTools.jsx"));

const PROJECT_KEY = "mangoos.v2.project";
const TIER_KEY = "mangoos.v2.buildTier";

// Les 4 paliers de build (repris tels quels de la 1.0, Header.jsx). Ils changent
// vraiment le comportement de Mango (scenario.ts), pas juste un libellé.
const BUILD_MODES = [
  { id: "mvp",        label: "MVP",        hint: "Rapide & économe — droit au but",              icon: Zap },
  { id: "elite",      label: "Élite",      hint: "Qualité max — analyse + vérif visuelle",        icon: Gem },
  { id: "finition",   label: "Finition",   hint: "Durcissement & QA — pas de nouvelle feature",   icon: Shield },
  { id: "esthetique", label: "Esthétique", hint: "Raffinement graphique — micro-interactions, animations", icon: Sparkles },
];

// Sélecteur de palier de build (bouton + menu), dans la barre projet du builder.
function ModeSelector({ tier, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  const current = BUILD_MODES.find((m) => m.id === tier) ?? BUILD_MODES[1];
  const Icon = current.icon;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Palier de build"
        aria-label={`Palier de build : ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(TEXT.base, "flex items-center gap-1.5 rounded-lg border border-edge bg-bg px-2 py-1 text-ink transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-accent")}
      >
        <Icon size={13} className="text-accent-soft" />
        {current.label}
        <ChevronDown size={12} className="text-faint" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
          {BUILD_MODES.map((m) => {
            const MIcon = m.icon;
            const active = m.id === tier;
            return (
              <button
                key={m.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { onPick(m.id); setOpen(false); }}
                className={cx("flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raised", active && "bg-accent/8")}
              >
                <MIcon size={15} className={cx("mt-0.5 shrink-0", active ? "text-accent" : "text-dim")} />
                <span className="min-w-0">
                  <span className={cx("block text-[13px]", active ? "font-medium text-ink" : "text-dim")}>{m.label}</span>
                  <span className="block text-[11px] leading-snug text-faint">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BuilderPane() {
  const { pushToast, builderSeed, consumeBuilderSeed } = useAppState();
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState(() => localStorage.getItem(PROJECT_KEY) || "");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [chatMode, setChatMode] = useState({ model: "eleve", mode: "elite" });
  // Palier de build choisi (mvp/elite/finition/esthetique), persisté — les 4 modes 1.0.
  const [buildTier, setBuildTier] = useState(() => localStorage.getItem(TIER_KEY) || "elite");
  const [cost, setCost] = useState(0);
  const [autoPrompt, setAutoPrompt] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  // Rail workspace : réflexion visible + dosage de style (persisté par projet, comme la 1.0).
  const [showThinking, setShowThinking] = useState(true);
  const [styleStrength, setStyleStrength] = useState(100);
  // Modal de confirmation façon 1.0 (rollback de version, suppression de projet).
  const [confirmConfig, setConfirmConfig] = useState(null);
  const confirm = useCallback((cfg) => setConfirmConfig(cfg), []);

  // Versions : le vrai hook de la 1.0 (refresh au changement de projet + après build).
  const { versions, refresh: refreshVersions, askRollback } = useVersions({
    projectName,
    pushToast,
    confirm,
    onRolledBack: () => setPreviewKey((k) => k + 1),
  });

  const refreshProjects = useCallback(() => {
    api("/api/projects")
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // Graine venue de l'Accueil : sélectionne le projet et arme le premier prompt.
  useEffect(() => {
    if (!builderSeed) return;
    setProjectName(builderSeed.project);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    setAutoPrompt(builderSeed.prompt);
    setProjects((prev) => (prev.includes(builderSeed.project) ? prev : [builderSeed.project, ...prev]));
    consumeBuilderSeed();
  }, [builderSeed, consumeBuilderSeed]);

  useEffect(() => {
    try { localStorage.setItem(PROJECT_KEY, projectName); } catch { /* localStorage indispo */ }
  }, [projectName]);

  // Dosage de style persisté PAR projet (même clé que la 1.0 → réglages partagés).
  useEffect(() => {
    if (!projectName) return;
    const saved = Number(localStorage.getItem(`mangoos.styleStrength.${projectName}`));
    setStyleStrength(Number.isFinite(saved) && saved >= 0 && saved <= 100 ? saved : 100);
  }, [projectName]);
  const changeStyleStrength = (v) => {
    setStyleStrength(v);
    try { localStorage.setItem(`mangoos.styleStrength.${projectName}`, String(v)); } catch { /* localStorage indispo */ }
  };

  const pickProject = (name) => {
    setProjectName(name);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    setAutoPrompt(null);
  };

  // Changer le palier de build : persiste, et l'applique aussitôt si on est en mode build.
  const changeTier = (t) => {
    setBuildTier(t);
    try { localStorage.setItem(TIER_KEY, t); } catch { /* localStorage indispo */ }
    setChatMode((cm) => (cm.mode === "discuss" ? cm : { ...cm, mode: t }));
  };

  // Le chat rapporte "elite" quand on clique Construire (helper Chat), "discuss" pour
  // Planifier/Discuter. On substitue le palier choisi au "elite" générique → Construire
  // envoie réellement mvp/elite/finition/esthetique. Planifier/Discuter restent intacts.
  const handleChatMode = ({ model, mode }) => {
    setChatMode({ model, mode: mode === "elite" ? buildTier : mode });
  };

  const building = chatMode.mode !== "discuss";
  const tierLabel = BUILD_MODES.find((m) => m.id === buildTier)?.label ?? "Élite";

  // Règle UX de Raf (documentée dans NewProjectForm 1.0, « je me suis fait avoir ») :
  // ce formulaire ne sert QU'À NOMMER — AUCUNE construction n'est lancée. Le composer
  // s'ouvre VIDE ; le démarrage « depuis une idée » reste l'affaire de l'Accueil/Ideation.
  const createProject = () => {
    const raw = newDesc.trim();
    if (!raw) return;
    const name = slugify(raw);
    setNewOpen(false);
    setNewDesc("");
    setProjects((prev) => (prev.includes(name) ? prev : [name, ...prev]));
    setProjectName(name);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    setAutoPrompt(null); // composer vide — c'est Raf qui décide de Construire/Discuter/Planifier
    pushToast("ok", `Projet « ${name} » créé — décris, discute ou planifie quand tu veux`);
  };

  // Suppression (définitive) — même endpoint que la 1.0, derrière confirmation.
  const askDeleteProject = () => {
    if (!projectName) return;
    confirm({
      title: `Supprimer « ${projectName} » ?`,
      body: "Le dossier du projet et ses versions seront définitivement supprimés.",
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        try {
          await api(`/api/projects/${encodeURIComponent(projectName)}`, { method: "DELETE" });
          pushToast("ok", `Projet « ${projectName} » supprimé`);
          setProjectName("");
          setPreviewUrl(null);
          refreshProjects();
        } catch { /* onApiError a déjà affiché le toast */ }
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre projet : sélection + création + suppression + coût du tour */}
      <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-edge-soft px-4">
        <FolderOpen size={14} className="text-faint" />
        <select
          value={projectName}
          onChange={(e) => pickProject(e.target.value)}
          aria-label="Choisir un projet"
          className={cx(TEXT.base, "max-w-[280px] rounded-lg border border-edge bg-bg px-2 py-1 text-ink outline-none focus:border-faint")}
        >
          <option value="">— choisir un projet —</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>
          Nouveau
        </Button>
        {projectName && (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Trash2 size={14} />}
            onClick={askDeleteProject}
            className="hover:text-err"
            title="Supprimer ce projet"
            aria-label="Supprimer ce projet"
          />
        )}
        {/* Palier de build (MVP/Élite/Finition/Esthétique) — remonté de la 1.0 */}
        <ModeSelector tier={buildTier} onPick={changeTier} />
        {projectName && (
          <Badge tone="accent">{building ? `Construire · ${tierLabel}` : "Discuter"}</Badge>
        )}
        <span className={cx(TEXT.xs, "ml-auto font-mono text-dim")}>${cost.toFixed(4)}</span>
      </div>

      {!projectName ? (
        <EmptyState
          icon={<Boxes size={30} />}
          title="Choisis un projet — ou crée-en un"
          description="Le chat et l'aperçu live se montent ici — même moteur que la 1.0, nouveau shell."
          action={<Button variant="primary" icon={<Plus size={14} />} onClick={() => setNewOpen(true)}>Nouveau projet</Button>}
          className="flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<div className={cx(TEXT.base, "m-auto text-faint")}>Chargement du builder…</div>}>
            <WorkspaceTools
              projectName={projectName}
              versions={versions}
              onRollback={askRollback}
              showThinking={showThinking}
              onToggleThinking={() => setShowThinking((v) => !v)}
              styleStrength={styleStrength}
              onStyleStrength={changeStyleStrength}
            />
            <Chat
              key={projectName}
              projectName={projectName}
              model={chatMode.model}
              mode={chatMode.mode}
              template={null}
              autoPrompt={autoPrompt}
              onAutoPromptConsumed={() => setAutoPrompt(null)}
              onPreviewUrl={setPreviewUrl}
              onCost={(c) => setCost((prev) => prev + c)}
              onContext={() => {}}
              onAgentDone={() => { setPreviewKey((k) => k + 1); refreshVersions(); }}
              onChatMode={handleChatMode}
              onToast={pushToast}
              showThinking={showThinking}
              styleStrength={styleStrength}
            />
            <Preview
              url={previewUrl}
              reloadKey={previewKey}
              errors={[]}
              onFix={() => {}}
              onReload={() => setPreviewKey((k) => k + 1)}
              inspecting={false}
              onToggleInspect={() => {}}
              selectedElement={null}
              onClearSelection={() => {}}
              onApplyStyle={() => {}}
            />
          </Suspense>
        </div>
      )}

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Nouveau projet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Annuler</Button>
            <Button variant="primary" disabled={!newDesc.trim()} onClick={createProject}>Créer &amp; ouvrir l'atelier</Button>
          </>
        }
      >
        <p className="mb-2 text-dim">
          Nomme le projet — l'atelier s'ouvre avec le composer <span className="text-ink">vide</span> : aucune
          construction n'est lancée maintenant, c'est toi qui décides ensuite (Construire / Discuter / Planifier).
        </p>
        <Textarea
          autoFocus
          rows={1}
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); createProject(); } }}
          placeholder="nom-du-projet — ex. mango-boutique"
        />
        {newDesc.trim() && slugify(newDesc) !== newDesc.trim() && (
          <p className="mt-2 font-mono text-[11px] text-faint">Créé sous : workspace/{slugify(newDesc)}</p>
        )}
      </Modal>

      <ConfirmModal config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  );
}
