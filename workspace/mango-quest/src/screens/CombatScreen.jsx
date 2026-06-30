// Mango Quest — combat tour par tour avec « juice » : dégâts flottants, secousse
// d'impact, flash de dégâts, bannière de montée de niveau. UI pure au-dessus du
// système de combat (src/game/systems/combat.js) ; le monde est gelé derrière.
import { useMemo, useRef, useState } from "react";
import {
  createCombatState, playerAttack, playerDodge, playerFlee, awardXp,
} from "../game/systems/combat.js";

const JUICE_CSS = `
@keyframes mq-shake { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-6px,2px)} 40%{transform:translate(5px,-2px)} 60%{transform:translate(-4px,1px)} 80%{transform:translate(3px,-1px)} }
@keyframes mq-float { 0%{opacity:0;transform:translate(-50%,4px) scale(.8)} 15%{opacity:1;transform:translate(-50%,-6px) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-46px) scale(1)} }
@keyframes mq-flash { 0%{opacity:.55} 100%{opacity:0} }
@keyframes mq-pop { 0%{opacity:0;transform:scale(.6)} 40%{opacity:1;transform:scale(1.15)} 100%{opacity:1;transform:scale(1)} }
.mq-shake{animation:mq-shake .32s ease}
.mq-float{position:absolute;left:50%;top:-2px;font-weight:800;font-size:1.5rem;pointer-events:none;text-shadow:0 2px 3px rgba(0,0,0,.7);animation:mq-float .9s ease-out forwards}
.mq-flash{position:absolute;inset:0;background:#ff2d2d;pointer-events:none;animation:mq-flash .4s ease-out forwards;border-radius:.75rem}
.mq-pop{animation:mq-pop .5s cubic-bezier(.2,1.4,.4,1) both}
`;

function Bar({ label, hp, maxHp, color }) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
  const low = pct <= 25;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-mono mb-1 text-stone-200">
        <span>{label}</span>
        <span className={low ? "text-red-400" : ""}>{Math.max(0, hp)} / {maxHp}</span>
      </div>
      <div className="h-3 w-full rounded bg-stone-900/80 border border-stone-700 overflow-hidden">
        <div className="h-full transition-all duration-300 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function CombatScreen({ player, enemy, isBoss, seed, onResolve }) {
  const [state, setState] = useState(() => createCombatState(player, enemy, seed));
  const [floats, setFloats] = useState([]);      // { id, side, text, color }
  const [shake, setShake] = useState(null);      // "enemy" | "player" | null
  const [flash, setFlash] = useState(false);     // overlay rouge quand le joueur encaisse
  const [banner, setBanner] = useState(null);    // bannière (level up / fuite)
  const fid = useRef(0);
  const over = state.state !== "ongoing";

  const log = useMemo(() => state.log.slice(-5).reverse(), [state.log]);
  const enemyName = state.enemy.name || (isBoss ? "Boss" : "Ennemi");

  function spawnFloat(side, text, color) {
    const id = ++fid.current;
    setFloats((f) => [...f, { id, side, text, color }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
  }

  function act(fn) {
    if (over) return;
    const next = fn(state);

    // Juice : dégâts flottants + secousse + flash, dérivés des deltas de PV.
    const eDmg = state.enemy.hp - next.enemy.hp;
    const pDmg = state.player.hp - next.player.hp;
    if (eDmg > 0) { spawnFloat("enemy", `-${eDmg}`, "#ffe066"); setShake("enemy"); }
    if (pDmg > 0) { spawnFloat("player", `-${pDmg}`, "#ff6b6b"); setShake("player"); setFlash(true); setTimeout(() => setFlash(false), 400); }
    if (fn === playerDodge && pDmg === 0) spawnFloat("player", "Esquive !", "#5ad1ff");
    setTimeout(() => setShake(null), 320);

    setState(next);
    if (next.state === "ongoing") return;

    if (next.state === "player_won") {
      const xp = enemy.xpReward ?? 5;
      const { player: playerAfter, leveledUp } = awardXp(next.player, xp);
      if (leveledUp) setBanner(`⭐ Niveau ${playerAfter.level} ! +${xp} XP`);
      setTimeout(() => onResolve({ outcome: "player_won", playerAfter, enemyId: enemy.id, isBoss }), leveledUp ? 950 : 520);
    } else if (next.state === "player_lost") {
      setTimeout(() => onResolve({ outcome: "player_lost", playerAfter: next.player, enemyId: enemy.id, isBoss }), 520);
    } else if (next.state === "fled") {
      setBanner("💨 Fuite !");
      setTimeout(() => onResolve({ outcome: "fled", playerAfter: next.player, enemyId: enemy.id, isBoss }), 600);
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <style>{JUICE_CSS}</style>
      <div className={`mq-pop w-[min(92vw,460px)] rounded-xl border-2 ${isBoss ? "border-red-600/80" : "border-amber-700/70"} bg-stone-900/95 p-5 shadow-2xl font-mono`}>
        <h2 className={`text-center text-lg font-bold mb-4 ${isBoss ? "text-red-400" : "text-amber-300"}`}>
          {isBoss ? "⚔ COMBAT DE BOSS ⚔" : "⚔ Combat"} — {enemyName}
        </h2>

        <div className="space-y-3 mb-4">
          <div className={`relative ${shake === "enemy" ? "mq-shake" : ""}`}>
            <Bar label={enemyName} hp={state.enemy.hp} maxHp={state.enemy.maxHp} color="#c8302a" />
            {floats.filter((f) => f.side === "enemy").map((f) => (
              <span key={f.id} className="mq-float" style={{ color: f.color }}>{f.text}</span>
            ))}
          </div>
          <div className={`relative ${shake === "player" ? "mq-shake" : ""}`}>
            <Bar label="Toi" hp={state.player.hp} maxHp={state.player.maxHp} color="#40b0e8" />
            {floats.filter((f) => f.side === "player").map((f) => (
              <span key={f.id} className="mq-float" style={{ color: f.color }}>{f.text}</span>
            ))}
            {flash && <div className="mq-flash" />}
          </div>
        </div>

        <div className="h-24 overflow-hidden rounded bg-black/40 border border-stone-700 p-2 mb-4 text-xs leading-relaxed">
          {log.map((line, i) => (
            <p key={i} className={i === 0 ? "text-stone-100" : "text-stone-400"}>{line}</p>
          ))}
        </div>

        {banner ? (
          <p className="mq-pop text-center text-amber-300 font-bold py-2">{banner}</p>
        ) : over ? (
          <p className="text-center text-amber-300 text-sm animate-pulse">Résolution…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => act(playerAttack)} className="rounded bg-red-700 hover:bg-red-600 active:scale-95 px-3 py-2 text-sm font-bold text-white transition">Attaquer</button>
            <button onClick={() => act(playerDodge)} className="rounded bg-sky-700 hover:bg-sky-600 active:scale-95 px-3 py-2 text-sm font-bold text-white transition">Esquiver</button>
            <button onClick={() => act(playerFlee)} className="rounded bg-stone-700 hover:bg-stone-600 active:scale-95 px-3 py-2 text-sm font-bold text-white transition">Fuir</button>
          </div>
        )}
      </div>
    </div>
  );
}
