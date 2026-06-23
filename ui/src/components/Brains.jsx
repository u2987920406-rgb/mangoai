import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Brain, Cpu, ScanLine, Trash2, AlertTriangle, Check } from "lucide-react";

// Phase E (#135) — Réglages › Cerveaux. Le sélecteur multi-cerveaux par intention :
// chaque intention (Construire / Planifier / Discuter) est routée vers SON cerveau
// MESURÉ par l'examen d'entrée #148. Le scan recommande l'aptitude, l'humain décide
// l'emploi, MangoOS avertit si une affectation contredit la mesure.

// Couleur par verdict mesuré (palette MangoOS : vert apte → rouge recalé).
const VERDICT = {
  agentic:  { label: "Agentique",  dot: "#34C759", chip: "bg-[#34C759]/15 text-[#34C759] border-[#34C759]/30" },
  contract: { label: "Contrat",    dot: "#FFCC00", chip: "bg-[#FFCC00]/15 text-[#E0A800] border-[#FFCC00]/30" },
  discuss:  { label: "Discussion", dot: "#0A84FF", chip: "bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30" },
  reject:   { label: "Recalé",     dot: "#FF3B30", chip: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30" },
};

function VerdictChip({ verdict }) {
  const v = VERDICT[verdict] ?? VERDICT.reject;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${v.chip}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.dot }} />
      {v.label}
    </span>
  );
}

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export default function Brains({ onBack }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Formulaire de scan
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/brains");
      if (!res.ok) throw new Error("chargement impossible");
      setState(await res.json());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const setRouting = async (intention, brainId) => {
    try {
      const res = await fetch("/api/brains/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intention, brainId: brainId || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "échec");
      setState(await res.json());
    } catch (e) {
      setError(e.message);
    }
  };

  const removeBrain = async (id) => {
    try {
      const res = await fetch(`/api/brains/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("suppression impossible");
      setState(await res.json());
    } catch (e) {
      setError(e.message);
    }
  };

  const runScan = async () => {
    const m = model.trim();
    if (!m) return;
    setScanning(true);
    setScanMsg(`Examen d'entrée de « ${m} » en cours (6 sondes objectives)…`);
    try {
      const res = await fetch("/api/brains/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "examen impossible");
      setState(data.state);
      setScanMsg(`✓ ${data.summary}`);
      setModel("");
      setLabel("");
    } catch (e) {
      setScanMsg(`✗ ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const brains = state?.brains ?? [];
  const routing = state?.routing ?? {};
  const intentions = state?.intentions ?? [];
  const warnings = state?.warnings ?? [];
  const warnFor = (intention) => warnings.find((w) => w.intention === intention);

  return (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
          <ArrowLeft size={16} /> Accueil
        </button>
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Brain size={16} className="text-accent-soft" /> Cerveaux · multi-cerveaux par intention
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-6 py-5">
        <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-dim">
          Affecte le bon cerveau à chaque intention — façon Haiku/Sonnet/Opus, mais souverain et{" "}
          <span className="text-ink">mesuré</span>. L'examen d'entrée recommande l'aptitude ; <span className="text-ink">tu</span> décides
          l'emploi ; MangoOS t'avertit si une affectation contredit la mesure.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-3 py-2 text-[13px] text-[#FF3B30]">
            {error}
          </div>
        )}

        {/* ── Routage par intention ─────────────────────────────────────────── */}
        <section className="mb-7">
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">Routage des intentions</h3>
          {(brains.length || loading) ? (
          <div className="flex flex-col gap-2.5">
            {intentions.map(({ id, label: ilabel }) => {
              const w = warnFor(id);
              return (
                <div key={id} className="rounded-xl border border-edge-soft bg-panel px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[13px] font-medium text-ink">{ilabel}</span>
                    <select
                      value={routing[id] ?? ""}
                      onChange={(e) => setRouting(id, e.target.value)}
                      disabled={loading}
                      className="min-w-0 flex-1 rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent/50 disabled:opacity-50"
                    >
                      <option value="">— non affecté —</option>
                      {brains.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label} ({VERDICT[b.verdict]?.label ?? b.verdict})
                        </option>
                      ))}
                    </select>
                  </div>
                  {w && (
                    <div
                      className={`mt-2 flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${
                        w.fit === "mismatch"
                          ? "bg-[#FF3B30]/10 text-[#FF3B30]"
                          : "bg-[#FFCC00]/10 text-[#E0A800]"
                      }`}
                    >
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>{w.message}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          ) : (
            <div className="rounded-xl border border-dashed border-accent/40 bg-accent/5 px-4 py-4">
              <p className="mb-1 text-[13px] font-semibold text-ink">Commence par scanner un cerveau ↓</p>
              <p className="text-[12.5px] leading-relaxed text-dim">
                Le registre est vide. On ne peut router une intention que vers un cerveau <span className="text-ink">mesuré</span> :
                lance un examen dans « Scanner un nouveau cerveau » juste en dessous, puis reviens ici affecter
                Construire / Planifier / Discuter.
              </p>
            </div>
          )}
        </section>

        {/* ── Scanner un nouveau cerveau ─────────────────────────────────────── */}
        <section className="mb-7">
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">Scanner un nouveau cerveau</h3>
          <div className="rounded-xl border border-edge-soft bg-panel px-4 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-faint">Identifiant du modèle</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !scanning && runScan()}
                  placeholder="ex. glm-4.6:cloud"
                  className="w-56 rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent/50"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-faint">Nom lisible (optionnel)</span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="ex. GLM cloud"
                  className="w-44 rounded-lg border border-edge bg-raised px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent/50"
                />
              </label>
              <button
                onClick={runScan}
                disabled={scanning || !model.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3.5 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
              >
                <ScanLine size={15} className={scanning ? "animate-pulse" : ""} />
                {scanning ? "Examen…" : "Lancer l'examen"}
              </button>
            </div>
            {scanMsg && (
              <p className={`mt-3 text-[12px] ${scanMsg.startsWith("✗") ? "text-[#FF3B30]" : "text-dim"}`}>{scanMsg}</p>
            )}
            <p className="mt-2 text-[11px] text-faint">
              L'examen passe 6 sondes objectives (raisonnement, JSON, consigne, contrat, appel d'outils, codage) via l'endpoint Élève actif.
            </p>
          </div>
        </section>

        {/* ── Cerveaux mesurés ───────────────────────────────────────────────── */}
        <section>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-faint">
            Cerveaux mesurés ({brains.length})
          </h3>
          <div className="flex flex-col gap-2">
            {brains.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl border border-edge-soft bg-panel px-4 py-3">
                <Cpu size={18} className="shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{b.label}</span>
                    <VerdictChip verdict={b.verdict} />
                    {b.agentic && <Check size={13} className="text-[#34C759]" title="apte à la boucle agentique" />}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-faint">
                    {b.model} · {b.provider} · {b.avgLatencyMs ? `${b.avgLatencyMs}ms` : "—"} · scanné {timeAgo(b.scannedAt)}
                  </p>
                </div>
                <button
                  onClick={() => removeBrain(b.id)}
                  title="Retirer ce cerveau"
                  className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-[#FF3B30]/10 hover:text-[#FF3B30]"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {!brains.length && !loading && (
              <p className="text-[12px] text-faint">Le registre est vide.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
