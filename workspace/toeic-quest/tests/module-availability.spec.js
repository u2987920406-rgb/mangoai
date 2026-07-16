// ─── Garde de régression — disponibilité des modules ──────────────────────────
// L'état "Bientôt disponible" (isModulePlayable=false, MIN_PLAYABLE=6) est un
// vrai filet de sécurité dans le code (ModuleScreen.jsx/ModuleNode.jsx) mais
// AUCUN module réel n'est aujourd'hui sous ce seuil (minimum mesuré : 8
// questions) — impossible de déclencher honnêtement l'état verrouillé sans
// fabriquer une fausse banque. Deux vérifications à la place :
//  1. Garde de régression (logique pure, hors navigateur) : si un futur
//     changement de contenu fait passer un module sous le seuil, CE test le
//     détecte immédiatement (aujourd'hui vert par construction).
//  2. e2e léger : le module le moins fourni du curriculum (8 questions, tout
//     près du seuil) s'affiche bien comme JOUABLE, pas comme verrouillé.
import { test, expect } from "@playwright/test";
import { CURRICULUM } from "../src/data/curriculum.js";
import { availableForModule, isModulePlayable, MIN_PLAYABLE } from "../src/data/bank/index.js";
import { trackErrors, seedProgress } from "./helpers.js";

// Débloque un module en complétant tous les modules du MÊME niveau qui le
// précèdent dans le curriculum (les prérequis inter-niveaux sont auto-satisfaits
// dès que `unlockedLevel` couvre le niveau visé — cf. `isModuleUnlocked`).
function unlockChainFor(targetId) {
  const target = CURRICULUM.find((m) => m.id === targetId);
  const sameLevel = CURRICULUM.filter((m) => m.level === target.level);
  const moduleProgress = {};
  for (const mod of sameLevel) {
    if (mod.id === targetId) break;
    moduleProgress[mod.id] = { completed: true, bestAccuracy: 0.9, stars: 2, attempts: 1, questionsSeen: 10 };
  }
  return { unlockedLevel: target.level, placementDone: true, placementLevel: target.level, moduleProgress };
}

test.describe("Disponibilité des modules", () => {
  test("garde de régression : tous les modules du curriculum restent ≥ MIN_PLAYABLE", () => {
    const shortfalls = CURRICULUM
      .map((m) => ({ id: m.id, available: availableForModule(m.id) }))
      .filter((m) => m.available < MIN_PLAYABLE);
    expect(shortfalls, `Modules sous le seuil jouable (${MIN_PLAYABLE}) : ${JSON.stringify(shortfalls)}`).toEqual([]);
  });

  test("le module le moins fourni (8 questions) s'affiche comme jouable, pas verrouillé", async ({ page }) => {
    const lowest = CURRICULUM
      .map((m) => ({ m, available: availableForModule(m.id) }))
      .sort((a, b) => a.available - b.available)[0];
    expect(isModulePlayable(lowest.m.id)).toBe(true); // sanity : toujours au-dessus du seuil aujourd'hui

    const errors = trackErrors(page);
    await seedProgress(page, unlockChainFor(lowest.m.id));
    await page.goto("/");
    await page.getByRole("button", { name: /Voir tout le parcours/ }).click();
    await page.getByRole("button", { name: new RegExp(lowest.m.title) }).click({ force: true });

    const startBtn = page.getByTestId("start-session");
    await expect(startBtn).toBeEnabled();
    await expect(startBtn).toContainText("Commencer la session");
    await expect(page.getByText(`${lowest.available} dispo.`)).toBeVisible();
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
