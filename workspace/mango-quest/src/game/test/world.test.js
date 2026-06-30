// Tests du monde : 2 zones, collision, transitions, porte. API réelle de world.js.
import {
  createWorld, isSolidTile, isSolidTileAt, isSolid, collidesAt,
  unlockDoor, getTransition, getTile,
  PLAYER_START, ENEMY_SPAWNS, BOSS_SPAWN, ITEM_PICKUPS,
} from "../world.js";
import { TILE, ZONE } from "../constants.js";

test("createWorld expose deux zones + zone courante + transitions", () => {
  const w = createWorld();
  expect(w.zones[ZONE.PRAIRIE]).toBeTruthy();
  expect(w.zones[ZONE.CAVERN]).toBeTruthy();
  expect(w.currentZone).toBe(ZONE.PRAIRIE);
  expect(Array.isArray(w.transitions)).toBeTruthy();
  expect(w.transitions.length).toBeGreaterThan(0);
});

test("isSolidTile : arbre solide, herbe non", () => {
  expect(isSolidTile(TILE.TREE)).toBeTruthy();
  expect(isSolidTile(TILE.GRASS)).toBeFalsy();
});

test("bordure de la prairie solide, intérieur franchissable", () => {
  const w = createWorld();
  expect(isSolidTileAt(w, ZONE.PRAIRIE, 0, 0)).toBeTruthy(); // coin = arbre
  expect(isSolidTileAt(w, ZONE.PRAIRIE, 3, 5)).toBeFalsy();   // herbe
});

test("hors limites = solide (mur invisible)", () => {
  const w = createWorld();
  expect(isSolidTileAt(w, ZONE.PRAIRIE, -1, 0)).toBeTruthy();
  expect(isSolidTileAt(w, ZONE.PRAIRIE, 999, 999)).toBeTruthy();
});

test("l'eau bloque le déplacement", () => {
  const w = createWorld();
  expect(isSolidTileAt(w, ZONE.PRAIRIE, 11, 3)).toBeTruthy();
});

test("isSolid (coords pixels) cohérent avec la grille", () => {
  const w = createWorld();
  const ts = 32;
  expect(isSolid(w, ZONE.PRAIRIE, 0, 0, ts)).toBeTruthy();        // arbre
  expect(isSolid(w, ZONE.PRAIRIE, 3 * ts, 5 * ts, ts)).toBeFalsy(); // herbe
});

test("collidesAt utilise la zone courante du monde", () => {
  const w = createWorld();
  w.currentZone = ZONE.PRAIRIE;
  expect(collidesAt(w, 0.5, 0.5)).toBeTruthy();   // coin haut-gauche = arbre
  expect(collidesAt(w, 3.5, 5.5)).toBeFalsy();    // pleine herbe
});

test("position de départ franchissable", () => {
  const w = createWorld();
  expect(isSolidTileAt(w, PLAYER_START.zone, PLAYER_START.x, PLAYER_START.y)).toBeFalsy();
});

test("porte verrouillée présente puis ouverte par unlockDoor", () => {
  const w = createWorld();
  expect(getTile(w, ZONE.PRAIRIE, 7, 10)).toBe(TILE.DOOR_LOCKED);
  const unlocked = unlockDoor(w);
  expect(unlocked).toBeTruthy();
  expect(getTile(w, ZONE.PRAIRIE, 7, 10)).toBe(TILE.DOOR_OPEN);
  expect(isSolidTileAt(w, ZONE.PRAIRIE, 7, 10)).toBeFalsy();
});

test("transition prairie -> caverne sur la tuile de passage", () => {
  const w = createWorld();
  const tr = getTransition(w, ZONE.PRAIRIE, 7, 11);
  expect(tr).toBeTruthy();
  expect(tr.toZone).toBe(ZONE.CAVERN);
});

test("pas de transition sur une tuile quelconque", () => {
  const w = createWorld();
  expect(getTransition(w, ZONE.PRAIRIE, 3, 3)).toBeFalsy();
});

test("spawns ennemis valides (zone, coords, type)", () => {
  expect(ENEMY_SPAWNS.length).toBeGreaterThan(0);
  for (const s of ENEMY_SPAWNS) {
    expect(typeof s.x).toBe("number");
    expect(typeof s.y).toBe("number");
    expect(s.type === "patrol" || s.type === "chase").toBeTruthy();
  }
});

test("le boss apparaît dans la caverne", () => {
  expect(BOSS_SPAWN.zone).toBe(ZONE.CAVERN);
});

test("au moins une clé à ramasser", () => {
  const keys = ITEM_PICKUPS.filter((p) => p.item === "key");
  expect(keys.length).toBeGreaterThanOrEqual(1);
});
