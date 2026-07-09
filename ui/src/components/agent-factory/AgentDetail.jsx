import { useState, useEffect, useCallback } from "react";
import { Trash2, Send, RefreshCw } from "lucide-react";
import StatusDot from "./StatusDot.jsx";
import AgentLogs from "./AgentLogs.jsx";
import { STATUS_STYLES, relativeTime } from "./constants.js";

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-faint">{label}</span>
      <span className="text-ink text-right">{value}</span>
    </div>
  );
}

export default function AgentDetail({ agent, state, onDelete }) {
  const [tab, setTab] = useState("state");
  const [msgs, setMsgs] = useState([]);
  const [msgInput, setMsgInput] = useState("");

  const fetchInbox = useCallback(() => {
    fetch(`/api/agents/${agent.id}/inbox`)
      .then((r) => r.ok ? r.json() : { messages: [] })
      .then((d) => setMsgs(d.messages ?? []))
      .catch(() => {});
  }, [agent.id]);

  useEffect(() => { if (tab === "messages") fetchInbox(); }, [tab, fetchInbox]);

  function sendMsg(type) {
    fetch("/api/agents/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: agent.id, type, payload: msgInput || null }),
    }).then(() => { setMsgInput(""); fetchInbox(); }).catch(() => {});
  }

  const tabs = ["state", "config", "logs", "messages"];
  const tabLabel = { state: "État", config: "Config", logs: "Logs", messages: "Messages" };

  return (
    <div className="flex flex-col gap-3">
      {/* Onglets */}
      <div className="flex gap-1 rounded-lg bg-edge-soft p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
              tab === t ? "bg-panel text-ink shadow-sm" : "text-dim hover:text-ink"
            }`}
          >
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {tab === "state" && (
        <div className="flex flex-col gap-2 rounded-lg bg-panel p-3 text-[12px]">
          {state ? (
            <>
              <Row label="Statut" value={<><StatusDot status={state.status} /> <span className="ml-1">{STATUS_STYLES[state.status]?.label ?? state.status}</span></>} />
              {state.pid && <Row label="PID" value={state.pid} />}
              {state.startedAt && <Row label="Démarré" value={new Date(state.startedAt).toLocaleString()} />}
              {state.stoppedAt && <Row label="Arrêté" value={new Date(state.stoppedAt).toLocaleString()} />}
              <Row label="Tâches" value={state.taskCount} />
              <Row label="Erreurs" value={state.errorCount} />
              {state.lastHeartbeat && <Row label="Heartbeat" value={relativeTime(state.lastHeartbeat)} />}
              {state.lastTaskResult && (
                <div className="mt-1 rounded bg-edge-soft p-2 text-[11px] text-dim italic">{state.lastTaskResult}</div>
              )}
            </>
          ) : <span className="text-faint">Aucun état disponible</span>}
        </div>
      )}

      {tab === "config" && (
        <div className="rounded-lg bg-panel p-3">
          <pre className="overflow-auto text-[11px] text-dim whitespace-pre-wrap nice-scroll max-h-64">
            {JSON.stringify(agent, null, 2)}
          </pre>
        </div>
      )}

      {tab === "logs" && <AgentLogs agentId={agent.id} />}

      {tab === "messages" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              placeholder="Payload (texte ou JSON)"
              className="flex-1 rounded-lg border border-edge bg-panel px-3 py-1.5 text-[12px] text-ink placeholder:text-faint focus:outline-none focus:border-accent"
            />
            <button onClick={() => sendMsg("task")} className="rounded-lg bg-accent/20 px-3 py-1.5 text-[12px] text-accent hover:bg-accent/30 transition-colors">
              <Send size={12} />
            </button>
          </div>
          <div className="flex gap-1">
            {["ping", "abort"].map((t) => (
              <button key={t} onClick={() => sendMsg(t)}
                className="rounded-lg border border-edge px-2 py-1 text-[11px] text-dim hover:bg-edge-soft transition-colors capitalize"
              >{t}</button>
            ))}
            <button onClick={fetchInbox} className="ml-auto text-[11px] text-faint hover:text-dim transition-colors flex items-center gap-1">
              <RefreshCw size={10} /> Rafraîchir
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto rounded-lg bg-panel p-2 nice-scroll">
            {msgs.length === 0
              ? <span className="text-[11px] text-faint">Inbox vide</span>
              : msgs.map((m, i) => (
                <div key={i} className="rounded py-1 text-[11px] border-b border-edge last:border-0">
                  <span className="text-faint">{m.type}</span>
                  {" · "}
                  <span className="text-dim">{JSON.stringify(m.payload)?.slice(0, 80)}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Danger zone */}
      <button
        onClick={() => onDelete(agent.id)}
        className="mt-1 flex items-center gap-1 self-start rounded-lg px-2.5 py-1 text-[12px] text-err/60 hover:text-err hover:bg-err/10 transition-colors"
      >
        <Trash2 size={11} /> Supprimer cet agent
      </button>
    </div>
  );
}
