// Écran Carte de parcours — vue du curriculum + progression par module
// (maîtrise moyenne des compétences du module, verrouillage par prérequis).
export default function CarteParcours({ curriculum, learner, dueCount, onOpenModule, onOpenRevision, onStartPlacement }) {
  function masteryOfModule(mod) {
    const values = mod.skillIds.map((s) => learner.mastery[s] ?? 0);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function isUnlocked(mod) {
    return mod.prerequis.every((p) => learner.modulesValides.includes(p));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-amber-600">Parcours</p>
          <h1 className="text-2xl font-bold">{curriculum.sujet}</h1>
        </div>
        <div className="flex items-center gap-3">
          {onStartPlacement && (
            <button
              onClick={onStartPlacement}
              className="text-sm font-medium text-slate-500 underline decoration-dotted hover:text-slate-700"
            >
              Passer un test de niveau (optionnel)
            </button>
          )}
          {dueCount > 0 && (
            <button
              onClick={onOpenRevision}
              className="rounded-xl bg-amber-500 px-4 py-2 font-medium text-white shadow-sm"
            >
              Réviser ({dueCount})
            </button>
          )}
        </div>
      </header>

      <ol className="flex flex-col gap-3">
        {curriculum.modules.map((mod, i) => {
          const unlocked = isUnlocked(mod);
          const mastery = masteryOfModule(mod);
          const done = learner.modulesValides.includes(mod.id);
          return (
            <li key={mod.id}>
              <button
                disabled={!unlocked}
                onClick={() => onOpenModule(mod.id)}
                className={
                  "flex w-full items-center justify-between rounded-2xl border p-4 text-left transition " +
                  (unlocked
                    ? "border-slate-200 bg-white hover:border-amber-400"
                    : "border-slate-100 bg-slate-50 opacity-50")
                }
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{mod.titre}</p>
                    <p className="text-xs text-slate-500">
                      {done ? "Validé" : unlocked ? "Disponible" : "Verrouillé (prérequis manquant)"}
                    </p>
                  </div>
                </div>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${Math.round(mastery * 100)}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
