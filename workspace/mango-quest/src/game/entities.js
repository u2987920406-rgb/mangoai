// Mango Quest — entity factories (pure). Player, enemies (patrol/chase), boss.
import { PLAYER_BASE, ENEMY_STATS, BOSS_STATS, DIR } from "./constants.js";
import { PLAYER_START, BOSS_SPAWN } from "./world.js";

// Per-tick speeds in TILE units (the loop runs at ~60 ticks/s). Tuned so the
// player feels brisk and enemies are a touch slower — the proven runtime values.
const SPEED = { player: 0.06, chase: 0.045, patrol: 0.035, boss: 0.03 };

let _id = 0;
function nextId() { return ++_id; }
// Test seam: reset the id counter so factory tests are deterministic.
export function resetIds() { _id = 0; }

export function createPlayer() {
  const s = PLAYER_BASE;
  return {
    id: nextId(),
    kind: "player",
    x: PLAYER_START.x + 0.5,
    y: PLAYER_START.y + 0.5,
    dir: DIR.DOWN,
    hp: s.hp,
    maxHp: s.maxHp,
    atk: s.atk,
    def: s.def,
    level: s.level,
    xp: s.xp,
    xpToNext: s.xpToNext,
    speed: SPEED.player,
    moving: false,
    invuln: 0, // ticks of invulnerability after hit
  };
}

// Enemy types: "patrol" (deterministic back-and-forth) or "chase" (approach player)
export function createEnemy(type, x, y) {
  const isChase = type === "chase";
  const s = isChase ? ENEMY_STATS.chase : ENEMY_STATS.patrol;
  return {
    id: nextId(),
    kind: "enemy",
    type, // "patrol" | "chase"
    x: x + 0.5,
    y: y + 0.5,
    dir: DIR.LEFT,
    hp: s.hp,
    maxHp: s.maxHp,
    atk: s.atk,
    def: s.def,
    xpReward: s.xp,
    speed: isChase ? SPEED.chase : SPEED.patrol,
    // patrol state
    patrolAxis: "x", // move along x or y
    patrolDir: 1, // 1 or -1
    patrolMin: x,
    patrolMax: x + 4,
    alive: true,
    defeated: false,
  };
}

export function createBoss() {
  const s = BOSS_STATS;
  return {
    id: nextId(),
    kind: "boss",
    type: "chase", // a boss hunts the player
    x: BOSS_SPAWN.x + 0.5,
    y: BOSS_SPAWN.y + 0.5,
    dir: DIR.DOWN,
    hp: s.hp,
    maxHp: s.maxHp,
    atk: s.atk,
    def: s.def,
    xpReward: s.xp,
    speed: SPEED.boss,
    alive: true,
    defeated: false,
    name: "Golem des Profondeurs",
  };
}

// Apply damage to an entity (returns new hp, clamped). Pure.
export function applyDamage(entity, dmg) {
  const hp = Math.max(0, entity.hp - dmg);
  return { ...entity, hp };
}

// Check if entity is dead
export function isDead(entity) {
  return entity.hp <= 0;
}

// Reset an entity's HP to max (e.g. after heal)
export function healEntity(entity, amount) {
  const hp = Math.min(entity.maxHp, entity.hp + amount);
  return { ...entity, hp };
}