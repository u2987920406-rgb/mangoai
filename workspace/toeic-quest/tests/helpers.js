// ─── Helpers partagés e2e — Yes I Can Toeic ───────────────────────────────────
import { expect } from "@playwright/test";

export const STORAGE_KEY = "yesicantoeic_progress_v1";

// Collecte les erreurs console + pageerror. Les échecs de chargement d'images
// distantes Pexels (contenu .gen encore en ligne) sont tolérés : l'app les gère
// par fallback ; tout le reste fait échouer le test.
export function trackErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("images.pexels.com")) return;
    errors.push(`[console] ${text}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  return errors;
}

// Répond à la question affichée (correct=true → bonne réponse) puis vérifie le feedback.
export async function answer(page, { correct = true } = {}) {
  const selector = `[data-testid="choice"][data-correct="${correct ? "true" : "false"}"]`;
  await page.locator(selector).first().click();
  const feedback = page.getByTestId("feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(correct ? "Correct !" : "Pas tout à fait");
}

// Passe à la question suivante (ou aux résultats). Renvoie true si la session continue.
export async function next(page) {
  const btn = page.getByRole("button", { name: /Question suivante|Voir les résultats/ });
  const label = await btn.innerText();
  await btn.click();
  return label.includes("suivante");
}

// Joue la session entière ; wrongIndexes = index (0-based) des questions à rater.
export async function playSession(page, { wrongIndexes = [] } = {}) {
  let i = 0;
  let going = true;
  while (going) {
    await answer(page, { correct: !wrongIndexes.includes(i) });
    going = await next(page);
    i++;
    if (i > 60) throw new Error("Session anormalement longue (plafonnement cassé ?)");
  }
  return i;
}

export function readProgress(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), STORAGE_KEY);
}

// Sème un état de progression directement en localStorage AVANT le premier goto.
export async function seedProgress(page, partialState) {
  await page.addInitScript(([key, state]) => {
    localStorage.setItem(key, state);
  }, [STORAGE_KEY, JSON.stringify(partialState)]);
}
