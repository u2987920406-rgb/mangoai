import { Clock, Users, Flame, CheckCircle2 } from "lucide-react";
import { findIngredient } from "../data/ingredients.js";
import { cn } from "../lib/utils.js";

export function RecipeCard({ recipe, score, missing, cookableNow, onOpen }) {
  const pct = Math.round(score * 100);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        cookableNow
          ? "border-primary/50 ring-2 ring-primary/35 shadow-md shadow-primary/10"
          : "border-border",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={recipe.dishImage}
          alt={recipe.name}
          className={cn(
            "h-full w-full object-cover transition-all duration-300 group-hover:scale-105",
            !cookableNow && pct < 30 && "saturate-[0.88] group-hover:saturate-100",
          )}
        />
        {cookableNow ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-md">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Cuisinable maintenant
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded-full border border-border/60 bg-card/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
            {pct}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base font-semibold leading-snug">{recipe.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {recipe.time} min
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {recipe.portions} pers.
          </span>
          <span className="flex items-center gap-1 capitalize">
            <Flame className="h-3.5 w-3.5" /> {recipe.difficulty}
          </span>
        </div>

        {!cookableNow && missing.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {missing.slice(0, 3).map((id) => {
              const ing = findIngredient(id);
              return (
                <span
                  key={id}
                  className={cn(
                    "rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground",
                  )}
                >
                  + {ing?.label}
                </span>
              );
            })}
            {missing.length > 3 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                +{missing.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
