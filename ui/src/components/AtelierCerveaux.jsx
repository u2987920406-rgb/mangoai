import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Check, Eye, Loader2, RefreshCw, Hand, Cpu } from "lucide-react";
import SpecialistAgents from "./SpecialistAgents.jsx";
import Header from "./atelier/Header.jsx";
import AddModelModal from "./atelier/AddModelModal.jsx";
import { InlineConfirm, InlineToast } from "./atelier/InlineFeedback.jsx";
import CapBadge from "./atelier/CapBadge.jsx";
import { PROVIDERS, FIELD_CLS } from "./atelier/constants.js";

// #162 — « L'Atelier des cerveaux ». L'UI qui donne à Raf le pouvoir que Claude
// avait à la main : voir chaque agent, choisir son modèle, parcourir/télécharger
// les modèles Ollama LOCAUX, et tout ça avec une GARDE de capacités (l'agent
// `vision` exige la capability `vision` — piège GLM-4.6V évité) + un bouton
// « scanner » (examen d'entrée #148). Aboutissement UI du multi-cerveaux #150/#135.
//
// Réutilise tel quel : GET/PUT /api/brain-registry (#150), POST /api/brains/scan
// (#148), et les nouvelles routes /api/ollama/* (#162 Pièce 1). Garde NON-BLOQUANTE
// (avertit, n'impose pas — fidèle #111).

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

        {/* Slice 2a — les agents que Mango se forge via GLM pour combler ses lacunes */}
        <SpecialistAgents models={models} flash={flash} requestConfirm={setConfirmCfg} />
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
