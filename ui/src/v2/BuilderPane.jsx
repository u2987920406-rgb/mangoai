// App Builder DANS le shell 2.0 (Phase C3) — monte les VRAIS Chat + Preview de la 1.0
// avec l'état parent minimal (projet, previewUrl, model/mode, coût). Les extras de
// App.jsx (versions, tutoriel, kanban, seed…) migreront au fil de la Phase C — la 1.0
// reste la référence complète jusqu'à parité (audit-mango-2.0 §5).
import { lazy, Suspense, useEffect, useState } from "react";
import { FolderOpen, Boxes } from "lucide-react";
import { api } from "../api";
import { useAppState } from "../state/AppState";
import { EmptyState, Badge, cx, TEXT } from "../design";

const Chat = lazy(() => import("../Chat.jsx"));
const Preview = lazy(() => import("../Preview.jsx"));

const PROJECT_KEY = "mangoos.v2.project";

export default function BuilderPane() {
  const { pushToast } = useAppState();
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState(() => localStorage.getItem(PROJECT_KEY) || "");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [chatMode, setChatMode] = useState({ model: "eleve", mode: "elite" });
  const [cost, setCost] = useState(0);

  useEffect(() => {
    api("/api/projects")
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PROJECT_KEY, projectName); } catch { /* localStorage indispo */ }
  }, [projectName]);

  const pickProject = (name) => {
    setProjectName(name);
    setPreviewUrl(null);
    setPreviewKey((k) => k + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Barre projet : sélection + coût du tour */}
      <div className="flex h-[42px] shrink-0 items-center gap-2.5 border-b border-edge-soft px-4">
        <FolderOpen size={14} className="text-faint" />
        <select
          value={projectName}
          onChange={(e) => pickProject(e.target.value)}
          className={cx(TEXT.base, "max-w-[280px] rounded-lg border border-edge bg-bg px-2 py-1 text-ink outline-none focus:border-faint")}
        >
          <option value="">— choisir un projet —</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        {projectName && <Badge tone="accent">{chatMode.mode === "elite" ? "Construire" : "Discuter"}</Badge>}
        <span className={cx(TEXT.xs, "ml-auto font-mono text-faint")}>${cost.toFixed(4)}</span>
      </div>

      {!projectName ? (
        <EmptyState
          icon={<Boxes size={30} />}
          title="Choisis un projet pour ouvrir le builder"
          description="Le chat et l'aperçu live se montent ici — même moteur que la 1.0, nouveau shell."
          className="flex-1"
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<div className={cx(TEXT.base, "m-auto text-faint")}>Chargement du builder…</div>}>
            <Chat
              key={projectName}
              projectName={projectName}
              model={chatMode.model}
              mode={chatMode.mode}
              template={null}
              onPreviewUrl={setPreviewUrl}
              onCost={(c) => setCost((prev) => prev + c)}
              onContext={() => {}}
              onAgentDone={() => setPreviewKey((k) => k + 1)}
              onChatMode={setChatMode}
              onToast={pushToast}
              showThinking
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
    </div>
  );
}
