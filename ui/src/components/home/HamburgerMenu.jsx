import { useState } from "react";
import { ChevronRight, Download, FolderOpen, GitBranch, Image as ImageIcon, LayoutGrid, Menu, MessageSquare, Music2, Plus, Settings, Trash2 } from "lucide-react";
import ConfirmDelete from "../ConfirmDelete.jsx";
import { WINDOWS } from "../../nav.js";

// Menu hamburger de l'accueil (actions rapides + conversations récentes) —
// extrait verbatim de Home.jsx.
export default function HamburgerMenu({ onOpenWindow, onOpenAppBuilder, onOpenLauncher, inputRef, conversations = [], onLoadConversation, onDeleteConversation }) {
  const [open, setOpen] = useState(false);
  const recent = conversations.slice(0, 10);

  // Applications proposées dans la cascade « Nouveau projet »
  const apps = [
    {
      icon: FolderOpen,
      label: "App Builder",
      run: () => (onOpenAppBuilder
        ? onOpenAppBuilder()
        : onOpenWindow?.({ type: WINDOWS.PROJECTS, title: "Mango App Builder", width: 820, height: 580 })),
    },
    {
      icon: ImageIcon,
      label: "Image Creator",
      run: () => onOpenWindow?.({ type: WINDOWS.IMAGE_CREATOR, title: "Image Creator", width: 900, height: 640 }),
    },
    {
      icon: Music2,
      label: "Music Creator",
      run: () => onOpenWindow?.({ type: WINDOWS.MUSIC_CREATOR, title: "Music Creator", width: 900, height: 640 }),
    },
    {
      icon: LayoutGrid,
      label: "Toutes les apps",
      run: () => onOpenLauncher?.(),
    },
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
          <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl
                          border border-edge bg-panel shadow-2xl">
            <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Actions rapides
            </p>
            <div className="border-t border-edge" />

            {/* Nouveau projet — cascade vers les applications */}
            <div className="group/sub relative">
              <button
                className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-[13px]
                           text-dim hover:bg-edge-soft transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Plus size={14} className="shrink-0 text-faint" />
                  Nouveau projet
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" />
              </button>
              {/* Sous-menu en cascade (apparaît à droite au survol) */}
              <div
                className="invisible absolute left-full top-0 z-50 ml-1 w-52 rounded-xl border border-edge
                           bg-panel p-1 opacity-0 shadow-2xl transition-opacity
                           group-hover/sub:visible group-hover/sub:opacity-100"
              >
                {apps.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => { a.run(); setOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px]
                               text-dim hover:bg-edge-soft hover:text-ink transition-colors"
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
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <Settings size={14} className="shrink-0" />
              Paramètres
            </button>
          </div>
        </>
      )}
    </div>
  );
}
