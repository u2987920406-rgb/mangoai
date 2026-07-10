// Moteur de suggestion — cœur de l'app.
// Calcule, pour chaque recette, un score de complétude par rapport à l'inventaire du frigo,
// la liste des ingrédients manquants, et permet de trier par "cuisinable maintenant".
import { recipeIsGlutenFree, recipeIsQuick } from "../data/recipes.js";

/**
 * @param {string[]} inventoryIds - ids d'ingrédients possédés
 * @param {object} recipe
 * @returns {{ score: number, missing: string[], have: string[], cookableNow: boolean }}
 */
export function matchRecipe(inventoryIds, recipe) {
  const inventorySet = new Set(inventoryIds);
  const have = recipe.ingredients.filter((id) => inventorySet.has(id));
  const missing = recipe.ingredients.filter((id) => !inventorySet.has(id));
  const score = recipe.ingredients.length === 0 ? 0 : have.length / recipe.ingredients.length;
  return {
    score,
    have,
    missing,
    cookableNow: missing.length === 0,
  };
}

/**
 * Retourne toutes les recettes annotées avec leur score de matching, triées
 * par "cuisinable maintenant" d'abord puis par score décroissant.
 */
export function rankRecipes(inventoryIds, recipes, filters = {}) {
  const annotated = recipes.map((recipe) => ({
    recipe,
    ...matchRecipe(inventoryIds, recipe),
  }));

  const filtered = annotated.filter(({ recipe }) => {
    if (filters.vegetarien && !recipe.vegetarien) return false;
    if (filters.rapide && !recipeIsQuick(recipe)) return false;
    if (filters.sansGluten && !recipeIsGlutenFree(recipe)) return false;
    if (filters.difficulty && recipe.difficulty !== filters.difficulty) return false;
    if (filters.maxTime && recipe.time > filters.maxTime) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.cookableNow !== b.cookableNow) return a.cookableNow ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    // à score égal, on privilégie la recette avec le moins d'ingrédients manquants au total
    return a.missing.length - b.missing.length;
  });

  return filtered;
}

/**
 * Quand aucune recette n'est "cuisinable maintenant", suggère les ingrédients
 * à acheter qui débloqueraient le plus de recettes (quick wins).
 */
export function suggestIngredientsToUnlock(inventoryIds, recipes, limit = 6) {
  const inventorySet = new Set(inventoryIds);
  const missingCount = new Map();

  for (const recipe of recipes) {
    const missing = recipe.ingredients.filter((id) => !inventorySet.has(id));
    // on ne compte que les recettes "presque prêtes" (il manque 1 ou 2 ingrédients)
    if (missing.length > 0 && missing.length <= 2) {
      for (const id of missing) {
        missingCount.set(id, (missingCount.get(id) || 0) + 1);
      }
    }
  }

  return [...missingCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, unlocksCount]) => ({ id, unlocksCount }));
}
