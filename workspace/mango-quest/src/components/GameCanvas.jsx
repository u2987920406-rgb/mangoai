// Mango Quest — React canvas host. The pure game logic lives in src/game/* and is
// unit-tested; this component only wires it to the DOM (canvas, keyboard, loop) and
// bridges to React combat via an imperative handle (pause / resume / applyOutcome).
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TILE, ZONE, ITEM_INFO } from "../game/constants.js";
import {
  createWorld, ENEMY_SPAWNS, ITEM_PICKUPS,
  getTransition, getTile, unlockDoor,
} from "../game/world.js";
import { createPlayer, createEnemy, createBoss, healEntity } from "../game/entities.js";
import { movePlayer, entitiesOverlap } from "../game/systems/movement.js";
import { updateEnemy } from "../game/systems/ai.js";
import { setupCanvas, drawWorld, drawPickups, drawEntity, drawLighting, drawHud, drawSpellBar, drawQuestTracker, drawShieldRing, drawToast } from "../game/render.js";
import { createLoop } from "../game/loop.js";
import { createSpellState, castSpell, tickSpells, shieldActive, SPELL } from "../game/systems/spells.js";
import { createQuestLog, trackEvent, claimReward } from "../game/systems/quests.js";
import { buildSnapshot, saveGame } from "../game/systems/save.js";
import { awardXp } from "../game/systems/combat.js";

const GameCanvas = forwardRef(function GameCanvas({ onEncounter, initial }, ref) {
  const canvasRef = useRef(null);
  const encounterRef = useRef(onEncounter);
  encounterRef.current = onEncounter;
  // Sauvegarde à charger au montage (null = nouvelle partie). Lue une fois dans l'effet.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  // Live game state, kept in a ref so the imperative handle can read/write it.
  const gameRef = useRef(null);

  // Bridge to React combat: App pauses the world on encounter, then pushes the
  // outcome back here once the turn-based fight resolves.
  useImperativeHandle(ref, () => ({
    pause() { if (gameRef.current) gameRef.current.paused = true; },
    resume() { if (gameRef.current) gameRef.current.paused = false; },
    // outcome: { won, fled, playerAfter, enemyId }
    applyOutcome(outcome) {
      const g = gameRef.current;
      if (!g || !outcome) return;
      // Garde de robustesse (conseil d'experts #44) : le pont React→Canvas valide
      // chaque champ — un playerAfter incomplet/NaN ne corrompt jamais le moteur.
      const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
      const pa = outcome.playerAfter;
      if (pa && typeof pa === "object") {
        const maxHp = Math.max(1, num(pa.maxHp, g.player.maxHp));
        g.player = {
          ...g.player,
          maxHp,
          hp: Math.max(0, Math.min(maxHp, num(pa.hp, g.player.hp))),
          atk: Math.max(0, num(pa.atk, g.player.atk)),
          def: Math.max(0, num(pa.def, g.player.def)),
          xp: Math.max(0, num(pa.xp, g.player.xp)),
          level: Math.max(1, num(pa.level, g.player.level)),
        };
      }
      if (outcome.won && outcome.enemyId != null) {
        const en = g.enemies.find((e) => e.id === outcome.enemyId);
        if (en) en.alive = false;
        if (g.boss && g.boss.id === outcome.enemyId) g.boss.alive = false;
      }
      g.paused = false;
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = setupCanvas(canvas);

    const saved = initialRef.current;
    const world = createWorld();
    let startZone = world.currentZone;
    let player = createPlayer();
    let inventory = { potion: 0, bomb: 0, key: 0 };
    let spells = createSpellState();
    let quests = createQuestLog();
    if (saved) {
      if (saved.zone) { startZone = saved.zone; world.currentZone = startZone; }
      if (saved.player) player = { ...player, ...saved.player };
      if (saved.inventory && saved.inventory.items) inventory = { ...inventory, ...saved.inventory.items };
      if (saved.spells) spells = { ...spells, mana: saved.spells.mana ?? spells.mana, maxMana: saved.spells.maxMana ?? spells.maxMana, cooldowns: { ...spells.cooldowns, ...(saved.spells.cooldowns || {}) } };
      if (saved.quests) quests = saved.quests;
    }
    const g = {
      world,
      zone: startZone,
      player,
      enemies: ENEMY_SPAWNS.filter((s) => s.zone === startZone).map((s) => createEnemy(s.type, s.x, s.y)),
      boss: startZone === ZONE.CAVERN ? createBoss() : null,
      pickups: ITEM_PICKUPS.map((p) => ({ ...p })),
      inventory,
      spells,
      quests,
      toast: null,
      countedDefeats: new Set(),
      engaged: new Set(),
      paused: false,
    };
    gameRef.current = g;
    const input = { up: false, down: false, left: false, right: false };

    const KEYS = {
      up: ["arrowup", "z", "w"], down: ["arrowdown", "s"],
      left: ["arrowleft", "q", "a"], right: ["arrowright", "d"],
    };
    const setKey = (k, val) => {
      for (const dir of Object.keys(KEYS)) if (KEYS[dir].includes(k)) { input[dir] = val; return true; }
      return false;
    };

    const onKeyDown = (e) => {
      if (g.paused) return; // world frozen during combat — let React own the keys
      const k = e.key.toLowerCase();
      if (setKey(k, true)) { e.preventDefault(); return; }
      if (k === " " || k === "e") { handleAction(); e.preventDefault(); }
      if (k === "1") { drinkPotion(); e.preventDefault(); }
      if (k === "2") { castPlayerSpell(SPELL.HEAL); e.preventDefault(); }
      if (k === "3") { castPlayerSpell(SPELL.FIREBALL); e.preventDefault(); }
      if (k === "4") { castPlayerSpell(SPELL.SHIELD); e.preventDefault(); }
      if (k === "o") { saveProgress(); e.preventDefault(); }
    };
    const onKeyUp = (e) => setKey(e.key.toLowerCase(), false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function handleAction() {
      if (g.inventory.key <= 0) return;
      const pc = Math.floor(g.player.x), pr = Math.floor(g.player.y);
      const adj = [[pc + 1, pr], [pc - 1, pr], [pc, pr + 1], [pc, pr - 1]];
      for (const [c, r] of adj) {
        if (getTile(g.world, g.zone, c, r) === TILE.DOOR_LOCKED) { unlockDoor(g.world); break; }
      }
    }

    function drinkPotion() {
      if (g.inventory.potion <= 0 || g.player.hp >= g.player.maxHp) return;
      g.inventory.potion -= 1;
      g.player = healEntity(g.player, ITEM_INFO.potion.heal);
    }

    function setToast(text) { g.toast = { text, ticks: 140 }; }

    // Cible la plus proche dans la zone (≤ 4,5 tuiles) pour la boule de feu.
    function nearestTarget() {
      const cands = [...g.enemies, g.boss].filter((e) => e && e.alive);
      let best = null, bestD = Infinity;
      for (const e of cands) {
        const d = Math.hypot(e.x - g.player.x, e.y - g.player.y);
        if (d < bestD && d <= 4.5) { bestD = d; best = e; }
      }
      return best;
    }

    function castPlayerSpell(spellId) {
      if (g.paused) return; // le combat React possède les touches
      if (spellId === SPELL.FIREBALL) {
        const target = nearestTarget();
        if (!target) { setToast("Aucune cible à portée"); return; }
        const r = castSpell(g.spells, SPELL.FIREBALL, g.player, target);
        g.spells = r.state;
        if (r.ok) {
          const t = [...g.enemies, g.boss].find((e) => e && e.id === target.id);
          if (t) { t.hp = r.target.hp; if (t.hp <= 0) t.alive = false; } // la mort est détectée par trackQuest
        }
        setToast(r.message);
        return;
      }
      const r = castSpell(g.spells, spellId, g.player);
      g.spells = r.state;
      if (r.ok && spellId === SPELL.HEAL) g.player = r.player;
      setToast(r.message);
    }

    // Avance les quêtes sur un événement, réclame et applique les récompenses.
    function trackQuest(evt) {
      const tr = trackEvent(g.quests, evt);
      g.quests = tr.log;
      for (const id of tr.completed) {
        const cr = claimReward(g.quests, id);
        g.quests = cr.log;
        if (cr.ok) {
          g.player = awardXp(g.player, cr.rewardXp).player;
          if (cr.rewardItem) g.inventory[cr.rewardItem] = (g.inventory[cr.rewardItem] || 0) + cr.rewardQty;
          setToast(`Quête terminée ! +${cr.rewardXp} XP`);
        }
      }
    }

    function saveProgress() {
      const snap = buildSnapshot({
        player: g.player,
        inventory: { items: g.inventory },
        spells: g.spells,
        quests: g.quests,
        zone: g.zone,
      });
      setToast(saveGame(snap) ? "Partie sauvegardée ✓" : "Sauvegarde indisponible");
    }

    function update() {
      if (g.paused) return; // frozen while the combat overlay is open
      g.spells = tickSpells(g.spells); // régénère la mana + décrémente cooldowns/bouclier
      if (g.toast) { g.toast.ticks -= 1; if (g.toast.ticks <= 0) g.toast = null; }
      g.player = movePlayer(g.player, g.world, input);
      g.enemies = g.enemies.map((en) => updateEnemy(en, g.player, g.world));
      if (g.boss) g.boss = updateEnemy(g.boss, g.player, g.world);

      const col = Math.floor(g.player.x), row = Math.floor(g.player.y);
      // zone transition
      const tr = getTransition(g.world, g.zone, col, row);
      if (tr) {
        g.zone = tr.toZone;
        g.world.currentZone = g.zone; // keep collision (movement/ai) on the active zone
        g.player = { ...g.player, x: tr.toX + 0.5, y: tr.toY + 0.5 };
        g.enemies = ENEMY_SPAWNS.filter((s) => s.zone === g.zone).map((s) => createEnemy(s.type, s.x, s.y));
        g.boss = g.zone === ZONE.CAVERN ? createBoss() : null;
        g.engaged.clear();
      }
      // item pickup
      const pick = g.pickups.find((p) => p.zone === g.zone && p.x === col && p.y === row);
      if (pick) {
        g.pickups = g.pickups.filter((p) => p !== pick);
        g.inventory[pick.item] = (g.inventory[pick.item] || 0) + 1;
        if (pick.item === "key") { unlockDoor(g.world); trackQuest("key_found"); }
      }
      // quêtes : compte les ennemis fraîchement vaincus (mêlée via applyOutcome OU sort)
      for (const e of [...g.enemies, g.boss]) {
        if (e && !e.alive && !g.countedDefeats.has(e.id)) {
          g.countedDefeats.add(e.id);
          trackQuest(e.kind === "boss" ? "boss_defeated" : "enemy_defeated");
        }
      }
      // encounters -> hand off to React combat (once per entity)
      const trigger = (e) => {
        if (e && e.alive && !g.engaged.has(e.id) && entitiesOverlap(g.player, e)) {
          g.engaged.add(e.id);
          g.paused = true;
          if (encounterRef.current) encounterRef.current({ enemy: { ...e }, player: { ...g.player } });
          return true;
        }
        return false;
      };
      for (const en of g.enemies) if (trigger(en)) return;
      trigger(g.boss);
    }

    function render() {
      drawWorld(ctx, g.world, g.zone);
      drawPickups(ctx, g.pickups, g.zone);
      for (const en of g.enemies) if (en.alive) drawEntity(ctx, en);
      if (g.boss && g.boss.alive) drawEntity(ctx, g.boss);
      drawEntity(ctx, g.player);
      if (shieldActive(g.spells)) drawShieldRing(ctx, g.player);
      drawLighting(ctx, g.player, g.zone);
      drawHud(ctx, g.player, g.inventory, g.world, g.zone);
      drawQuestTracker(ctx, g.quests);
      drawSpellBar(ctx, g.spells);
      drawToast(ctx, g.toast);
    }

    const loop = createLoop({ update, render });
    loop.start();
    return () => { loop.stop(); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas border-2 border-amber-700/40 rounded-lg shadow-2xl" aria-label="Mango Quest game canvas" />;
});

export default GameCanvas;
