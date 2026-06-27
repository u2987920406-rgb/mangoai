import { useState, useEffect, useCallback } from "react";
import { Hammer, Trash2, Loader2, Sparkles, Play, ChevronDown, Cpu } from "lucide-react";

// Slice 2a — onglet « Agents forgés » de l'Atelier des cerveaux. Mango se fabrique des
// agents spécialisés via GLM (la Forge) ; ici Raf les LISTE, en REFORGE, les TESTE,
// RÉASSIGNE leur cerveau (utile : gemma4:12b local peut 500 → basculer sur un cloud sain)
// et les SUPPRIME. Réutilise les routes /api/specialists/*.

const PROVIDERS = ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"];
const FIELD =
  "rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/50";

function TestRow({ agent, flash }) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState(agent.examples?.[0] || "");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");

  async function run() {
    if (!task.trim() || busy) return;
    setBusy(true); setOut("");
    try {
      const r = await fetch(`/api/specialists/${agent.id}/invoke`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const d = await r.json();
      if (!d.ok) { setOut(`✗ ${d.text || "échec"}`); flash?.("error", "L'agent n'a pas répondu (cerveau KO ?)."); }
      else setOut(d.text || "(réponse vide)");
    } catch (e) { setOut(`✗ ${e.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-2 border-t border-edge-soft pt-2">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-[12px] text-dim transition-colors hover:text-ink">
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} /> Tester cet agent
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={task} onChange={(e) => setTask(e.target.value)} rows={2}
            placeholder="Une tâche à confier à l'agent…"
            className={`${FIELD} w-full resize-y`}
          />
          <button onClick={run} disabled={busy || !task.trim()} className="self-start flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-soft disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {busy ? "Invocation…" : "Lancer"}
          </button>
          {out && (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-edge-soft bg-panel px-3 py-2 text-[12px] leading-relaxed text-dim">{out}</pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpecialistAgents({ models = [], flash, requestConfirm }) {
  const [agents, setAgents] = useState(null);
  const [forging, setForging] = useState(false);
  const [forgeLog, setForgeLog] = useState("");
  const [n, setN] = useState(3);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/specialists"); const d = await r.json(); setAgents(d.agents || []); }
    catch { setAgents([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function patchBrain(id, patch) {
    try {
      const r = await fetch(`/api/specialists/${id}/brain`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setAgents((prev) => prev.map((a) => (a.id === id ? d.agent : a)));
      flash?.("ok", "Cerveau réassigné.");
    } catch { flash?.("error", "Réassignation impossible."); }
  }

  function del(agent) {
    requestConfirm?.({
      title: "Supprimer l'agent forgé ?",
      body: `« ${agent.name} » sera retiré du registre (reforgeable plus tard).`,
      confirmLabel: "Supprimer",
      onConfirm: async () => {
        try {
          const r = await fetch(`/api/specialists/${agent.id}`, { method: "DELETE" });
          if (!r.ok) throw new Error();
          setAgents((prev) => prev.filter((a) => a.id !== agent.id));
          flash?.("ok", "Agent supprimé.");
        } catch { flash?.("error", "Suppression impossible."); }
      },
    });
  }

  async function forge() {
    if (forging) return;
    setForging(true); setForgeLog("Mango lit ses lacunes…");
    try {
      const r = await fetch("/api/specialists/forge", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n }),
      });
      if (!r.body) throw new Error("pas de flux");
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let o; try { o = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (o.type === "progress") setForgeLog(o.msg);
          else if (o.type === "done") {
            setForgeLog(`${o.created} agent(s) forgé(s)${o.failures ? `, ${o.failures} échec(s)` : ""}.`);
            if (Array.isArray(o.agents)) setAgents(o.agents);
            flash?.("ok", `${o.created} agent(s) forgé(s) par Mango.`);
          } else if (o.type === "error") { flash?.("error", o.error || "forge KO"); }
        }
      }
    } catch (e) { flash?.("error", `Forge impossible : ${e.message}`); }
    finally { setForging(false); load(); }
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Hammer size={16} className="text-accent-soft" />
        <span className="text-[14px] font-semibold text-ink">Agents forgés par Mango</span>
        <span className="rounded-full border border-edge bg-edge-soft px-2 py-0.5 text-[10px] text-faint">
          {agents?.length ?? "…"}
        </span>
      </div>
      <p className="mb-3 max-w-2xl text-[12.5px] leading-relaxed text-dim">
        Mango se fabrique des agents <span className="text-ink">sur mesure via GLM</span> pour combler ses{" "}
        <span className="text-ink">lacunes</span> (il lit son registre <code className="text-accent">limites.md</code>).
        Tu peux en <span className="text-ink">reforger</span>, les <span className="text-ink">tester</span>,
        et <span className="text-ink">réassigner leur cerveau</span> (ex. basculer un agent de raisonnement
        d'un modèle local vers un cloud plus fiable).
      </p>

      {/* Barre de forge */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-edge-soft bg-panel px-3.5 py-2.5">
        <span className="text-[12.5px] text-dim">Forger</span>
        <input type="number" min={1} max={10} value={n} onChange={(e) => setN(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          className={`${FIELD} w-16`} aria-label="nombre d'agents à forger" disabled={forging} />
        <span className="text-[12.5px] text-dim">agent(s) ciblant ses lacunes</span>
        <button onClick={forge} disabled={forging} className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50">
          {forging ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {forging ? "Forge…" : "Forger"}
        </button>
        {forgeLog && <span className="text-[12px] text-faint">{forgeLog}</span>}
      </div>

      {agents === null ? (
        <p className="text-[13px] text-faint italic">Chargement…</p>
      ) : agents.length === 0 ? (
        <p className="text-[13px] text-faint italic">Aucun agent forgé. Clique « Forger » pour que Mango s'en fabrique.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {agents.map((a) => {
            const local = a.provider === "ollama";
            return (
              <div key={a.id} className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Cpu size={16} className="shrink-0 text-faint" />
                  <span className="text-[13px] font-semibold text-ink">{a.name}</span>
                  {a.lacune && (
                    <span className="rounded-full border border-[#FFCC00]/30 bg-[#FFCC00]/10 px-1.5 py-0.5 text-[10px] text-[#E0A800]">
                      {String(a.lacune).split("—")[0].trim() || a.lacune}
                    </span>
                  )}
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${local ? "bg-accent/15 text-accent" : "bg-edge-soft text-faint"}`}>{local ? "local" : "cloud"}</span>
                  <button onClick={() => del(a)} title="Supprimer cet agent" className="ml-auto rounded-lg p-1.5 text-faint transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30]">
                    <Trash2 size={14} />
                  </button>
                </div>

                {a.role && <p className="mt-1.5 text-[12px] leading-relaxed text-dim">{a.role}</p>}

                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-faint">Cerveau — provider</span>
                    <select value={a.provider} onChange={(e) => patchBrain(a.id, { provider: e.target.value, model: a.model })} className={`${FIELD} w-full`} aria-label={`provider de ${a.name}`}>
                      {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-faint">Modèle</span>
                    {local ? (
                      <select value={a.model || ""} onChange={(e) => patchBrain(a.id, { provider: "ollama", model: e.target.value })} className={`${FIELD} w-full`} aria-label={`modèle de ${a.name}`}>
                        <option value="">— choisir —</option>
                        {a.model && !models.some((m) => m.name === a.model) && <option value={a.model}>{a.model}</option>}
                        {models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameterSize ? ` · ${m.parameterSize}` : ""}</option>)}
                      </select>
                    ) : (
                      <input value={a.model || ""} onChange={(e) => patchBrain(a.id, { provider: a.provider, model: e.target.value })} placeholder="ex. glm-5.2:cloud / sonnet" className={`${FIELD} w-full`} aria-label={`modèle de ${a.name}`} />
                    )}
                  </label>
                </div>

                <TestRow agent={a} flash={flash} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
