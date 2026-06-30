// Mango Quest — constants

export const TILE_SIZE = 32; // px per tile (render scale applied separately)
export const MAP_COLS = 16;
export const MAP_ROWS = 12;

// Tile types
export const TILE = {
  GRASS: 0,
  TREE: 1,
  PATH: 2,
  WALL: 3,
  ROCK: 4,
  FLOOR: 5,
  DOOR_LOCKED: 6,
  DOOR_OPEN: 7,
  WATER: 8,
  SAND: 9,
};

// Solid tiles block movement
export const SOLID_TILES = new Set([
  TILE.TREE,
  TILE.WALL,
  TILE.ROCK,
  TILE.WATER,
  TILE.DOOR_LOCKED,
]);

// Zones
export const ZONE = {
  PRAIRIE: "prairie",
  CAVERN: "cavern",
};

// Player base stats
export const PLAYER_BASE = {
  maxHp: 30,
  hp: 30,
  atk: 6,
  def: 2,
  level: 1,
  xp: 0,
  xpToNext: 10,
  speed: 2, // px per tick
};

// XP required to reach the next level (from `level`). Smooth geometric curve.
// Level 1 -> 10, 2 -> 15, 3 -> 23, 4 -> 34… keeps early levels brisk.
export function xpToNextLevel(level) {
  return Math.round(10 * Math.pow(1.5, Math.max(1, level) - 1));
}

// Enemy archetypes
export const ENEMY_TYPES = {
  PATROL: "patrol",
  CHASE: "chase",
};

export const ENEMY_STATS = {
  patrol: { maxHp: 14, hp: 14, atk: 3, def: 1, xp: 6, speed: 1 },
  chase: { maxHp: 18, hp: 18, atk: 4, def: 1, xp: 9, speed: 1 },
};

export const BOSS_STATS = {
  maxHp: 60,
  hp: 60,
  atk: 8,
  def: 3,
  xp: 40,
  speed: 0,
};

// Inventory item types
export const ITEM = {
  POTION: "potion",
  BOMB: "bomb",
  KEY: "key",
};

export const ITEM_INFO = {
  potion: { name: "Potion de soin", heal: 15, maxStack: 99 },
  bomb: { name: "Bombe", damage: 20, maxStack: 99 },
  key: { name: "Clé", maxStack: 1 },
};

// Combat
export const COMBAT = {
  BASE_HIT_CHANCE: 0.9,
  DODGE_CHANCE: 0.45,
  FLEE_CHANCE: 0.6,
  CRIT_MULT: 1.5,
};

// Directions
export const DIR = {
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
};

export const DIR_VEC = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// Colors — warm retro 16-bit palette
export const COLORS = {
  // terrain
  grass: "#5a8a3a",
  grassDark: "#3e6b28",
  path: "#c2a060",
  pathDark: "#9a7a40",
  tree: "#2a5a1a",
  treeDark: "#1a3a10",
  trunk: "#6b4a2a",
  // cavern
  floor: "#5a4a3a",
  floorDark: "#3e3028",
  rock: "#7a6a5a",
  rockDark: "#4a3e34",
  wall: "#2a2420",
  // water
  water: "#3a6a9a",
  waterDark: "#2a4a7a",
  // doors
  doorLocked: "#8a6a2a",
  doorOpen: "#caa050",
  sand: "#d4b878",
  // entities
  player: "#e8d048",
  playerDark: "#a88820",
  playerSkin: "#f0c8a0",
  enemyPatrol: "#c84a4a",
  enemyPatrolDark: "#8a2a2a",
  enemyChase: "#9a4ac8",
  enemyChaseDark: "#5a2a8a",
  boss: "#c8302a",
  bossDark: "#7a1010",
  // HUD
  hudBg: "#1a1410",
  hudText: "#f0e8d0",
  hpFill: "#e84030",
  hpBack: "#3a1818",
  xpFill: "#40b0e8",
  xpBack: "#1a2a3a",
  white: "#ffffff",
  black: "#000000",
};

// Fixed timestep
export const TICK_MS = 1000 / 60;