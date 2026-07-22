import { useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "../hooks/useIsMobile.js";

const MIN_W = 400;
const MIN_H = 280;

// #196 (2026-07-22, Raf en vrai sur son téléphone via l'accès LAN) — ces
// fenêtres flottantes (App Builder, Ideation, Agent Factory…) ont une
// taille/position desktop fixe (ex. 820×560px), toujours en pixels absolus :
// sur un écran de 390px, ça déborde entièrement, hors d'atteinte au toucher.
// Sur mobile, la fenêtre devient PLEIN ÉCRAN (pas de drag/resize — inutile et
// non tactile de toute façon, aucun handler onTouch n'existait déjà).
export default function Window({ win, onClose, onFocus, onMove, onResize, children }) {
  const { id, title, x, y, width, height, zIndex } = win;
  const isMobile = useIsMobile();

  const handleTitleMouseDown = useCallback((e) => {
    if (isMobile || e.button !== 0) return;
    e.preventDefault();
    onFocus(id);
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startX = x;
    const startY = y;
    const mm = (ev) => {
      const nx = Math.max(0, Math.min(startX + ev.clientX - startMX, window.innerWidth - 120));
      const ny = Math.max(0, Math.min(startY + ev.clientY - startMY, window.innerHeight - 40));
      onMove(id, nx, ny);
    };
    const mu = () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }, [isMobile, id, x, y, onFocus, onMove]);

  const handleResizeMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startMX = e.clientX;
    const startMY = e.clientY;
    const startW = width;
    const startH = height;
    const mm = (ev) => {
      onResize(id, Math.max(MIN_W, startW + ev.clientX - startMX), Math.max(MIN_H, startH + ev.clientY - startMY));
    };
    const mu = () => {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }, [id, width, height, onResize]);

  return (
    <div
      className={
        isMobile
          ? "fixed inset-0 flex flex-col overflow-hidden bg-panel pointer-events-auto"
          : "fixed flex flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl pointer-events-auto"
      }
      style={isMobile ? { zIndex } : { left: x, top: y, width, height, zIndex }}
      onMouseDown={() => onFocus(id)}
    >
      {/* Barre de titre */}
      <div
        className="flex shrink-0 select-none items-center gap-2 border-b border-edge bg-panel px-3 py-2"
        style={isMobile ? undefined : { cursor: "move" }}
        onMouseDown={handleTitleMouseDown}
      >
        {isMobile ? (
          // Cible tactile ≥44px (pas le point macOS de 12px, illisible/inatteignable au doigt).
          <button
            onClick={() => onClose(id)}
            className="-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-dim hover:text-ink transition-colors"
            title="Fermer"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onClose(id)}
            className="h-3 w-3 flex-shrink-0 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all"
            title="Fermer"
          />
        )}
        <span className="flex-1 truncate text-center text-[13px] font-medium text-ink">{title}</span>
        {/* Fantôme de la même largeur que le bouton retour, pour garder le titre centré */}
        {isMobile && <span className="w-10 shrink-0" />}
      </div>

      {/* Contenu */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>

      {/* Poignée de redimensionnement (desktop uniquement — plein écran sur mobile, rien à redimensionner) */}
      {!isMobile && (
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize pointer-events-auto z-10"
        onMouseDown={handleResizeMouseDown}
        title="Redimensionner"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-edge">
          <path
            d="M13 13 L13 7 M13 13 L7 13 M13 13 L9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      )}
    </div>
  );
}
