// Tests du mouvement. API réelle : collision via world.currentZone.
import { moveEntity, movePlayer, entitiesOverlap } from "../systems/movement.js";
import { createWorld } from "../world.js";
import { createPlayer } from "../entities.js";
import { DIR, ZONE } from "../constants.js";

function prairie() {
  const w = createWorld();
  w.currentZone = ZONE.PRAIRIE;
  return w;
}

const NO_INPUT = { up: false, down: false, left: false, right: false };

test("moveEntity avance à droite en terrain libre", () => {
  const w = prairie();
  const p = createPlayer();
  const moved = moveEntity(p, w, DIR.RIGHT, 0.1);
  expect(moved.x).toBeGreaterThan(p.x);
  expect(moved.dir).toBe(DIR.RIGHT);
  expect(moved.moving).toBeTruthy();
});

test("moveEntity bloqué par la bordure d'arbres (gauche)", () => {
  const w = prairie();
  const p = { ...createPlayer(), x: 0.6, y: 2.5 };
  const moved = moveEntity(p, w, DIR.LEFT, 0.1);
  expect(moved.x).toBe(p.x); // bloqué
});

test("moveEntity bloqué par la bordure (haut)", () => {
  const w = prairie();
  const p = { ...createPlayer(), x: 3.5, y: 0.6 };
  const moved = moveEntity(p, w, DIR.UP, 0.1);
  expect(moved.y).toBe(p.y); // bloqué
});

test("movePlayer sans input : immobile", () => {
  const w = prairie();
  const p = createPlayer();
  const r = movePlayer(p, w, NO_INPUT);
  expect(r.moving).toBeFalsy();
  expect(r.x).toBe(p.x);
  expect(r.y).toBe(p.y);
});

test("movePlayer bas : descend", () => {
  const w = prairie();
  const p = createPlayer();
  const r = movePlayer(p, w, { ...NO_INPUT, down: true });
  expect(r.y).toBeGreaterThan(p.y);
  expect(r.dir).toBe(DIR.DOWN);
});

test("movePlayer gauche : va à gauche", () => {
  const w = prairie();
  const p = createPlayer();
  const r = movePlayer(p, w, { ...NO_INPUT, left: true });
  expect(r.x).toBeLessThan(p.x);
  expect(r.dir).toBe(DIR.LEFT);
});

test("movePlayer priorité : bas avant haut", () => {
  const w = prairie();
  const p = createPlayer();
  const r = movePlayer(p, w, { ...NO_INPUT, up: true, down: true });
  expect(r.dir).toBe(DIR.DOWN);
});

test("entitiesOverlap : proche = contact", () => {
  expect(entitiesOverlap({ x: 5.5, y: 5.5 }, { x: 5.6, y: 5.6 })).toBeTruthy();
});

test("entitiesOverlap : loin = pas de contact", () => {
  expect(entitiesOverlap({ x: 5.5, y: 5.5 }, { x: 10.5, y: 10.5 })).toBeFalsy();
});
