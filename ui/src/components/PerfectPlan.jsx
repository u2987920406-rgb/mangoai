import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from "lucide-react";
import { QUESTIONS } from "./perfect-plan/questions.js";

export default function PerfectPlan({ onClose, onLaunch, count = 15, title = "Perfect Plan", launchLabel = "Lancer avec ce plan" }) {
  // Perfect Plan = 15 questions · Gros chantier = 30. On découpe la banque commune.
  const active = QUESTIONS.slice(0, Math.min(count, QUESTIONS.length));
  const TOTAL = active.length + 1; // N questions + l'étape références

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [refs, setRefs] = useState([]);
  const [refKind, setRefKind] = useState("url");
  const [refValue, setRefValue] = useState("");
  const [refLabel, setRefLabel] = useState("");

  const q = step < active.length ? active[step] : null;
  const isRefsStep = step === active.length;
  const canNext = q ? answers[q.id] !== undefined : true;

  function pick(id, value, label) {
    setAnswers((prev) => ({ ...prev, [id]: { value, label } }));
  }

  function addRef() {
    if (!refValue.trim()) return;
    setRefs((prev) => [
      ...prev,
      { kind: refKind, value: refValue.trim(), ...(refLabel.trim() ? { label: refLabel.trim() } : {}) },
    ]);
    setRefValue("");
    setRefLabel("");
  }

  function launch() {
    const answersArr = active.map((q) => ({
      id: q.id,
      value: answers[q.id].value,
      label: answers[q.id].label,
    }));
    onLaunch({ answers: answersArr, refs });
  }

  const stepTitle = q ? q.text : "Références (optionnel)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-edge bg-panel p-7 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              ✨ {title} — étape {step + 1}/{TOTAL}
            </p>
            <h2 className="text-[17px] font-bold text-ink">{stepTitle}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Barre de progression */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < step ? "bg-accent" : i === step ? "bg-accent/50" : "bg-edge"
              }`}
            />
          ))}
        </div>

        {/* Options */}
        {q && (
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const sel = answers[q.id]?.value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { pick(q.id, opt.value, opt.label); }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                    sel
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-edge bg-bg text-dim hover:border-faint hover:text-ink"
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    sel ? "border-accent bg-accent" : "border-edge"
                  }`}>
                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight">{opt.label}</p>
                    <p className="text-[11px] text-faint">{opt.example}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Étape références */}
        {isRefsStep && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-dim leading-relaxed">
              Dépose des sites, une palette ou des contraintes. Mango les utilisera avant de coder — Sharingan scan automatique sur les URLs.
            </p>

            <div className="flex flex-col gap-2 rounded-xl border border-edge p-3">
              <div className="flex items-center gap-2">
                <select
                  value={refKind}
                  onChange={(e) => setRefKind(e.target.value)}
                  className="rounded-lg border border-edge bg-bg px-2 py-1.5 text-xs text-dim focus:border-accent focus:outline-none"
                >
                  <option value="url">URL</option>
                  <option value="palette">Palette</option>
                  <option value="note">Contrainte</option>
                </select>
                <input
                  type="text"
                  value={refValue}
                  onChange={(e) => setRefValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addRef(); }}
                  placeholder={
                    refKind === "url" ? "https://apple.com"
                    : refKind === "palette" ? "#1a1a2e, #e94560"
                    : "pas de serif, fond sombre obligatoire…"
                  }
                  className="flex-1 rounded-lg border border-edge bg-bg px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  onClick={addRef}
                  disabled={!refValue.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-edge text-dim hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>
              {refKind === "url" && (
                <input
                  type="text"
                  value={refLabel}
                  onChange={(e) => setRefLabel(e.target.value)}
                  placeholder="Description (optionnel)"
                  className="rounded-lg border border-edge bg-bg px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              )}
            </div>

            {refs.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {refs.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-edge bg-bg px-3 py-1.5">
                    <span className="min-w-[44px] text-[9px] font-semibold uppercase text-faint">{r.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.value}</span>
                    {r.label && <span className="max-w-[80px] truncate text-[10px] text-faint">{r.label}</span>}
                    <button onClick={() => setRefs((p) => p.filter((_, j) => j !== i))} className="text-dim hover:text-err transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-faint">Aucune référence — Mango comblera librement.</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-xs text-dim hover:border-faint hover:text-ink disabled:opacity-30 transition-colors"
          >
            <ArrowLeft size={13} />
            Précédent
          </button>

          {isRefsStep ? (
            <button
              onClick={launch}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-md shadow-accent/30 hover:opacity-90 transition"
            >
              {launchLabel}
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/30 hover:opacity-90 disabled:opacity-50 transition"
            >
              Suivant
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
