import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Bot, Play, Square, RotateCcw } from "lucide-react";
import { CATEGORY_LABELS } from "./agent-factory/constants.js";
import AgentCard from "./agent-factory/AgentCard.jsx";
import AgentDetail from "./agent-factory/AgentDetail.jsx";
import CreateForm from "./agent-factory/CreateForm.jsx";

// Idée #103 — Mango Agent Factory. Galerie + création + gestion des agents autonomes.

export default function AgentFactory({ onBack }) {
  const [agents, setAgents] = useState([]);
  const [states, setStates] = useState({});
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("tous");
  const timer = useRef(null);

  const refresh = useCallback(() => {
    fetch("/api/agents")
      .then((r) => r.ok ? r.json() : { agents: [], states: {} })
      .then((d) => {
        setAgents(d.agents ?? []);
        setStates(d.states ?? {});
        // Mise à jour de l'agent sélectionné
        setSelected((prev) => prev ? (d.agents ?? []).find((a) => a.id === prev.id) ?? prev : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 3000);
    return () => clearInterval(timer.current);
  }, [refresh]);

  function doStart(id) {
    fetch(`/api/agents/${id}/start`, { method: "POST" }).then(refresh).catch(() => {});
  }
  function doStop(id) {
    fetch(`/api/agents/${id}/stop`, { method: "POST" }).then(refresh).catch(() => {});
  }
  function doRestart(id) {
    fetch(`/api/agents/${id}/restart`, { method: "POST" }).then(refresh).catch(() => {});
  }
  function doDelete(id) {
    fetch(`/api/agents/${id}`, { method: "DELETE" }).then(() => {
      setSelected(null);
      refresh();
    }).catch(() => {});
  }

  const categories = ["tous", "collecteur", "processeur", "acteur", "coordinateur"];
  const filtered = filter === "tous" ? agents : agents.filter((a) => a.category === filter);
  const running = agents.filter((a) => states[a.id]?.status === "running").length;

  return (
    <div className="flex h-screen flex-col bg-bg text-ink">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-dim hover:bg-edge-soft transition-colors">
          <ArrowLeft size={16} />
        </button>
        <Bot size={18} className="text-accent" />
        <span className="text-[15px] font-semibold">Agent Factory</span>
        <span className="ml-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] text-ok">
          {running} actif{running !== 1 ? "s" : ""}
        </span>
        <span className="ml-1 text-[12px] text-faint">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Colonne gauche */}
        <div className="flex w-[420px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-edge p-4 nice-scroll">
          {/* Formulaire de création */}
          <CreateForm onCreate={refresh} />

          {/* Filtres */}
          <div className="flex flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full px-3 py-1 text-[12px] capitalize transition-colors ${
                  filter === c
                    ? "bg-accent/20 text-accent"
                    : "border border-edge text-dim hover:border-accent/40 hover:text-ink"
                }`}
              >
                {c === "tous" ? `Tous (${agents.length})` : `${CATEGORY_LABELS[c]?.label} (${agents.filter((a) => a.category === c).length})`}
              </button>
            ))}
          </div>

          {/* Galerie */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Bot size={32} className="text-faint" />
              <p className="text-[13px] text-faint">
                {agents.length === 0
                  ? "Aucun agent créé. Décris ce que tu veux automatiser ↑"
                  : "Aucun agent dans cette catégorie"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  state={states[a.id] ?? null}
                  onStart={doStart}
                  onStop={doStop}
                  onRestart={doRestart}
                  onSelect={setSelected}
                  selected={selected?.id === a.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panneau détail */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 nice-scroll">
          {selected ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold">{selected.name}</h2>
                  <span className={`text-[12px] font-medium ${CATEGORY_LABELS[selected.category]?.color}`}>
                    {CATEGORY_LABELS[selected.category]?.label} · {CATEGORY_LABELS[selected.category]?.desc}
                  </span>
                </div>
                <div className="flex gap-2">
                  {(states[selected.id]?.status === "running") ? (
                    <button onClick={() => doStop(selected.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-err/10 px-3 py-1.5 text-[13px] text-err hover:bg-err/20 transition-colors">
                      <Square size={12} /> Arrêter
                    </button>
                  ) : (
                    <button onClick={() => doStart(selected.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-ok/10 px-3 py-1.5 text-[13px] text-ok hover:bg-ok/20 transition-colors">
                      <Play size={12} /> Démarrer
                    </button>
                  )}
                  <button onClick={() => doRestart(selected.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[13px] text-dim hover:bg-edge-soft transition-colors">
                    <RotateCcw size={12} /> Redémarrer
                  </button>
                </div>
              </div>
              <AgentDetail
                agent={selected}
                state={states[selected.id] ?? null}
                onDelete={doDelete}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Bot size={40} className="text-faint" />
              <p className="text-[14px] text-faint">Sélectionne un agent pour voir ses détails</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
