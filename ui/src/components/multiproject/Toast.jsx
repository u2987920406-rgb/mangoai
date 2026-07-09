import { useEffect } from "react";
import { Check, X } from "lucide-react";

// Toast auto-dismiss du panneau Multi-projets — extrait verbatim de MultiProject.jsx.
export default function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-edge bg-panel px-5 py-3 shadow-lg">
      <Check size={16} className="text-green-400" />
      <span className="text-sm text-ink">{message}</span>
      <button onClick={onClose} className="text-dim hover:text-ink transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
