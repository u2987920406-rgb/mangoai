// Écran Exercice — joue UN item (qcm/flashcard/texte-à-trous/appariement) via
// ItemRenderer, puis remonte le verdict (correct/incorrect) à l'appelant qui
// met à jour la maîtrise (estimateMastery), la difficulté (adjustDifficulty)
// et l'état FSRS (lib/spaced.ts) — cette page ne connaît AUCUNE de ces règles,
// elle se contente d'afficher et de relayer (séparation stricte UI/moteur).
import ItemRenderer from "../components/ItemRenderer";

export default function Exercice({ item, progress, onAnswered }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-wide text-amber-600">Exercice</p>
        {progress && <p className="text-xs text-slate-400">{progress}</p>}
      </header>
      <ItemRenderer item={item} onAnswer={onAnswered} now={new Date()} />
    </div>
  );
}
