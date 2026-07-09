import { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Loader2, Bot } from "lucide-react";
import { CATEGORY_LABELS } from "./constants.js";

export default function CreateForm({ onCreate }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("collecteur");
  const [description, setDescription] = useState("");
  const [intervalMs, setIntervalMs] = useState(60000);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function submit() {
    if (!name.trim() || !description.trim()) return;
    setGenerating(true);
    setStatusMsg("Génération en cours…");

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, description, intervalMs }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          if (!part.trim().startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(part.slice(6));
            if (ev.type === "status") setStatusMsg(ev.text);
            if (ev.type === "result") {
              setStatusMsg(`✅ Agent "${ev.agent?.name}" créé`);
              onCreate();
              setName(""); setDescription(""); setOpen(false);
            }
            if (ev.type === "error") setStatusMsg(`❌ ${ev.message}`);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setStatusMsg(`❌ ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-xl border border-edge bg-panel overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-[13px] font-medium text-ink hover:bg-edge-soft transition-colors"
      >
        <span className="flex items-center gap-2"><Plus size={14} /> Créer un nouvel agent</span>
        {open ? <ChevronDown size={14} className="text-dim" /> : <ChevronRight size={14} className="text-dim" />}
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-edge p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-faint">Nom de l'agent</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="ex : Veilleur de Prix Amazon"
                className="w-full rounded-lg border border-edge bg-bg px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent"
              />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-[11px] text-faint">Catégorie</label>
              <select
                value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-edge bg-bg px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:border-accent"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-faint">Description (ce que l'agent doit faire)</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="ex : Surveille le prix d'un produit Amazon toutes les heures et m'alerte si ça descend sous 50€"
              className="w-full resize-none rounded-lg border border-edge bg-bg px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent"
            />
          </div>

          {(category === "collecteur" || category === "acteur") && (
            <div className="w-40">
              <label className="mb-1 block text-[11px] text-faint">Intervalle (ms)</label>
              <input
                type="number" min={5000} step={1000} value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="w-full rounded-lg border border-edge bg-bg px-3 py-1.5 text-[13px] text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={generating || !name.trim() || !description.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-bg disabled:opacity-50 hover:bg-accent/90 transition-colors"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
              Générer l'agent
            </button>
            {statusMsg && <span className="text-[12px] text-dim">{statusMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
