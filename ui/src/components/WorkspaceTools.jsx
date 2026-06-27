import { useState } from "react";
import {
  Briefcase, BrainCircuit, ClipboardCheck, Download, Eye, EyeOff,
  GitFork, Hammer, History, Loader2, Server, ShieldCheck, Sparkles, Squircle, Trash2,
} from "lucide-react";
import Knowledge from "./Knowledge.jsx";
import BuildReview from "./BuildReview.jsx";
import PanelShell from "./PanelShell.jsx";
import ProjectKanban from "./ProjectKanban.jsx";

// ─── Bouton du rail d'outils projet ───────────────────────────────────────────
function RailBtn({ icon: Icon, label, active = false, onClick, badge }) {
  return (
    <div className="group relative w-full">
      <button
        onClick={onClick}
        className={`relative flex h-12 w-full items-center justify-center rounded-lg transition-colors ${
          active ? "bg-accent/15 text-accent" : "text-dim hover:bg-edge-soft hover:text-ink"
        }`}
      >
        <Icon size={20} className={active ? "text-accent" : ""} />
        {badge != null && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent/80 px-1 text-[9px] font-semibold text-white">
            {badge}
          </span>
        )}
      </button>
      {/* Tooltip à droite (rail collé au bord gauche du workspace) */}
      <div
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2
                   whitespace-nowrap rounded-lg border border-edge bg-panel px-3 py-1.5
                   text-xs text-ink shadow-xl opacity-0 transition-opacity group-hover:opacity-100"
      >
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-panel" />
      </div>
    </div>
  );
}

function Sep() {
  return <div className="my-1.5 w-7 self-center border-t border-[#FF9500]/20" />;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Panneau Versions ──────────────────────────────────────────────────────────
function VersionsPanel({ versions, onRollback, onClose }) {
  return (
    <PanelShell title="Versions" onClose={onClose}>
      <div className="flex flex-col gap-1 p-2">
        {versions.map((v) => (
          <button
            key={v.hash}
            onClick={() => { onRollback(v.hash); onClose(); }}
            className="flex flex-col rounded-lg px-2.5 py-2 text-left hover:bg-edge-soft transition-colors"
          >
            <span className="text-[13px] text-ink">{v.message}</span>
            <span className="text-[11px] text-faint">{formatDate(v.date)}</span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

// ─── Panneau Backend ───────────────────────────────────────────────────────────
function BackendPanel({ status, onScaffold, onStart, onStop, onClose }) {
  const { scaffolded, running, url } = status;
  return (
    <PanelShell title="Backend" onClose={onClose}>
      <div className="flex flex-col gap-3 p-4">
        {!scaffolded ? (
          <>
            <p className="text-xs text-dim">Aucun backend Express pour ce projet.</p>
            <button
              onClick={onScaffold}
              className="rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-dim hover:border-faint hover:text-ink transition-colors"
            >
              Ajouter un backend Express
            </button>
          </>
        ) : running ? (
          <>
            <div className="flex items-center gap-2 text-sm text-ok">
              <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
              Actif — {url}
            </div>
            <button
              onClick={onStop}
              className="rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err hover:bg-err/20 transition-colors"
            >
              Arrêter
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-dim">Backend arrêté.</p>
            <button
              onClick={onStart}
              className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn hover:bg-warn/20 transition-colors"
            >
              Démarrer
            </button>
          </>
        )}
      </div>
    </PanelShell>
  );
}

// ─── Panneau Perfect Plan ─────────────────────────────────────────────────────
function PerfectPlanPanel({ contract, onDelete, onClose }) {
  if (!contract) {
    return (
      <PanelShell title="Perfect Plan" onClose={onClose}>
        <div className="p-4">
          <p className="text-xs text-dim">Aucun Perfect Plan actif pour ce projet.</p>
          <p className="mt-2 text-[11px] text-faint">
            Créez un nouveau projet depuis l'accueil pour définir les contraintes avant de démarrer.
          </p>
        </div>
      </PanelShell>
    );
  }
  const LABELS = { type: "Type", style: "Style", navigation: "Navigation", data: "Données", ambiance: "Ambiance" };
  const activeRefs = contract.refs?.filter((r) => r.value?.trim()) ?? [];
  return (
    <PanelShell title="Perfect Plan" onClose={onClose}>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-soft">Contrat actif</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {contract.answers?.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-faint min-w-[72px]">{LABELS[a.id] ?? a.id}</span>
              <span className="text-[12px] text-ink font-medium text-right">{a.label}</span>
            </div>
          ))}
        </div>
        {activeRefs.length > 0 && (
          <>
            <div className="border-t border-edge" />
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">Références</p>
              {activeRefs.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[9px] font-semibold uppercase text-faint min-w-[36px] pt-0.5">{r.kind}</span>
                  <span className="min-w-0 flex-1 break-all text-[11px] text-dim">{r.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <button
          onClick={onDelete}
          className="mt-1 flex items-center gap-2 rounded-lg border border-err/30 bg-err/5 px-3 py-1.5 text-xs text-err hover:bg-err/10 transition-colors"
        >
          <Trash2 size={12} />
          Supprimer ce plan
        </button>
      </div>
    </PanelShell>
  );
}

// ─── Panneau GitHub ────────────────────────────────────────────────────────────
function GithubPanel({ pushingGithub, onGithub, githubUrl, onClose }) {
  const [customRepo, setCustomRepo] = useState("");
  return (
    <PanelShell title="GitHub" onClose={onClose}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-faint">Repo cible (optionnel)</label>
          <input
            type="text"
            value={customRepo}
            onChange={(e) => setCustomRepo(e.target.value)}
            placeholder="nom-du-repo existant"
            className="rounded-lg border border-edge bg-panel px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-faint">Laisser vide = repo nommé d'après le projet.</p>
        </div>
        <button
          onClick={() => onGithub(customRepo.trim() || undefined)}
          disabled={pushingGithub}
          className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-dim hover:border-faint hover:text-ink disabled:opacity-60 transition-colors"
        >
          {pushingGithub ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GitFork size={14} />
          )}
          {pushingGithub ? "Envoi…" : githubUrl ? "Re-pousser" : "Pousser sur GitHub"}
        </button>
        {githubUrl && (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-2 font-mono text-xs text-dim hover:border-faint hover:text-ink transition-colors"
          >
            <GitFork size={13} />
            <span className="truncate">{githubUrl.replace("https://github.com/", "")}</span>
          </a>
        )}
      </div>
    </PanelShell>
  );
}

// ─── Rail d'outils contextuels du projet (façon VS Code) ──────────────────────
export default function WorkspaceTools({
  projectName,
  versions = [],
  onRollback,
  canGithub = false,
  pushingGithub = false,
  onGithub,
  githubUrl,
  backendStatus = null,
  onBackendScaffold,
  onBackendStart,
  onBackendStop,
  showThinking = true,
  onToggleThinking,
  clientMode = false,
  onClientMode,
  perfectPlanContract = null,
  onDeletePerfectPlan,
  onOpenMirror,
  onMangoQA,
  onBuildIncrement,
  planRefresh = 0,
  agentBusy = false,
}) {
  const [active, setActive] = useState(null);
  const toggle = (id) => setActive((v) => (v === id ? null : id));
  const close = () => setActive(null);

  return (
    <div className="flex h-full shrink-0 border-r border-edge">
      {/* Rail d'icônes */}
      <div className="flex w-14 flex-col items-center gap-0.5 bg-panel/60 px-1.5 py-2">
        <RailBtn icon={BrainCircuit} label="Mémoire" active={active === "memoire"} onClick={() => toggle("memoire")} />
        <RailBtn icon={ClipboardCheck} label="Revue du build" active={active === "revue"} onClick={() => toggle("revue")} />
        {versions.length > 0 && (
          <RailBtn icon={History} label="Versions" badge={versions.length} active={active === "versions"} onClick={() => toggle("versions")} />
        )}
        {backendStatus && (
          <RailBtn icon={Server} label="Backend" active={active === "backend" || backendStatus.running} onClick={() => toggle("backend")} />
        )}
        {canGithub && (
          <RailBtn icon={GitFork} label="GitHub" active={active === "github"} onClick={() => toggle("github")} />
        )}
        <RailBtn icon={Sparkles} label="Perfect Plan" active={active === "perfectPlan" || Boolean(perfectPlanContract)} onClick={() => toggle("perfectPlan")} />
        {/* #139 Gros Projet — le Kanban de pages/stages du chantier */}
        <RailBtn icon={Hammer} label="Chantier (Gros Projet)" active={active === "chantier"} onClick={() => toggle("chantier")} />

        <Sep />

        {/* Actions directes (sans panneau) */}
        <RailBtn icon={ShieldCheck} label="MangoQA" onClick={() => { close(); onMangoQA?.(); }} />
        <RailBtn icon={Squircle} label="Mode Miroir" onClick={() => { close(); onOpenMirror?.(); }} />
        {onClientMode && (
          <RailBtn
            icon={Briefcase}
            label={clientMode ? "Mode Client ✓" : "Mode Client"}
            active={clientMode}
            onClick={() => onClientMode(!clientMode)}
          />
        )}
        <RailBtn
          icon={showThinking ? Eye : EyeOff}
          label={showThinking ? "Masquer la réflexion" : "Afficher la réflexion"}
          active={showThinking}
          onClick={() => onToggleThinking?.()}
        />
        {projectName && (
          <a href={`/api/export/${encodeURIComponent(projectName)}`} download className="w-full">
            <RailBtn icon={Download} label="Exporter le projet (zip)" />
          </a>
        )}
      </div>

      {/* Panneau contextuel (le Chantier est plus large pour ses 3 colonnes) */}
      {active && (
        <div className={`${active === "chantier" ? "w-[560px]" : "w-72"} overflow-hidden border-l border-edge bg-panel`}>
          {active === "memoire" && (
            <PanelShell title="Mémoire" onClose={close}>
              <Knowledge projectName={projectName} />
            </PanelShell>
          )}
          {active === "revue" && (
            <PanelShell title="Revue du build" onClose={close}>
              {/* key=projet → remonte un panneau FRAIS à chaque changement de projet
                  (pas de review périmée, pas de réponse async d'un autre projet) */}
              <BuildReview key={projectName} projectName={projectName} />
            </PanelShell>
          )}
          {active === "versions" && (
            <VersionsPanel versions={versions} onRollback={onRollback} onClose={close} />
          )}
          {active === "backend" && backendStatus && (
            <BackendPanel
              status={backendStatus}
              onScaffold={onBackendScaffold}
              onStart={onBackendStart}
              onStop={onBackendStop}
              onClose={close}
            />
          )}
          {active === "github" && (
            <GithubPanel
              pushingGithub={pushingGithub}
              onGithub={onGithub}
              githubUrl={githubUrl}
              onClose={close}
            />
          )}
          {active === "perfectPlan" && (
            <PerfectPlanPanel
              contract={perfectPlanContract}
              onDelete={() => { onDeletePerfectPlan?.(); close(); }}
              onClose={close}
            />
          )}
          {active === "chantier" && (
            <PanelShell title="Chantier — Gros Projet" onClose={close}>
              <ProjectKanban
                projectName={projectName}
                onBuild={onBuildIncrement}
                refreshKey={planRefresh}
                busy={agentBusy}
              />
            </PanelShell>
          )}
        </div>
      )}
    </div>
  );
}
