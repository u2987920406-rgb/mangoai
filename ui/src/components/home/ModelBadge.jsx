import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { MODELS } from "./helpers.js";
import { useEleveLabel } from "../../hooks/useEleveLabel.js";

// Badge/sélecteur de modèle — extrait verbatim de Home.jsx.
export default function ModelBadge({ model, onModel, openUp = false, onOpenSettings, overrideLabel }) {
  const [open, setOpen] = useState(false);
  // "eleve" affichait un nom codé en dur (GLM-5.2) déconnecté de Réglages —
  // surcharge avec le vrai cerveau local configuré (brain-registry.json).
  const eleveLabel = useEleveLabel();
  const models = useMemo(
    () => MODELS.map((m) => (m.id === "eleve" && eleveLabel ? { ...m, label: `Élève · ${eleveLabel}` } : m)),
    [eleveLabel],
  );
  const current = models.find((m) => m.id === model) ?? models[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10
                   px-2.5 py-0.5 text-[11px] font-semibold text-ok hover:bg-ok/20 transition-colors"
      >
        {overrideLabel || current.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 w-52 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl
                        ${openUp ? "bottom-full right-0 mb-1.5" : "top-full left-0 mt-1.5"}`}
          >
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => { onModel?.(m.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px]
                            hover:bg-edge-soft transition-colors
                            ${m.id === model ? "text-accent font-medium" : "text-dim"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.id === model ? "bg-accent" : "bg-transparent border border-edge"}`} />
                {m.label}
              </button>
            ))}
            <div className="border-t border-edge">
              <button
                onClick={() => { onOpenSettings?.(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left
                                 text-[12px] text-faint hover:bg-edge-soft transition-colors"
              >
                <Plus size={12} />
                Connecter un autre modèle…
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
