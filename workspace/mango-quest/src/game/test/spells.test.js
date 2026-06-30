// Tests du système de sorts (sorts, mana, cooldowns, bouclier).
import { createSpellState, canCast, castSpell, tickSpells, shieldActive, absorbWithShield, SPELL, SPELL_INFO } from "../systems/spells.js";

const player = (hp = 20, maxHp = 30) => ({ hp, maxHp });
const enemy = (hp = 30) => ({ hp });

test("createSpellState — mana pleine, cooldowns à zéro", () => {
  const s = createSpellState();
  expect(s.mana).toBe(20);
  expect(s.maxMana).toBe(20);
  expect(s.cooldowns.fireball).toBe(0);
  expect(s.shieldTicks).toBe(0);
});

test("canCast — vrai si assez de mana et hors recharge", () => {
  const s = createSpellState();
  expect(canCast(s, SPELL.FIREBALL)).toBeTruthy();
  expect(canCast(s, "inconnu")).toBeFalsy();
});

test("canCast — faux si mana insuffisante", () => {
  const s = { ...createSpellState(), mana: 2 };
  expect(canCast(s, SPELL.FIREBALL)).toBeFalsy();
});

test("castSpell heal — soigne le joueur et dépense la mana", () => {
  const s = createSpellState();
  const r = castSpell(s, SPELL.HEAL, player(10, 30));
  expect(r.ok).toBeTruthy();
  expect(r.player.hp).toBe(28); // 10 + 18
  expect(r.state.mana).toBe(14); // 20 - 6
  expect(r.state.cooldowns.heal).toBe(SPELL_INFO.heal.cooldown);
});

test("castSpell heal — n'excède pas maxHp", () => {
  const r = castSpell(createSpellState(), SPELL.HEAL, player(25, 30));
  expect(r.player.hp).toBe(30);
});

test("castSpell fireball — inflige des dégâts à la cible", () => {
  const r = castSpell(createSpellState(), SPELL.FIREBALL, player(), enemy(30));
  expect(r.ok).toBeTruthy();
  expect(r.target.hp).toBe(8); // 30 - 22
  expect(r.state.mana).toBe(10); // 20 - 10
});

test("castSpell fireball — clampe les HP de la cible à 0", () => {
  const r = castSpell(createSpellState(), SPELL.FIREBALL, player(), enemy(5));
  expect(r.target.hp).toBe(0);
});

test("castSpell shield — active le bouclier pour sa durée", () => {
  const r = castSpell(createSpellState(), SPELL.SHIELD, player());
  expect(r.ok).toBeTruthy();
  expect(shieldActive(r.state)).toBeTruthy();
  expect(r.state.shieldTicks).toBe(SPELL_INFO.shield.duration);
});

test("castSpell — refus si mana insuffisante (immuable)", () => {
  const s = { ...createSpellState(), mana: 1 };
  const r = castSpell(s, SPELL.FIREBALL, player());
  expect(r.ok).toBeFalsy();
  expect(r.state.mana).toBe(1); // inchangé
});

test("castSpell — refus si en recharge", () => {
  const s = { ...createSpellState(), cooldowns: { heal: 0, fireball: 50, shield: 0 } };
  const r = castSpell(s, SPELL.FIREBALL, player());
  expect(r.ok).toBeFalsy();
  expect(r.message).toContain("recharge");
});

test("tickSpells — décrémente cooldown et régénère la mana", () => {
  const s = { ...createSpellState(), mana: 10, cooldowns: { heal: 5, fireball: 0, shield: 0 } };
  const t = tickSpells(s);
  expect(t.cooldowns.heal).toBe(4);
  expect(t.mana).toBeGreaterThan(10);
});

test("tickSpells — mana plafonnée à maxMana", () => {
  const t = tickSpells(createSpellState());
  expect(t.mana).toBe(20);
});

test("absorbWithShield — absorbe quand actif, sinon laisse passer", () => {
  const withShield = { ...createSpellState(), shieldTicks: 100 };
  const a = absorbWithShield(withShield, 8);
  expect(a.absorbed).toBe(8);
  expect(a.dmg).toBe(0);
  const noShield = createSpellState();
  const b = absorbWithShield(noShield, 8);
  expect(b.absorbed).toBe(0);
  expect(b.dmg).toBe(8);
});

test("absorbWithShield — absorbe au plus la valeur du bouclier", () => {
  const withShield = { ...createSpellState(), shieldTicks: 100 };
  const a = absorbWithShield(withShield, 25);
  expect(a.absorbed).toBe(SPELL_INFO.shield.shield); // 10
  expect(a.dmg).toBe(15);
});
