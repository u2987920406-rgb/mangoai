// Écran Révision — la file FSRS du jour (items échus, lib/spaced.ts:dueItemIds).
// Rejoue les items en retard ; chaque réponse repasse par reviewItem (FSRS ou
// repli Leitner) pour recalculer la prochaine échéance.
import ItemRenderer from "../components/ItemRenderer";

export default function Revision({ queue, index, onAnswered }) {
  if (queue.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 p-16 text-center text-slate-500">
        <p className="text-lg font-semibold text-slate-700">Rien à réviser pour l'instant.</p>
        <p>Reviens plus tard — les cartes réapparaîtront à leur échéance.</p>
      </div>
    );
  }
  const item = queue[index];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-wide text-amber-600">Révision</p>
        <p className="text-xs text-slate-400">{index + 1}/{queue.length}</p>
      </header>
      <ItemRenderer item={item} onAnswer={onAnswered} now={new Date()} />
    </div>
  );
}
