// Mango Quest — sprite atlases (Kenney Tiny Town + Tiny Dungeon, CC0).
// Two 12-column, 16px-per-tile packed tilemaps served from /public/tiles.
// All drawing is fallback-safe: until an atlas finishes loading, drawSprite()
// returns false and the caller paints a flat-color tile instead. The render
// loop runs every animation frame, so tiles upgrade to real art automatically
// once the images are ready — no load callback needed.
import { TILE, ZONE } from "./constants.js";

const ATLAS_COLS = 12;
const SRC = 16; // source tile size in the atlas

const BASE = (import.meta.env && import.meta.env.BASE_URL) || "/";
function loadAtlas(file) {
  // Guard for non-DOM environments (tests run in Node and never call this path).
  if (typeof Image === "undefined") return null;
  const img = new Image();
  img.src = BASE + "tiles/" + file;
  return img;
}

export const TOWN = loadAtlas("town.png");
export const DUNGEON = loadAtlas("dungeon.png");

export function atlasReady(atlas) {
  return !!(atlas && atlas.complete && atlas.naturalWidth > 0);
}

// Draw atlas tile `index` (row-major) into the dest rect. Returns false (drawing
// nothing) when the atlas isn't loaded yet, so callers can fall back.
export function drawSprite(ctx, atlas, index, dx, dy, dw, dh) {
  if (!atlasReady(atlas)) return false;
  const sx = (index % ATLAS_COLS) * SRC;
  const sy = Math.floor(index / ATLAS_COLS) * SRC;
  ctx.drawImage(atlas, sx, sy, SRC, SRC, dx, dy, dw, dh);
  return true;
}

// Deterministic per-cell pick so the same tile always varies the same way
// (natural-looking ground without flicker between frames). Uses a hashed spread
// so variants don't band or cluster; weight rare tiles by repeating common ones
// in the source list.
export function variant(list, r, c) {
  let h = (Math.imul(r, 73856093) ^ Math.imul(c, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return list[h % list.length];
}

// Named atlas indices (validated against the labeled contact sheets).
export const IDX = {
  // Grass weighted strongly toward plain; subtle tufts sometimes, bright flowers rarely.
  town: { grass: [0, 0, 0, 0, 0, 0, 0, 1, 1, 2], sand: [40, 41, 42], path: [40], tree: 4, key: 116, bomb: 105 },
  dungeon: {
    floor: [48, 49, 51], wall: [58], doorClosed: 45, doorOpen: 47,
    player: 96, goblin: 112, crab: 110, ogre: 109, potion: 115,
  },
};

// Per-(zone, tile) drawing spec. `base` = ground sprite(s) under everything;
// `obj` = object drawn on top (tree/door); `water`/`rock` = procedural overlay.
export function tileSpec(zoneName, tile) {
  const cavern = zoneName === ZONE.CAVERN;
  if (cavern) {
    switch (tile) {
      case TILE.WALL: return { atlas: DUNGEON, base: IDX.dungeon.wall };
      case TILE.ROCK: return { atlas: DUNGEON, base: IDX.dungeon.floor, rock: true };
      case TILE.DOOR_LOCKED: return { atlas: DUNGEON, base: IDX.dungeon.floor, obj: IDX.dungeon.doorClosed };
      case TILE.DOOR_OPEN: return { atlas: DUNGEON, base: IDX.dungeon.floor, obj: IDX.dungeon.doorOpen };
      case TILE.WATER: return { water: true };
      default: return { atlas: DUNGEON, base: IDX.dungeon.floor }; // floor/path/sand/grass fallback
    }
  }
  // Prairie (Tiny Town)
  switch (tile) {
    case TILE.TREE: return { atlas: TOWN, base: IDX.town.grass, obj: IDX.town.tree };
    case TILE.PATH: return { atlas: TOWN, base: IDX.town.path };
    case TILE.SAND: return { atlas: TOWN, base: IDX.town.sand };
    case TILE.WATER: return { water: true };
    case TILE.DOOR_LOCKED: return { atlas: DUNGEON, base: IDX.dungeon.floor, obj: IDX.dungeon.doorClosed };
    case TILE.DOOR_OPEN: return { atlas: DUNGEON, base: IDX.dungeon.floor, obj: IDX.dungeon.doorOpen };
    case TILE.FLOOR: return { atlas: DUNGEON, base: IDX.dungeon.floor };
    default: return { atlas: TOWN, base: IDX.town.grass }; // grass
  }
}

// Sprite index for a moving entity.
export function entitySprite(entity) {
  if (entity.kind === "boss") return IDX.dungeon.ogre;
  if (entity.kind === "enemy") return entity.type === "chase" ? IDX.dungeon.crab : IDX.dungeon.goblin;
  return IDX.dungeon.player;
}
