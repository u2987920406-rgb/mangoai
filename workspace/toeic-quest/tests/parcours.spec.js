// ─── Tests e2e — parcours réel TOEIC Quest ────────────────────────────────────
// Couvre : Dashboard → Placement (12 q) → verdict → Carte (verrouillage) →
// Module → Session (feedback correct/incorrect) → Résultats (revue des erreurs)
// → Diagnostic (maîtrise, reset) + modes libres plafonnés + persistance.
// Assertions dures : zéro erreur console/pageerror, score ∈ [250, 990],
// déverrouillage de niveau après bilan ≥ 75 %.
import { test, expect } from "@playwright/test";

const STORAGE_KEY = "toeicquest_progress_v1";

// Collecte les erreurs console + pageerror. Les échecs de chargement d'images
// distantes Pexels (contenu .gen encore en ligne) sont tolérés : l'app les gère
// par fallback ; tout le reste fait échouer le test.
function trackErrors(page) {
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
async function answer(page, { correct = true } = {}) {
  const selector = `[data-testid="choice"][data-correct="${correct ? "true" : "false"}"]`;
  await page.locator(selector).first().click();
  const feedback = page.getByTestId("feedback");
  await expect(feedback).toBeVisible();
  await expect(feedback).toContainText(correct ? "Correct !" : "Pas tout à fait");
}

// Passe à la question suivante (ou aux résultats). Renvoie true si la session continue.
async function next(page) {
  const btn = page.getByRole("button", { name: /Question suivante|Voir les résultats/ });
  const label = await btn.innerText();
  await btn.click();
  return label.includes("suivante");
}

// Joue la session entière ; wrongIndexes = index (0-based) des questions à rater.
async function playSession(page, { wrongIndexes = [] } = {}) {
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

function readProgress(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), STORAGE_KEY);
}

test.describe("Parcours TOEIC Quest", () => {
  test("parcours complet : placement → carte → module → session → revue → diagnostic", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");

    // Dashboard initial
    await expect(page.getByRole("heading", { name: /Bienvenue, futur champion/ })).toBeVisible();

    // ── Placement : 12 questions, toutes justes → niveau Avancé ──
    await page.getByRole("button", { name: "Passer le test →" }).click();
    await page.getByTestId("start-placement").click();
    const placementCount = await playSession(page);
    expect(placementCount).toBe(12);
    await expect(page.getByTestId("placement-verdict")).toContainText("Avancé");

    // ── Carte du parcours (niveau avancé) : verrouillage/déverrouillage ──
    await page.getByRole("button", { name: "Voir mon parcours →" }).click();
    await expect(page.getByRole("heading", { name: "Niveau Avancé" })).toBeVisible();
    const m37 = page.getByRole("button", { name: "Photos : descriptions nuancées" });
    const m38 = page.getByRole("button", { name: "Réponses idiomatiques" });
    await expect(m37).toBeEnabled();          // 1er module du niveau : jouable
    await expect(m38).toBeDisabled();         // prérequis M37 non complété : verrouillé

    // ── Module M37 → session : feedback incorrect puis correct ──
    await m37.click();
    await expect(page.getByRole("heading", { name: "Photos : descriptions nuancées" })).toBeVisible();
    await page.getByTestId("start-session").click();
    await expect(page.getByTestId("session-count")).toBeVisible();
    const sessionCount = await playSession(page, { wrongIndexes: [0] }); // 1 erreur volontaire
    expect(sessionCount).toBeGreaterThanOrEqual(6);
    expect(sessionCount).toBeLessThanOrEqual(15);

    // ── Résultats : la revue affiche énoncé + réponses + explication ──
    await expect(page.getByRole("heading", { name: /Session terminée/ })).toBeVisible();
    const review = page.getByTestId("review-card");
    await expect(review).toBeVisible();
    const item = page.getByTestId("review-item").first();
    await expect(item.getByTestId("review-question")).not.toBeEmpty();
    await expect(item.getByTestId("review-given")).not.toBeEmpty();
    await expect(item.getByTestId("review-correct")).not.toBeEmpty();
    await expect(item.getByTestId("review-explanation")).not.toBeEmpty();
    // La réponse donnée diffère de la bonne réponse.
    expect(await item.getByTestId("review-given").innerText())
      .not.toBe(await item.getByTestId("review-correct").innerText());

    // ── Persistance + bornes du score estimé ──
    const prog = await readProgress(page);
    expect(prog.placementDone).toBe(true);
    expect(prog.totalSessions).toBeGreaterThanOrEqual(1);
    expect(prog.estimatedScore).toBeGreaterThanOrEqual(250);
    expect(prog.estimatedScore).toBeLessThanOrEqual(990);

    // ── Diagnostic : maîtrise par partie présente ──
    await page.getByRole("button", { name: "Retour au tableau de bord" }).click();
    await page.getByText("Forces & faiblesses").click();
    await expect(page.getByRole("heading", { name: "Diagnostic" })).toBeVisible();
    await expect(page.getByText("Maîtrise par partie TOEIC")).toBeVisible();
    await expect(page.getByText(/\d+\/\d+ questions/).first()).toBeVisible();

    // ── Persistance après rechargement ──
    await page.reload();
    await expect(page.getByRole("heading", { name: /Bon retour, champion/ })).toBeVisible();
    await expect(page.getByText("Sessions récentes")).toBeVisible();

    expect(errors, `Erreurs console/page détectées:\n${errors.join("\n")}`).toEqual([]);
  });

  test("mode libre : session plafonnée (12 questions, jamais la banque entière)", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await page.getByRole("heading", { name: "Listening", exact: true }).click();
    await expect(page.getByTestId("session-count")).toContainText("1/12");
    const count = await playSession(page);
    expect(count).toBe(12);
    await expect(page.getByRole("heading", { name: /Session/ })).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("bilan ≥ 75 % : débloque le niveau Intermédiaire", async ({ page }) => {
    const errors = trackErrors(page);
    // Préparation : M01-M15 complétés (le bilan M16 exige la chaîne de prérequis).
    await page.addInitScript(([key]) => {
      const moduleProgress = {};
      for (let i = 1; i <= 15; i++) {
        moduleProgress["M" + String(i).padStart(2, "0")] =
          { completed: true, bestAccuracy: 0.9, stars: 2, attempts: 1, questionsSeen: 10 };
      }
      localStorage.setItem(key, JSON.stringify({
        placementDone: true, placementLevel: "debutant", unlockedLevel: "debutant", moduleProgress,
      }));
    }, [STORAGE_KEY]);
    await page.goto("/");

    await page.getByText("Carte du parcours", { exact: true }).click();
    await page.getByText("Débutant", { exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Niveau Débutant" })).toBeVisible();
    // force: le nœud « à faire » pulse en continu (animate-pulse-mango) → jamais « stable » pour Playwright.
    await page.getByRole("button", { name: "Bilan Débutant" }).click({ force: true });
    await page.getByTestId("start-session").click();
    await playSession(page); // 100 % ≥ 75 %

    const prog = await readProgress(page);
    expect(prog.unlockedLevel).toBe("intermediaire");
    expect(prog.moduleProgress.M16.completed).toBe(true);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("diagnostic : réinitialisation de la progression", async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(([key]) => {
      localStorage.setItem(key, JSON.stringify({ totalXP: 500, totalSessions: 4, placementDone: true }));
    }, [STORAGE_KEY]);
    await page.goto("/");
    await page.getByText("Forces & faiblesses").click();
    await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer la remise à zéro" }).click();
    await expect(page.getByRole("heading", { name: /Bienvenue, futur champion/ })).toBeVisible();
    const prog = await readProgress(page);
    expect(prog.totalSessions).toBe(0);
    expect(prog.totalXP).toBe(0);
    expect(prog.placementDone).toBe(false);
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
