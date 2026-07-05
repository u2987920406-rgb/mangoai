// Écran Leçon — le contenu, PAS un exercice. Décision D5 : sources visibles
// (portées par ItemRenderer/LeconRenderer). Règle anti-dérive-quiz (§4.9 du
// plan) : la leçon est le produit, l'exercice n'est que la preuve — on ne
// score pas une leçon comme un exercice, on la marque juste "vue".
import ItemRenderer from "../components/ItemRenderer";

export default function Lecon({ item, onDone }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <p className="text-sm uppercase tracking-wide text-amber-600">Leçon</p>
      <ItemRenderer item={item} onAnswer={() => onDone()} now={new Date()} />
    </div>
  );
}
