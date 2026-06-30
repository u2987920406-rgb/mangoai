// Mango Quest — inventory system (pure). Three item types: potion, bomb, key.
import { ITEM, ITEM_INFO } from "../constants.js";
import { unlockDoor } from "../world.js";

// Create empty inventory
export function createInventory() {
  return {
    items: { [ITEM.POTION]: 0, [ITEM.BOMB]: 0, [ITEM.KEY]: 0 },
  };
}

// Add an item to inventory. Returns new inventory.
export function addItem(inventory, itemType, qty = 1) {
  if (!ITEM_INFO[itemType]) return inventory;
  const items = { ...inventory.items, [itemType]: (inventory.items[itemType] || 0) + qty };
  return { ...inventory, items };
}

// Use an item. Returns { inventory, player, world, message }.
// Some items affect the player (potion heals), some the world (key opens door, bomb damages enemies).
export function useItem(inventory, itemType, player, world) {
  if (!inventory.items[itemType] || inventory.items[itemType] <= 0) {
    return { inventory, player, world, message: "Tu n'as pas cet objet.", effect: "none" };
  }

  const info = ITEM_INFO[itemType];
  let newPlayer = player;
  let newWorld = world;
  let message = "";
  let effect = "none";

  if (itemType === ITEM.POTION) {
    const heal = info.heal;
    const before = newPlayer.hp;
    newPlayer = { ...newPlayer, hp: Math.min(newPlayer.maxHp, newPlayer.hp + heal) };
    message = `Potion utilisée : +${newPlayer.hp - before} HP.`;
    effect = "heal";
  } else if (itemType === ITEM.BOMB) {
    // Bomb damages all nearby enemies (handled by caller in game state).
    // Here we just consume it and signal the effect.
    message = "Bombe lancée !";
    effect = "bomb";
  } else if (itemType === ITEM.KEY) {
    // Key opens a locked door (uses the real world API: unlockDoor flips
    // DOOR_LOCKED -> DOOR_OPEN and returns whether anything was unlocked).
    if (world && unlockDoor(world)) {
      message = "Clé utilisée : porte ouverte !";
      effect = "open_door";
      newWorld = world;
    } else {
      // Nothing to open -> don't consume the key.
      return { inventory, player, world, message: "Il n'y a pas de porte à ouvrir ici.", effect: "none" };
    }
  }

  // Consume the item
  const items = { ...inventory.items, [itemType]: inventory.items[itemType] - 1 };
  return { inventory: { ...inventory, items }, player: newPlayer, world: newWorld, message, effect };
}

// Get count of an item
export function itemCount(inventory, itemType) {
  return inventory.items[itemType] || 0;
}

// Check if player has an item
export function hasItem(inventory, itemType) {
  return (inventory.items[itemType] || 0) > 0;
}