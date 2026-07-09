import { useEffect, useState } from "react";
import { Brain, Check, Loader2, RefreshCw } from "lucide-react";
import Section from "./Section.jsx";
import { BRAIN_PROVIDERS, FIELD_CLS } from "./helpers.js";

// Brain-Dispatch #150 — chaque agent a SON cerveau, éditable ici (registre
// data/brain-registry.json). Le routage par cerveau s'active avec BRAIN_DISPATCH=on.
export default function BrainRegistryPanel() {
  const [registry, setRegistry] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/brain-registry")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRegistry(d.registry);
        setDefaults(d.defaults);
        setAgents(d.agents || Object.keys(d.registry || {}));
      })
      .catch(() => { if (alive) setError("Chargement impossible."); });
    return () => { alive = false; };
  }, []);

  function setField(id, key, val) {
    setRegistry((prev) => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/brain-registry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registry),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setRegistry(d.registry);
      setDirty(false);
    } catch {
      setError("Sauvegarde impossible.");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!defaults) return;
    setRegistry(JSON.parse(JSON.stringify(defaults)));
    setDirty(true);
  }

  return (
    <Section
      icon={Brain}
      title="Cerveaux par agent"
      badge={<span className="rounded bg-edge-soft px-1.5 py-0.5 text-[10px] text-faint">#150</span>}
    >
      {!registry ? (
        <p className="text-xs text-faint italic">{error || "Chargement…"}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] text-faint">
            Chaque agent route ses appels vers son propre cerveau. Le routage s'active quand <code className="text-dim">BRAIN_DISPATCH=on</code> ; le registre reste éditable à tout moment.
          </p>
          {agents.map((id) => {
            const c = registry[id] || {};
            const local = c.provider === "ollama";
            return (
              <div key={id} className="rounded-lg border border-edge bg-bg p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-ink">{id}</span>
                  <span className={`rounded px-1 py-0.5 text-[9px] ${local ? "bg-accent/15 text-accent" : "bg-edge-soft text-faint"}`}>
                    {local ? "local" : "cloud"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select value={c.provider || "claude"} onChange={(e) => setField(id, "provider", e.target.value)} className={FIELD_CLS}>
                    {BRAIN_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input value={c.model || ""} onChange={(e) => setField(id, "model", e.target.value)} placeholder="modèle" className={FIELD_CLS} />
                  <input value={c.baseUrl || ""} onChange={(e) => setField(id, "baseUrl", e.target.value)} placeholder="baseUrl (optionnel)" className={FIELD_CLS} />
                  <input value={c.apiKeyEnv || ""} onChange={(e) => setField(id, "apiKeyEnv", e.target.value)} placeholder="apiKeyEnv (optionnel)" className={FIELD_CLS} />
                  <input type="number" value={c.timeoutMs ?? ""} onChange={(e) => setField(id, "timeoutMs", Number(e.target.value) || undefined)} placeholder="timeoutMs" className={FIELD_CLS} />
                  <label className="flex items-center gap-1.5 text-[10px] text-dim">
                    <input type="checkbox" checked={!!c.localOnly} onChange={(e) => setField(id, "localOnly", e.target.checked)} />
                    localOnly (jamais de cloud)
                  </label>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 pt-1">
            <button
              onClick={resetDefaults}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-xs text-dim hover:text-ink transition-colors"
            >
              <RefreshCw size={11} /> Réinitialiser les défauts
            </button>
            <button
              disabled={saving || !dirty}
              onClick={save}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </button>
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
      )}
    </Section>
  );
}
