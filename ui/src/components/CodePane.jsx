// Section « Code » (#193, docs/plan-193-section-code.md) — chat agentique FRONTIÈRE-ONLY
// sur des projets locaux EXTERNES au workspace MangoOS. Réutilise Chat.jsx/Preview.jsx tels
// quels (même moteur que le Builder) mais SANS WorkspaceTools/ProjectSwitcher/versions/deploy
// (tous workspace-spécifiques) et SANS useChatActionModels (jamais de menu modèle, jamais de
// repli "eleve" — le cerveau est verrouillé côté serveur, cf. code-route.ts::resolveFrontierModel).
import { lazy, Suspense, useEffect, useState } from "react";
import { Code2, ArrowLeft } from "lucide-react";
import { Button, EmptyState, cx, TEXT } from "../design";
import ExternalProjectPicker from "./ExternalProjectPicker.jsx";

const Chat = lazy(() => import("../Chat.jsx"));
const Preview = lazy(() => import("../Preview.jsx"));

const PROJECT_KEY = "mangoos.codeProject"; // clé DISTINCTE de mangoos.project (Workspace)

export default function CodePane({ onBack = () => {} }) {
  const [enabled, setEnabled] = useState(null); // null = pas encore su
  const [project, setProject] = useState(() => {
    try {
      const raw = localStorage.getItem(PROJECT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    fetch("/api/flags/code-section")
      .then((r) => r.json())
      .then((d) => setEnabled(Boolean(d?.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  function selectProject(p) {
    setProject(p);
    try { localStorage.setItem(PROJECT_KEY, JSON.stringify(p)); } catch { /* stockage indisponible : session-only */ }
  }

  function backToPicker() {
    setProject(null);
    try { localStorage.removeItem(PROJECT_KEY); } catch { /* rien de plus à faire */ }
  }

  if (enabled === null) {
    return <div className={cx(TEXT.base, "flex h-full items-center justify-center text-faint")}>Chargement…</div>;
  }

  if (!enabled) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b border-edge px-6 py-4 shrink-0">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>Accueil</Button>
        </div>
        <EmptyState
          icon={<Code2 size={30} />}
          title="Section Code désactivée"
          description="Active CODE_SECTION=on côté serveur (server/.env) pour débloquer le chat frontière sur tes projets locaux."
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-edge px-6 py-4 shrink-0">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={project ? backToPicker : onBack}>
          {project ? "Changer de projet" : "Accueil"}
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-ink">Code</h1>
          <p className="text-xs text-dim">
            {project ? project.label : "Débogage et construction agentique — cerveau frontière, toujours."}
          </p>
        </div>
      </div>

      {!project ? (
        <ExternalProjectPicker onSelect={selectProject} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<div className={cx(TEXT.base, "m-auto text-faint")}>Chargement…</div>}>
            <Chat
              key={project.id}
              projectName={`ext:${project.id}`}
              apiPath="/api/code-chat"
              model="opus"
              mode="elite"
              template={null}
              onPreviewUrl={() => {}}
              onCost={() => {}}
              onContext={() => {}}
              onAgentDone={() => {}}
              onToast={() => {}}
            />
            <Preview
              url={null}
              reloadKey={0}
              errors={[]}
              onFix={() => {}}
              onReload={() => {}}
              inspecting={false}
              onToggleInspect={() => {}}
              selectedElement={null}
              onClearSelection={() => {}}
              onApplyStyle={() => {}}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
