// ─── e2e — progression stockée de forme invalide ──────────────────────────────
// Un blob JSON syntaxiquement valide mais de forme inattendue (ex. un nombre
// stocké comme chaîne) ne doit JAMAIS se propager dans les calculs de score —
// l'app doit détecter l'incohérence et repartir sur l'état par défaut, jamais
// planter ni afficher NaN. Couvre `isValidShape`/`loadState` (useProgress.js).
import { test, expect } from "@playwright/test";
import { trackErrors, seedProgress, readProgress } from "./helpers.js";

test.describe("localStorage corrompu — forme invalide", () => {
  test("champ numérique stocké en chaîne → repli sur l'état par défaut", async ({ page }) => {
    const errors = trackErrors(page);
    await seedProgress(page, { totalXP: "beaucoup", totalSessions: 4 });
    await page.goto("/");

    // Repli propre : dashboard par défaut (0 session), pas de NaN affiché.
    await expect(page.getByRole("heading", { name: /Bienvenue, futur champion/ })).toBeVisible();
    // Regex SANS le flag "i" → recherche sensible à la casse : évite un faux
    // positif sur "mainteNANt" (getByText en chaîne est insensible à la casse
    // par défaut et confondait "NaN" avec la fin du mot "maintenant").
    await expect(page.getByText(/NaN/)).toHaveCount(0);

    const prog = await readProgress(page);
    expect(prog.totalSessions).toBe(0);
    expect(typeof prog.totalXP).toBe("number");
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("moduleProgress en tableau au lieu d'objet → repli sans planter", async ({ page }) => {
    const errors = trackErrors(page);
    await seedProgress(page, { moduleProgress: ["pas un objet"] });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Bienvenue, futur champion/ })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("JSON syntaxiquement invalide (charabia) → repli sans planter", async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(([key]) => {
      localStorage.setItem(key, "{ceci n'est pas du JSON");
    }, ["yesicantoeic_progress_v1"]);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Bienvenue, futur champion/ })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
