import { X, Clock, Users, Flame, CheckCircle2, ShoppingBasket } from "lucide-react";
import { findIngredient } from "../data/ingredients.js";
import { cn } from "../lib/utils.js";

export function RecipeDetail({ recipe, have, missing, cookableNow, onClose }) {
  if (!recipe) return null;

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-modal-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl">
        <div className="relative h-52 shrink-0 sm:h-64">
          <img src={recipe.dishImage} alt={recipe.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-4 bottom-3">
            <h2 className="font-display text-2xl font-bold text-white drop-shadow-sm sm:text-3xl">
              {recipe.name}
            </h2>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {recipe.time} min
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {recipe.portions} portions
            </span>
            <span className="flex items-center gap-1.5 capitalize">
              <Flame className="h-4 w-4" /> {recipe.difficulty}
            </span>
            {recipe.vegetarien && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                Végétarien
              </span>
            )}
          </div>

          {cookableNow ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
              Tu as tout ce qu'il faut pour cuisiner ce plat maintenant !
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBasket className="h-4 w-4" />
                Il te manque {missing.length} ingrédient{missing.length > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missing.map((id) => {
                  const ing = findIngredient(id);
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1 rounded-full bg-background px-2 py-1 text-xs"
                    >
                      <img src={ing?.image} alt="" className="h-4 w-4 rounded-full object-cover" />
                      {ing?.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <section className="mb-5">
            <h3 className="mb-2 font-display text-base font-semibold">Ingrédients</h3>
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {recipe.ingredients.map((id) => {
                const ing = findIngredient(id);
                const owned = have.includes(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      owned ? "bg-accent/60" : "bg-secondary/50 text-muted-foreground",
                    )}
                  >
                    <img src={ing?.image} alt="" className="h-6 w-6 rounded-full object-cover" />
                    <span className="truncate">{ing?.label}</span>
                    {owned && <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-display text-base font-semibold">Étapes</h3>
            <ol className="space-y-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
