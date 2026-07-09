import { useState, useEffect, useRef } from "react";
import { Cpu, ScanLine, Trash2, Download, HardDrive, Loader2, X, Sparkles } from "lucide-react";
import CapBadge from "./CapBadge.jsx";
import { VERDICT, SUGGESTED, fmtBytes } from "./constants.js";

// Modale « + Ajouter un modèle » : Local (parcourir + scanner + supprimer) | Télécharger (pull).
export default function AddModelModal({ models, caps, ensureCaps, onClose, onChanged, onDelete, flash }) {
  const [tab, setTab] = useState("local");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="animate-pop flex max-h-[82vh] w-[560px] max-w-[92vw] flex-col rounded-2xl border border-edge bg-raised shadow-2xl shadow-black/50">
        <div className="flex items-center gap-3 border-b border-edge px-5 py-3.5">
          <span className="text-[14px] font-semibold text-ink">Ajouter un modèle</span>
          <button onClick={onClose} className="ml-auto text-dim hover:text-ink" aria-label="Fermer"><X size={16} /></button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          {[["local", "Mes modèles locaux", HardDrive], ["pull", "Télécharger", Download]].map(([k, lab, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${tab === k ? "bg-accent/15 text-accent" : "text-dim hover:bg-edge-soft hover:text-ink"}`}>
              <Icon size={14} /> {lab}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-5 py-4">
          {tab === "local"
            ? <LocalTab models={models} caps={caps} ensureCaps={ensureCaps} onDelete={onDelete} flash={flash} />
            : <PullTab onDone={onChanged} flash={flash} />}
        </div>
      </div>
    </div>
  );
}

function LocalTab({ models, caps, ensureCaps, onDelete, flash }) {
  const [scanningName, setScanningName] = useState("");
  const [scanResult, setScanResult] = useState(null); // { name, verdict, summary }

  useEffect(() => { models.forEach((m) => ensureCaps(m.name)); }, [models, ensureCaps]);

  async function scan(name) {
    setScanningName(name);
    setScanResult(null);
    try {
      const r = await fetch("/api/brains/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, provider: "ollama" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "examen impossible");
      const verdict = d.card?.verdict ?? d.state?.brains?.find?.((b) => b.model === name)?.verdict;
      setScanResult({ name, verdict, summary: d.summary || "" });
    } catch (e) {
      flash("error", `Scan impossible : ${e.message}`);
    } finally {
      setScanningName("");
    }
  }

  if (!models.length) {
    return <p className="text-[12.5px] text-faint">Aucun modèle Ollama local détecté (ou Ollama injoignable).</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {models.map((m) => {
        const mc = caps[m.name];
        const isScanning = scanningName === m.name;
        const res = scanResult?.name === m.name ? scanResult : null;
        return (
          <div key={m.name} className="rounded-xl border border-edge-soft bg-panel px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <Cpu size={16} className="shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{m.name}</div>
                <div className="text-[11px] text-faint">{[m.parameterSize, m.family, fmtBytes(m.size)].filter(Boolean).join(" · ")}</div>
              </div>
              <button onClick={() => scan(m.name)} disabled={isScanning} className="flex items-center gap-1 rounded-lg border border-edge px-2.5 py-1 text-[12px] text-dim transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50">
                <ScanLine size={13} className={isScanning ? "animate-pulse" : ""} /> {isScanning ? "Examen…" : "Scanner"}
              </button>
              <button onClick={() => onDelete(m.name)} title="Supprimer ce modèle" className="rounded-lg p-1.5 text-faint transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30]">
                <Trash2 size={14} />
              </button>
            </div>
            {mc?.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">{mc.map((cap) => <CapBadge key={cap} cap={cap} />)}</div>
            )}
            {res && (
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge-soft pt-2 text-[12px]">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT[res.verdict]?.cls ?? VERDICT.reject.cls}`}>
                  <Sparkles size={11} /> {VERDICT[res.verdict]?.label ?? res.verdict ?? "?"}
                </span>
                {(SUGGESTED[res.verdict] ?? []).length > 0 && (
                  <span className="text-dim">conseillé pour : <span className="text-ink">{SUGGESTED[res.verdict].join(", ")}</span></span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PullTab({ onDone, flash }) {
  const [name, setName] = useState("");
  const [pulling, setPulling] = useState(false);
  const [status, setStatus] = useState("");
  const [pct, setPct] = useState(null);
  const abortRef = useRef(null);

  async function pull() {
    const m = name.trim();
    if (!m || pulling) return;
    setPulling(true);
    setStatus("Connexion à Ollama…");
    setPct(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: m }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let obj;
          try { obj = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (obj.error) throw new Error(obj.error);
          if (obj.done) { setStatus("Terminé."); setPct(100); }
          else {
            setStatus(obj.status || "Téléchargement…");
            if (obj.total) setPct(Math.round(((obj.completed || 0) / obj.total) * 100));
          }
        }
      }
      flash("ok", `« ${m} » téléchargé.`);
      setName("");
      onDone?.();
    } catch (e) {
      if (e.name !== "AbortError") flash("error", `Téléchargement impossible : ${e.message}`);
    } finally {
      setPulling(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-dim">
        Donne le nom exact d'un modèle de la bibliothèque Ollama (ex. <code className="text-ink">qwen3-vl:8b</code>,{" "}
        <code className="text-ink">llama3.2:3b</code>). Il sera téléchargé sur ta machine.
      </p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pull()}
          disabled={pulling}
          placeholder="nom:tag"
          className="flex-1 rounded-lg border border-edge bg-panel px-3 py-2 text-[13px] text-ink outline-none focus:border-accent/50 disabled:opacity-50"
        />
        <button onClick={pull} disabled={pulling || !name.trim()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-soft disabled:opacity-50">
          {pulling ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {pulling ? "…" : "Télécharger"}
        </button>
      </div>
      {(pulling || status) && (
        <div className="rounded-lg border border-edge-soft bg-panel px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-dim">
            <span className="truncate">{status}</span>
            {pct != null && <span className="ml-2 shrink-0 tabular-nums text-ink">{pct}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge-soft">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct ?? 8}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
