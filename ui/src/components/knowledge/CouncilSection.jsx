import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Check, Loader2, Wrench } from "lucide-react";
import Section from "./Section.jsx";
import { stripFrontmatter } from "./helpers.js";

// Idée #44 — Conseil d'experts : rattrapage d'un projet dévié (lecture seule).
// Extrait verbatim de Knowledge.jsx (état councilProblem/councilRunning/
// councilResult/councilError/expandedLens local).
export default function CouncilSection({ projectName }) {
  const [councilProblem, setCouncilProblem] = useState("");
  const [councilRunning, setCouncilRunning] = useState(false);
  const [councilResult, setCouncilResult] = useState(null);
  const [councilError, setCouncilError] = useState(null);
  const [expandedLens, setExpandedLens] = useState(null);

  return (
    <Section icon={Wrench} title="Conseil d'experts">
      <div className="space-y-2">
        <p className="text-[11px] text-faint leading-relaxed">
          Projet parti de travers ? Convoque un conseil d'experts qui le lit chacun sous son angle
          (archi, produit, UX, données, robustesse) et fusionne leurs diagnostics en un plan de reprise priorisé.
        </p>
        <textarea
          value={councilProblem}
          onChange={(e) => setCouncilProblem(e.target.value)}
          rows={2}
          placeholder="Qu'est-ce qui a dévié ? (optionnel — ex: « parti sur une todo mais je veux un CRM »)"
          className="w-full resize-y rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
        />
        <button
          disabled={councilRunning}
          onClick={async () => {
            setCouncilRunning(true);
            setCouncilError(null);
            try {
              const r = await fetch(`/api/council/${encodeURIComponent(projectName)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ problem: councilProblem }),
              });
              if (!r.ok) throw new Error(`Erreur HTTP ${r.status}`);
              setCouncilResult(await r.json());
            } catch (e) {
              setCouncilError(e.message ?? String(e));
            } finally {
              setCouncilRunning(false);
            }
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-40 transition-colors"
        >
          {councilRunning ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
          {councilRunning ? "Le conseil délibère…" : "Convoquer le conseil"}
        </button>
        {councilError && <p className="text-[11px] text-red-400">⚠ {councilError}</p>}
        {councilResult && (
          <div className="space-y-2 pt-1">
            {councilResult.plan && (
              <div className="rounded-lg border border-accent/40 bg-accent/5 p-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Plan de reprise</p>
                <div className="md text-xs leading-relaxed">
                  <ReactMarkdown>{stripFrontmatter(councilResult.plan)}</ReactMarkdown>
                </div>
              </div>
            )}
            {(councilResult.diagnoses || []).length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">Diagnostics ({councilResult.diagnoses.length})</p>
                {councilResult.diagnoses.map((d, i) => (
                  <div key={d.key || i} className="rounded-lg border border-edge bg-bg">
                    <button
                      onClick={() => setExpandedLens(expandedLens === i ? null : i)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-medium text-dim hover:text-ink transition-colors"
                    >
                      <span>{d.lens}</span>
                      <span className="text-faint">{expandedLens === i ? "−" : "+"}</span>
                    </button>
                    {expandedLens === i && (
                      <div className="md border-t border-edge px-2 py-1.5 text-[11px] leading-relaxed">
                        <ReactMarkdown>{d.findings}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {councilResult.plan && (
              <button
                onClick={async () => {
                  await fetch(`/api/council/${encodeURIComponent(projectName)}`, { method: "DELETE" });
                  setCouncilResult(null);
                  setCouncilProblem("");
                }}
                className="flex w-full items-center justify-center gap-1 rounded-lg border border-edge py-1.5 text-[11px] text-faint hover:text-ink transition-colors"
              >
                <Check size={11} /> Rattrapage terminé — effacer le plan
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
