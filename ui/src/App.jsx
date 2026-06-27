import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Squircle } from "lucide-react";
import Chat from "./Chat.jsx";
import Preview from "./Preview.jsx";
import Home from "./components/Home.jsx";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import WorkspaceTools from "./components/WorkspaceTools.jsx";
import Toasts from "./components/Toast.jsx";
import ConfirmModal from "./components/ConfirmModal.jsx";
import SidePanel from "./components/SidePanel.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { NEUTRAL } from "./neutral.js";
import { slugify } from "./slugify.js";
import { SCREENS, WINDOWS, isScreen } from "./nav.js";

// Panneaux lourds chargés à la demande (code-splitting)
// NB : les apps « bureau » (Ideation, NotesRAG, DocGenerator, PromptLab,
// DesignReview, MultiProject, SuperAgentBuilder) sont désormais des fenêtres
// (lazy-importées dans WindowManager.jsx), plus des écrans pleins.
// NB : Billing/Cron/Métriques/Traces/Ablation/Radar/Veille/Tokeniseur/Nocturne
// sont montés DANS l'écran Réglages (Reglages.jsx), plus en écrans `screen` ici.
const ControleurPanel = lazy(() => import("./components/QAPanel.jsx"));
const MetricsDashboard= lazy(() => import("./components/MetricsDashboard.jsx"));
const Tutorial        = lazy(() => import("./components/Tutorial.jsx"));
const Radar           = lazy(() => import("./components/Radar.jsx"));
const Reglages        = lazy(() => import("./components/Reglages.jsx"));
import { useToasts } from "./hooks/useToasts.js";
import { useTutorial } from "./hooks/useTutorial.js";
import { useBackendServer } from "./hooks/useBackendServer.js";
import { useProjectDelivery } from "./hooks/useProjectDelivery.js";
import { useVersions } from "./hooks/useVersions.js";
import { usePreview } from "./hooks/usePreview.js";
import { useWindowManager } from "./hooks/useWindowManager.js";
import WindowManager from "./components/WindowManager.jsx";

function PanelLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted">
      Chargement…
    </div>
  );
}

export default function App() {
  // Écran courant PERSISTÉ : un F5 reste là où on était (Workspace, Réglages…)
  // au lieu de retomber sur l'Accueil. Garde isScreen → un identifiant invalide
  // (ancien/corrompu) retombe proprement sur HOME (pas d'écran fantôme).
  const [screen, setScreen] = useState(() => {
    const saved = localStorage.getItem("mangoos.screen");
    return isScreen(saved) ? saved : SCREENS.HOME;
  });
  useEffect(() => {
    localStorage.setItem("mangoos.screen", screen);
  }, [screen]);
  const [projectName, setProjectName] = useState(
    () => localStorage.getItem("mangoos.project") ?? "mon-app",
  );
  const [projects, setProjects] = useState([]);
  const [reviews, setReviews] = useState({}); // #93 — nom → { score } (étoiles de revue)
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState("");
  const [model, setModel] = useState(() => localStorage.getItem("mangoos.model") ?? "sonnet");
  const [mode, setMode] = useState(() => localStorage.getItem("mangoos.mode") ?? "elite");

  const handleChatMode = useCallback(({ model: m, mode: md }) => {
    setModel(m);
    setMode(md);
    localStorage.setItem("mangoos.model", m);
    localStorage.setItem("mangoos.mode", md);
  }, []);

  // #139 Gros Projet — « Construire » un incrément du Kanban : bascule en mode
  // projet et envoie un tour borné à cette page/stage (Chat consomme buildRequest).
  const buildIncrement = useCallback((inc) => {
    setMode("projet");
    localStorage.setItem("mangoos.mode", "projet");
    setChatBusy(true);
    const prompt = `Construis l'incrément « ${inc.title} »${inc.route ? ` (route ${inc.route})` : ""}. `
      + `Ne touche qu'à cette page/stage, réutilise le squelette existant (router, layout, design tokens, modèle de données), `
      + `puis marque cet incrément "done" dans .project-plan.json.`;
    setBuildRequest({ id: Date.now(), prompt, incrementId: inc.id });
  }, []);

  const [cost, setCost] = useState(0);
  const [context, setContext] = useState(null);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  // #139 Gros Projet — requête de build d'incrément (Kanban → Chat) + nonce de
  // rafraîchissement du Kanban après chaque tour + busy pour griser « Construire ».
  const [buildRequest, setBuildRequest] = useState(null);
  const [planRefresh, setPlanRefresh] = useState(0);
  const [chatBusy, setChatBusy] = useState(false);
  const [showThinking, setShowThinking] = useState(() => localStorage.getItem("mangoos.showThinking") !== "false");
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [workspaceOrigin, setWorkspaceOrigin] = useState(null);
  const [initialTask, setInitialTask] = useState(null);
  const [nocturnalEntry, setNocturnalEntry] = useState(null);
  const [clientMode, setClientMode] = useState(false);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [perfectPlanContract, setPerfectPlanContract] = useState(null);
  const { windows, openWindow, closeWindow, focusWindow, moveWindow, resizeWindow } = useWindowManager();
  const { toasts, pushToast, dismissToast } = useToasts();
  const {
    previewUrl, setPreviewUrl,
    previewKey, bumpPreview,
    previewErrors, clearErrors,
    inspecting, toggleInspect,
    seedInput, setSeedInput, clearSeed,
    editTarget, clearEditTarget,
    requestFix,
    resetForProject: resetPreview,
  } = usePreview({ screen, projectName, pushToast, onRequestFix: setPendingPrompt });
  const {
    active: tutorialActive,
    id: tutorialId,
    nextId: tutorialNextId,
    start: startTutorial,
    enterContext: enterTutorialContext,
    exit: exitTutorial,
    startNext: startNextTutorial,
    complete: completeTutorial,
  } = useTutorial({ setScreen, pushToast });
  const {
    status: backendStatus,
    scaffold: scaffoldBackend,
    start: startBackend,
    stop: stopBackend,
  } = useBackendServer({ projectName, pushToast });
  const { deployedUrl, githubUrl, deploying, pushingGithub, deploy, pushGithub } =
    useProjectDelivery({ projectName, pushToast });
  const { versions, refresh: refreshVersions, askRollback } = useVersions({
    projectName,
    pushToast,
    confirm: setConfirmCfg,
    onRolledBack: bumpPreview,
  });

  useEffect(() => { localStorage.setItem("mangoos.project", projectName); }, [projectName]);
  useEffect(() => { localStorage.setItem("mangoos.model", model); }, [model]);
  useEffect(() => { localStorage.setItem("mangoos.mode", mode); }, [mode]);

  const refreshProjects = useCallback(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => {
        setProjects(d.projects ?? []);
        setTemplates(d.templates ?? []);
        setReviews(d.reviews ?? {}); // #93 — note de revue par projet (étoiles), partagée avec le sélecteur
        setGithubEnabled(Boolean(d.githubEnabled));
      })
      .catch(() => {});
  }, []);

  const handleDeleteProject = useCallback(async (name) => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushToast("error", d.error ?? `Suppression impossible (HTTP ${res.status})`);
        return false;
      }
      refreshProjects();
      return true;
    } catch (err) {
      pushToast("error", `Suppression impossible : ${err.message ?? err}`);
      return false;
    }
  }, [refreshProjects, pushToast]);

  const handleDeleteProjects = useCallback(async (names) => {
    const failed = [];
    for (const name of names) {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
        if (!res.ok) failed.push(name);
      } catch { failed.push(name); }
    }
    refreshProjects();
    if (failed.length) {
      pushToast("error", `${failed.length}/${names.length} non supprimé(s) — ${failed.join(", ")}`);
    } else {
      pushToast("success", `${names.length} projet(s) supprimé(s)`);
    }
  }, [refreshProjects, pushToast]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && !d.hasProfile) setOnboardingNeeded(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (screen !== SCREENS.WORKSPACE || !projectName.trim()) { setPerfectPlanContract(null); return; }
    fetch(`/api/perfect-plan/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPerfectPlanContract(d))
      .catch(() => setPerfectPlanContract(null));
  }, [screen, projectName]);

  async function openProject(name, { template: tpl = "", prompt = null, origin = null, task = null, nocturnal = null, contract = null } = {}) {
    if (contract) {
      try {
        await fetch(`/api/perfect-plan/${encodeURIComponent(name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contract),
        });
      } catch { /* non-bloquant */ }
    }
    setProjectName(name);
    setTemplate(tpl);
    setPendingPrompt(prompt);
    setWorkspaceOrigin(origin);
    setInitialTask(task);
    setNocturnalEntry(nocturnal);
    resetPreview();
    setContext(null);
    setPerfectPlanContract(null);
    setClientMode(localStorage.getItem(`mangoos.clientMode.${name}`) === "true");
    setScreen(SCREENS.WORKSPACE);
  }

  function handleClientMode(val) {
    setClientMode(val);
    localStorage.setItem(`mangoos.clientMode.${projectName}`, String(val));
  }

  function goHome() {
    refreshProjects();
    setScreen(SCREENS.HOME);
  }

  const tutorialOverlay =
    tutorialActive && tutorialId != null ? (
      <Suspense fallback={null}>
        <Tutorial
          id={tutorialId}
          onComplete={completeTutorial}
          onExit={exitTutorial}
          onStartNext={startNextTutorial}
          onContext={enterTutorialContext}
        />
      </Suspense>
    ) : null;

  const globalChrome = (
    <>
      {tutorialOverlay}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <ConfirmModal config={confirmCfg} onClose={() => setConfirmCfg(null)} />
      <WindowManager
        windows={windows}
        onClose={closeWindow}
        onFocus={focusWindow}
        onMove={moveWindow}
        onResize={resizeWindow}
      />
    </>
  );

  // Panneaux plein-écran (lazy). Les outils système (Billing/Cron/Métriques/…)
  // vivent dans Réglages ; `metrics` reste routé ici car le tutoriel #9 y mène
  // (enterTutorialContext("metrics")) ; `controleur` est ouvert par le rail projet.
  let panelContent = null;
  if (screen === SCREENS.CONTROLEUR) panelContent = <ControleurPanel projectName={projectName} onBack={() => setScreen(SCREENS.WORKSPACE)} />;
  if (screen === SCREENS.METRICS) panelContent = <MetricsDashboard onBack={() => setScreen(SCREENS.HOME)} />;
  if (screen === SCREENS.REGLAGES) panelContent = (
    <Reglages
      onBack={() => setScreen(SCREENS.HOME)}
      onOpenProject={(name, entry) => openProject(name, { origin: "nocturnal", task: entry?.task ?? null, nocturnal: entry ? { id: entry.id, reviewed: Boolean(entry.reviewed) } : null })}
    />
  );

  if (onboardingNeeded) {
    return <Onboarding onDone={() => setOnboardingNeeded(false)} />;
  }

  // Ouvre la fenêtre Mango App Builder (liste + création de projets)
  const openProjectsWindow = () => openWindow({
    type: WINDOWS.PROJECTS,
    title: "Mango App Builder",
    width: 820,
    height: 560,
    props: { onOpen: openProject, onDelete: handleDeleteProject },
  });

  // Ouvre une app « bureau » en fenêtre flottante (uniformisation OS — P4)
  const openAppWindow = (id) => {
    switch (id) {
      case WINDOWS.IDEATION:
        return openWindow({
          type: WINDOWS.IDEATION, title: "Ideation", width: 900, height: 680,
          props: { onStartCoding: (desc) => openProject(slugify(desc), { prompt: desc }) },
        });
      case WINDOWS.NOTES:
        return openWindow({ type: WINDOWS.NOTES, title: "Notes & RAG", width: 960, height: 680, props: { onToast: pushToast } });
      case WINDOWS.DOCS:
        return openWindow({ type: WINDOWS.DOCS, title: "Générateur de docs", width: 900, height: 680 });
      case WINDOWS.PROMPTLAB:
        return openWindow({ type: WINDOWS.PROMPTLAB, title: "Prompt Lab", width: 1000, height: 680 });
      case WINDOWS.DESIGN:
        return openWindow({ type: WINDOWS.DESIGN, title: "Design Review", width: 1000, height: 720, props: { projectName } });
      case WINDOWS.TASTE:
        return openWindow({ type: WINDOWS.TASTE, title: "Variantes de goût", width: 1120, height: 780, props: { projectName } });
      case WINDOWS.MULTI:
        return openWindow({ type: WINDOWS.MULTI, title: "Multi-Projet", width: 1000, height: 720 });
      case WINDOWS.SUPERAGENT:
        return openWindow({ type: WINDOWS.SUPERAGENT, title: "Super Agent Builder", width: 900, height: 700, props: { projectName } });
      case WINDOWS.SUITE:
        // #138 OS d'apps — fenêtre Suite : liste les apps composables et leur
        // donnée partagée. `onOpen` = openProject pour le bouton Ouvrir.
        return openWindow({ type: WINDOWS.SUITE, title: "Suite — OS d'apps", width: 1000, height: 720, props: { onOpen: openProject } });
      default:
        return undefined;
    }
  };

  // Ouvre le Launcher (grille de toutes les apps & outils)
  const openLauncher = () => openWindow({
    type: WINDOWS.LAUNCHER,
    title: "Toutes les apps",
    width: 720,
    height: 560,
    props: {
      actions: {
        onOpenProjects: openProjectsWindow,
        onOpenWindow: openWindow,
        onOpenApp: openAppWindow,
        onOpenSidePanel: () => setSidePanelOpen(true),
      },
    },
  });

  // Dock latéral droit — apps headline + Launcher + Réglages + Tutoriels + Thème
  const sidebarProps = {
    onOpenProjects: openProjectsWindow,
    onOpenWindow: openWindow,
    onOpenLauncher: openLauncher,
    onOpenSuite: () => openAppWindow("suite"),
    onSetScreen: setScreen,
    onStartTutorial: startTutorial,
    nextTutorialId: tutorialNextId,
  };

  // Outils contextuels du projet — rail VS-Code dans le workspace
  const workspaceToolsProps = {
    projectName,
    versions,
    onRollback: askRollback,
    canGithub: githubEnabled && projects.includes(projectName),
    pushingGithub,
    onGithub: pushGithub,
    githubUrl,
    backendStatus: projects.includes(projectName) ? backendStatus : null,
    onBackendScaffold: scaffoldBackend,
    onBackendStart: startBackend,
    onBackendStop: stopBackend,
    showThinking,
    onToggleThinking: () => {
      setShowThinking((v) => {
        const next = !v;
        localStorage.setItem("mangoos.showThinking", String(next));
        return next;
      });
    },
    clientMode,
    onClientMode: handleClientMode,
    perfectPlanContract,
    onDeletePerfectPlan: async () => {
      await fetch(`/api/perfect-plan/${encodeURIComponent(projectName)}`, { method: "DELETE" }).catch(() => {});
      setPerfectPlanContract(null);
    },
    onOpenMirror: () => openProject("__mirror__"),
    onMangoQA: () => setScreen(SCREENS.CONTROLEUR),
    onBuildIncrement: buildIncrement,
    planRefresh,
    agentBusy: chatBusy,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar {...sidebarProps} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {panelContent ? (
          <Suspense fallback={<PanelLoader />}>{panelContent}</Suspense>
        ) : screen === SCREENS.HOME ? (
          <Home
            onOpen={openProject}
            onOpenWindow={openWindow}
            onOpenAppBuilder={openProjectsWindow}
            onOpenLauncher={openLauncher}
            model={model}
            onModel={(m) => { setModel(m); localStorage.setItem("mangoos.model", m); }}
          />
        ) : (
          <>
            <Header
              projectName={projectName}
              onHome={goHome}
              onBack={() => (workspaceOrigin ? setScreen(workspaceOrigin) : goHome())}
              backLabel={workspaceOrigin === "nocturnal" ? "Review nocturne" : "Accueil"}
              projects={projects}
              reviews={reviews}
              onSwitchProject={(name) => { if (name !== projectName) openProject(name); }}
              onRefreshProjects={refreshProjects}
              model={model}
              onModel={setModel}
              mode={mode}
              onMode={setMode}
              canDeploy={projects.includes(projectName)}
              deploying={deploying}
              onDeploy={deploy}
              deployedUrl={deployedUrl}
              cost={cost}
              context={context}
              canDelete={projects.includes(projectName) && projectName !== "__mirror__"}
              onDeleteProject={async () => {
                const ok = await handleDeleteProject(projectName);
                if (ok) goHome();
              }}
            />
            {projectName === "__mirror__" && (
              <div className="flex shrink-0 items-center gap-2 border-b border-accent/30 bg-accent/[0.06] px-4 py-1.5 text-xs text-accent-soft">
                <Squircle size={13} />
                <span>Mode Miroir — l'agent édite l'interface de Mango. Vite HMR applique les changements en direct. Tout est récupérable via git.</span>
              </div>
            )}
            <div className="flex min-h-0 flex-1">
              <WorkspaceTools {...workspaceToolsProps} />
              <Chat
                projectName={projectName}
                model={model}
                mode={mode}
                template={template}
                seedHistory={initialTask}
                nocturnalEntry={nocturnalEntry}
                onReviewed={() => setNocturnalEntry((e) => (e ? { ...e, reviewed: true } : e))}
                onPreviewUrl={setPreviewUrl}
                onCost={(c) => setCost((prev) => prev + c)}
                onContext={setContext}
                onAgentDone={() => {
                  clearErrors();
                  bumpPreview();
                  refreshVersions();
                  refreshProjects();
                  // #139 — un tour est fini : rafraîchir le Kanban + libérer « Construire ».
                  setChatBusy(false);
                  setPlanRefresh((n) => n + 1);
                }}
                autoPrompt={pendingPrompt}
                onAutoPromptConsumed={() => setPendingPrompt(null)}
                seedInput={seedInput}
                onSeedConsumed={clearSeed}
                editTarget={editTarget}
                onEditTargetConsumed={clearEditTarget}
                showThinking={showThinking}
                onChatMode={handleChatMode}
                onToast={pushToast}
                tutorialId={tutorialActive ? tutorialId : null}
                clientMode={clientMode}
                buildRequest={buildRequest}
                onBuildConsumed={() => setBuildRequest(null)}
              />
              <Preview
                url={previewUrl}
                reloadKey={previewKey}
                errors={previewErrors}
                onFix={requestFix}
                onReload={bumpPreview}
                inspecting={inspecting}
                onToggleInspect={toggleInspect}
                selectedElement={editTarget}
                onClearSelection={clearEditTarget}
                onApplyStyle={setSeedInput}
              />
            </div>
          </>
        )}
      </div>

      <SidePanel isOpen={sidePanelOpen} onClose={() => setSidePanelOpen(false)} />
      {globalChrome}
    </div>
  );
}
