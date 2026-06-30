// Mango Quest — turn-based combat system (pure, deterministic with injected RNG).
// Actions: attack, dodge, flee. Damage is deterministic via a seeded RNG.

// Seeded PRNG (mulberry32) — deterministic, injectable for tests.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Calculate attack damage: atk - def, with a small deterministic variance from rng.
// damage = max(1, atk - def + variance) where variance in [-1, +1] from rng.
export function calcDamage(attackerAtk, defenderDef, rng) {
  const variance = Math.floor(rng() * 3) - 1; // -1, 0, or +1
  return Math.max(1, attackerAtk - defenderDef + variance);
}

// Dodge: chance to fully avoid damage. Deterministic via rng.
// Base dodge chance 35%, boosted if player chose dodge this turn (50%).
export function tryDodge(rng, chance = 0.5) {
  return rng() < chance;
}

// Flee: chance to escape combat. Deterministic via rng.
export function tryFlee(rng, chance = 0.6) {
  return rng() < chance;
}

// Apply combat result to an entity (returns new entity with reduced hp)
export function applyCombatDamage(entity, dmg) {
  return { ...entity, hp: Math.max(0, entity.hp - dmg) };
}

// --- Turn resolution ---
// A combat state: { player, enemy, turn, log, rng, state }
// state: "ongoing" | "player_won" | "player_lost" | "fled"

// Player attacks enemy. Returns new combat state.
export function playerAttack(state) {
  const rng = state.rng;
  const dmg = calcDamage(state.player.atk, state.enemy.def, rng);
  const enemy = applyCombatDamage(state.enemy, dmg);
  const log = [...state.log, `Tu attaques pour ${dmg} dégâts.`];

  if (enemy.hp <= 0) {
    return { ...state, enemy, log, state: "player_won" };
  }

  // Enemy counter-attacks
  const eDmg = calcDamage(state.enemy.atk, state.player.def, rng);
  const player = applyCombatDamage(state.player, eDmg);
  const log2 = [...log, `${state.enemy.name || "Ennemi"} riposte pour ${eDmg} dégâts.`];

  if (player.hp <= 0) {
    return { ...state, player, enemy, log: log2, state: "player_lost" };
  }
  return { ...state, player, enemy, log: log2, turn: state.turn + 1 };
}

// Player dodges: high chance to avoid enemy attack, but no damage dealt.
export function playerDodge(state) {
  const rng = state.rng;
  const dodged = tryDodge(rng, 0.5);
  let log, player;
  if (dodged) {
    log = [...state.log, "Esquive réussie ! Aucun dégât."];
    player = state.player;
  } else {
    const eDmg = calcDamage(state.enemy.atk, state.player.def, rng);
    player = applyCombatDamage(state.player, eDmg);
    log = [...state.log, `Esquive ratée ! Tu subis ${eDmg} dégâts.`];
    if (player.hp <= 0) {
      return { ...state, player, log, state: "player_lost" };
    }
  }
  return { ...state, player, log, turn: state.turn + 1 };
}

// Player flees: chance to escape.
export function playerFlee(state) {
  const rng = state.rng;
  const fled = tryFlee(rng, 0.6);
  if (fled) {
    return { ...state, log: [...state.log, "Tu prends la fuite !"], state: "fled" };
  }
  // Failed flee: enemy gets a free hit
  const eDmg = calcDamage(state.enemy.atk, state.player.def, rng);
  const player = applyCombatDamage(state.player, eDmg);
  const log = [...state.log, `Fuite ratée ! Tu subis ${eDmg} dégâts.`];
  if (player.hp <= 0) {
    return { ...state, player, log, state: "player_lost" };
  }
  return { ...state, player, log, turn: state.turn + 1 };
}

// Award XP to player after victory. Handles level-up.
export function awardXp(player, xpGained) {
  let { xp, level, maxHp, atk, def } = player;
  xp += xpGained;
  let leveledUp = false;
  const levelsGained = [];
  // Check level up (loop in case of big XP gain)
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    leveledUp = true;
    levelsGained.push(level);
    maxHp += 6;
    atk += 2;
    def += 1;
  }
  const newPlayer = { ...player, xp, level, maxHp, atk, def, hp: leveledUp ? maxHp : player.hp };
  return { player: newPlayer, leveledUp, levelsGained };
}

// XP threshold for next level (imported from constants)
import { xpToNextLevel as xpToNext } from "../constants.js";

// Create initial combat state
export function createCombatState(player, enemy, seed = 42) {
  return {
    player: { ...player },
    enemy: { ...enemy, name: enemy.name || (enemy.type === "chase" ? "Chasseur" : "Patrouilleur") },
    turn: 1,
    log: [`Un ${enemy.name || "ennemi"} apparaît !`],
    rng: makeRng(seed),
    state: "ongoing",
  };
}