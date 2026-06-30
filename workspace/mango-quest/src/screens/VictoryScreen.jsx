// Mango Quest — victory screen (boss defeated).
export default function VictoryScreen({ player, onReplay, onMenu }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-amber-950/90 to-black/90 px-6 text-center font-mono">
      <h1 className="text-4xl font-extrabold tracking-widest text-amber-300 drop-shadow">🏆 VICTOIRE 🏆</h1>
      <p className="text-stone-300">Le Golem des Profondeurs est vaincu. La prairie est sauvée !</p>
      {player && (
        <p className="text-sm text-stone-400">
          Niveau atteint : <span className="text-amber-300">{player.level}</span> · PV max : <span className="text-amber-300">{player.maxHp}</span>
        </p>
      )}
      <div className="flex gap-3">
        <button onClick={onReplay} className="rounded-lg border-2 border-amber-500 bg-amber-600 px-8 py-3 font-bold text-stone-950 transition hover:bg-amber-500">↻ Rejouer</button>
        <button onClick={onMenu} className="rounded-lg border-2 border-stone-600 bg-stone-800 px-8 py-3 font-bold text-stone-200 transition hover:bg-stone-700">Menu</button>
      </div>
    </div>
  );
}
