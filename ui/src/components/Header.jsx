import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Brain, Building2, Cloud, Gauge, Gem, Globe, GraduationCap, Layers, LayoutGrid, Loader2, Puzzle, Rocket, Shield, Sparkles, Trash2, Triangle, Zap } from "lucide-react";
import Dropdown, { DropdownItem } from "./Dropdown.jsx";
import { NEUTRAL, t } from "../neutral.js";

const DEPLOY_TARGETS = [
  { id: "cloudflare", label: "Cloudflare Pages", hint: "Edge gratuit — défaut", icon: Cloud },
  { id: "vercel", label: "Vercel", hint: "Idéal Next.js / SSR", icon: Triangle },
  { id: "netlify", label: "Netlify", hint: "Sites statiques + forms", icon: Globe },
];

const MODELS = [
  { id: "haiku", label: "Haiku", hint: "Rapide, projets simples", icon: Zap },
  { id: "sonnet", label: "Sonnet", hint: "Équilibré (recommandé)", icon: Gauge },
  { id: "opus", label: "Opus", hint: "Puissant, plus cher", icon: Brain },
  { id: "eleve", label: t("Élève · GLM-5.2", "Student · GLM-5.2"), hint: t("GLM-5.2 cloud (Ollama) — Claude en secours", "GLM-5.2 cloud — Claude as backup"), icon: GraduationCap },
];

const MODES = [
  { id: "mvp", label: "MVP", hint: "Rapide & économe — droit au but", icon: Zap },
  { id: "elite", label: "Élite", hint: "Qualité max — analyse + vérif visuelle", icon: Gem },
  { id: "finition", label: "Finition", hint: "Durcissement & QA — pas de nouvelle feature", icon: Shield },
  { id: "esthetique", label: "Esthétique", hint: "Raffinement graphique — micro-interactions, animations, finitions", icon: Sparkles },
  { id: "projet", label: "Gros Projet", hint: "Site multi-pages / jeu multi-stages — socle-d'abord puis page par page (Kanban)", icon: Building2 },
  { id: "compose", label: "App composable", hint: "Une app d'une suite qui se parle — manifest + données partagées (OS d'apps)", icon: Puzzle },
  { id: "uxui",   label: "Agent UX/UI",   hint: "shadcn · accessibilité · micro-interactions — Gemma local (#145)", icon: Layers },
  { id: "layout", label: "Agent Layout",  hint: "CSS Grid · Flex · Container Queries · responsive — Gemma local (#145)", icon: LayoutGrid },
];

export default function Header({
  projectName,
  onHome,
  onBack = null,
  backLabel = "Retour",
  model,
  onModel,
  mode,
  onMode,
  canDeploy,
  deploying,
  onDeploy,
  deployedUrl,
  cost,
  context,
  canDelete = false,
  onDeleteProject = null,
}) {
  const current = MODELS.find((m) => m.id === model) ?? MODELS[1];
  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[1];

  return (
    <header
      data-tour="header"
      className="flex h-14 shrink-0 items-center gap-3 border-b border-edge bg-panel px-4"
    >
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm text-dim hover:bg-edge-soft hover:text-ink transition-colors"
          title={`Retour — ${backLabel}`}
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">{backLabel}</span>
        </button>
      )}

      <button
        onClick={onHome}
        className="flex items-center gap-2 font-extrabold tracking-tight hover:opacity-80 transition-opacity"
        title="Retour à l'accueil"
      >
        <span className="text-xl">🥭</span>
        <span>
          Mango<span className="text-accent-soft">AI</span>
        </span>
      </button>

      <span className="text-edge">/</span>
      <span className="truncate font-mono text-[13px] text-dim" title="Projet actif">
        {projectName}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {deployedUrl && (
          <a
            href={deployedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 max-w-52 items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/10 px-3 font-mono text-xs text-ok hover:bg-ok/20 transition-colors"
            title="Site publié"
          >
            <Globe size={13} className="shrink-0" />
            <span className="truncate">{deployedUrl.replace("https://", "")}</span>
          </a>
        )}

        <Dropdown
          dataTour="mode"
          button={
            <>
              <currentMode.icon
                size={14}
                className={mode === "elite" ? "text-accent-soft" : "text-dim"}
              />
              {currentMode.label}
            </>
          }
        >
          {(close) =>
            MODES.map((m) => (
              <DropdownItem
                key={m.id}
                icon={m.icon}
                label={m.label}
                hint={m.hint}
                active={m.id === mode}
                onClick={() => { onMode(m.id); close(); }}
              />
            ))
          }
        </Dropdown>

        <Dropdown
          dataTour="model"
          button={
            <>
              <current.icon size={14} className="text-accent-soft" />
              {current.label}
            </>
          }
        >
          {(close) =>
            MODELS.map((m) => (
              <DropdownItem
                key={m.id}
                icon={m.icon}
                label={m.label}
                hint={m.hint}
                active={m.id === model}
                onClick={() => { onModel(m.id); close(); }}
              />
            ))
          }
        </Dropdown>

        {canDeploy && (
          <Dropdown
            width="w-64"
            align="right"
            dataTour="deploy"
            button={
              <>
                {deploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                {deploying ? "Publication…" : "Publier"}
              </>
            }
            buttonClass="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-soft disabled:opacity-60 transition"
            disabled={deploying}
          >
            {(close) =>
              DEPLOY_TARGETS.map((t) => (
                <DropdownItem
                  key={t.id}
                  icon={t.icon}
                  label={t.label}
                  hint={t.hint}
                  onClick={() => { onDeploy(t.id); close(); }}
                />
              ))
            }
          </Dropdown>
        )}

        {context && <ContextGauge tokens={context.tokens} window={context.window} />}

        <span className="font-mono text-xs text-faint" title="Coût cumulé de la session">
          ${cost.toFixed(4)}
        </span>

        {canDelete && onDeleteProject && (
          <>
            <span className="text-edge">|</span>
            <DeleteProjectButton onConfirm={onDeleteProject} />
          </>
        )}
      </div>
    </header>
  );
}

// Poubelle + confirmation ancrée JUSTE sous le bouton (popover), au lieu du
// window.confirm() natif centré en haut d'écran : le curseur n'a quasi pas à
// bouger pour confirmer.
function DeleteProjectButton({ onConfirm }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Supprimer ce projet et revenir à l'accueil"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500"
      >
        <Trash2 size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-edge bg-panel p-3 shadow-xl shadow-black/30">
          <p className="mb-2.5 text-xs leading-relaxed text-dim">
            Supprimer ce projet ? Cette action est irréversible.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setOpen(false); onConfirm?.(); }}
              className="flex-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
            >
              Supprimer
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextGauge({ tokens, window: win }) {
  const pct = Math.min(100, Math.round((tokens / win) * 100));
  const color = pct >= 70 ? "bg-err" : pct >= 50 ? "bg-warn" : "bg-ok";
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-xs text-faint"
      title={`Contexte : ${Math.round(tokens / 1000)}k / ${Math.round(win / 1000)}k tokens — compression auto au-delà de 70 %`}
    >
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-edge-soft">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}
