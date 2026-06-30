// Mango Quest — enemy AI (pure). Patrol (deterministic back-and-forth) and chase.
import { DIR, DIR_VEC } from "../constants.js";
import { collidesAt } from "../world.js";

// Patrol: move back and forth along patrolAxis between patrolMin and patrolMax.
// Deterministic — no randomness. Reverses at bounds or on collision.
export function updatePatrol(enemy, map) {
  if (!enemy.alive) return enemy;
  const axis = enemy.patrolAxis;
  const vec = axis === "x" ? { x: enemy.patrolDir, y: 0 } : { x: 0, y: enemy.patrolDir };
  const speed = enemy.speed;
  const nx = enemy.x + vec.x * speed;
  const ny = enemy.y + vec.y * speed;

  // Check bounds
  const pos = axis === "x" ? enemy.x : enemy.y;
  const atBound = (enemy.patrolDir > 0 && pos + speed >= enemy.patrolMax) ||
                  (enemy.patrolDir < 0 && pos - speed <= enemy.patrolMin);

  // Check collision
  const blocked = collidesAt(map, nx, ny, 0.35);

  if (atBound || blocked) {
    // Reverse direction
    const newDir = -enemy.patrolDir;
    const newVec = axis === "x" ? { x: newDir, y: 0 } : { x: 0, y: newDir };
    const rNx = enemy.x + newVec.x * speed;
    const rNy = enemy.y + newVec.y * speed;
    if (!collidesAt(map, rNx, rNy, 0.35)) {
      return {
        ...enemy,
        x: rNx,
        y: rNy,
        patrolDir: newDir,
        dir: axis === "x" ? (newDir > 0 ? DIR.RIGHT : DIR.LEFT) : (newDir > 0 ? DIR.DOWN : DIR.UP),
      };
    }
    return { ...enemy, patrolDir: newDir };
  }

  return {
    ...enemy,
    x: nx,
    y: ny,
    dir: axis === "x" ? (enemy.patrolDir > 0 ? DIR.RIGHT : DIR.LEFT) : (enemy.patrolDir > 0 ? DIR.DOWN : DIR.UP),
  };
}

// Chase: move towards the player. Picks the axis with the greatest distance.
export function updateChase(enemy, player, map) {
  if (!enemy.alive) return enemy;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const speed = enemy.speed;

  // Try the axis with the larger gap first
  const tryXFirst = Math.abs(dx) >= Math.abs(dy);
  const attempts = tryXFirst
    ? [{ ax: "x", v: Math.sign(dx) }, { ax: "y", v: Math.sign(dy) }]
    : [{ ax: "y", v: Math.sign(dy) }, { ax: "x", v: Math.sign(dx) }];

  for (const a of attempts) {
    if (a.v === 0) continue;
    const nx = a.ax === "x" ? enemy.x + a.v * speed : enemy.x;
    const ny = a.ax === "y" ? enemy.y + a.v * speed : enemy.y;
    if (!collidesAt(map, nx, ny, 0.35)) {
      return {
        ...enemy,
        x: nx,
        y: ny,
        dir: a.ax === "x" ? (a.v > 0 ? DIR.RIGHT : DIR.LEFT) : (a.v > 0 ? DIR.DOWN : DIR.UP),
      };
    }
  }
  return enemy;
}

// Dispatch: update an enemy based on its type
export function updateEnemy(enemy, player, map) {
  if (enemy.type === "chase") return updateChase(enemy, player, map);
  return updatePatrol(enemy, map);
}