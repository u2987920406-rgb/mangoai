import { SlidersHorizontal } from "lucide-react";
import { cn } from "../lib/utils.js";

const TOGGLES = [
  { key: "vegetarien", label: "Végétarien" },
  { key: "rapide", label: "Rapide < 20 min" },
  { key: "sansGluten", label: "Sans gluten" },
];

const DIFFICULTIES = ["facile", "moyen", "difficile"];

export function FiltersBar({ filters, onChange }) {
  function toggle(key) {
    onChange({ ...filters, [key]: !filters[key] });
  }

  function setDifficulty(level) {
    onChange({ ...filters, difficulty: filters.difficulty === level ? null : level });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <SlidersHorizontal className="h-4 w-4" />
        Filtres
      </span>
      {TOGGLES.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => toggle(t.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            filters[t.key]
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-secondary",
          )}
        >
          {t.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      {DIFFICULTIES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDifficulty(d)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm capitalize transition-colors",
            filters.difficulty === d
              ? "border-primary bg-accent text-accent-foreground"
              : "border-border bg-background hover:bg-secondary",
          )}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
