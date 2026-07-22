import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Squircle } from "lucide-react";
import Chat from "./Chat.jsx";
import Preview from "./Preview.jsx";
import Home from "./components/Home.jsx";
import Header from "./components/Header.jsx";
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
const Radar           = lazy(() => import("./components/Radar.jsx"));
const Reglages        = lazy(() => import("./components/Reglages.jsx"));
// #193 — section Code (docs/plan-193-section-code.md), portée depuis le shell v2
// (gelé, jamais monté en prod — cf. main.jsx) vers le vrai shell de prod.
const CodePane         = lazy(() => import("./components/CodePane.jsx"));
import { useToasts } from "./hooks/useToasts.js";
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
  const [styleStrength, setStyleStrength] = useState(100); // curseur 0→100 % du goût Mango
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [perfectPlanContract, setPerfectPlanContract] = useState(null);
  // #196 — Multi-Projet : opt-in par projet (marqueur serveur, pas localStorage —
  // doit être lisible par scenario.ts au moment de bâtir le prompt système).
  const [multiProjectEnabled, setMultiProjectEnabled] = useState(false);
  const { windows, openWindow, closeWindow, focusWindow, moveWindow, resizeWindow } = useWindowManager();
  const { toasts, pushToast, dismissToast } = useToasts();
  const {
    previewUrl, setPreviewUrl,
    previewKey, bumpPreview, refreshPreview,
    previewErrors, clearErrors,
    inspecting, toggleInspect,
    seedInput, setSeedInput, clearSeed,
    editTarget, clearEditTarget,
    requestFix,
    resetForProject: resetPreview,
  } = usePreview({ screen, projectName, pushToast, onRequestFix: setPendingPrompt });
  const {
    status: backendStatus,
    starting: backendStarting, // (Un, 2026-07-03) U7 — garde anti double-clic « Démarrer »
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
    onRolledBack: refreshPreview,
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

  useEffect(() => {
    if (screen !== SCREENS.WORKSPACE || !projectName.trim()) { setMultiProjectEnabled(false); return; }
    fetch(`/api/multi-project/status/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setMultiProjectEnabled(Boolean(d.enabled)))
      .catch(() => setMultiProjectEnabled(false));
  }, [screen, projectName]);

  function handleMultiProject(val) {
    setMultiProjectEnabled(val);
    fetch(`/api/multi-project/status/${encodeURIComponent(projectName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: val }),
    }).catch(() => {});
  }

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
    const savedStyle = Number(localStorage.getItem(`mangoos.styleStrength.${name}`));
    setStyleStrength(Number.isFinite(savedStyle) && savedStyle >= 0 && savedStyle <= 100 ? savedStyle : 100);
    setScreen(SCREENS.WORKSPACE);
  }

  function handleClientMode(val) {
    setClientMode(val);
    localStorage.setItem(`mangoos.clientMode.${projectName}`, String(val));
  }

  function handleStyleStrength(val) {
    setStyleStrength(val);
    localStorage.setItem(`mangoos.styleStrength.${projectName}`, String(val));
  }

  function goHome() {
    refreshProjects();
    setScreen(SCREENS.HOME);
  }

  const globalChrome = (
    <>
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
  // vivent dans Réglages ; `controleur` est ouvert par le rail projet.
  let panelContent = null;
  if (screen === SCREENS.CONTROLEUR) panelContent = <ControleurPanel projectName={projectName} onBack={() => setScreen(SCREENS.WORKSPACE)} />;
  if (screen === SCREENS.METRICS) panelContent = <MetricsDashboard onBack={() => setScreen(SCREENS.HOME)} />;
  if (screen === SCREENS.REGLAGES) panelContent = <Reglages onBack={() => setScreen(SCREENS.HOME)} />;
  if (screen === SCREENS.CODE) panelContent = <CodePane onBack={() => setScreen(SCREENS.HOME)} />;

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
      case WINDOWS.DOCS:
        return openWindow({ type: WINDOWS.DOCS, title: "Générateur de docs", width: 900, height: 680 });
      case WINDOWS.TASTE:
        return openWindow({ type: WINDOWS.TASTE, title: "Variantes de goût", width: 1120, height: 780, props: { projectName } });
      case WINDOWS.MULTI:
        return openWindow({ type: WINDOWS.MULTI, title: "Multi-Projet", width: 1000, height: 720 });
      case WINDOWS.SUITE:
        // #138 OS d'apps — fenêtre Suite : liste les apps composables et leur
        // donnée partagée. `onOpen` = openProject pour le bouton Ouvrir.
        return openWindow({ type: WINDOWS.SUITE, title: "Suite — OS d'apps", width: 1000, height: 720, props: { onOpen: openProject } });
      default:
        return undefined;
    }
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
    backendStarting, // (Un, 2026-07-03) U7
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
    styleStrength,
    onStyleStrength: handleStyleStrength,
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
    multiProjectEnabled,
    onMultiProject: handleMultiProject,
    onOpenMultiProjectBrowser: () => openAppWindow(WINDOWS.MULTI),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {panelContent ? (
          <Suspense fallback={<PanelLoader />}>{panelContent}</Suspense>
        ) : screen === SCREENS.HOME ? (
          <Home
            onOpen={openProject}
            onOpenWindow={openWindow}
            onOpenAppBuilder={openProjectsWindow}
            onOpenApp={openAppWindow}
            onOpenSidePanel={() => setSidePanelOpen(true)}
            onOpenSettings={() => setScreen(SCREENS.REGLAGES)}
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
                if (!ok) return;
                // Rester dans le workspace : basculer vers le projet restant le plus récent
                // (la liste /api/projects est triée par récence). Accueil seulement si plus aucun.
                const remaining = projects.filter((p) => p !== projectName && p !== "__mirror__");
                if (remaining.length > 0) openProject(remaining[0]);
                else goHome();
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
                  refreshPreview();
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
                clientMode={clientMode}
                styleStrength={styleStrength}
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
