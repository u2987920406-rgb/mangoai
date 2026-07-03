// Rangée des 3 actions du composer (Construire/Planifier/Discuter), chacune avec
// SON sélecteur de modèle mémorisé — extraite de Chat.jsx (Phase C).
import { ChevronDown } from "lucide-react";
import { CHAT_ACTIONS, ACTION_MODEL_OPTIONS, actionModelLabel } from "./helpers.js";

export default function ChatActions({ activeAction, actionModels, modelMenuFor, onPickAction, onToggleModelMenu, onSetModel }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
      {CHAT_ACTIONS.map((a) => {
        const active = activeAction === a.id;
        return (
          <div key={a.id} className="relative flex items-center">
            {/* Le bouton d'action : active l'action + applique son modèle/mode */}
            <button
              onClick={() => onPickAction(a)}
              className={`rounded-l-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-faint hover:text-dim hover:bg-edge-soft"
              }`}
            >
              {a.label}
            </button>
            {/* Le sélecteur de modèle PROPRE à ce bouton (mémorisé) */}
            <button
              onClick={() => onToggleModelMenu(modelMenuFor === a.id ? null : a.id)}
              title="Choisir le modèle de ce bouton"
              className={`flex items-center gap-0.5 rounded-r-lg border-l px-1.5 py-1 text-[10px] font-medium transition-colors ${
                active
                  ? "border-accent/20 bg-accent/15 text-accent"
                  : "border-edge/40 text-faint hover:text-dim hover:bg-edge-soft"
              }`}
            >
              {actionModelLabel(actionModels[a.id])}
              <ChevronDown size={9} />
            </button>
            {modelMenuFor === a.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => onToggleModelMenu(null)} />
                <div className="absolute bottom-full left-0 z-50 mb-1 w-36 overflow-hidden rounded-lg border border-edge bg-panel shadow-2xl">
                  {ACTION_MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSetModel(a.id, m.id)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-edge-soft ${
                        actionModels[a.id] === m.id ? "text-accent font-medium" : "text-dim"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${actionModels[a.id] === m.id ? "bg-accent" : "border border-edge"}`} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
