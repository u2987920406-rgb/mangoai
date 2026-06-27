import { useState, useEffect, useCallback } from "react";
import { BrainCircuit, Star } from "lucide-react";
import { ReviewQuestions, setAnswer } from "./NocturnalReviewForm.jsx";

function StarPicker({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          disabled={disabled}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 disabled:cursor-default"
          title={`${n} étoile${n > 1 ? "s" : ""}`}
        >
          <Star
            size={22}
            className={n <= (hovered || value) ? "fill-warn text-warn" : "text-edge"}
          />
        </button>
      ))}
    </div>
  );
}

const LABELS = ["", "Décevant", "Moyen", "Correct", "Bien", "Excellent"];

export default function BuildReview({ projectName }) {
  const [review, setReview]     = useState(null);
  const [score, setScore]       = useState(0);
  const [comment, setComment]   = useState("");
  const [answers, setAnswers]   = useState({}); // QCM gradué par dimension
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult]     = useState(null); // axiomes extraits
  const [error, setError]       = useState(null);

  const load = useCallback(() => {
    fetch(`/api/projects/${encodeURIComponent(projectName)}/build-review`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.review) {
          setReview(d.review);
          setScore(d.review.score ?? 0);
          setComment(d.review.comment ?? "");
          setAnswers(d.review.answers ?? {});
          if (d.review.axiomsExtracted) setResult(d.review.axiomsExtracted);
        }
      });
  }, [projectName]);

  useEffect(() => { load(); }, [load]);

  async function handleAnalyze() {
    if (!score) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(
        `/api/projects/${encodeURIComponent(projectName)}/build-review/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ score, comment, answers }),
        },
      );
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Erreur serveur"); return; }
      setResult(d.axiomsExtracted ?? []);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  }

  const alreadyAnalyzed = review?.analyzedAt != null;

  return (
    <div className="flex flex-col gap-4 p-3">

      {/* Titre explicatif */}
      <div className="rounded-xl border border-edge bg-bg/60 px-3 py-2.5">
        <p className="text-[12px] leading-relaxed text-dim">
          Note ce build pour que Mango apprenne de ton jugement.
          Ton score + commentaire seront analysés pour extraire des axiomes
          qui influenceront les prochains projets.
        </p>
      </div>

      {/* Étoiles */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">
          Qualité globale du build
        </p>
        <StarPicker value={score} onChange={setScore} disabled={analyzing} />
        {score > 0 && (
          <p className="text-[13px] font-semibold text-ink">{LABELS[score]}</p>
        )}
      </div>

      {/* QCM par dimension (même grille que la review nocturne) */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">
          Détail par dimension · ❤️ adoré · 👍 bien · 😐 moyen · 👎 raté
        </p>
        <ReviewQuestions
          answers={answers}
          onChange={(key, value) => setAnswers((a) => setAnswer(a, key, value))}
        />
      </div>

      {/* Commentaire */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">
          Ce qui a bien marché / déçu
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={analyzing}
          placeholder="Ex : le design était élégant mais Mango a ignoré la contrainte mobile-first que j'avais précisée…"
          rows={4}
          className="w-full resize-none rounded-xl border border-edge bg-bg px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
        />
      </div>

      {/* Bouton analyser */}
      <button
        disabled={!score || analyzing}
        onClick={handleAnalyze}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent disabled:opacity-40 transition-colors"
      >
        <BrainCircuit size={15} />
        {analyzing ? "Analyse en cours…" : alreadyAnalyzed ? "Ré-analyser" : "Analyser"}
      </button>

      {error && (
        <p className="rounded-xl border border-err/30 bg-err/[0.07] px-3 py-2 text-[12px] text-err">
          {error}
        </p>
      )}

      {/* Résultat — axiomes extraits */}
      {result && result.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-faint">
            {result.length} axiome{result.length > 1 ? "s" : ""} ajouté{result.length > 1 ? "s" : ""} à ta mémoire
          </p>
          {result.map((axiom, i) => (
            <div
              key={i}
              className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2.5"
            >
              <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-dim font-mono">
                {axiom}
              </pre>
            </div>
          ))}
        </div>
      )}

      {result && result.length === 0 && (
        <p className="text-center text-[12px] text-faint">
          Aucun axiome extrait — essaie d'ajouter un commentaire plus précis.
        </p>
      )}

      {alreadyAnalyzed && !result && (
        <p className="text-[11px] text-faint text-center">
          Déjà analysé le {new Date(review.analyzedAt).toLocaleDateString("fr-FR")} ·{" "}
          {review.axiomsExtracted?.length ?? 0} axiome{(review.axiomsExtracted?.length ?? 0) > 1 ? "s" : ""} extrait{(review.axiomsExtracted?.length ?? 0) > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
