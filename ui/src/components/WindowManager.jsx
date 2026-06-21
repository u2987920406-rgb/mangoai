import { Suspense, lazy, useState, useEffect } from "react";
import {
  BookOpen, Bot, FileText, FlaskConical, FolderOpen, HelpCircle,
  Image as ImageIcon, Layers, Lightbulb, Music2, Network, Palette,
  Plus, Search, Sliders, Sparkles, Trash2,
} from "lucide-react";
import Window from "./Window.jsx";
import ConfirmDelete from "./ConfirmDelete.jsx";
import { slugify } from "../slugify.js";

const AgentFactory      = lazy(() => import("./AgentFactory.jsx"));
const Artifacts         = lazy(() => import("./Artifacts.jsx"));
const Guide             = lazy(() => import("./Guide.jsx"));
const Ideation          = lazy(() => import("./Ideation.jsx"));
const NotesRAG          = lazy(() => import("./NotesRAG.jsx"));
const DocGenerator      = lazy(() => import("./DocGenerator.jsx"));
const PromptLab         = lazy(() => import("./PromptLab.jsx"));
const DesignReview      = lazy(() => import("./DesignReview.jsx"));
const MultiProject      = lazy(() => import("./MultiProject.jsx"));
const SuperAgentBuilder = lazy(() => import("./SuperAgentBuilder.jsx"));

function PanelLoader() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted">
      Chargement…
    </div>
  );
}

function ComingSoon({ icon: Icon, title, subtitle, envKey }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
        <Icon size={32} className="text-accent/60" />
      </div>
      <div>
        <p className="text-lg font-semibold text-ink">{title}</p>
        {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
      </div>
      <p className="max-w-sm text-xs text-faint leading-relaxed">
        Fonctionnalité en cours de développement.{" "}
        {envKey && (
          <>
            Configurez{" "}
            <code className="rounded bg-edge-soft px-1 font-mono text-accent">{envKey}</code>
            {" "}dans{" "}
            <code className="rounded bg-edge-soft px-1 font-mono text-accent">server/.env</code>
            {" "}pour activer cette fonctionnalité.
          </>
        )}
      </p>
    </div>
  );
}

// ─── Formulaire de création de projet ────────────────────────────────────────
function NewProjectForm({ onCreate, onCancel }) {
  const [desc, setDesc] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const slug = nameEdited ? slugify(name) : slugify(desc);
  const ready = desc.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent/[0.05] p-3">
      <textarea
        value={desc}
        onChange={(e) => { setDesc(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && ready) onCreate(slug, desc.trim());
        }}
        placeholder="Décris l'app que tu veux créer — une phrase suffit pour démarrer…"
        rows={3}
        className="w-full resize-none rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint/60 focus:border-accent focus:outline-none leading-relaxed"
        autoFocus
      />
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-faint">Nom :</span>
        <input
          value={slug}
          onChange={(e) => { setNameEdited(true); setName(e.target.value); }}
          className="h-7 min-w-0 flex-1 rounded-lg border border-edge bg-bg px-2.5 font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-edge px-3 py-1.5 text-[12px] text-dim hover:text-ink transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={() => ready && onCreate(slug, desc.trim())}
          disabled={!ready}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-md shadow-accent/30 hover:opacity-90 disabled:opacity-40 transition-all"
        >
          <Sparkles size={13} />
          Créer & construire
        </button>
      </div>
    </div>
  );
}

// ─── Fenêtre Mango App Builder ────────────────────────────────────────────────
function ProjectsWindow({ win, onClose }) {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const onOpen = win.props?.onOpen;
  const onDelete = win.props?.onDelete;

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => { setProjects(d.projects ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? projects.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
    : projects;

  // Création → ouvre le workspace avec le prompt initial (le build + la preview suivent)
  function handleCreate(name, prompt) {
    onOpen?.(name, { prompt });
    onClose(win.id);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {/* Création de projet */}
      {creating ? (
        <NewProjectForm onCreate={handleCreate} onCancel={() => setCreating(false)} />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 bg-accent/[0.04] px-3 py-2.5 text-[13px] font-medium text-accent-soft hover:bg-accent/10 transition-colors"
        >
          <Plus size={15} />
          Nouveau projet
        </button>
      )}

      {/* Recherche */}
      {projects.length > 0 && (
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les projets…"
            className="h-8 w-full rounded-lg border border-edge bg-bg pl-8 pr-3 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-xs text-faint">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-faint">
          {search.trim()
            ? `Aucun projet trouvé pour « ${search} »`
            : "Aucun projet pour l'instant — clique sur « Nouveau projet » pour démarrer."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto nice-scroll">
          {filtered.map((p) => (
            <div
              key={p}
              className="group relative flex items-center rounded-xl border border-edge bg-bg hover:border-accent/50 hover:bg-raised transition-colors"
            >
              <button
                onClick={() => { onOpen?.(p, {}); onClose(win.id); }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-l-xl px-3 py-2.5 text-left"
              >
                <FolderOpen size={13} className="shrink-0 text-dim group-hover:text-accent-soft transition-colors" />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{p}</span>
              </button>
              <ConfirmDelete
                onConfirm={async () => {
                  const ok = await onDelete?.(p);
                  if (ok !== false) setProjects((prev) => prev.filter((x) => x !== p));
                }}
                message={`Supprimer « ${p} » ? Cette action est irréversible.`}
                align="right"
                triggerTitle="Supprimer le projet"
                triggerClassName="hidden group-hover:flex h-full items-center rounded-r-xl border-l border-edge px-2.5 text-faint hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </ConfirmDelete>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Launcher — grille de toutes les apps & outils ────────────────────────────
const LAUNCHER_SECTIONS = [
  {
    title: "Apps",
    items: [
      { id: "projects",   label: "App Builder",   icon: FolderOpen,   run: (a) => a.onOpenProjects?.() },
      { id: "image",      label: "Image Creator", icon: ImageIcon,    run: (a) => a.onOpenWindow?.({ type: "image-creator", title: "Image Creator", width: 900, height: 640 }) },
      { id: "music",      label: "Music Creator", icon: Music2,       run: (a) => a.onOpenWindow?.({ type: "music-creator", title: "Music Creator", width: 900, height: 640 }) },
      { id: "agent",      label: "Agent Factory", icon: Bot,          run: (a) => a.onOpenWindow?.({ type: "agent-factory", title: "Agent Factory", width: 1100, height: 700 }) },
      { id: "superagent", label: "Super Agent",   icon: Network,      run: (a) => a.onOpenApp?.("superagent") },
      { id: "ideation",   label: "Ideation",      icon: Lightbulb,    run: (a) => a.onOpenApp?.("ideation") },
      { id: "multi",      label: "Multi-Projet",  icon: Layers,       run: (a) => a.onOpenApp?.("multi") },
      { id: "notes",      label: "Notes & RAG",   icon: BookOpen,     run: (a) => a.onOpenApp?.("notes") },
      { id: "docs",       label: "Doc",           icon: FileText,     run: (a) => a.onOpenApp?.("docs") },
      { id: "promptlab",  label: "Prompt Lab",    icon: FlaskConical, run: (a) => a.onOpenApp?.("promptlab") },
      { id: "design",     label: "Design Review", icon: Palette,      run: (a) => a.onOpenApp?.("design") },
    ],
  },
  {
    title: "Outils",
    items: [
      { id: "artifacts", label: "Artefacts",      icon: Sparkles,   run: (a) => a.onOpenWindow?.({ type: "artifacts", title: "Artefacts · Blackboard", width: 780, height: 600 }) },
      { id: "guide",     label: "Aide",           icon: HelpCircle, run: (a) => a.onOpenWindow?.({ type: "guide", title: "Aide", width: 740, height: 600 }) },
      { id: "editor",    label: "Éditeur visuel", icon: Sliders,    run: (a) => a.onOpenSidePanel?.() },
    ],
  },
];

function LauncherWindow({ win, onClose }) {
  const actions = win.props?.actions ?? {};
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto nice-scroll p-5">
      {LAUNCHER_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-faint">
            {section.title}
          </p>
          <div className="grid grid-cols-4 gap-2.5">
            {section.items.map(({ id, label, icon: Icon, run }) => (
              <button
                key={id}
                onClick={() => { run(actions); onClose(win.id); }}
                className="group flex flex-col items-center gap-2 rounded-xl border border-edge bg-bg px-3 py-4
                           hover:border-accent/50 hover:bg-raised transition-colors"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/15 bg-accent/[0.07] text-accent-soft transition-colors group-hover:bg-accent/15">
                  <Icon size={20} />
                </span>
                <span className="text-center text-[12px] leading-tight text-dim group-hover:text-ink transition-colors">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WindowContent({ win, onClose }) {
  if (win.type === "projects") {
    return <ProjectsWindow win={win} onClose={onClose} />;
  }
  if (win.type === "launcher") {
    return <LauncherWindow win={win} onClose={onClose} />;
  }
  if (win.type === "artifacts") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <Artifacts />
      </Suspense>
    );
  }
  if (win.type === "guide") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <Guide />
      </Suspense>
    );
  }
  if (win.type === "ideation") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <Ideation
          onBack={() => onClose(win.id)}
          onStartCoding={(desc) => { win.props?.onStartCoding?.(desc); onClose(win.id); }}
        />
      </Suspense>
    );
  }
  if (win.type === "notes") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <NotesRAG onBack={() => onClose(win.id)} onToast={win.props?.onToast} />
      </Suspense>
    );
  }
  if (win.type === "docs") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <DocGenerator onBack={() => onClose(win.id)} />
      </Suspense>
    );
  }
  if (win.type === "promptlab") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <PromptLab onBack={() => onClose(win.id)} />
      </Suspense>
    );
  }
  if (win.type === "design") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <DesignReview onBack={() => onClose(win.id)} projectName={win.props?.projectName} />
      </Suspense>
    );
  }
  if (win.type === "multi") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <MultiProject onBack={() => onClose(win.id)} />
      </Suspense>
    );
  }
  if (win.type === "superagent") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <SuperAgentBuilder onBack={() => onClose(win.id)} projectName={win.props?.projectName} />
      </Suspense>
    );
  }
  if (win.type === "agent-factory") {
    return (
      <Suspense fallback={<PanelLoader />}>
        <AgentFactory onBack={() => onClose(win.id)} />
      </Suspense>
    );
  }
  if (win.type === "image-creator") {
    return (
      <ComingSoon
        icon={ImageIcon}
        title="Image Creator"
        subtitle="Génération d'images via FLUX"
        envKey="REPLICATE_API_TOKEN"
      />
    );
  }
  if (win.type === "music-creator") {
    return (
      <ComingSoon
        icon={Music2}
        title="Music Creator"
        subtitle="Génération musicale via AudioCraft / MusicGen"
        envKey="REPLICATE_API_TOKEN"
      />
    );
  }
  return null;
}

export default function WindowManager({ windows, onClose, onFocus, onMove, onResize }) {
  if (windows.length === 0) return null;
  return (
    <>
      {windows.map((win) => (
        <Window
          key={win.id}
          win={win}
          onClose={onClose}
          onFocus={onFocus}
          onMove={onMove}
          onResize={onResize}
        >
          <WindowContent win={win} onClose={onClose} />
        </Window>
      ))}
    </>
  );
}
