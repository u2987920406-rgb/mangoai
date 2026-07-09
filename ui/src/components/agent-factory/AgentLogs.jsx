import { useState, useEffect, useRef } from "react";

export default function AgentLogs({ agentId }) {
  const [lines, setLines] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!agentId) return;
    const fetch_ = () =>
      fetch(`/api/agents/${agentId}/logs?lines=80`)
        .then((r) => r.ok ? r.json() : { lines: [] })
        .then((d) => setLines(d.lines ?? []))
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 2000);
    return () => clearInterval(t);
  }, [agentId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  return (
    <div className="h-64 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] nice-scroll">
      {lines.length === 0 ? (
        <span className="text-faint">Aucun log…</span>
      ) : (
        lines.map((line, i) => {
          let parsed = null;
          try { parsed = JSON.parse(line); } catch { /* ignore */ }
          const level = parsed?.level ?? "info";
          const msg   = parsed?.message ?? line;
          const color = level === "error" ? "text-err" : level === "warn" ? "text-warn" : "text-dim";
          return (
            <div key={i} className={`${color} leading-relaxed`}>
              <span className="text-faint">{parsed?.ts?.slice(11, 19) ?? ""} </span>{msg}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
