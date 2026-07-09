import { AlertTriangle, Check, X } from "lucide-react";

// Confirm + Toast autonomes (l'atelier est un panneau de Réglages, pas le shell App).
export function InlineConfirm({ config, onClose }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="animate-pop w-[420px] max-w-[90vw] rounded-2xl border border-edge bg-raised p-5 shadow-2xl shadow-black/50">
        <h2 className="text-base font-bold text-ink">{config.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-dim">{config.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-4 py-2 text-sm text-dim transition-colors hover:border-faint hover:text-ink">Annuler</button>
          <button onClick={() => { config.onConfirm(); onClose(); }} className="rounded-lg bg-err px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
            {config.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InlineToast({ toast, onClose }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] w-80">
      <div className={`animate-pop flex items-start gap-2.5 rounded-xl border bg-raised/95 p-3 shadow-xl shadow-black/40 backdrop-blur ${toast.kind === "error" ? "border-err/40" : "border-ok/40"}`}>
        {toast.kind === "error" ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-err" /> : <Check size={17} className="mt-0.5 shrink-0 text-ok" />}
        <div className="flex-1 text-sm leading-snug text-ink">{toast.text}</div>
        <button onClick={onClose} className="shrink-0 text-dim hover:text-ink" aria-label="Fermer"><X size={14} /></button>
      </div>
    </div>
  );
}
