// Mango Quest — title / menu screen.
import { hasSave } from "../game/systems/save.js";

export default function MenuScreen({ onStart, onContinue }) {
  const saved = hasSave();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-stone-950 px-6 text-center font-mono">
      <div>
        <h1 className="text-5xl font-extrabold tracking-widest text-amber-400 drop-shadow-[0_2px_0_rgba(0,0,0,0.6)]">
          ⚔ MANGO QUEST
        </h1>
        <p className="mt-3 text-stone-400">Un mini-RPG rétro top-down</p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onStart}
          className="rounded-lg border-2 border-amber-500 bg-amber-600 px-10 py-3 text-lg font-bold text-stone-950 shadow-lg transition hover:bg-amber-500"
        >
          ▶ Nouvelle partie
        </button>
        {saved && (
          <button
            onClick={onContinue}
            className="rounded-lg border-2 border-amber-500/60 bg-stone-800 px-10 py-2.5 text-base font-bold text-amber-300 shadow transition hover:bg-stone-700"
          >
            ⮌ Continuer
          </button>
        )}
      </div>

      <div className="max-w-md text-sm text-stone-500 leading-relaxed">
        <p><span className="text-stone-300">ZQSD / Flèches</span> — se déplacer · <span className="text-stone-300">Espace</span> — agir</p>
        <p><span className="text-stone-300">1</span> potion · <span className="text-emerald-300">2</span> soin · <span className="text-orange-300">3</span> boule de feu · <span className="text-sky-300">4</span> bouclier · <span className="text-stone-300">O</span> sauvegarder</p>
        <p className="mt-2">Accomplis les <span className="text-amber-300">quêtes</span>, trouve la <span className="text-amber-300">clé</span>, descends dans la caverne et terrasse le <span className="text-red-400">Golem des Profondeurs</span>.</p>
      </div>
    </div>
  );
}
