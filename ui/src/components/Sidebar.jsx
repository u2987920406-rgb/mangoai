import { useEffect, useState } from "react";
import {
  Boxes, Code2, FolderOpen, GraduationCap, Image as ImageIcon, LayoutGrid,
  Moon, Music2, Settings, Sun,
} from "lucide-react";
import { getTheme, toggleTheme } from "../theme.js";
import { SCREENS, WINDOWS } from "../nav.js";

// ─── Bouton icône primaire ────────────────────────────────────────────────────
// `badge` (2026-07-14, #168 suite) : petit compteur rouge en coin — visibilité
// PROACTIVE d'un état qui attend une action (ex. lacunes de la forge auto en
// attente de validation), sans obliger à naviguer dans Réglages pour le savoir.
// Né d'un cas réel : une lacune bloquée 5 jours sans que personne ne le remarque.
function SideBtn({ icon: Icon, label, haloColor, active = false, onClick, dataTour, badge = 0 }) {
  return (
    <div className="group relative w-full">
      <button
        onClick={onClick}
        data-tour={dataTour}
        className={`relative flex h-14 w-full items-center justify-center rounded-xl transition-all duration-200 ${
          active ? "bg-accent/15" : "hover:bg-accent/8"
        }`}
      >
        {/* Halo circulaire mango */}
        {haloColor && (
          <div
            className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: `radial-gradient(circle at center, ${haloColor}28 0%, transparent 68%)`,
              opacity: active ? 1 : 0.65,
            }}
          />
        )}
        <Icon
          size={26}
          style={{
            color: active ? "var(--color-accent)" : "var(--color-dim)",
            filter: active ? "drop-shadow(0 0 8px rgba(124,92,255,0.7))" : undefined,
            transition: "color 0.2s, filter 0.2s",
          }}
          className={!active ? "group-hover:!text-accent-soft group-hover:[filter:drop-shadow(0_0_6px_rgba(124,92,255,0.45))]" : ""}
        />
        {badge > 0 && (
          <span
            className="pointer-events-none absolute right-2 top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white shadow"
            title={`${badge} lacune(s) en attente de validation`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>
      {/* Tooltip flottant */}
      <div
        className="pointer-events-none absolute right-full top-1/2 z-50 mr-3 -translate-y-1/2
                   whitespace-nowrap rounded-lg border border-edge bg-panel px-3 py-1.5
                   text-xs text-ink shadow-xl opacity-0 transition-opacity group-hover:opacity-100"
      >
        {label}
        <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-panel" />
      </div>
    </div>
  );
}

// ─── Séparateur ───────────────────────────────────────────────────────────────
function Sep() {
  return <div className="my-1 w-7 self-center border-t border-[#FF9500]/20" />;
}

// ─── Dock latéral droit ───────────────────────────────────────────────────────
export default function Sidebar({
  onOpenProjects,
  onOpenWindow,
  onOpenLauncher,
  onOpenSuite,
  onSetScreen,
  onStartTutorial,
  nextTutorialId,
}) {
  const [theme, setThemeState] = useState(getTheme);
  const flipTheme = () => setThemeState(toggleTheme());
  const [expanded, setExpanded] = useState(false);

  // (2026-07-14, #168 suite) Lacunes en attente de validation (forge auto) —
  // poll léger, visible depuis l'Accueil sans entrer dans Réglages. À l'échec
  // (backend pas encore levé), on n'affiche rien plutôt que de faire échouer l'UI.
  const [pendingGaps, setPendingGaps] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch("/api/gaps")
        .then((r) => (r.ok ? r.json() : { gaps: [] }))
        .then((d) => {
          if (cancelled) return;
          const n = Array.isArray(d.gaps) ? d.gaps.filter((g) => g.status === "proposed").length : 0;
          setPendingGaps(n);
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // #193 — l'icône Code ne s'affiche QUE si le gate serveur est actif (Raf a
  // décidé le 2026-07-21 de ne pas l'utiliser pour l'instant : icône masquée,
  // code dormant en place plutôt que retiré). Un seul appel au montage suffit
  // (le gate ne change qu'au redémarrage backend, pas en cours de session).
  const [codeSectionEnabled, setCodeSectionEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/flags/code-section")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setCodeSectionEnabled(Boolean(d?.enabled)))
      .catch(() => {});
  }, []);

  return (
    // Conteneur pointer-events-none : il ne capte RIEN par défaut → le décor sous
    // le bord droit reste cliquable/atteignable. Seules la poignée et le dock
    // (re)prennent les events.
    <div className="pointer-events-none fixed right-0 top-0 z-30 flex h-full">

      {/* Poignée centrale — le SEUL déclencheur du survol (les 3 points). Petite
          zone (14×64px) centrée verticalement, au lieu de toute la colonne. */}
      {!expanded && (
        <div
          onMouseEnter={() => setExpanded(true)}
          onClick={() => setExpanded(true)}
          title="Ouvrir le dock"
          className="pointer-events-auto absolute right-0 top-1/2 flex h-16 w-3.5 -translate-y-1/2 cursor-pointer flex-col items-center justify-center gap-1 rounded-l-md border-y border-l border-[#FF9500]/30 bg-panel/85 backdrop-blur transition-colors hover:bg-panel"
        >
          <span className="h-1 w-1 rounded-full bg-[#FF9500]/80" />
          <span className="h-1 w-1 rounded-full bg-[#FFCC00]/80" />
          <span className="h-1 w-1 rounded-full bg-[#34C759]/80" />
        </div>
      )}

      {/* Dock — entièrement caché à droite quand replié ; révélé au survol de la
          poignée. onMouseLeave referme. */}
      <div
        onMouseLeave={() => setExpanded(false)}
        className={`pointer-events-auto relative z-10 flex w-16 flex-col items-center gap-0.5 border-l border-[#FF9500]/25 bg-panel py-2 px-1.5 transition-transform duration-300 ease-out ${expanded ? "translate-x-0" : "translate-x-full"}`}
      >

        {/* Spacer haut — centre les icônes verticalement */}
        <div className="flex-1" />

        {/* Apps headline */}
        <SideBtn
          icon={FolderOpen}
          label="Mango App Builder"
          haloColor="#FF9500"
          onClick={onOpenProjects}
          dataTour="projects"
        />
        <SideBtn
          icon={ImageIcon}
          label="Image Creator"
          haloColor="#FFCC00"
          onClick={() => onOpenWindow?.({ type: WINDOWS.IMAGE_CREATOR, title: "Image Creator", width: 900, height: 640 })}
        />
        <SideBtn
          icon={Music2}
          label="Music Creator"
          haloColor="#FF3B30"
          onClick={() => onOpenWindow?.({ type: WINDOWS.MUSIC_CREATOR, title: "Music Creator", width: 900, height: 640 })}
        />

        {/* Suite — OS d'apps composables (#138) */}
        <SideBtn
          icon={Boxes}
          label="OS d'apps — la suite"
          haloColor="#7C5CFF"
          onClick={onOpenSuite}
          dataTour="suite"
        />

        {/* Code — #193, chat frontière sur projets locaux externes au workspace.
            Masquée si le gate serveur CODE_SECTION est off (dormant, pas retiré). */}
        {codeSectionEnabled && (
          <SideBtn
            icon={Code2}
            label="Code — projets locaux, cerveau frontière"
            haloColor="#0A84FF"
            onClick={() => onSetScreen?.(SCREENS.CODE)}
            dataTour="code"
          />
        )}

        {/* Launcher — toutes les apps */}
        <SideBtn
          icon={LayoutGrid}
          label="Toutes les apps"
          haloColor="#34C759"
          onClick={onOpenLauncher}
          dataTour="launcher"
        />

        <Sep />

        {/* Réglages */}
        <SideBtn
          icon={Settings}
          label={pendingGaps > 0 ? `Réglages — ${pendingGaps} lacune(s) en attente` : "Réglages"}
          haloColor="#8e8e93"
          onClick={() => onSetScreen?.("reglages")}
          badge={pendingGaps}
        />
        {/* Tutoriels */}
        <SideBtn
          icon={GraduationCap}
          label={nextTutorialId != null ? `Tutoriel ${nextTutorialId}/10` : "Tutoriels"}
          haloColor="#5856d6"
          onClick={() => nextTutorialId != null && onStartTutorial?.(nextTutorialId)}
          dataTour="tutorial"
        />

        {/* Spacer bas */}
        <div className="flex-1" />

        {/* Toggle thème — pill proéminent */}
        <button
          onClick={flipTheme}
          title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
          className="mb-1 flex items-center gap-1.5 rounded-full border border-edge bg-raised px-3 py-1.5 text-xs text-dim transition-colors hover:border-accent/40 hover:text-ink"
        >
          {theme === "dark" ? (
            <Sun size={13} className="text-warn" />
          ) : (
            <Moon size={13} className="text-accent-soft" />
          )}
        </button>
      </div>
    </div>
  );
}
