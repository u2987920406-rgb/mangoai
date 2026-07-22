import { useState } from "react";
import {
  Bot, ChevronRight, Download, FileText, FlaskConical, FolderOpen,
  GitBranch, GraduationCap, HelpCircle, Image as ImageIcon, Layers,
  Lightbulb, Menu, MessageSquare, Moon, Music2, Network, Palette,
  Plus, Settings, Sliders, Sparkles, Sun, Trash2, Wand2, Boxes,
} from "lucide-react";
import ConfirmDelete from "../ConfirmDelete.jsx";
import { getTheme, toggleTheme } from "../../theme.js";
import { WINDOWS } from "../../nav.js";

// Menu hamburger de l'accueil — POINT D'ENTRÉE UNIQUE de la navigation (demande
// de Raf, 2026-07-22 : « un menu unique qui regroupe tout ce qui est nécessaire
// sous le menu hamburger uniquement »). Remplace le dock latéral droit
// (Sidebar.jsx, supprimé) ET la grille Launcher (WindowManager.jsx, supprimée) —
// chaque destination n'a plus qu'UN SEUL point d'accès, ici.
export default function HamburgerMenu({
  onOpenWindow,
  onOpenAppBuilder,
  onOpenApp,
  onOpenSidePanel,
  onOpenSettings,
  onStartTutorial,
  nextTutorialId,
  inputRef,
  conversations = [],
  onLoadConversation,
  onDeleteConversation,
}) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState(getTheme);
  const recent = conversations.slice(0, 10);

  const flipTheme = () => setThemeState(toggleTheme());

  // « Nouveau projet » — cascade vers les applications de construction.
  const newProjectApps = [
    {
      icon: FolderOpen,
      label: "App Builder",
      run: () => (onOpenAppBuilder
        ? onOpenAppBuilder()
        : onOpenWindow?.({ type: WINDOWS.PROJECTS, title: "Mango App Builder", width: 820, height: 580 })),
    },
    { icon: Boxes, label: "OS d'apps — la suite", run: () => onOpenApp?.("suite") },
    { icon: ImageIcon, label: "Image Creator", run: () => onOpenWindow?.({ type: WINDOWS.IMAGE_CREATOR, title: "Image Creator", width: 900, height: 640 }) },
    { icon: Music2, label: "Music Creator", run: () => onOpenWindow?.({ type: WINDOWS.MUSIC_CREATOR, title: "Music Creator", width: 900, height: 640 }) },
  ];

  // « Outils » — cascade vers les fenêtres flottantes secondaires (ex-Launcher).
  // Notes & RAG et Artefacts retirés le 2026-07-22 (demande de Raf) : leur valeur
  // est déjà réinjectée AUTOMATIQUEMENT à chaque tour agentique (agent.ts::runAgent
  // — relevantNotesSection/relevantArtifactsSection), ces 2 écrans n'étaient que des
  // vitrines manuelles jamais ouvertes, du contenu déjà utilisé en coulisses.
  const tools = [
    { icon: Bot, label: "Agent Factory", run: () => onOpenWindow?.({ type: WINDOWS.AGENT_FACTORY, title: "Agent Factory", width: 1100, height: 700 }) },
    { icon: Network, label: "Super Agent", run: () => onOpenApp?.("superagent") },
    { icon: Lightbulb, label: "Ideation", run: () => onOpenApp?.("ideation") },
    { icon: Layers, label: "Multi-Projet", run: () => onOpenApp?.("multi") },
    { icon: FileText, label: "Doc", run: () => onOpenApp?.("docs") },
    { icon: FlaskConical, label: "Prompt Lab", run: () => onOpenApp?.("promptlab") },
    { icon: Palette, label: "Design Review", run: () => onOpenApp?.("design") },
    { icon: Wand2, label: "Variantes de goût", run: () => onOpenApp?.("taste") },
    { icon: HelpCircle, label: "Aide", run: () => onOpenWindow?.({ type: WINDOWS.GUIDE, title: "Aide", width: 740, height: 600 }) },
    { icon: Sliders, label: "Éditeur visuel", run: () => onOpenSidePanel?.() },
  ];

  return (
    <div className="absolute left-4 top-4 z-20">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge/60
                   bg-panel/80 text-dim backdrop-blur hover:border-accent/40 hover:text-ink transition-colors"
      >
        <Menu size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 max-h-[80vh] w-56 overflow-y-auto nice-scroll rounded-xl
                          border border-edge bg-panel shadow-2xl">
            <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Actions rapides
            </p>
            <div className="border-t border-edge" />

            {/* Nouveau projet — cascade */}
            <div className="group/sub relative">
              <button className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors">
                <span className="flex items-center gap-2.5">
                  <Plus size={14} className="shrink-0 text-faint" />
                  Nouveau projet
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" />
              </button>
              <div className="invisible absolute left-full top-0 z-50 ml-1 w-52 rounded-xl border border-edge
                              bg-panel p-1 opacity-0 shadow-2xl transition-opacity
                              group-hover/sub:visible group-hover/sub:opacity-100">
                {newProjectApps.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => { a.run(); setOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-dim hover:bg-edge-soft hover:text-ink transition-colors"
                  >
                    <a.icon size={14} className="shrink-0 text-faint" />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { (onOpenAppBuilder ?? (() => onOpenWindow?.({ type: WINDOWS.PROJECTS, title: "Mango App Builder", width: 820, height: 580 })))(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors"
            >
              <FolderOpen size={14} className="shrink-0 text-faint" />
              Mes projets
            </button>

            {/* Outils — cascade (ex-Launcher, plus de grille séparée) */}
            <div className="group/sub relative">
              <button className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors">
                <span className="flex items-center gap-2.5">
                  <Sparkles size={14} className="shrink-0 text-faint" />
                  Outils
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" />
              </button>
              <div className="invisible absolute left-full top-0 z-50 ml-1 max-h-[70vh] w-56 overflow-y-auto nice-scroll rounded-xl border border-edge
                              bg-panel p-1 opacity-0 shadow-2xl transition-opacity
                              group-hover/sub:visible group-hover/sub:opacity-100">
                {tools.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => { t.run(); setOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-dim hover:bg-edge-soft hover:text-ink transition-colors"
                  >
                    <t.icon size={14} className="shrink-0 text-faint" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Historique des 10 dernières conversations */}
            {recent.length > 0 && (
              <>
                <div className="border-t border-edge" />
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
                  Conversations récentes
                </p>
                <div>
                  {recent.map((c) => (
                    <div key={c.id} className="group/conv flex items-center pr-1">
                      <button
                        onClick={() => { onLoadConversation?.(c.id); setOpen(false); }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[13px] text-dim hover:bg-edge-soft hover:text-ink transition-colors"
                      >
                        <MessageSquare size={13} className="shrink-0 text-faint" />
                        <span className="truncate">{c.title}</span>
                      </button>
                      <ConfirmDelete
                        onConfirm={() => onDeleteConversation?.(c.id)}
                        message="Supprimer cette conversation ?"
                        align="right"
                        triggerTitle="Supprimer la conversation"
                        triggerClassName="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint opacity-0 hover:text-red-400 group-hover/conv:opacity-100 transition-all"
                      >
                        <Trash2 size={12} />
                      </ConfirmDelete>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Système — ex-dock latéral droit (Réglages/Tutoriels/Thème) */}
            <div className="border-t border-edge" />
            <button
              onClick={() => { onOpenSettings?.(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors"
            >
              <Settings size={14} className="shrink-0 text-faint" />
              Réglages
            </button>
            <button
              onClick={() => { if (nextTutorialId != null) onStartTutorial?.(nextTutorialId); setOpen(false); }}
              disabled={nextTutorialId == null}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <GraduationCap size={14} className="shrink-0 text-faint" />
              {nextTutorialId != null ? `Tutoriel ${nextTutorialId}/10` : "Tutoriels (terminés)"}
            </button>
            <button
              onClick={flipTheme}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors"
            >
              {theme === "dark" ? <Sun size={14} className="shrink-0 text-faint" /> : <Moon size={14} className="shrink-0 text-faint" />}
              {theme === "dark" ? "Mode clair" : "Mode sombre"}
            </button>

            <div className="border-t border-edge" />
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Bientôt
            </p>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <GitBranch size={14} className="shrink-0" />
              Exporter sur GitHub
            </button>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <Download size={14} className="shrink-0" />
              Télécharger un projet
            </button>
          </div>
        </>
      )}
    </div>
  );
}
