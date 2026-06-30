// Mango Quest — world: tiled map, 2 zones, collision, spawn points

import { TILE, ZONE, MAP_COLS, MAP_ROWS, SOLID_TILES } from "./constants.js";

// Zone 1 — Prairie (overworld)
// 16 cols x 12 rows
const PRAIRIE_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,8,8,0,0,1],
  [1,0,0,0,0,1,0,0,0,0,0,8,8,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

// Zone 2 — Cavern (dungeon)
const CAVERN_MAP = [
  [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,4,4,5,5,5,5,5,5,4,4,5,5,3],
  [3,5,5,4,4,5,5,5,5,5,5,4,4,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,5,5,5,5,5,5,5,5,5,5,5,5,5,5,3],
  [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
];

// Build the world: a map of zones. Each zone has its own tile grid.
// The passage between zones is at the bottom-center of prairie -> top-center of cavern.
// We use a DOOR_LOCKED tile that becomes DOOR_OPEN when the player has a key.

function buildZone(name, grid) {
  return {
    name,
    cols: MAP_COLS,
    rows: MAP_ROWS,
    tiles: grid.map((row) => row.slice()),
  };
}

export function createWorld() {
  const prairie = buildZone(ZONE.PRAIRIE, PRAIRIE_MAP);
  const cavern = buildZone(ZONE.CAVERN, CAVERN_MAP);

  // Place a locked door at the bottom-center of prairie (row 11 is wall border, row 10 is walkable)
  // The passage: prairie bottom-center -> cavern top-center
  // We carve a path tile at the border and place a locked door just above it
  prairie.tiles[11][7] = TILE.PATH; // opening in the bottom wall
  prairie.tiles[11][8] = TILE.PATH;
  prairie.tiles[10][7] = TILE.DOOR_LOCKED; // locked door blocking the passage
  prairie.tiles[10][8] = TILE.DOOR_LOCKED;

  // Cavern top-center entrance
  cavern.tiles[0][7] = TILE.PATH;
  cavern.tiles[0][8] = TILE.PATH;

  return {
    zones: {
      [ZONE.PRAIRIE]: prairie,
      [ZONE.CAVERN]: cavern,
    },
    currentZone: ZONE.PRAIRIE,
    // Transition points: when player steps on these tiles, switch zone
    transitions: [
      {
        zone: ZONE.PRAIRIE,
        x: 7, y: 11,
        toZone: ZONE.CAVERN,
        toX: 7, toY: 1,
      },
      {
        zone: ZONE.PRAIRIE,
        x: 8, y: 11,
        toZone: ZONE.CAVERN,
        toX: 8, toY: 1,
      },
      {
        zone: ZONE.CAVERN,
        x: 7, y: 0,
        toZone: ZONE.PRAIRIE,
        toX: 7, toY: 10,
      },
      {
        zone: ZONE.CAVERN,
        x: 8, y: 0,
        toZone: ZONE.PRAIRIE,
        toX: 8, toY: 10,
      },
    ],
  };
}

// Player start position (tile coords) in prairie
export const PLAYER_START = { zone: ZONE.PRAIRIE, x: 2, y: 2 };

// Enemy spawn positions (tile coords)
export const ENEMY_SPAWNS = [
  { zone: ZONE.PRAIRIE, x: 10, y: 3, type: "patrol" },
  { zone: ZONE.PRAIRIE, x: 12, y: 8, type: "chase" },
];

// Boss spawn in cavern
export const BOSS_SPAWN = { zone: ZONE.CAVERN, x: 8, y: 6 };

// Item pickups (tile coords)
export const ITEM_PICKUPS = [
  { zone: ZONE.PRAIRIE, x: 5, y: 5, item: "potion" },
  { zone: ZONE.PRAIRIE, x: 13, y: 2, item: "potion" },
  { zone: ZONE.PRAIRIE, x: 3, y: 9, item: "key" },
  { zone: ZONE.CAVERN, x: 3, y: 3, item: "bomb" },
  { zone: ZONE.CAVERN, x: 12, y: 9, item: "potion" },
];

// Check if a tile type is solid (blocks movement)
export function isSolidTile(tileType) {
  return SOLID_TILES.has(tileType);
}

// Check if a pixel position is solid in the given zone
// x, y are in pixel coordinates
export function isSolid(world, zoneName, px, py, tileSize) {
  const zone = world.zones[zoneName];
  if (!zone) return true;
  const col = Math.floor(px / tileSize);
  const row = Math.floor(py / tileSize);
  if (col < 0 || col >= zone.cols || row < 0 || row >= zone.rows) return true;
  return isSolidTile(zone.tiles[row][col]);
}

// Check if a tile coordinate is solid
export function isSolidTileAt(world, zoneName, col, row) {
  const zone = world.zones[zoneName];
  if (!zone) return true;
  if (col < 0 || col >= zone.cols || row < 0 || row >= zone.rows) return true;
  return isSolidTile(zone.tiles[row][col]);
}

// Collision in TILE units for the CURRENT zone (world.currentZone). x, y are the
// entity centre in tile coordinates; r is its half-extent. Samples the 4 corners
// + centre so an entity can't clip a solid tile. Used by movement/ai systems.
export function collidesAt(world, x, y, r = 0.35) {
  const zoneName = world.currentZone;
  const pts = [
    [x, y],
    [x - r, y - r], [x + r, y - r],
    [x - r, y + r], [x + r, y + r],
  ];
  return pts.some(([px, py]) => isSolidTileAt(world, zoneName, Math.floor(px), Math.floor(py)));
}

// Unlock the door in prairie (when player uses key)
export function unlockDoor(world) {
  const p = world.zones[ZONE.PRAIRIE];
  let unlocked = false;
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      if (p.tiles[r][c] === TILE.DOOR_LOCKED) {
        p.tiles[r][c] = TILE.DOOR_OPEN;
        unlocked = true;
      }
    }
  }
  return unlocked;
}

// Check if a tile is a transition trigger
export function getTransition(world, zoneName, col, row) {
  return world.transitions.find(
    (t) => t.zone === zoneName && t.x === col && t.y === row
  );
}

// Get tile type at a coordinate
export function getTile(world, zoneName, col, row) {
  const zone = world.zones[zoneName];
  if (!zone) return TILE.WALL;
  if (col < 0 || col >= zone.cols || row < 0 || row >= zone.rows) return TILE.WALL;
  return zone.tiles[row][col];
}