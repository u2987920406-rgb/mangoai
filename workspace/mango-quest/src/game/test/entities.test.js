// Tests des fabriques d'entités. API réelle de entities.js.
import {
  createPlayer, createEnemy, createBoss, applyDamage, isDead, healEntity, resetIds,
} from "../entities.js";
import { PLAYER_BASE, ENEMY_STATS, BOSS_STATS, DIR } from "../constants.js";
import { PLAYER_START } from "../world.js";

test("createPlayer : stats de départ + position au point de spawn", () => {
  const p = createPlayer();
  expect(p.kind).toBe("player");
  expect(p.hp).toBe(PLAYER_BASE.hp);
  expect(p.maxHp).toBe(PLAYER_BASE.maxHp);
  expect(p.atk).toBe(PLAYER_BASE.atk);
  expect(p.level).toBe(1);
  expect(p.xp).toBe(0);
  expect(p.dir).toBe(DIR.DOWN);
  expect(p.x).toBeCloseTo(PLAYER_START.x + 0.5, 5);
  expect(p.y).toBeCloseTo(PLAYER_START.y + 0.5, 5);
});

test("createEnemy patrol : type, stats et bornes de patrouille", () => {
  const e = createEnemy("patrol", 5, 5);
  expect(e.kind).toBe("enemy");
  expect(e.type).toBe("patrol");
  expect(e.hp).toBe(ENEMY_STATS.patrol.hp);
  expect(e.atk).toBe(ENEMY_STATS.patrol.atk);
  expect(e.xpReward).toBe(ENEMY_STATS.patrol.xp);
  expect(e.alive).toBeTruthy();
  expect(e.patrolMin).toBe(5);
  expect(e.patrolMax).toBeGreaterThan(e.patrolMin);
});

test("createEnemy chase : plus offensif que le patrouilleur", () => {
  const e = createEnemy("chase", 5, 5);
  expect(e.type).toBe("chase");
  expect(e.hp).toBe(ENEMY_STATS.chase.hp);
  expect(e.atk).toBeGreaterThanOrEqual(ENEMY_STATS.patrol.atk);
  expect(e.xpReward).toBe(ENEMY_STATS.chase.xp);
});

test("createBoss : stats de boss + nom", () => {
  const b = createBoss();
  expect(b.kind).toBe("boss");
  expect(b.hp).toBe(BOSS_STATS.hp);
  expect(b.hp).toBeGreaterThan(ENEMY_STATS.chase.hp);
  expect(b.atk).toBeGreaterThan(ENEMY_STATS.chase.atk);
  expect(b.name).toBeTruthy();
});

test("applyDamage réduit les PV et borne à 0", () => {
  const e = createEnemy("patrol", 5, 5);
  const hurt = applyDamage(e, 5);
  expect(hurt.hp).toBe(ENEMY_STATS.patrol.hp - 5);
  const dead = applyDamage(e, 999);
  expect(dead.hp).toBe(0);
});

test("isDead vrai quand PV <= 0", () => {
  const e = createEnemy("patrol", 5, 5);
  expect(isDead(e)).toBeFalsy();
  expect(isDead(applyDamage(e, 999))).toBeTruthy();
});

test("healEntity soigne et borne au max", () => {
  const e = createEnemy("patrol", 5, 5);
  const hurt = applyDamage(e, 10);
  const healed = healEntity(hurt, 3);
  expect(healed.hp).toBe(hurt.hp + 3);
  const over = healEntity(hurt, 999);
  expect(over.hp).toBe(e.maxHp);
});

test("identifiants uniques entre entités", () => {
  resetIds();
  const a = createEnemy("patrol", 1, 1);
  const b = createEnemy("patrol", 2, 2);
  const p = createPlayer();
  expect(a.id !== b.id).toBeTruthy();
  expect(a.id !== p.id).toBeTruthy();
});
