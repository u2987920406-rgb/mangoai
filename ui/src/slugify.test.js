// #140 — Tests de caractérisation de slugify (filet de sécurité avant refactor).
import { describe, it, expect } from "vitest";
import { slugify } from "./slugify.js";

describe("slugify", () => {
  it("met en minuscules et relie par des tirets", () => {
    expect(slugify("Mon Super Projet")).toBe("mon-super-projet");
  });
  it("retire les accents (NFD)", () => {
    expect(slugify("Café Élégant")).toBe("cafe-elegant");
  });
  it("retire la ponctuation", () => {
    expect(slugify("To-do List! (v2)")).toBe("to-do-list-v2");
  });
  it("borne à 4 mots", () => {
    expect(slugify("un deux trois quatre cinq six")).toBe("un-deux-trois-quatre");
  });
  it("borne à 40 caractères", () => {
    expect(slugify("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
  it("repli 'mon-projet' sur vide / null", () => {
    expect(slugify("")).toBe("mon-projet");
    expect(slugify(null)).toBe("mon-projet");
    expect(slugify("!!!")).toBe("mon-projet");
  });
});
