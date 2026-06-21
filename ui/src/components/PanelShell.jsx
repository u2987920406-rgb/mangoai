import { X } from "lucide-react";

// ─── Coque de panneau latéral (partagée Sidebar globale + outils projet) ──────
export default function PanelShell({ title, onClose, children }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-faint">
          {title}
        </span>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-dim hover:text-ink transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll">{children}</div>
    </div>
  );
}
