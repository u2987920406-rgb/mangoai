import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Cpu, Wrench, Plus, ScanLine, Trash2, AlertTriangle, Check,
  Download, RefreshCw, X, Eye, Sparkles, HardDrive, Loader2, Hand,
} from "lucide-react";

// #162 — « L'Atelier des cerveaux ». L'UI qui donne à Raf le pouvoir que Claude
// avait à la main : voir chaque agent, choisir son modèle, parcourir/télécharger
// les modèles Ollama LOCAUX, et tout ça avec une GARDE de capacités (l'agent
// `vision` exige la capability `vision` — piège GLM-4.6V évité) + un bouton
// « scanner » (examen d'entrée #148). Aboutissement UI du multi-cerveaux #150/#135.
//
// Réutilise tel quel : GET/PUT /api/brain-registry (#150), POST /api/brains/scan
// (#148), et les nouvelles routes /api/ollama/* (#162 Pièce 1). Garde NON-BLOQUANTE
// (avertit, n'impose pas — fidèle #111).

const PROVIDERS = ["claude", "ollama", "openai", "deepseek", "mistral", "groq", "litellm"];

const FIELD_CLS =
  "w-full rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/50";

// Couleur par verdict #148 (palette MangoOS).
const VERDICT = {
  agentic:  { label: "Agentique",  cls: "bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30" },
  contract: { label: "Contrat",    cls: "bg-[#FFCC00]/15 text-[#E0A800] border-[#FFCC00]/30" },
  discuss:  { label: "Discussion", cls: "bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30" },
  reject:   { label: "Recalé",     cls: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30" },
};

// verdict → agents conseillés (la capability `vision` reste requise à part).
const SUGGESTED = {
  agentic:  ["codeur", "orchestrateur", "architecte", "juge", "optimiseur"],
  contract: ["extracteur", "testeur", "auditeur"],
  discuss:  ["chercheur", "designer_ux"],
  reject:   [],
};

// Badge de capability Ollama (vision/tools/thinking…).
const CAP_LABEL = { vision: "vision", tools: "outils", thinking: "raisonne", completion: "texte" };
function CapBadge({ cap }) {
  const vis = cap === "vision";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
        vis ? "border-accent/40 bg-accent/12 text-accent" : "border-edge bg-edge-soft text-dim"
      }`}
    >
      {vis && <Eye size={9} />}
      {CAP_LABEL[cap] ?? cap}
    </span>
  );
}

function fmtBytes(n) {
  if (!n) return "";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} Go`;
  return `${Math.round(n / 1e6)} Mo`;
}

export default function AtelierCerveaux({ onBack }) {
  const [registry, setRegistry] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [agents, setAgents] = useState([]);
  const [expectedCaps, setExpectedCaps] = useState({});
  const [caps, setCaps] = useState({}); // { [modelName]: string[] }
  const [models, setModels] = useState([]); // modèles Ollama locaux
  const [ollamaOk, setOllamaOk] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState(null); // { kind, text }
  const [confirmCfg, setConfirmCfg] = useState(null);

  const flash = useCallback((kind, text) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Charge les capabilities d'un modèle Ollama (cache via ref synchrone, lève jamais).
  const fetchedCaps = useRef(new Set());
  const ensureCaps = useCallback(async (name) => {
    if (!name || fetchedCaps.current.has(name)) return;
    fetchedCaps.current.add(name);
    try {
      const r = await fetch(`/api/ollama/caps?name=${encodeURIComponent(name)}`);
      const d = await r.json();
      setCaps((prev) => ({ ...prev, [name]: Array.isArray(d.capabilities) ? d.capabilities : [] }));
    } catch {
      setCaps((prev) => ({ ...prev, [name]: [] }));
    }
  }, []);

  const loadRegistry = useCallback(async () => {
    const r = await fetch("/api/brain-registry");
    if (!r.ok) throw new Error("registre indisponible");
    const d = await r.json();
    setRegistry(d.registry);
    setDefaults(d.defaults);
    setAgents(d.agents || Object.keys(d.registry || {}));
    setExpectedCaps(d.expectedCaps || {});
    // Pré-charge les caps des modèles ollama déjà assignés (pour la garde).
    for (const id of d.agents || []) {
      const c = d.registry?.[id];
      if (c?.provider === "ollama" && c.model) ensureCaps(c.model);
    }
  }, [ensureCaps]);

  const loadModels = useCallback(async () => {
    try {
      const r = await fetch("/api/ollama/models");
      const d = await r.json();
      setOllamaOk(!!d.ok);
      setModels(Array.isArray(d.models) ? d.models : []);
    } catch {
      setOllamaOk(false);
      setModels([]);
    }
  }, []);

  useEffect(() => {
    loadRegistry().catch((e) => setError(e.message));
    loadModels();
  }, [loadRegistry, loadModels]);

  function setField(id, key, val) {
    setRegistry((prev) => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
    setDirty(true);
  }

  function pickModel(id, name) {
    setField(id, "model", name);
    ensureCaps(name);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/brain-registry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registry),
      });
      if (!r.ok) throw new Error("sauvegarde refusée");
      const d = await r.json();
      setRegistry(d.registry);
      setDirty(false);
      flash("ok", "Registre des cerveaux sauvegardé.");
    } catch (e) {
      setError(e.message);
      flash("error", `Sauvegarde impossible : ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!defaults) return;
    setRegistry(JSON.parse(JSON.stringify(defaults)));
    setDirty(true);
    flash("ok", "Défauts restaurés (non sauvegardé).");
  }

  // Garde : capabilities exigées ⊄ caps du modèle → liste des manquantes.
  function missingCaps(id) {
    const c = registry?.[id];
    if (!c || c.provider !== "ollama" || !c.model) return [];
    const need = expectedCaps[id] || [];
    if (need.length === 0) return [];
    const have = caps[c.model];
    if (have === undefined) return []; // caps pas encore connues → pas d'alarme prématurée
    return need.filter((cap) => !have.includes(cap));
  }

  const [showAdd, setShowAdd] = useState(false);

  if (error && !registry) {
    return (
      <div className="flex h-full flex-col">
        <Header onBack={onBack} />
        <div className="p-6 text-[13px] text-[#FF3B30]">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header onBack={onBack} onAdd={() => setShowAdd(true)} />

      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-6 py-5">
        <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-dim">
          Chaque agent de MangoOS a <span className="text-ink">son</span> cerveau. Choisis le modèle,
          parcours ou télécharge tes modèles Ollama locaux, et l'atelier t'avertit si un modèle
          n'a pas la <span className="text-ink">capacité</span> exigée (l'œil <span className="text-ink">vision</span>{" "}
          a besoin de <code className="text-accent">vision</code>). Le routage s'active avec{" "}
          <code className="text-dim">BRAIN_DISPATCH=on</code> ; le registre reste éditable à tout moment.
        </p>

        {!ollamaOk && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#FFCC00]/30 bg-[#FFCC00]/10 px-3 py-2 text-[12.5px] text-[#E0A800]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Ollama local injoignable — la liste des modèles et les capacités sont indisponibles. Les champs restent éditables à la main.</span>
          </div>
        )}

        {!registry ? (
          <p className="text-[13px] text-faint italic">Chargement…</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {agents.map((id) => {
              const c = registry[id] || {};
              const local = c.provider === "ollama";
              const lacking = missingCaps(id);
              const modelCaps = local && c.model ? caps[c.model] : undefined;
              return (
                <div key={id} data-agent={id} className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Cpu size={17} className="shrink-0 text-faint" />
                    <span className="text-[13px] font-semibold text-ink">{id}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${local ? "bg-accent/15 text-accent" : "bg-edge-soft text-faint"}`}>
                      {local ? "local" : "cloud"}
                    </span>
                    {expectedCaps[id]?.includes("vision") && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                        <Eye size={9} /> exige vision
                      </span>
                    )}
                    {id === "codeur" && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-ok/40 bg-ok/10 px-1.5 py-0.5 text-[10px] text-ok"
                        title="L'Élève : le modèle qui CODE en mode Construire/Discuter. L'endpoint et la clé restent dans .env."
                      >
                        <Hand size={9} /> Élève · les mains
                      </span>
                    )}
                    {local && modelCaps?.length > 0 && (
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {modelCaps.map((cap) => <CapBadge key={cap} cap={cap} />)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-faint">Provider</span>
                      <select aria-label={`provider de ${id}`} value={c.provider || "claude"} onChange={(e) => setField(id, "provider", e.target.value)} className={FIELD_CLS}>
                        {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-faint">Modèle</span>
                      {local ? (
                        <select aria-label={`modèle de ${id}`} value={c.model || ""} onChange={(e) => pickModel(id, e.target.value)} className={FIELD_CLS}>
                          <option value="">— choisir —</option>
                          {/* le modèle assigné peut ne plus être listé (ex. cloud Ollama) → on l'ajoute */}
                          {c.model && !models.some((m) => m.name === c.model) && <option value={c.model}>{c.model}</option>}
                          {models.map((m) => <option key={m.name} value={m.name}>{m.name}{m.parameterSize ? ` · ${m.parameterSize}` : ""}</option>)}
                        </select>
                      ) : (
                        <input aria-label={`modèle de ${id}`} value={c.model || ""} onChange={(e) => setField(id, "model", e.target.value)} placeholder="ex. opus / sonnet / glm-4.6" className={FIELD_CLS} />
                      )}
                    </label>

                    {!local && (
                      <>
                        <input aria-label={`baseUrl de ${id}`} value={c.baseUrl || ""} onChange={(e) => setField(id, "baseUrl", e.target.value)} placeholder="baseUrl (optionnel)" className={FIELD_CLS} />
                        <input aria-label={`apiKeyEnv de ${id}`} value={c.apiKeyEnv || ""} onChange={(e) => setField(id, "apiKeyEnv", e.target.value)} placeholder="apiKeyEnv (optionnel)" className={FIELD_CLS} />
                      </>
                    )}

                    <label className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-faint">Timeout (ms)</span>
                      <input aria-label={`timeout de ${id}`} type="number" value={c.timeoutMs ?? ""} onChange={(e) => setField(id, "timeoutMs", Number(e.target.value) || undefined)} placeholder="ex. 60000" className={FIELD_CLS} />
                    </label>

                    <label className="flex items-center gap-2 self-end pb-1.5 text-[12px] text-dim">
                      <input type="checkbox" checked={!!c.localOnly} onChange={(e) => setField(id, "localOnly", e.target.checked)} />
                      localOnly (jamais de cloud)
                    </label>
                  </div>

                  {/* GARDE de capacités (non-bloquante) */}
                  {lacking.length > 0 && (
                    <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-[#FF3B30]/10 px-2.5 py-1.5 text-[12px] text-[#FF3B30]" data-warn={id}>
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        Ce modèle n'a pas la capacité <strong>{lacking.join(", ")}</strong> —
                        {lacking.includes("vision") ? " l'œil ne verra pas (piège GLM-4.6V). " : " "}
                        Tu peux quand même sauvegarder, mais cet agent risque d'échouer.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer collant quand modifié */}
      {dirty && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-edge bg-panel/80 px-6 py-3 backdrop-blur">
          <button onClick={resetDefaults} className="flex items-center gap-1.5 rounded-lg border border-edge px-3.5 py-2 text-[13px] text-dim transition-colors hover:border-faint hover:text-ink">
            <RefreshCw size={14} /> Réinitialiser
          </button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-soft disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      )}

      {showAdd && (
        <AddModelModal
          models={models}
          caps={caps}
          ensureCaps={ensureCaps}
          onClose={() => setShowAdd(false)}
          onChanged={() => { loadModels(); }}
          onDelete={(name) => setConfirmCfg({
            title: "Supprimer le modèle ?",
            body: `« ${name} » sera retiré d'Ollama (réinstallable plus tard). Cette action est définitive.`,
            confirmLabel: "Supprimer",
            onConfirm: async () => {
              try {
                const r = await fetch(`/api/ollama/model?name=${encodeURIComponent(name)}`, { method: "DELETE" });
                if (!r.ok) throw new Error();
                flash("ok", `« ${name} » supprimé.`);
                loadModels();
              } catch {
                flash("error", "Suppression impossible.");
              }
            },
          })}
          flash={flash}
        />
      )}

      {confirmCfg && <InlineConfirm config={confirmCfg} onClose={() => setConfirmCfg(null)} />}
      {toast && <InlineToast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function Header({ onBack, onAdd }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Accueil
      </button>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Wrench size={16} className="text-accent-soft" /> Atelier des cerveaux · un modèle par agent
      </span>
      {onAdd && (
        <button onClick={onAdd} className="ml-auto flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/25">
          <Plus size={15} /> Ajouter un modèle
        </button>
      )}
    </div>
  );
}

// Modale « + Ajouter un modèle » : Local (parcourir + scanner + supprimer) | Télécharger (pull).
function AddModelModal({ models, caps, ensureCaps, onClose, onChanged, onDelete, flash }) {
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

// Confirm + Toast autonomes (l'atelier est un panneau de Réglages, pas le shell App).
function InlineConfirm({ config, onClose }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="animate-pop w-[420px] max-w-[90vw] rounded-2xl border border-edge bg-raised p-5 shadow-2xl shadow-black/50">
        <h2 className="text-base font-bold text-ink">{config.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-dim">{config.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-4 py-2 text-sm text-dim transition-colors hover:border-faint hover:text-ink">Annuler</button>
          <button onClick={() => { config.onConfirm(); onClose(); }} className="rounded-lg bg-err px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
            {config.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineToast({ toast, onClose }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] w-80">
      <div className={`animate-pop flex items-start gap-2.5 rounded-xl border bg-raised/95 p-3 shadow-xl shadow-black/40 backdrop-blur ${toast.kind === "error" ? "border-err/40" : "border-ok/40"}`}>
        {toast.kind === "error" ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-err" /> : <Check size={17} className="mt-0.5 shrink-0 text-ok" />}
        <div className="flex-1 text-sm leading-snug text-ink">{toast.text}</div>
        <button onClick={onClose} className="shrink-0 text-dim hover:text-ink" aria-label="Fermer"><X size={14} /></button>
      </div>
    </div>
  );
}
