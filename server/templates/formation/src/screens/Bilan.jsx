// Écran Bilan — résumé de session : score, compétences faibles diagnostiquées
// (diagnoseWeaknesses, réutilisé tel quel par le futur Tuteur É5).
export default function Bilan({ sessionAnswers, weaknesses, onRetour }) {
  const total = sessionAnswers.length;
  const correct = sessionAnswers.filter((a) => a.correct).length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8 text-center">
      <p className="text-sm uppercase tracking-wide text-amber-600">Bilan de session</p>
      <p className="text-5xl font-bold">{pct}%</p>
      <p className="text-slate-500">{correct} / {total} réponses correctes</p>

      {weaknesses.length > 0 && (
        <div className="rounded-2xl bg-rose-50 p-4 text-left text-sm text-rose-800">
          <p className="mb-2 font-semibold">Compétences à retravailler</p>
          <ul className="list-inside list-disc">
            {weaknesses.map((w) => (
              <li key={w.skillId}>
                {w.skillId} — maîtrise {Math.round(w.mastery * 100)}% sur {w.attempts} tentatives
                {w.recentConsecutiveErrors >= 2 ? ` (${w.recentConsecutiveErrors} erreurs récentes d'affilée)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={onRetour} className="self-center rounded-xl bg-amber-500 px-6 py-3 font-medium text-white">
        Retour au parcours
      </button>
    </div>
  );
}
