// #140 — Tests des constantes de navigation (source de vérité unique).
import { describe, it, expect } from "vitest";
import { SCREENS, WINDOWS, isScreen, isWindowType, screenValues, windowValues } from "./nav.js";

describe("nav — écrans", () => {
  it("expose les écrans connus du cockpit", () => {
    expect(SCREENS.HOME).toBe("home");
    expect(SCREENS.WORKSPACE).toBe("workspace");
    expect(screenValues()).toContain("reglages");
  });
  it("isScreen valide un écran connu et rejette un fantôme", () => {
    expect(isScreen("workspace")).toBe(true);
    expect(isScreen("chat")).toBe(false); // l'ancien écran fantôme supprimé
    expect(isScreen("")).toBe(false);
  });
  it("les valeurs d'écrans sont uniques", () => {
    const v = screenValues();
    expect(new Set(v).size).toBe(v.length);
  });
  it("SCREENS est figé (immuable)", () => {
    expect(Object.isFrozen(SCREENS)).toBe(true);
  });
});

describe("nav — fenêtres", () => {
  it("expose les types de fenêtres, dont la Suite (#138)", () => {
    expect(WINDOWS.SUITE).toBe("suite");
    expect(windowValues()).toContain("projects");
  });
  it("isWindowType valide un type connu et rejette l'inconnu", () => {
    expect(isWindowType("suite")).toBe(true);
    expect(isWindowType("inexistant")).toBe(false);
  });
  it("les valeurs de fenêtres sont uniques", () => {
    const v = windowValues();
    expect(new Set(v).size).toBe(v.length);
  });
  it("WINDOWS est figé (immuable)", () => {
    expect(Object.isFrozen(WINDOWS)).toBe(true);
  });
  it("tout type de fenêtre est une chaîne kebab-case non vide", () => {
    for (const t of windowValues()) {
      expect(typeof t).toBe("string");
      expect(t).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});
