import { useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, X } from "lucide-react";
import Section from "./Section.jsx";
import { mutateProposal } from "./helpers.js";

// Idée #76 — Évolution des règles (auto-réécriture proposée, validée par l'humain).
// Extrait verbatim de Knowledge.jsx (état evoRunning/evoExpanded local ; evoRuns/
// setEvoRuns viennent du hook useKnowledge, remontés en props).
export default function EvolutionSection({ evoRuns, setEvoRuns }) {
  const [evoRunning, setEvoRunning] = useState(false);
  const [evoExpanded, setEvoExpanded] = useState(null);

  return (
    <Section
      icon={BrainCircuit}
      title="Évolution des règles"
      action={
        <button
          onClick={async () => {
            setEvoRunning(true);
            try {
              const r = await fetch("/api/prompt-evolution/run", { method: "POST" });
              if (r.ok) {
                const d = await r.json();
                setEvoRuns((prev) => [d.run, ...(prev || [])]);
                setEvoExpanded(d.run?.id ?? null);
              }
            } finally {
              setEvoRunning(false);
            }
          }}
          disabled={evoRunning}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink transition-colors disabled:opacity-40"
          title="Analyser mes corrections récurrentes et proposer des évolutions"
        >
          {evoRunning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {evoRunning ? "Analyse…" : "Analyser & proposer"}
        </button>
      }
    >
      {!evoRuns || evoRuns.length === 0 ? (
        <p className="text-xs text-faint italic">
          Mango analyse tes corrections récurrentes (axiomes, escalades) et propose des évolutions de ses propres règles — à valider avant application. Clique « Analyser & proposer ».
        </p>
      ) : (
        <ul className="space-y-2">
          {evoRuns.map((run) => (
            <li key={run.id} className="rounded-lg border border-edge bg-bg p-2 text-xs space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-faint">{run.ts?.slice(0, 16).replace("T", " ")}</p>
                  {run.summary && <p className="text-[11px] text-dim">{run.summary}</p>}
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/prompt-evolution/${encodeURIComponent(run.id)}`, { method: "DELETE" });
                    setEvoRuns((prev) => (prev || []).filter((r) => r.id !== run.id));
                  }}
                  className="shrink-0 rounded p-0.5 text-faint hover:text-red-400 transition-colors"
                  title="Supprimer cette analyse"
                >
                  <X size={11} />
                </button>
              </div>
              {run.proposals.length === 0 ? (
                <p className="text-[10px] text-faint italic">Aucune évolution proposée — les règles sont saines.</p>
              ) : (
                run.proposals.map((p) => (
                  <div key={p.id} className="rounded border border-edge/70 p-1.5">
                    <button
                      onClick={() => setEvoExpanded(evoExpanded === p.id ? null : p.id)}
                      className="flex w-full items-start gap-1.5 text-left"
                    >
                      <span className="rounded bg-edge-soft px-1 py-0.5 text-[9px] text-faint shrink-0">{p.kind}</span>
                      <span className="flex-1 min-w-0 font-medium text-ink">{p.title}</span>
                      {p.status !== "pending" && (
                        <span className={`text-[9px] shrink-0 ${p.status === "applied" ? "text-accent" : "text-faint"}`}>
                          {p.status === "applied" ? "✓ appliqué" : "✗ refusé"}
                        </span>
                      )}
                    </button>
                    {p.rationale && <p className="mt-0.5 text-[10px] text-dim">{p.rationale}</p>}
                    {p.targetIds?.length > 0 && (
                      <p className="text-[9px] text-faint">cible : {p.targetIds.join(", ")}</p>
                    )}
                    {evoExpanded === p.id && p.newText && (
                      <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-dim">{p.newText}</pre>
                    )}
                    {p.status === "pending" && (
                      <div className="mt-1 flex items-center gap-1.5">
                        {p.kind === "scenario" ? (
                          <>
                            <span className="text-[9px] text-faint italic">suggestion à porter à la main dans scenario.ts</span>
                            <button
                              onClick={() => mutateProposal(run.id, p.id, "reject", setEvoRuns)}
                              className="ml-auto rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-ink"
                            >
                              Vu
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => mutateProposal(run.id, p.id, "apply", setEvoRuns)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                            >
                              ✓ Appliquer
                            </button>
                            <button
                              onClick={() => mutateProposal(run.id, p.id, "reject", setEvoRuns)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-faint hover:text-red-400"
                            >
                              ✗ Refuser
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
