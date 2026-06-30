// Tests de l'IA ennemie : patrouille déterministe + poursuite. API réelle.
import { updatePatrol, updateChase, updateEnemy } from "../systems/ai.js";
import { createWorld } from "../world.js";
import { createEnemy } from "../entities.js";
import { DIR, ZONE } from "../constants.js";

function prairie() {
  const w = createWorld();
  w.currentZone = ZONE.PRAIRIE;
  return w;
}

test("patrouille : avance vers la droite au départ (patrolDir=1)", () => {
  const w = prairie();
  const e = createEnemy("patrol", 5, 5);
  const e2 = updatePatrol(e, w);
  expect(e2.x).toBeGreaterThan(e.x);
  expect(e2.dir).toBe(DIR.RIGHT);
});

test("patrouille : rebond à la borne max", () => {
  const w = prairie();
  const e = { ...createEnemy("patrol", 5, 5), x: 0, patrolDir: 1 };
  e.x = e.patrolMax - 0.01;
  const e2 = updatePatrol(e, w);
  expect(e2.patrolDir).toBe(-1);
});

test("patrouille : rebond à la borne min", () => {
  const w = prairie();
  const e = { ...createEnemy("patrol", 5, 5), patrolDir: -1 };
  e.x = e.patrolMin + 0.01;
  const e2 = updatePatrol(e, w);
  expect(e2.patrolDir).toBe(1);
});

test("patrouille : déterministe (mêmes entrées, mêmes sorties)", () => {
  const w = prairie();
  const r1 = updatePatrol(createEnemy("patrol", 5, 5), w);
  const r2 = updatePatrol(createEnemy("patrol", 5, 5), w);
  expect(r1.x).toBe(r2.x);
  expect(r1.y).toBe(r2.y);
  expect(r1.dir).toBe(r2.dir);
});

test("patrouille : mort = immobile", () => {
  const w = prairie();
  const e = { ...createEnemy("patrol", 5, 5), alive: false };
  const e2 = updatePatrol(e, w);
  expect(e2.x).toBe(e.x);
  expect(e2.y).toBe(e.y);
});

test("poursuite : se rapproche sur X quand le joueur est à droite", () => {
  const w = prairie();
  const e = createEnemy("chase", 5, 5);
  const e2 = updateChase(e, { x: 10, y: 5 }, w);
  expect(e2.x).toBeGreaterThan(e.x);
});

test("poursuite : se rapproche sur Y quand le joueur est en bas", () => {
  const w = prairie();
  const e = createEnemy("chase", 5, 5);
  const e2 = updateChase(e, { x: 5, y: 10 }, w);
  expect(e2.y).toBeGreaterThan(e.y);
});

test("poursuite : la distance ne fait que diminuer", () => {
  const w = prairie();
  const player = { x: 12, y: 12 };
  const e = createEnemy("chase", 5, 5);
  const before = Math.abs(player.x - e.x) + Math.abs(player.y - e.y);
  const e2 = updateChase(e, player, w);
  const after = Math.abs(player.x - e2.x) + Math.abs(player.y - e2.y);
  expect(after).toBeLessThanOrEqual(before);
});

test("poursuite : mort = immobile", () => {
  const w = prairie();
  const e = { ...createEnemy("chase", 5, 5), alive: false };
  const e2 = updateChase(e, { x: 10, y: 5 }, w);
  expect(e2.x).toBe(e.x);
  expect(e2.y).toBe(e.y);
});

test("updateEnemy aiguille vers patrouille", () => {
  const w = prairie();
  const e = createEnemy("patrol", 5, 5);
  const e2 = updateEnemy(e, { x: 5.5, y: 5.5 }, w);
  expect(e2.x).toBeGreaterThan(e.x);
});

test("updateEnemy aiguille vers poursuite", () => {
  const w = prairie();
  const e = createEnemy("chase", 5, 5);
  const e2 = updateEnemy(e, { x: 10, y: 5 }, w);
  expect(e2.x).toBeGreaterThan(e.x);
});
