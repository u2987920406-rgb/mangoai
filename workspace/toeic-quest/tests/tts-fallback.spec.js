// ─── e2e — repli transcript quand la synthèse vocale est indisponible ─────────
// `speechSupported()` (lib/speech.js) est figé au chargement du module
// (`hasSpeech = "speechSynthesis" in window`) — on retire l'API AVANT que le
// bundle ne s'exécute via `addInitScript` (qui s'injecte avant les scripts de
// la page elle-même). Le transcript doit alors s'afficher D'OFFICE (pas besoin
// de cliquer "Transcript") — c'est le repli déjà implémenté, jamais testé.
import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers.js";

test("sans speechSynthesis : le transcript s'affiche automatiquement", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.speechSynthesis;
  });
  await page.goto("/");

  await page.getByRole("heading", { name: "Listening", exact: true }).click();
  await expect(page.getByTestId("session-count")).toBeVisible();

  // showTranscript=true d'office → le bouton lit "Cacher" (pas "Transcript"),
  // sans qu'on ait rien cliqué.
  await expect(page.getByRole("button", { name: "Cacher" })).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});
