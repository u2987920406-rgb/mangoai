// Tests du combat tour par tour (déterministe via RNG à graine). API réelle.
import {
  makeRng, calcDamage, tryDodge, tryFlee, applyCombatDamage,
  playerAttack, playerDodge, playerFlee, awardXp, createCombatState,
} from "../systems/combat.js";
import { createPlayer, createEnemy, createBoss } from "../entities.js";
import { ENEMY_STATS, xpToNextLevel } from "../constants.js";

test("makeRng déterministe à graine égale", () => {
  const r1 = makeRng(42);
  const r2 = makeRng(42);
  expect(r1()).toBeCloseTo(r2(), 5);
  expect(r1()).toBeCloseTo(r2(), 5);
});

test("makeRng diffère selon la graine", () => {
  const a = makeRng(1)();
  const b = makeRng(2)();
  expect(Math.abs(a - b) > 1e-6).toBeTruthy();
});

test("calcDamage : minimum 1", () => {
  expect(calcDamage(1, 100, makeRng(42))).toBeGreaterThanOrEqual(1);
});

test("calcDamage = atk - def + variance [-1..1]", () => {
  const dmg = calcDamage(10, 3, makeRng(42)); // 7 ± 1
  expect(dmg).toBeGreaterThanOrEqual(6);
  expect(dmg).toBeLessThanOrEqual(8);
});

test("calcDamage déterministe à graine égale", () => {
  expect(calcDamage(10, 3, makeRng(99))).toBe(calcDamage(10, 3, makeRng(99)));
});

test("applyCombatDamage réduit et borne à 0", () => {
  const e = createEnemy("patrol", 5, 5);
  expect(applyCombatDamage(e, 5).hp).toBe(ENEMY_STATS.patrol.hp - 5);
  expect(applyCombatDamage(e, 999).hp).toBe(0);
});

test("tryDodge : chance 1 réussit, chance 0 échoue", () => {
  expect(tryDodge(makeRng(1), 1)).toBeTruthy();
  expect(tryDodge(makeRng(1), 0)).toBeFalsy();
});

test("tryFlee : chance 1 réussit toujours", () => {
  expect(tryFlee(makeRng(1), 1)).toBeTruthy();
});

test("playerAttack réduit les PV ennemis et journalise", () => {
  const state = createCombatState(createPlayer(), createEnemy("patrol", 5, 5), 42);
  const after = playerAttack(state);
  expect(after.enemy.hp).toBeLessThan(state.enemy.hp);
  expect(after.log.length).toBeGreaterThan(state.log.length);
});

test("playerAttack : victoire quand l'ennemi tombe à 0", () => {
  const player = { ...createPlayer(), atk: 999 };
  const state = createCombatState(player, createEnemy("patrol", 5, 5), 42);
  const after = playerAttack(state);
  expect(after.state).toBe("player_won");
  expect(after.enemy.hp).toBe(0);
});

test("playerAttack : défaite quand le joueur tombe à 0", () => {
  const player = { ...createPlayer(), hp: 1, maxHp: 1, def: 0 };
  const enemy = { ...createEnemy("patrol", 5, 5), atk: 999 };
  const after = playerAttack(createCombatState(player, enemy, 42));
  expect(after.state).toBe("player_lost");
  expect(after.player.hp).toBe(0);
});

test("playerDodge : avance d'un tour, état cohérent", () => {
  const state = createCombatState(createPlayer(), createEnemy("patrol", 5, 5), 7);
  const after = playerDodge(state);
  expect(after.turn).toBe(state.turn + 1);
  expect(after.state === "ongoing" || after.state === "player_lost").toBeTruthy();
});

test("playerFlee : un état valide (fuite, en cours ou défaite)", () => {
  const after = playerFlee(createCombatState(createPlayer(), createEnemy("chase", 5, 5), 1));
  expect(["ongoing", "fled", "player_lost"].includes(after.state)).toBeTruthy();
});

test("awardXp : montée de niveau au seuil exact", () => {
  const player = createPlayer();
  const result = awardXp(player, xpToNextLevel(1));
  expect(result.player.level).toBe(2);
  expect(result.leveledUp).toBeTruthy();
  expect(result.player.xp).toBe(0);
});

test("awardXp : la montée de niveau augmente PV/ATK/DEF", () => {
  const player = createPlayer();
  const result = awardXp(player, xpToNextLevel(1));
  expect(result.player.maxHp).toBeGreaterThan(player.maxHp);
  expect(result.player.atk).toBeGreaterThan(player.atk);
  expect(result.player.def).toBeGreaterThan(player.def);
});

test("awardXp : la montée de niveau restaure les PV", () => {
  const player = { ...createPlayer(), hp: 5 };
  const result = awardXp(player, xpToNextLevel(1));
  expect(result.player.hp).toBe(result.player.maxHp);
});

test("awardXp : pas assez d'XP = pas de niveau", () => {
  const player = createPlayer();
  const result = awardXp(player, 1);
  expect(result.player.level).toBe(1);
  expect(result.leveledUp).toBeFalsy();
  expect(result.player.xp).toBe(1);
});

test("awardXp : plusieurs niveaux d'un gros gain", () => {
  const player = createPlayer();
  const need = xpToNextLevel(1) + xpToNextLevel(2) + xpToNextLevel(3);
  const result = awardXp(player, need);
  expect(result.player.level).toBe(4);
  expect(result.levelsGained.length).toBe(3);
});

test("createCombatState : initialisation correcte", () => {
  const player = createPlayer();
  const enemy = createEnemy("patrol", 5, 5);
  const state = createCombatState(player, enemy, 42);
  expect(state.state).toBe("ongoing");
  expect(state.turn).toBe(1);
  expect(state.player.hp).toBe(player.hp);
  expect(state.enemy.hp).toBe(enemy.hp);
  expect(state.log.length).toBeGreaterThanOrEqual(1);
});

test("combat entièrement déterministe à graine égale", () => {
  const player = createPlayer();
  const enemy = createEnemy("patrol", 5, 5);
  const a1 = playerAttack(createCombatState(player, enemy, 42));
  const a2 = playerAttack(createCombatState(player, enemy, 42));
  expect(a1.enemy.hp).toBe(a2.enemy.hp);
  expect(a1.player.hp).toBe(a2.player.hp);
  expect(a1.log).toEqual(a2.log);
});

test("combat de boss : coriace, plusieurs tours, victoire au bout", () => {
  let s = createCombatState(createPlayer(), createBoss(), 42);
  let turns = 0;
  while (s.state === "ongoing" && turns < 200) { s = playerAttack(s); turns++; }
  expect(turns).toBeGreaterThan(1);
  expect(s.state === "player_won" || s.state === "player_lost").toBeTruthy();
});
