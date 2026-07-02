// Modal — LA modale accessible du design system : focus trap, aria-modal,
// Échap, clic-backdrop, retour du focus à la fermeture. Une seule implémentation
// accessible = toutes les modales de la 2.0 le sont (audit §3.2 U4).
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { cx, RADIUS, TEXT } from "./tokens";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pied de modale (boutons d'action). */
  footer?: ReactNode;
  /** Largeur max (classe Tailwind), défaut w-[480px]. */
  widthClass?: string;
}

export function Modal({ open, onClose, title, children, footer, widthClass = "w-[480px]" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus initial : premier élément focusable du panneau (souvent le bouton Fermer).
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !panel) return;
      // Piège du focus : Tab boucle à l'intérieur du panneau.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx("max-h-[85vh] max-w-[92vw] animate-pop overflow-hidden border border-edge bg-panel shadow-2xl", RADIUS.surface, widthClass)}
      >
        <div className="flex items-center justify-between border-b border-edge-soft px-4 py-3">
          <h2 id={titleId} className={TEXT.lg}>{title}</h2>
          <Button variant="ghost" size="sm" iconOnly icon={<X size={15} />} aria-label="Fermer" title="Fermer" onClick={onClose} />
        </div>
        <div className={cx("overflow-y-auto px-4 py-4", TEXT.base)}>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-edge-soft px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
