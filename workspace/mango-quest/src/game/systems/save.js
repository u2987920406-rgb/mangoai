// Mango Quest — sauvegarde/chargement (localStorage). Sérialise un instantané de
// progression (stats joueur, niveau/xp, inventaire, sorts, quêtes, zone, position)
// en JSON et le relit. Le storage est INJECTABLE → testable sans navigateur.

export const SAVE_KEY = "mango-quest-save-v1";
export const SAVE_VERSION = 1;

// Construit un instantané sérialisable à partir des pièces vivantes du jeu. PUR.
export function buildSnapshot({ player, inventory, spells, quests, zone } = {}) {
  return {
    version: SAVE_VERSION,
    player: player
      ? {
          hp: player.hp,
          maxHp: player.maxHp,
          atk: player.atk,
          def: player.def,
          level: player.level,
          xp: player.xp,
          xpToNext: player.xpToNext,
          x: player.x,
          y: player.y,
          dir: player.dir,
        }
      : null,
    inventory: inventory ? { items: { ...inventory.items } } : null,
    spells: spells ? { mana: spells.mana, maxMana: spells.maxMana, cooldowns: { ...spells.cooldowns } } : null,
    quests: quests || null,
    zone: zone || null,
  };
}

export function serialize(snapshot) {
  return JSON.stringify(snapshot);
}

// Relit un instantané. Renvoie null si invalide ou version incompatible. Ne lève jamais.
export function deserialize(str) {
  try {
    const o = JSON.parse(str);
    if (!o || o.version !== SAVE_VERSION) return null;
    return o;
  } catch {
    return null;
  }
}

function defaultStorage() {
  return typeof globalThis !== "undefined" && globalThis.localStorage ? globalThis.localStorage : null;
}

// storage = tout objet { getItem, setItem, removeItem } (les tests injectent un faux).
export function saveGame(snapshot, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serialize(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function hasSave(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    return !!storage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
