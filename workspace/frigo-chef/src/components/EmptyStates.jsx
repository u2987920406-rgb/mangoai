import { Camera, ChefHat, ShoppingBasket } from "lucide-react";
import { findIngredient } from "../data/ingredients.js";
import { Button } from "./ui/button.jsx";

export function OnboardingEmpty({ onOpenScan }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative h-48 sm:h-64">
        <img
          src="/assets/hero/frigo-ouvert.jpg"
          alt="Frigo ouvert avec des légumes frais"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-4 bottom-4 sm:inset-x-6">
          <p className="font-display text-2xl font-bold text-white drop-shadow sm:text-3xl">
            Ton frigo est vide pour l'instant
          </p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-4 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground sm:text-base">
          Ajoute quelques ingrédients — à la main ou en scannant une photo — et on te propose
          aussitôt des plats à cuisiner avec ce que tu as sous la main.
        </p>
        <Button onClick={onOpenScan} size="lg">
          <Camera className="h-4 w-4" />
          Scanner mon frigo
        </Button>
      </div>
    </div>
  );
}

export function NoRecipePossible({ suggestions, onAddIngredient }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-6 text-center sm:p-8">
      <ChefHat className="mx-auto mb-3 h-9 w-9 text-primary" />
      <h3 className="mb-1.5 font-display text-lg font-semibold">
        Aucune recette ne colle encore avec tes filtres
      </h3>
      <p className="mx-auto mb-5 max-w-md text-sm text-muted-foreground">
        Ajoute un de ces ingrédients pour débloquer plusieurs recettes d'un coup :
      </p>
      <div className="mx-auto flex max-w-lg flex-wrap justify-center gap-2">
        {suggestions.map(({ id, unlocksCount }) => {
          const ing = findIngredient(id);
          if (!ing) return null;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onAddIngredient(id)}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <img src={ing.image} alt="" className="h-6 w-6 rounded-full object-cover" />
              {ing.label}
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                +{unlocksCount}
              </span>
            </button>
          );
        })}
      </div>
      {suggestions.length === 0 && (
        <div className="mx-auto flex max-w-sm items-center gap-2 justify-center text-sm text-muted-foreground">
          <ShoppingBasket className="h-4 w-4" />
          Essaie d'assouplir tes filtres pour voir plus de suggestions.
        </div>
      )}
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-border bg-card">
          <div className="aspect-[4/3] bg-secondary" />
          <div className="space-y-2 p-3.5">
            <div className="h-3.5 w-3/4 rounded bg-secondary" />
            <div className="h-2.5 w-1/2 rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}
