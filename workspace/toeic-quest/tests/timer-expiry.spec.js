// ─── e2e — expiration du timer d'examen ───────────────────────────────────────
// Le mode examen chronométré (SessionTimer, Gamification.jsx) doit terminer la
// session proprement (écran "Temps écoulé !") sans laisser l'utilisateur bloqué,
// même si aucune question n'a été répondue avant l'expiration. Horloge virtuelle
// Playwright (`page.clock`) pour ne pas attendre les 5 minutes réelles.
import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers.js";

test("timer d'examen : expiration termine la session proprement", async ({ page }) => {
  const errors = trackErrors(page);
  await page.clock.install();
  await page.goto("/");

  await page.getByRole("button", { name: /Voir tout le parcours/ }).click();
  await expect(page.getByRole("heading", { name: "Niveau Débutant" })).toBeVisible();
  // force: le nœud « à faire » pulse en continu (animate-pulse-accent) → jamais « stable » pour Playwright.
  await page.getByRole("button", { name: /Photos du quotidien/ }).click({ force: true });

  // Active le mode examen chronométré (désactivé par défaut sur un module normal).
  await page.getByRole("switch", { name: "Activer le mode examen chronométré" }).click();
  await page.getByTestId("start-session").click();
  await expect(page.getByTestId("session-count")).toBeVisible();

  // Ne répond à AUCUNE question — avance l'horloge au-delà des 300s. `runFor`
  // (pas `fastForward`) déclenche CHAQUE tick du setInterval d'1s successivement,
  // comme un vrai décompte — `fastForward` ne tirerait que le dernier tick.
  await page.clock.runFor("05:01");

  await expect(page.getByRole("heading", { name: "Temps écoulé !" })).toBeVisible({ timeout: 10_000 });
  expect(errors, errors.join("\n")).toEqual([]);
});
