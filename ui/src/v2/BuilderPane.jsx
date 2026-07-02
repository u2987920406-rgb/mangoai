// App Builder DANS le shell 2.0 (Phase C3) — monte les VRAIS Chat + Preview de la 1.0
// avec l'état parent minimal (projet, previewUrl, model/mode, coût). La 1.0 reste la
// référence complète jusqu'à parité (audit-mango-2.0 §5).
//
// Revue UX 2026-07-02 : graine de l'Accueil (autoPrompt) + « Nouveau projet » (modale)
// + RAIL WORKSPACE réel (Mémoire · Revue · Dosage de style · Versions · Réflexion)
// + suppression de projet confirmée. Panneaux Backend/GitHub/PerfectPlan/Kanban :
// leurs boutons de rail restent masqués tant que leurs props ne sont pas câblées.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen, Boxes, Plus, Trash2, Zap, Gem, Shield, Sparkles, ChevronDown,
  Rocket, Cloud, Triangle, Globe, GitBranch, Download, ExternalLink, Loader2, SlidersHorizontal,
  Hammer, Layers, X, ClipboardList,
} from "lucide-react";
import { api } from "../api";
import { slugify } from "../slugify.js";
import { useAppState } from "../state/AppState";
import { useVersions } from "../hooks/useVersions.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { EmptyState, Button, Textarea, Modal, cx, TEXT } from "../design";

const Chat = lazy(() => import("../Chat.jsx"));
const Preview = lazy(() => import("../Preview.jsx"));
const WorkspaceTools = lazy(() => import("../components/WorkspaceTools.jsx"));
const PerfectPlan = lazy(() => import("../components/PerfectPlan.jsx"));
const ProjectKanban = lazy(() => import("../components/ProjectKanban.jsx"));

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

// Cibles de déploiement (POST /api/deploy/:name) — reprises de Header.jsx 1.0.
const DEPLOY_TARGETS = [
  { id: "cloudflare", label: "Cloudflare Pages", hint: "Edge gratuit — défaut", icon: Cloud },
  { id: "vercel",     label: "Vercel",           hint: "Idéal Next.js / SSR",   icon: Triangle },
  { id: "netlify",    label: "Netlify",          hint: "Sites statiques + forms", icon: Globe },
];

// Menu « Publier » : déploie l'app sur un hébergeur statique en un clic.
function PublishMenu({ disabled, deploying, onDeploy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button
        variant="primary"
        size="sm"
        icon={deploying ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
        disabled={disabled || deploying}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {deploying ? "Publication…" : "Publier"}
        <ChevronDown size={12} />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl">
          {DEPLOY_TARGETS.map((t) => {
            const TIcon = t.icon;
            return (
              <button
                key={t.id}
                role="menuitem"
                onClick={() => { onDeploy(t.id); setOpen(false); }}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raised"
              >
                <TIcon size={15} className="mt-0.5 shrink-0 text-dim" />
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink">{t.label}</span>
                  <span className="block text-[11px] leading-snug text-faint">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Dosage de style (0→100 % du goût Mango) — version COMPACTE pour la barre supérieure
// (remonté du rail à la demande de Raf). Bouton + popover avec curseur et presets.
function StyleControl({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);
  const PRESETS = [0, 25, 50, 75, 100];
  const label =
    value >= 100 ? "Plein style Mango" :
    value <= 0 ? "Style libre (le sujet mène)" :
    value >= 75 ? "Surtout mon style" :
    value <= 25 ? "Surtout le sujet" : "Équilibre";
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dosage de style"
        aria-label={`Dosage de style : ${value} %`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cx(TEXT.base, "flex items-center gap-1.5 rounded-lg border border-edge bg-bg px-2 py-1 text-ink transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-accent")}
      >
        <SlidersHorizontal size={13} className="text-accent-soft" />
        Style {value}%
        <ChevronDown size={12} className="text-faint" />
      </button>
      {open && (
        <div role="dialog" aria-label="Dosage de style" className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-edge bg-panel p-3 shadow-2xl">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-ink">{value}%</span>
            <span className="text-[12px] font-semibold text-accent-soft">{label}</span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="mt-1 flex justify-between">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => onChange(p)}
                className={cx("rounded-md px-2 py-1 text-[11px] transition-colors", value === p ? "bg-accent/20 font-semibold text-accent-soft" : "text-faint hover:text-dim")}
              >
                {p}%
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Part de TON style (palette, typo, design system) vs l'identité propre du sujet. Mémorisé par projet, appliqué au prochain message.
          </p>
        </div>
      )}
    </div>
  );
}

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
  const { pushToast, builderSeed, consumeBuilderSeed, newProjectNonce } = useAppState();
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
  // Aiguillage de la modale de création : "rapide" (0 q → construction), "perfect"
  // (15 q → app unique planifiée) ou "chantier" (30 q → gros projet multi-pages + Kanban).
  const [newKind, setNewKind] = useState("rapide");
  // Flux PLANIFIÉ (Perfect Plan → build). Le « chantier » ajoute squelette + Kanban.
  const [isBigProject, setIsBigProject] = useState(false); // le projet courant est-il un GROS CHANTIER ?
  const [perfectPlanFor, setPerfectPlanFor] = useState(null); // nom du projet dont l'assistant est ouvert
  const [perfectPlanKind, setPerfectPlanKind] = useState("perfect"); // "perfect" (15 q) | "chantier" (30 q)
  const [chantierOpen, setChantierOpen] = useState(false); // panneau Kanban ouvert
  const [buildRequest, setBuildRequest] = useState(null); // Kanban → Chat (build d'un incrément)
  const [planRefresh, setPlanRefresh] = useState(0); // force le Kanban à recharger après un tour
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

  // « Nouveau projet » demandé depuis une autre section (ex. Projets) → ouvre la modale.
  useEffect(() => {
    if (newProjectNonce > 0) { setNewOpen(true); setNewDesc(""); setNewIsBig(false); }
  }, [newProjectNonce]);

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

  // Détecte si le projet courant est un GROS CHANTIER (→ mode projet + Kanban). Un Perfect
  // Plan (app unique) a aussi un contrat mais NE déclenche PAS le Chantier : on tranche sur
  // `kind`. Rétrocompat : un contrat sans `kind` (avant cette feature) = ancien gros projet.
  useEffect(() => {
    if (!projectName) { setIsBigProject(false); return; }
    let alive = true;
    api(`/api/perfect-plan/${encodeURIComponent(projectName)}`)
      .then((c) => {
        if (!alive) return;
        const big = c?.kind ? c.kind === "chantier" : Boolean(c?.answers?.length);
        setIsBigProject(big);
      })
      .catch(() => { if (alive) setIsBigProject(false); });
    return () => { alive = false; };
  }, [projectName]);

  const pickProject = (name) => {
    setProjectName(name);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    setAutoPrompt(null);
    setChantierOpen(false);
  };

  // Changer le palier de build : persiste, et l'applique aussitôt si on est en mode build.
  const changeTier = (t) => {
    setBuildTier(t);
    try { localStorage.setItem(TIER_KEY, t); } catch { /* localStorage indispo */ }
    setChatMode((cm) => (cm.mode === "discuss" ? cm : { ...cm, mode: t }));
  };

  // Le chat rapporte "elite" quand on clique Construire (helper Chat), "discuss" pour
  // Planifier/Discuter. Gros projet → Construire envoie mode "projet" (squelette+incréments) ;
  // petit projet → le palier choisi (mvp/elite/finition/esthetique). Discuter intact.
  const handleChatMode = ({ model, mode }) => {
    setChatMode({ model, mode: mode === "elite" ? (isBigProject ? "projet" : buildTier) : mode });
  };

  // Règle UX de Raf : le formulaire ne fait que NOMMER. Rapide = composer vide ;
  // Perfect Plan (15 q) et Gros chantier (30 q) = ouvrent l'assistant AVANT le projet.
  const createProject = () => {
    const raw = newDesc.trim();
    if (!raw) return;
    const name = slugify(raw);
    if (newKind === "perfect" || newKind === "chantier") {
      setPerfectPlanKind(newKind);
      setPerfectPlanFor(name); // → l'assistant s'ouvre ; le lancement se fait dans launchPlanned
      return;
    }
    // RAPIDE : 0 question, on ouvre direct en construction (composer vide).
    setNewOpen(false);
    setNewDesc("");
    setNewKind("rapide");
    setProjects((prev) => (prev.includes(name) ? prev : [name, ...prev]));
    setProjectName(name);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    setAutoPrompt(null); // composer vide — c'est Raf qui décide de Construire/Discuter/Planifier
    pushToast("ok", `Projet « ${name} » créé — décris, discute ou planifie quand tu veux`);
  };

  // L'assistant (Perfect Plan 15 q OU Gros chantier 30 q) est validé → enregistre le contrat
  // (avec son `kind`), ouvre le projet en mode planifié. Le CHANTIER pose en plus un squelette
  // multi-pages + active le Kanban ; le PERFECT PLAN construit l'app unique selon le plan.
  const launchPlanned = async ({ answers, refs }) => {
    const name = perfectPlanFor;
    const kind = perfectPlanKind;
    setPerfectPlanFor(null);
    setNewOpen(false);
    setNewDesc("");
    setNewKind("rapide");
    try {
      await api(`/api/perfect-plan/${encodeURIComponent(name)}`, { method: "POST", body: { answers, refs, kind } });
    } catch { /* toast global — mais on continue d'ouvrir le projet */ }
    setProjects((prev) => (prev.includes(name) ? prev : [name, ...prev]));
    setProjectName(name);
    setIsBigProject(kind === "chantier");
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
    if (kind === "chantier") {
      setChatMode({ model: "eleve", mode: "projet" });
      setAutoPrompt(
        "Démarre ce gros projet : pose d'abord le SQUELETTE (design system + router multi-pages + layout partagé + pages placeholder) selon le Perfect Plan, puis écris le plan des pages/stages. Ne construis pas encore le contenu détaillé.",
      );
      pushToast("ok", `Gros chantier « ${name} » — pose du squelette lancée`);
    } else {
      // PERFECT PLAN : une app unique, construite d'un bloc selon le contrat (pas de Kanban).
      setChatMode({ model: "eleve", mode: buildTier });
      setAutoPrompt(
        "Construis cette application en respectant à la lettre le Perfect Plan ci-dessus (type, objectif, style, ambiance, navigation, données, contraintes). Vise un rendu COMPLET, cohérent et soigné en une seule app (pas un squelette). Utilise de vraies images si pertinent, puis finis proprement.",
      );
      pushToast("ok", `Perfect Plan « ${name} » — construction planifiée lancée`);
    }
  };

  // Kanban → Chat : construit un incrément (page/stage). Repris de App.jsx (1.0).
  const buildIncrement = (inc) => {
    setChatMode({ model: "eleve", mode: "projet" });
    const prompt =
      `Construis l'incrément « ${inc.title} »${inc.route ? ` (route ${inc.route})` : ""}. ` +
      `Ne touche qu'à cette page/stage, réutilise le squelette existant (router, layout, design tokens, modèle de données), ` +
      `puis marque cet incrément "done" dans .project-plan.json.`;
    setBuildRequest({ id: Date.now(), prompt, incrementId: inc.id });
    setChantierOpen(false);
  };

  // Publication / GitHub — endpoints 1.0 (POST /api/deploy, /api/github). Peuvent
  // échouer sans jetons configurés (Cloudflare/Vercel/Netlify/GitHub) → toast honnête.
  const [deploying, setDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState(null);
  const [pushingGithub, setPushingGithub] = useState(false);

  const deploy = async (target) => {
    if (!projectName || deploying) return;
    setDeploying(true);
    setDeployedUrl(null);
    try {
      const d = await api(`/api/deploy/${encodeURIComponent(projectName)}`, { method: "POST", body: { target } });
      setDeployedUrl(d.url);
      pushToast("ok", `Publié sur ${target} → ${d.url}`);
    } catch { /* toast global (jeton manquant, agent occupé…) */ }
    finally { setDeploying(false); }
  };

  const pushGithub = async () => {
    if (!projectName || pushingGithub) return;
    setPushingGithub(true);
    try {
      const d = await api(`/api/github/${encodeURIComponent(projectName)}`, { method: "POST", body: { private: true } });
      pushToast("ok", `Poussé sur GitHub → ${d.url}`);
      window.open(d.url, "_blank", "noopener");
    } catch { /* toast global (GITHUB_TOKEN manquant…) */ }
    finally { setPushingGithub(false); }
  };

  // Export zip : téléchargement direct (GET), pas d'appel api() (réponse binaire).
  const exportZip = () => {
    if (!projectName) return;
    window.location.href = `/api/export/${encodeURIComponent(projectName)}`;
  };

  useEffect(() => { setDeployedUrl(null); }, [projectName]);

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
      {/* Barre projet réorganisée : GAUCHE = créer + sélectionner · DROITE = build + publier + supprimer.
          (Réorg demandée par Raf : « + tout à gauche », publier/GitHub/export à droite, poubelle tout à droite.) */}
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge-soft px-4">
        {/* — Gauche : créer, puis choisir — */}
        <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => setNewOpen(true)}>
          Nouveau
        </Button>
        <FolderOpen size={14} className="text-faint" />
        <select
          value={projectName}
          onChange={(e) => pickProject(e.target.value)}
          aria-label="Choisir un projet"
          className={cx(TEXT.base, "max-w-[240px] rounded-lg border border-edge bg-bg px-2 py-1 text-ink outline-none focus:border-faint")}
        >
          <option value="">— choisir un projet —</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <span className={cx(TEXT.xs, "font-mono text-dim")}>${cost.toFixed(4)}</span>

        {/* — Droite : dosage de style · palier/gros-projet · publier/GitHub/export · supprimer — */}
        <div className="ml-auto flex items-center gap-2">
          {projectName && <StyleControl value={styleStrength} onChange={changeStyleStrength} />}
          {isBigProject ? (
            <>
              <span className={cx(TEXT.base, "flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-accent-soft")} title="Projet multi-pages piloté par un plan">
                <Layers size={13} /> Gros projet
              </span>
              <Button variant="secondary" size="sm" icon={<Hammer size={13} />} onClick={() => setChantierOpen(true)}>
                Chantier
              </Button>
            </>
          ) : (
            <ModeSelector tier={buildTier} onPick={changeTier} />
          )}
          {projectName && (
            <>
              <div className="mx-0.5 h-5 w-px bg-edge-soft" />
              {deployedUrl && (
                <a
                  href={deployedUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={deployedUrl}
                  className={cx(TEXT.xs, "flex max-w-[160px] items-center gap-1 text-ok hover:underline")}
                >
                  <ExternalLink size={11} className="shrink-0" />
                  <span className="truncate">{deployedUrl.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
              <PublishMenu disabled={!projectName} deploying={deploying} onDeploy={deploy} />
              <Button
                variant="secondary" size="sm" iconOnly icon={pushingGithub ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                onClick={pushGithub} disabled={pushingGithub}
                title="Pousser sur GitHub" aria-label="Pousser sur GitHub"
              />
              <Button
                variant="secondary" size="sm" iconOnly icon={<Download size={14} />}
                onClick={exportZip}
                title="Exporter le projet (.zip)" aria-label="Exporter le projet en zip"
              />
              <Button
                variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />}
                onClick={askDeleteProject} className="hover:text-err"
                title="Supprimer ce projet" aria-label="Supprimer ce projet"
              />
            </>
          )}
        </div>
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
              hidden={["memoire", "mangoqa", "mirror", "thinking", "style", "perfectPlan", "chantier"]}
            />
            <Chat
              key={projectName}
              projectName={projectName}
              model={chatMode.model}
              mode={chatMode.mode}
              template={null}
              autoPrompt={autoPrompt}
              onAutoPromptConsumed={() => setAutoPrompt(null)}
              buildRequest={buildRequest}
              onBuildConsumed={() => setBuildRequest(null)}
              onPreviewUrl={setPreviewUrl}
              onCost={(c) => setCost((prev) => prev + c)}
              onContext={() => {}}
              onAgentDone={() => { setPreviewKey((k) => k + 1); refreshVersions(); setPlanRefresh((n) => n + 1); }}
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
        onClose={() => { setNewOpen(false); setNewKind("rapide"); }}
        title="Nouveau projet"
        widthClass="w-[560px]"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setNewOpen(false); setNewKind("rapide"); }}>Annuler</Button>
            <Button variant="primary" disabled={!newDesc.trim()} onClick={createProject}>
              {newKind === "rapide" ? "Créer & ouvrir l'atelier" : "Définir le plan →"}
            </Button>
          </>
        }
      >
        <Textarea
          autoFocus
          rows={1}
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); createProject(); } }}
          placeholder="nom-du-projet — ex. mango-boutique"
        />
        {newDesc.trim() && slugify(newDesc) !== newDesc.trim() && (
          <p className="mt-1.5 font-mono text-[11px] text-faint">Créé sous : workspace/{slugify(newDesc)}</p>
        )}

        {/* Aiguillage : Rapide (0 q → construction) · Perfect Plan (15 q → app planifiée) ·
            Gros chantier (30 q → multi-pages + Kanban). */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { id: "rapide",   icon: Sparkles,      label: "Rapide",       desc: "0 question — l'atelier s'ouvre en construction, tu décides." },
            { id: "perfect",  icon: ClipboardList, label: "Perfect Plan", desc: "15 questions → une app unique, planifiée et soignée." },
            { id: "chantier", icon: Layers,        label: "Gros chantier", desc: "30 questions → multi-pages, squelette puis Chantier page par page." },
          ].map((opt) => {
            const sel = newKind === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => setNewKind(opt.id)}
                className={cx("rounded-xl border p-3 text-left transition-colors", sel ? "border-accent/60 bg-accent/8" : "border-edge hover:border-faint")}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                  <Icon size={14} className={sel ? "text-accent" : "text-dim"} /> {opt.label}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-faint">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Assistant planifié : Perfect Plan (15 q) OU Gros chantier (30 q) selon le fork choisi. */}
      {perfectPlanFor && (
        <Suspense fallback={null}>
          <PerfectPlan
            onClose={() => setPerfectPlanFor(null)}
            onLaunch={launchPlanned}
            count={perfectPlanKind === "chantier" ? 30 : 15}
            title={perfectPlanKind === "chantier" ? "Gros chantier" : "Perfect Plan"}
            launchLabel={perfectPlanKind === "chantier" ? "Lancer le chantier" : "Lancer avec ce plan"}
          />
        </Suspense>
      )}

      {/* Panneau Chantier (Kanban) — seulement pour un gros projet, ouvert depuis la barre. */}
      {chantierOpen && projectName && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setChantierOpen(false); }}>
          <div className="flex h-full w-[600px] max-w-[92vw] animate-fade flex-col border-l border-edge bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-edge-soft px-4 py-3">
              <span className="flex items-center gap-2 text-[14px] font-semibold"><Hammer size={16} className="text-accent-soft" /> Chantier — {projectName}</span>
              <Button variant="ghost" size="sm" iconOnly icon={<X size={15} />} onClick={() => setChantierOpen(false)} aria-label="Fermer" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <Suspense fallback={<div className={cx(TEXT.base, "m-auto p-6 text-faint")}>Chargement du chantier…</div>}>
                <ProjectKanban projectName={projectName} onBuild={buildIncrement} refreshKey={planRefresh} busy={false} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  );
}
