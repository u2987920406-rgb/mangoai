// De ton frigo à l'assiette en 3 gestes.
// Ajoute ce que tu as (à la main ou par scan simulé), et l'app te propose
// les plats les plus « cuisinables maintenant » parmi une base de vraies recettes.
/* palette anchor: warm appetizing kitchen */
import { useEffect, useMemo, useState } from "react";

import { Header } from "./components/Header.jsx";
import { IngredientPicker } from "./components/IngredientPicker.jsx";
import { ScanModal } from "./components/ScanModal.jsx";
import { InventoryPanel } from "./components/InventoryPanel.jsx";
import { FiltersBar } from "./components/FiltersBar.jsx";
import { RecipeCard } from "./components/RecipeCard.jsx";
import { RecipeDetail } from "./components/RecipeDetail.jsx";
import { OnboardingEmpty, NoRecipePossible, LoadingState } from "./components/EmptyStates.jsx";

import { RECIPES } from "./data/recipes.js";
import { rankRecipes, suggestIngredientsToUnlock } from "./lib/matching.js";

const DEFAULT_FILTERS = { vegetarien: false, rapide: false, sansGluten: false, difficulty: null };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState([]); // [{ id, expiry }]
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [scanOpen, setScanOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const inventoryIds = useMemo(() => inventory.map((i) => i.id), [inventory]);

  const ranked = useMemo(
    () => rankRecipes(inventoryIds, RECIPES, filters),
    [inventoryIds, filters],
  );

  const unlockSuggestions = useMemo(
    () => suggestIngredientsToUnlock(inventoryIds, RECIPES),
    [inventoryIds],
  );

  const selected = useMemo(
    () => ranked.find((r) => r.recipe.id === selectedId),
    [ranked, selectedId],
  );

  function addIngredient(id) {
    setInventory((prev) => (prev.some((i) => i.id === id) ? prev : [...prev, { id, expiry: null }]));
  }

  function addManyIngredients(ids) {
    setInventory((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const additions = ids.filter((id) => !existing.has(id)).map((id) => ({ id, expiry: null }));
      return [...prev, ...additions];
    });
  }

  function removeIngredient(id) {
    setInventory((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function setExpiry(id, date) {
    setInventory((prev) => prev.map((i) => (i.id === id ? { ...i, expiry: date } : i)));
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {inventory.length === 0 && !loading ? (
          <div className="mb-8">
            <OnboardingEmpty onOpenScan={() => setScanOpen(true)} />
          </div>
        ) : null}

        <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <IngredientPicker
            inventoryIds={inventoryIds}
            onAdd={addIngredient}
            onOpenScan={() => setScanOpen(true)}
          />
          <InventoryPanel inventory={inventory} onRemove={removeIngredient} onSetExpiry={setExpiry} />
        </div>

        {inventory.length > 0 && (
          <>
            <div className="mb-4 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Suggestions{" "}
                <span className="font-body text-sm font-normal text-muted-foreground">
                  ({ranked.filter((r) => r.cookableNow).length} à cuisiner tout de suite)
                </span>
              </h2>
              <FiltersBar filters={filters} onChange={setFilters} />
            </div>

            {loading ? (
              <LoadingState />
            ) : ranked.length === 0 ? (
              <NoRecipePossible suggestions={unlockSuggestions} onAddIngredient={addIngredient} />
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
                {ranked.map(({ recipe, score, missing, cookableNow }) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    score={score}
                    missing={missing}
                    cookableNow={cookableNow}
                    onOpen={() => setSelectedId(recipe.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Frigo Chef — {RECIPES.length} recettes, matché sur ton inventaire réel.
      </footer>

      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} onConfirm={addManyIngredients} />

      {selected && (
        <RecipeDetail
          recipe={selected.recipe}
          have={selected.have}
          missing={selected.missing}
          cookableNow={selected.cookableNow}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
