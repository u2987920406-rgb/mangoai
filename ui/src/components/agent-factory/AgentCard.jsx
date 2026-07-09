import { Play, Square, RotateCcw } from "lucide-react";
import StatusDot from "./StatusDot.jsx";
import { CATEGORY_LABELS, STATUS_STYLES } from "./constants.js";

export default function AgentCard({ agent, state, onStart, onStop, onRestart, onSelect, selected }) {
  const cat  = CATEGORY_LABELS[agent.category] ?? CATEGORY_LABELS.collecteur;
  const stat = STATUS_STYLES[state?.status] ?? STATUS_STYLES.idle;
  return (
    <div
      onClick={() => onSelect(agent)}
      className={`cursor-pointer rounded-xl border p-4 transition-colors hover:border-accent/40 ${
        selected ? "border-accent/60 bg-accent/5" : "border-edge bg-panel"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={state?.status ?? "idle"} />
            <span className="truncate text-[14px] font-medium text-ink">{agent.name}</span>
          </div>
          <span className={`text-[11px] font-medium ${cat.color}`}>{cat.label}</span>
          <p className="mt-1 line-clamp-2 text-[12px] text-dim">{agent.description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {(state?.status === "idle" || state?.status === "stopped" || state?.status === "error" || !state) ? (
          <button
            onClick={(e) => { e.stopPropagation(); onStart(agent.id); }}
            className="flex items-center gap-1 rounded-lg bg-ok/10 px-2.5 py-1 text-[12px] text-ok hover:bg-ok/20 transition-colors"
          >
            <Play size={11} /> Démarrer
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onStop(agent.id); }}
            className="flex items-center gap-1 rounded-lg bg-err/10 px-2.5 py-1 text-[12px] text-err hover:bg-err/20 transition-colors"
          >
            <Square size={11} /> Arrêter
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRestart(agent.id); }}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-dim hover:bg-edge-soft transition-colors"
        >
          <RotateCcw size={11} /> Redémarrer
        </button>
        {state?.taskCount !== undefined && (
          <span className="ml-auto text-[11px] text-faint">{state.taskCount} tâche{state.taskCount !== 1 ? "s" : ""}</span>
        )}
      </div>
      {state?.lastTaskResult && (
        <p className="mt-2 truncate text-[11px] text-faint italic">{state.lastTaskResult}</p>
      )}
    </div>
  );
}
