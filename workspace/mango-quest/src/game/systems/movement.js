// Mango Quest — movement system (pure). 4-direction movement + world collision.
import { DIR, DIR_VEC } from "../constants.js";
import { collidesAt } from "../world.js";

// Fallback per-tick speed (tile units) if an entity carries none.
const DEFAULT_SPEED = 0.06;

// Attempt to move an entity in a direction. Returns a new entity state.
// `map` is the world (collision reads world.currentZone). `speed` optional override.
export function moveEntity(entity, map, dir, speed = entity.speed || DEFAULT_SPEED) {
  const vec = DIR_VEC[dir];
  if (!vec) return entity;
  const nx = entity.x + vec.x * speed;
  const ny = entity.y + vec.y * speed;
  // Try X then Y separately for wall-sliding
  let finalX = entity.x;
  let finalY = entity.y;
  let moving = false;
  if (!collidesAt(map, nx, entity.y, 0.35)) {
    finalX = nx;
    moving = true;
  }
  if (!collidesAt(map, finalX, ny, 0.35)) {
    finalY = ny;
    moving = true;
  }
  return { ...entity, x: finalX, y: finalY, dir, moving };
}

// Move player based on input state. input = { up, down, left, right } booleans.
// Priority: last pressed wins; here we pick first true in order down/up/left/right.
export function movePlayer(player, map, input, speed = player.speed || DEFAULT_SPEED) {
  let dir = null;
  if (input.down) dir = DIR.DOWN;
  else if (input.up) dir = DIR.UP;
  else if (input.left) dir = DIR.LEFT;
  else if (input.right) dir = DIR.RIGHT;

  if (dir === null) {
    return { ...player, moving: false };
  }
  return moveEntity(player, map, dir, speed);
}

// Check if two entities overlap (contact) — used to trigger combat
export function entitiesOverlap(a, b, dist = 0.7) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.abs(dx) < dist && Math.abs(dy) < dist;
}