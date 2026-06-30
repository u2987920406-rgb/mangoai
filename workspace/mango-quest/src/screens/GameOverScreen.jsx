// Mango Quest — defeat screen.
export default function GameOverScreen({ onRetry, onMenu }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/85 px-6 text-center font-mono">
      <h1 className="text-4xl font-extrabold tracking-widest text-red-500">GAME OVER</h1>
      <p className="text-stone-400">Tu es tombé au combat… Le donjon t'attend toujours.</p>
      <div className="flex gap-3">
        <button onClick={onRetry} className="rounded-lg border-2 border-amber-500 bg-amber-600 px-8 py-3 font-bold text-stone-950 transition hover:bg-amber-500">↻ Recommencer</button>
        <button onClick={onMenu} className="rounded-lg border-2 border-stone-600 bg-stone-800 px-8 py-3 font-bold text-stone-200 transition hover:bg-stone-700">Menu</button>
      </div>
    </div>
  );
}
