import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownAZ, ArrowLeft, Brain, Building2, Check, ChevronDown, Clock, Cloud, FolderOpen, Gauge, Gem, Globe, GraduationCap, Layers, LayoutGrid, Loader2, Puzzle, Rocket, Search, Shield, Sparkles, Star, Trash2, Triangle, Zap } from "lucide-react";
import Dropdown, { DropdownItem } from "./Dropdown.jsx";
import { NEUTRAL, t } from "../neutral.js";
import { useEleveLabel } from "../hooks/useEleveLabel.js";
import ContextGauge from "./ContextGauge.jsx";

const DEPLOY_TARGETS = [
  { id: "cloudflare", label: "Cloudflare Pages", hint: "Edge gratuit — défaut", icon: Cloud },
  { id: "vercel", label: "Vercel", hint: "Idéal Next.js / SSR", icon: Triangle },
  { id: "netlify", label: "Netlify", hint: "Sites statiques + forms", icon: Globe },
];

// "eleve" n'a pas de nom fixe — c'est le cerveau local configuré dans Réglages
// (brain-registry.json). Le libellé/hint ci-dessous est le REPLI avant que
// useEleveLabel() (dans le composant) ait résolu le vrai nom (voir plus bas).
const MODELS = [
  { id: "haiku", label: "Haiku", hint: "Rapide, projets simples", icon: Zap },
  { id: "sonnet", label: "Sonnet", hint: "Équilibré (recommandé)", icon: Gauge },
  { id: "opus", label: "Opus", hint: "Puissant, plus cher", icon: Brain },
  { id: "eleve", label: t("Élève", "Student"), hint: t("Cerveau local (Ollama) — Claude en secours", "Local brain (Ollama) — Claude as backup"), icon: GraduationCap },
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
  projects = [],
  reviews = {},
  onSwitchProject = null,
  onRefreshProjects = null,
}) {
  // Raf (2026-07-11) : "Élève · GLM-5.2" était codé en dur et ne suivait jamais le
  // choix fait dans Réglages (brain-registry.json). On surcharge son label/hint
  // avec le VRAI cerveau local configuré, dès qu'il est connu.
  const eleveLabel = useEleveLabel();
  const models = useMemo(
    () =>
      MODELS.map((m) =>
        m.id === "eleve" && eleveLabel
          ? { ...m, label: t(`Élève · ${eleveLabel}`, `Student · ${eleveLabel}`), hint: t(`${eleveLabel} (local, Ollama) — Claude en secours`, `${eleveLabel} (local, Ollama) — Claude as backup`) }
          : m,
      ),
    [eleveLabel],
  );
  const current = models.find((m) => m.id === model) ?? models[1];
  const currentMode = MODES.find((m) => m.id === mode) ?? MODES[1];

  return (
    <header
      data-tour="header"
      className="flex h-14 shrink-0 items-center gap-1.5 border-b border-edge bg-panel px-2 sm:gap-3 sm:px-4"
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
        <span className="hidden sm:inline">
          Mango<span className="text-accent-soft">AI</span>
        </span>
      </button>

      <span className="text-edge">/</span>
      {onSwitchProject ? (
        <ProjectSwitcher
          projectName={projectName}
          projects={projects}
          reviews={reviews}
          onSwitch={onSwitchProject}
          onRefresh={onRefreshProjects}
        />
      ) : (
        <span className="truncate font-mono text-[13px] text-dim" title="Projet actif">
          {projectName}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
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
              <span className="hidden sm:inline">{currentMode.label}</span>
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
              <span className="hidden sm:inline">{current.label}</span>
            </>
          }
        >
          {(close) =>
            models.map((m) => (
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
                <span className="hidden sm:inline">{deploying ? "Publication…" : "Publier"}</span>
              </>
            }
            buttonClass="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 sm:px-3.5 text-[13px] font-semibold text-white shadow-lg shadow-accent/25 hover:bg-accent-soft disabled:opacity-60 transition"
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

        {context && (
          <div className="hidden sm:block">
            <ContextGauge tokens={context.tokens} window={context.window} />
          </div>
        )}

        <span className="hidden font-mono text-xs text-faint sm:inline" title="Coût cumulé de la session">
          ${cost.toFixed(4)}
        </span>

        {canDelete && onDeleteProject && (
          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
            <span className="text-edge">|</span>
            <DeleteProjectButton onConfirm={onDeleteProject} />
          </div>
        )}
      </div>
    </header>
  );
}

// Sélecteur de projet dans l'en-tête du workspace : on bascule vers un autre
// projet en un clic, SANS repasser par l'accueil (demande de Raf). Le nom du
// projet actif devient un menu déroulant — recherche collante en haut + liste
// scrollable des projets (nice-scroll) en dessous. Ferme au clic extérieur/Échap.
export function ProjectSwitcher({ projectName, projects, reviews = {}, onSwitch, onRefresh = null }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Tri choisi (filtre) : « date » = ordre de récence renvoyé par l'API (défaut) ;
  // « name » = alphabétique côté client. Persisté → le choix de Raf colle d'une session
  // à l'autre. (L'API renvoie déjà la récence ; on n'a donc qu'à trier par nom au besoin.)
  const [sortMode, setSortMode] = useState(() => {
    try { return localStorage.getItem("mangoos.projectSort") || "date"; } catch { return "date"; }
  });
  const chooseSort = (m) => {
    setSortMode(m);
    try { localStorage.setItem("mangoos.projectSort", m); } catch { /* stockage indispo */ }
  };
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // À chaque ouverture : recherche vide (liste complète) + rafraîchit la liste
  // (un projet créé ailleurs apparaît tout de suite, sans repasser par l'accueil).
  useEffect(() => { if (open) { setQ(""); onRefresh?.(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = q.trim().toLowerCase();
  const base = query ? projects.filter((p) => p.toLowerCase().includes(query)) : projects;
  // « name » → alphabétique ; « date » → on garde l'ordre de l'API (récence).
  const sorted = sortMode === "name" ? [...base].sort((a, b) => a.localeCompare(b)) : [...base];
  // Projet actif en tête pour le repère visuel (préserve l'ordre choisi pour le reste).
  const filtered = sorted.sort((a, b) => (a === projectName ? -1 : b === projectName ? 1 : 0));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Changer de projet — sans repasser par l'accueil"
        className="flex max-w-[26vw] items-center gap-1 rounded-lg px-1.5 py-1 font-mono text-[13px] text-dim hover:bg-edge-soft hover:text-ink transition-colors sm:max-w-[40vw]"
      >
        <span className="truncate">{projectName}</span>
        <ChevronDown size={13} className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="animate-pop absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-edge bg-raised shadow-2xl shadow-black/50">
          <div className="border-b border-edge bg-raised p-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrer les projets…"
                autoFocus
                className="h-8 w-full rounded-lg border border-edge bg-bg pl-8 pr-2.5 text-[12px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>
            {/* Filtres de tri : par date (récence) ou par nom (A→Z). */}
            <div className="mt-1.5 flex items-center gap-1">
              <span className="px-1 text-[10px] uppercase tracking-wide text-faint">Trier</span>
              <button
                type="button"
                onClick={() => chooseSort("date")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  sortMode === "date" ? "bg-accent/15 text-accent-soft" : "text-dim hover:bg-edge-soft hover:text-ink"
                }`}
                title="Trier du projet le plus récemment actif au moins récent"
              >
                <Clock size={11} /> Récent
              </button>
              <button
                type="button"
                onClick={() => chooseSort("name")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  sortMode === "name" ? "bg-accent/15 text-accent-soft" : "text-dim hover:bg-edge-soft hover:text-ink"
                }`}
                title="Trier par nom (ordre alphabétique A→Z)"
              >
                <ArrowDownAZ size={12} /> Nom
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto nice-scroll p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-faint">
                {projects.length === 0 ? "Aucun projet pour l'instant" : `Aucun projet pour « ${q.trim()} »`}
              </p>
            ) : (
              filtered.map((p) => {
                const active = p === projectName;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setOpen(false); if (!active) onSwitch(p); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-[12px] transition-colors ${
                      active ? "bg-accent/15 text-ink" : "text-ink hover:bg-edge-soft"
                    }`}
                  >
                    <FolderOpen size={14} className={`shrink-0 ${active ? "text-accent-soft" : "text-dim"}`} />
                    <span className="min-w-0 flex-1 truncate">{p}</span>
                    {/* #93 — étoiles de revue accolées au nom (note utilisateur) */}
                    {reviews[p]?.score > 0 && (
                      <span className="flex shrink-0 items-center gap-px" title={`Revu — ${reviews[p].score}/5`}>
                        {Array.from({ length: reviews[p].score }).map((_, i) => (
                          <Star key={i} size={10} className="fill-warn text-warn" strokeWidth={0} />
                        ))}
                      </span>
                    )}
                    {active && <Check size={14} className="shrink-0 text-accent-soft" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
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

