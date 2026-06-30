// Tests de l'inventaire (3 objets : potion, bombe, clé). API réelle, pure & immuable.
import { createInventory, addItem, useItem, itemCount, hasItem } from "../systems/inventory.js";
import { createWorld, getTile } from "../world.js";
import { createPlayer } from "../entities.js";
import { ITEM, ITEM_INFO, TILE, ZONE } from "../constants.js";

test("createInventory vide (0 de chaque)", () => {
  const inv = createInventory();
  expect(inv.items[ITEM.POTION]).toBe(0);
  expect(inv.items[ITEM.BOMB]).toBe(0);
  expect(inv.items[ITEM.KEY]).toBe(0);
});

test("addItem augmente le compte (et n'altère pas l'original)", () => {
  const inv = createInventory();
  const inv2 = addItem(inv, ITEM.POTION, 2);
  expect(inv2.items[ITEM.POTION]).toBe(2);
  expect(inv.items[ITEM.POTION]).toBe(0);
});

test("addItem empile sur l'existant", () => {
  const inv = addItem(addItem(createInventory(), ITEM.POTION, 1), ITEM.POTION, 2);
  expect(inv.items[ITEM.POTION]).toBe(3);
});

test("addItem type invalide : inventaire inchangé", () => {
  const inv = createInventory();
  expect(addItem(inv, "invalide", 1)).toBe(inv);
});

test("itemCount & hasItem", () => {
  const inv = addItem(createInventory(), ITEM.KEY, 3);
  expect(itemCount(inv, ITEM.KEY)).toBe(3);
  expect(itemCount(inv, ITEM.POTION)).toBe(0);
  expect(hasItem(inv, ITEM.KEY)).toBeTruthy();
  expect(hasItem(inv, ITEM.POTION)).toBeFalsy();
});

test("useItem potion : soigne et consomme", () => {
  const player = { ...createPlayer(), hp: 10, maxHp: 30 };
  const inv = addItem(createInventory(), ITEM.POTION, 1);
  const r = useItem(inv, ITEM.POTION, player, createWorld());
  expect(r.effect).toBe("heal");
  expect(r.player.hp).toBe(10 + ITEM_INFO.potion.heal);
  expect(r.inventory.items[ITEM.POTION]).toBe(0);
});

test("useItem potion : pas de surplus au-delà du max", () => {
  const player = { ...createPlayer(), hp: 25, maxHp: 30 };
  const inv = addItem(createInventory(), ITEM.POTION, 1);
  const r = useItem(inv, ITEM.POTION, player, createWorld());
  expect(r.player.hp).toBe(30);
});

test("useItem sans objet : effet none", () => {
  const r = useItem(createInventory(), ITEM.POTION, createPlayer(), createWorld());
  expect(r.effect).toBe("none");
});

test("useItem clé : ouvre la porte verrouillée et consomme", () => {
  const world = createWorld();
  const inv = addItem(createInventory(), ITEM.KEY, 1);
  expect(getTile(world, ZONE.PRAIRIE, 7, 10)).toBe(TILE.DOOR_LOCKED);
  const r = useItem(inv, ITEM.KEY, createPlayer(), world);
  expect(r.effect).toBe("open_door");
  expect(r.inventory.items[ITEM.KEY]).toBe(0);
  expect(getTile(world, ZONE.PRAIRIE, 7, 10)).toBe(TILE.DOOR_OPEN);
});

test("useItem clé : rien à ouvrir = clé non consommée", () => {
  const world = createWorld();
  const inv = addItem(createInventory(), ITEM.KEY, 1);
  useItem(inv, ITEM.KEY, createPlayer(), world); // 1re fois : ouvre
  const r = useItem(inv, ITEM.KEY, createPlayer(), world); // 2e : plus de porte
  expect(r.effect).toBe("none");
  expect(r.inventory.items[ITEM.KEY]).toBe(1); // pas consommée
});

test("useItem bombe : signale l'effet et consomme", () => {
  const inv = addItem(createInventory(), ITEM.BOMB, 1);
  const r = useItem(inv, ITEM.BOMB, createPlayer(), createWorld());
  expect(r.effect).toBe("bomb");
  expect(r.inventory.items[ITEM.BOMB]).toBe(0);
});

test("immuabilité : addItem ne mute pas l'original", () => {
  const inv = createInventory();
  addItem(inv, ITEM.POTION, 5);
  expect(inv.items[ITEM.POTION]).toBe(0);
});
