import { useMemo, useState } from "react";
import { Search, Plus, Check, Camera } from "lucide-react";
import { CATEGORIES, INGREDIENTS } from "../data/ingredients.js";
import { Input } from "./ui/input.jsx";
import { cn } from "../lib/utils.js";

export function IngredientPicker({ inventoryIds, onAdd, onOpenScan }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);

  const inventorySet = useMemo(() => new Set(inventoryIds), [inventoryIds]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return INGREDIENTS.filter(
      (ing) => ing.label.toLowerCase().includes(q) && !inventorySet.has(ing.id),
    ).slice(0, 8);
  }, [query, inventorySet]);

  const categoryItems = useMemo(
    () => INGREDIENTS.filter((ing) => ing.category === activeCategory),
    [activeCategory],
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-xl font-semibold">Qu'as-tu dans ton frigo ?</h2>
        <button
          type="button"
          onClick={onOpenScan}
          className="inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 sm:self-auto"
        >
          <Camera className="h-4 w-4" />
          Scanner une photo
        </button>
      </div>

      {/* Recherche autocomplétée */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cherche un ingrédient (ex. tomate, saumon, riz...)"
          className="pl-9"
          aria-label="Rechercher un ingrédient"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            {suggestions.map((ing) => (
              <li key={ing.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(ing.id);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <img
                    src={ing.image}
                    alt=""
                    className="h-8 w-8 rounded-md object-cover"
                  />
                  <span className="flex-1">{ing.label}</span>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Onglets de catégories */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              activeCategory === cat.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70",
            )}
          >
            <span className="mr-1">{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grille visuelle de la banque */}
      <div data-testid="ingredient-bank" className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {categoryItems.map((ing) => {
          const owned = inventorySet.has(ing.id);
          return (
            <button
              key={ing.id}
              type="button"
              onClick={() => onAdd(ing.id)}
              disabled={owned}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-all",
                owned
                  ? "border-primary/40 bg-accent cursor-default"
                  : "border-border bg-background hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
              )}
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-full ring-1 ring-border sm:h-16 sm:w-16">
                <img src={ing.image} alt={ing.label} className="h-full w-full object-cover" />
                {owned && (
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/60">
                    <Check className="h-6 w-6 text-primary-foreground" strokeWidth={3} />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium leading-tight">{ing.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
