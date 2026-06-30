// Tests des constantes & de la courbe d'XP. API réelle de constants.js.
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS, TILE, SOLID_TILES, ZONE,
  PLAYER_BASE, ENEMY_STATS, BOSS_STATS, ITEM, ITEM_INFO, COMBAT,
  DIR, DIR_VEC, xpToNextLevel, TICK_MS,
} from "../constants.js";

test("dimensions de la carte", () => {
  expect(TILE_SIZE).toBeGreaterThan(0);
  expect(MAP_COLS).toBe(16);
  expect(MAP_ROWS).toBe(12);
});

test("tuiles solides : arbre, mur, rocher, eau, porte verrouillée", () => {
  expect(SOLID_TILES.has(TILE.TREE)).toBeTruthy();
  expect(SOLID_TILES.has(TILE.WALL)).toBeTruthy();
  expect(SOLID_TILES.has(TILE.ROCK)).toBeTruthy();
  expect(SOLID_TILES.has(TILE.WATER)).toBeTruthy();
  expect(SOLID_TILES.has(TILE.DOOR_LOCKED)).toBeTruthy();
});

test("tuiles franchissables : herbe, chemin, sol, porte ouverte", () => {
  expect(SOLID_TILES.has(TILE.GRASS)).toBeFalsy();
  expect(SOLID_TILES.has(TILE.PATH)).toBeFalsy();
  expect(SOLID_TILES.has(TILE.FLOOR)).toBeFalsy();
  expect(SOLID_TILES.has(TILE.DOOR_OPEN)).toBeFalsy();
});

test("deux zones distinctes", () => {
  expect(ZONE.PRAIRIE).toBe("prairie");
  expect(ZONE.CAVERN).toBe("cavern");
});

test("stats de base du joueur cohérentes", () => {
  expect(PLAYER_BASE.hp).toBe(PLAYER_BASE.maxHp);
  expect(PLAYER_BASE.atk).toBeGreaterThan(0);
  expect(PLAYER_BASE.def).toBeGreaterThanOrEqual(0);
  expect(PLAYER_BASE.level).toBe(1);
});

test("stats ennemis : le chasseur tape au moins aussi fort que le patrouilleur", () => {
  expect(ENEMY_STATS.patrol.hp).toBeGreaterThan(0);
  expect(ENEMY_STATS.chase.hp).toBeGreaterThan(0);
  expect(ENEMY_STATS.chase.atk).toBeGreaterThanOrEqual(ENEMY_STATS.patrol.atk);
});

test("le boss est plus coriace que les ennemis communs", () => {
  expect(BOSS_STATS.hp).toBeGreaterThan(ENEMY_STATS.chase.hp);
  expect(BOSS_STATS.atk).toBeGreaterThan(ENEMY_STATS.chase.atk);
  expect(BOSS_STATS.xp).toBeGreaterThan(ENEMY_STATS.chase.xp);
});

test("infos objets : potion soigne, bombe inflige, clé non empilable", () => {
  expect(ITEM_INFO[ITEM.POTION].heal).toBeGreaterThan(0);
  expect(ITEM_INFO[ITEM.BOMB].damage).toBeGreaterThan(0);
  expect(ITEM_INFO[ITEM.KEY].maxStack).toBe(1);
});

test("vecteurs de direction corrects", () => {
  expect(DIR_VEC[DIR.UP]).toEqual({ x: 0, y: -1 });
  expect(DIR_VEC[DIR.DOWN]).toEqual({ x: 0, y: 1 });
  expect(DIR_VEC[DIR.LEFT]).toEqual({ x: -1, y: 0 });
  expect(DIR_VEC[DIR.RIGHT]).toEqual({ x: 1, y: 0 });
});

test("xpToNextLevel croît avec le niveau", () => {
  expect(xpToNextLevel(1)).toBe(10);
  expect(xpToNextLevel(2)).toBeGreaterThan(xpToNextLevel(1));
  expect(xpToNextLevel(3)).toBeGreaterThan(xpToNextLevel(2));
});

test("constantes de combat dans des bornes de probabilité", () => {
  expect(COMBAT.DODGE_CHANCE).toBeGreaterThan(0);
  expect(COMBAT.DODGE_CHANCE).toBeLessThan(1);
  expect(COMBAT.CRIT_MULT).toBeGreaterThanOrEqual(1);
});

test("pas de tick à zéro", () => {
  expect(TICK_MS).toBeGreaterThan(0);
});
