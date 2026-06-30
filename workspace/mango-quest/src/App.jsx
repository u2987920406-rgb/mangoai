// Mango Quest — top-level screen orchestration.
// menu → playing → (combat overlay ↔ playing) → game-over / victory.
import { useRef, useState } from "react";
import GameCanvas from "./components/GameCanvas.jsx";
import MenuScreen from "./screens/MenuScreen.jsx";
import { loadGame } from "./game/systems/save.js";
import CombatScreen from "./screens/CombatScreen.jsx";
import GameOverScreen from "./screens/GameOverScreen.jsx";
import VictoryScreen from "./screens/VictoryScreen.jsx";

export default function App() {
  const [screen, setScreen] = useState("menu"); // menu | playing | gameover | victory
  const [combat, setCombat] = useState(null);     // { player, enemy, isBoss, seed }
  const [runId, setRunId] = useState(0);           // bump to remount a fresh game
  const [finalPlayer, setFinalPlayer] = useState(null);
  const [initial, setInitial] = useState(null);    // sauvegarde chargée (null = nouvelle partie)
  const gameRef = useRef(null);

  function startGame() {
    setCombat(null);
    setFinalPlayer(null);
    setInitial(null);
    setRunId((n) => n + 1);
    setScreen("playing");
  }

  function continueGame() {
    const snap = loadGame();
    setCombat(null);
    setFinalPlayer(null);
    setInitial(snap);
    setRunId((n) => n + 1);
    setScreen("playing");
  }

  // The canvas froze the world and handed us snapshots — open the combat overlay.
  function handleEncounter({ enemy, player }) {
    setCombat({ player, enemy, isBoss: enemy.kind === "boss", seed: Math.floor(Math.random() * 1e9) });
  }

  // The fight resolved — push the result back into the live game, then route.
  function handleResolve(res) {
    setCombat(null);
    if (res.outcome === "player_lost") {
      setFinalPlayer(res.playerAfter);
      setScreen("gameover");
      return;
    }
    gameRef.current?.applyOutcome({
      won: res.outcome === "player_won",
      fled: res.outcome === "fled",
      playerAfter: res.playerAfter,
      enemyId: res.enemyId,
    });
    if (res.outcome === "player_won" && res.isBoss) {
      setFinalPlayer(res.playerAfter);
      setScreen("victory");
    }
    // win / flee on a normal enemy: applyOutcome already un-paused the world.
  }

  if (screen === "menu") return <MenuScreen onStart={startGame} onContinue={continueGame} />;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-950 py-6">
      <h1 className="font-mono text-xl font-bold tracking-widest text-amber-400">⚔ Mango Quest</h1>

      <GameCanvas key={runId} ref={gameRef} onEncounter={handleEncounter} initial={initial} />

      <p className="font-mono text-xs text-stone-500">
        ZQSD : bouger · Espace : agir · 1 : potion · 2 soin · 3 feu · 4 bouclier · O : sauvegarder
      </p>

      {combat && (
        <CombatScreen
          player={combat.player}
          enemy={combat.enemy}
          isBoss={combat.isBoss}
          seed={combat.seed}
          onResolve={handleResolve}
        />
      )}

      {screen === "gameover" && (
        <GameOverScreen onRetry={startGame} onMenu={() => setScreen("menu")} />
      )}

      {screen === "victory" && (
        <VictoryScreen player={finalPlayer} onReplay={startGame} onMenu={() => setScreen("menu")} />
      )}
    </main>
  );
}
