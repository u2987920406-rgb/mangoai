import { useCallback } from "react";

const MIN_W = 400;
const MIN_H = 280;

export default function Window({ win, onClose, onFocus, onMove, onResize, children }) {
  const { id, title, x, y, width, height, zIndex } = win;

  const handleTitleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
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
  }, [id, x, y, onFocus, onMove]);

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
      className="fixed flex flex-col overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl pointer-events-auto"
      style={{ left: x, top: y, width, height, zIndex }}
      onMouseDown={() => onFocus(id)}
    >
      {/* Barre de titre */}
      <div
        className="flex shrink-0 select-none items-center gap-2 border-b border-edge bg-panel px-3 py-2"
        style={{ cursor: "move" }}
        onMouseDown={handleTitleMouseDown}
      >
        {/* Bouton fermer (style macOS) */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onClose(id)}
          className="h-3 w-3 flex-shrink-0 rounded-full bg-[#ff5f57] hover:brightness-90 transition-all"
          title="Fermer"
        />
        <span className="flex-1 truncate text-center text-[13px] font-medium text-ink">{title}</span>
      </div>

      {/* Contenu */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>

      {/* Poignée de redimensionnement */}
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
    </div>
  );
}
