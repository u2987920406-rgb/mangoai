// Écran Placement — test initial court : quelques QCM représentatifs (un par
// module) pour amorcer la maîtrise estimée avant de laisser le sélecteur
// (lib/engine.ts:selectNextItem) piloter le parcours. Sans ça, `estimateMastery`
// démarre à 0,5 (neutre) pour tout le monde — le placement compense en partie
// l'heuristique EWMA (limite honnête documentée dans le plan §4.5).
import { useMemo, useState } from "react";
import ItemRenderer from "../components/ItemRenderer";

export default function Placement({ curriculum, items, onComplete }) {
  // Un item représentatif par module (le premier QCM du module, sinon le
  // premier item quel que soit son type).
  const sample = useMemo(() => {
    return curriculum.modules
      .map((m) => {
        const inModule = items.filter((it) => it.moduleId === m.id);
        return inModule.find((it) => it.type === "qcm") ?? inModule[0];
      })
      .filter(Boolean);
  }, [curriculum, items]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);

  if (sample.length === 0) {
    // Rien à évaluer (banque vide) : on saute directement le placement.
    onComplete([]);
    return null;
  }

  const current = sample[index];

  function handleAnswer(correct) {
    const next = [...answers, { item: current, correct }];
    setAnswers(next);
    setTimeout(() => {
      if (index + 1 < sample.length) {
        setIndex(index + 1);
      } else {
        onComplete(next);
      }
    }, 700);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm uppercase tracking-wide text-amber-600">Placement — {index + 1}/{sample.length}</p>
        <h1 className="text-2xl font-bold">Où en es-tu sur « {curriculum.sujet} » ?</h1>
        <p className="text-sm text-slate-500">
          Quelques questions pour calibrer ton point de départ — rien n'est éliminatoire.
        </p>
      </header>
      <ItemRenderer item={current} onAnswer={handleAnswer} now={new Date()} />
    </div>
  );
}
