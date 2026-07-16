// ─── e2e — bilan raté (< 75 %) ne débloque PAS le niveau suivant ──────────────
// Complément du test existant "bilan ≥ 75% débloque" (parcours.spec.js) : vérifie
// le chemin symétrique — sous le seuil, `unlockedLevel` doit rester inchangé et
// le module de bilan ne doit pas être marqué complété par erreur.
import { test, expect } from "@playwright/test";
import { trackErrors, seedProgress, playSession, readProgress } from "./helpers.js";

test("bilan < 75 % : le niveau Intermédiaire reste verrouillé", async ({ page }) => {
  const errors = trackErrors(page);
  // Même préparation que le test "bilan ≥ 75%" (M01-M15 complétés).
  const moduleProgress = {};
  for (let i = 1; i <= 15; i++) {
    moduleProgress["M" + String(i).padStart(2, "0")] =
      { completed: true, bestAccuracy: 0.9, stars: 2, attempts: 1, questionsSeen: 10 };
  }
  await seedProgress(page, {
    placementDone: true, placementLevel: "debutant", unlockedLevel: "debutant", moduleProgress,
  });
  await page.goto("/");

  await page.getByRole("button", { name: /Voir tout le parcours/ }).click();
  await expect(page.getByRole("heading", { name: "Niveau Débutant" })).toBeVisible();
  await page.getByRole("button", { name: "Bilan Débutant" }).click({ force: true });
  await page.getByTestId("start-session").click();

  // 5 erreurs volontaires → accuracy nettement sous 75%, quelle que soit la
  // taille exacte de la session (10-12 questions pour un bilan "mixed").
  await playSession(page, { wrongIndexes: [0, 1, 2, 3, 4] });

  const prog = await readProgress(page);
  expect(prog.unlockedLevel).toBe("debutant");
  expect(prog.moduleProgress.M16.completed).toBe(false);
  expect(errors, errors.join("\n")).toEqual([]);
});
