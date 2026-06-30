// Tests de la sauvegarde/chargement (snapshot, sérialisation, storage injecté).
import { buildSnapshot, serialize, deserialize, saveGame, loadGame, hasSave, clearSave, SAVE_KEY, SAVE_VERSION } from "../systems/save.js";

// Faux localStorage en mémoire pour les tests.
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _size: () => m.size,
  };
}

const samplePlayer = { hp: 22, maxHp: 30, atk: 6, def: 2, level: 3, xp: 5, xpToNext: 23, x: 4.5, y: 6.5, dir: "down", moving: true, invuln: 0 };
const sampleInv = { items: { potion: 2, bomb: 1, key: 0 } };
const sampleSpells = { mana: 14, maxMana: 20, cooldowns: { heal: 0, fireball: 30, shield: 0 }, shieldTicks: 100 };

test("buildSnapshot — n'embarque que les champs de progression du joueur", () => {
  const snap = buildSnapshot({ player: samplePlayer, inventory: sampleInv, spells: sampleSpells, quests: { quests: {} }, zone: "prairie" });
  expect(snap.version).toBe(SAVE_VERSION);
  expect(snap.player.level).toBe(3);
  expect(snap.player.moving).toBe(undefined); // champ runtime exclu
  expect(snap.inventory.items.potion).toBe(2);
  expect(snap.spells.mana).toBe(14);
  expect(snap.zone).toBe("prairie");
});

test("serialize/deserialize — aller-retour fidèle", () => {
  const snap = buildSnapshot({ player: samplePlayer, inventory: sampleInv });
  const back = deserialize(serialize(snap));
  expect(back.player.hp).toBe(22);
  expect(back.inventory.items.potion).toBe(2);
});

test("deserialize — JSON invalide → null (ne lève jamais)", () => {
  expect(deserialize("{pas du json")).toBe(null);
});

test("deserialize — version incompatible → null", () => {
  expect(deserialize(JSON.stringify({ version: 999, player: null }))).toBe(null);
});

test("saveGame/loadGame — round-trip via storage injecté", () => {
  const st = fakeStorage();
  const snap = buildSnapshot({ player: samplePlayer, spells: sampleSpells });
  expect(saveGame(snap, st)).toBeTruthy();
  expect(hasSave(st)).toBeTruthy();
  const loaded = loadGame(st);
  expect(loaded.player.level).toBe(3);
  expect(loaded.spells.cooldowns.fireball).toBe(30);
});

test("loadGame — aucune sauvegarde → null", () => {
  expect(loadGame(fakeStorage())).toBe(null);
});

test("clearSave — supprime la sauvegarde", () => {
  const st = fakeStorage();
  saveGame(buildSnapshot({ player: samplePlayer }), st);
  expect(hasSave(st)).toBeTruthy();
  clearSave(st);
  expect(hasSave(st)).toBeFalsy();
});

test("saveGame — stocke sous la bonne clé", () => {
  const st = fakeStorage();
  saveGame(buildSnapshot({ player: samplePlayer }), st);
  expect(st.getItem(SAVE_KEY)).toBeTruthy();
});

test("helpers — sans storage (null) ne lèvent pas", () => {
  expect(saveGame(buildSnapshot({}), null)).toBeFalsy();
  expect(loadGame(null)).toBe(null);
  expect(hasSave(null)).toBeFalsy();
  expect(clearSave(null)).toBeFalsy();
});
