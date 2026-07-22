import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Dna, Hammer, X, RefreshCw, ShieldCheck, ShieldAlert, Loader2, Check, AlertTriangle } from "lucide-react";

// #168 tranche 2 — Réglages › Intelligence › « Lacunes à combler ».
// L'UI de la boucle d'auto-évolution : Mango inscrit les blocages non couverts par un agent
// forgé (store machine `open-gaps.json`) ; Raf VALIDE → le forgeron (Opus) crée l'agent ciblé,
// ou rejette. Affiche aussi l'état du DISJONCTEUR de la forge auto (frein avant moteur).
// Routes : GET /api/gaps · GET /api/gaps/config · POST /api/gaps/:id/forge · /dismiss.

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

// #196 — score de valeur 0-100 (récurrence − échecs déjà tentés − fraîcheur), calculé
// côté serveur (self-evolution.ts::gapValueScore). Vert = vaut le coup, rouge = probablement pas.
function ValueScoreBadge({ score }) {
  const tone =
    score >= 60 ? "border-[#34C759]/30 bg-[#34C759]/12 text-[#34C759]" :
    score >= 30 ? "border-[#FFCC00]/30 bg-[#FFCC00]/12 text-[#E0A800]" :
    "border-[#FF3B30]/30 bg-[#FF3B30]/12 text-[#FF3B30]";
  return (
    <span
      title="Score de valeur : récurrence du blocage − tentatives déjà échouées − ancienneté. Un proxy, pas une mesure du bénéfice réel."
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {score}%
    </span>
  );
}

export default function AutoEvolution({ onBack }) {
  const [gaps, setGaps] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null); // id en cours de forge/rejet
  const [toast, setToast] = useState(null); // { kind: 'ok'|'err', text }

  const load = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([
        fetch("/api/gaps").then((r) => r.json()),
        fetch("/api/gaps/config").then((r) => r.json()),
      ]);
      setGaps(Array.isArray(g.gaps) ? g.gaps : []);
      setConfig(c);
      setError("");
    } catch {
      setError("Chargement impossible — le backend est-il lancé ?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (kind, text) => { setToast({ kind, text }); setTimeout(() => setToast(null), 4000); };

  async function forge(id, title) {
    setBusy(id);
    try {
      const r = await fetch(`/api/gaps/${encodeURIComponent(id)}/forge`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "échec de la forge");
      flash("ok", `Agent « ${data.agent?.name} » forgé (${data.agent?.provider}/${data.agent?.model})`);
      await load();
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(id) {
    setBusy(id);
    try {
      const r = await fetch(`/api/gaps/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
      if (!r.ok) throw new Error("échec du rejet");
      await load();
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(null);
    }
  }

  const auto = config?.autoForge;
  const selfEvolve = config?.selfEvolve;

  return (
    <div className="flex h-full flex-col">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
          <ArrowLeft size={16} /> Accueil
        </button>
        <Dna size={16} className="text-accent" />
        <span className="text-sm font-semibold text-ink">Lacunes à combler</span>
        <button onClick={load} className="ml-auto flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1 text-[13px] text-dim transition-colors hover:text-ink">
          <RefreshCw size={13} /> Rafraîchir
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-6 py-5">
        {/* Explication */}
        <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-dim">
          Quand Mango se bloque et qu'<strong className="text-ink">aucun agent forgé ne couvre le blocage</strong>, il inscrit la lacune ici.
          Tu la valides d'un clic → le <strong className="text-ink">forgeron</strong> crée l'agent ciblé (effet cliquet : chaque mur comblé est permanent).
        </p>

        {/* État du disjoncteur */}
        {config && (
          <div className={`mb-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-4 py-3 text-[12px] ${
            auto?.enabled ? "border-[#FFCC00]/30 bg-[#FFCC00]/8" : "border-edge bg-raised"
          }`}>
            {auto?.enabled ? <ShieldAlert size={15} className="text-[#E0A800]" /> : <ShieldCheck size={15} className="text-[#34C759]" />}
            <span className="font-medium text-ink">
              {auto?.enabled ? "Forge AUTO armée (sous disjoncteur)" : "Forge manuelle (validation humaine)"}
            </span>
            <span className="text-faint">·</span>
            <span className="text-dim">Détection des lacunes : <strong className={selfEvolve ? "text-[#34C759]" : "text-faint"}>{selfEvolve ? "ON" : "off"}</strong> <span className="text-faint">(SELF_EVOLVE)</span></span>
            {auto?.enabled && (
              <>
                <span className="text-faint">·</span>
                <span className="text-dim">Frein : max <strong className="text-ink">{auto.maxForgesPerRun}</strong> forge/run · garde-coût <strong className="text-ink">${auto.opusBudgetUsd}</strong> Opus</span>
              </>
            )}
          </div>
        )}

        {toast && (
          <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${
            toast.kind === "ok" ? "border-[#34C759]/30 bg-[#34C759]/10 text-[#34C759]" : "border-[#FF3B30]/30 bg-[#FF3B30]/10 text-[#FF3B30]"
          }`}>
            {toast.kind === "ok" ? <Check size={14} /> : <AlertTriangle size={14} />} {toast.text}
          </div>
        )}

        {error && <div className="mb-4 rounded-lg border border-[#FF3B30]/30 bg-[#FF3B30]/10 px-3 py-2 text-[13px] text-[#FF3B30]">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Chargement…</div>
        ) : gaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge py-14 text-center">
            <Dna size={28} className="text-faint" />
            <p className="text-sm font-medium text-dim">Aucune lacune ouverte</p>
            <p className="max-w-sm text-[12px] text-faint">Mango n'a rencontré aucun mur non couvert. Les lacunes apparaîtront ici quand un blocage sortira du champ des agents existants.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {gaps.map((g) => {
              const isBusy = busy === g.id;
              return (
                <div key={g.id} className="rounded-xl border border-edge bg-panel/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#FF9500]/30 bg-[#FF9500]/12 px-2 py-0.5 text-[11px] font-medium text-[#FF9500]">
                          {g.blocker}
                        </span>
                        <ValueScoreBadge score={g.valueScore ?? 0} />
                        {g.hits > 1 && <span className="rounded-full bg-edge-soft px-2 py-0.5 text-[11px] text-dim">×{g.hits} rencontres</span>}
                        {g.status === "forging" && <span className="inline-flex items-center gap-1 text-[11px] text-[#E0A800]"><Loader2 size={11} className="animate-spin" /> forge…</span>}
                        <span className="ml-auto text-[11px] text-faint">{timeAgo(g.createdAt)}</span>
                      </div>
                      <p className="mt-2 text-[13px] font-medium text-ink">{g.detail || g.title}</p>
                      {g.task && <p className="mt-1 line-clamp-2 text-[12px] text-faint">Tâche : {g.task}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        onClick={() => forge(g.id, g.title)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />} Forger l'agent
                      </button>
                      <button
                        onClick={() => dismiss(g.id)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-[12px] text-dim transition-colors hover:text-ink disabled:opacity-50"
                      >
                        <X size={13} /> Rejeter
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
