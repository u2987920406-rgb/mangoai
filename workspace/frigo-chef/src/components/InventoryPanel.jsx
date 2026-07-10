import { useMemo } from "react";
import { Trash2, AlertTriangle, CalendarClock } from "lucide-react";
import { findIngredient } from "../data/ingredients.js";
import { cn } from "../lib/utils.js";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function urgencyStyle(days) {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-destructive font-semibold";
  if (days <= 2) return "text-destructive font-semibold";
  if (days <= 5) return "text-primary font-medium";
  return "text-muted-foreground";
}

export function InventoryPanel({ inventory, onRemove, onSetExpiry }) {
  const sorted = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const da = a.expiry ? daysUntil(a.expiry) : Infinity;
      const db = b.expiry ? daysUntil(b.expiry) : Infinity;
      return da - db;
    });
  }, [inventory]);

  if (inventory.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
        Ton inventaire est vide pour l'instant — ajoute des ingrédients ci-dessus.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">
          Ton inventaire <span className="text-muted-foreground">({inventory.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-border">
        {sorted.map((item) => {
          const ing = findIngredient(item.id);
          if (!ing) return null;
          const days = item.expiry ? daysUntil(item.expiry) : null;
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <img src={ing.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ing.label}</p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={item.expiry || ""}
                    onChange={(e) => onSetExpiry(item.id, e.target.value || null)}
                    title="Date limite de consommation"
                    className={cn(
                      "rounded border-none bg-transparent text-xs outline-none transition-opacity [color-scheme:light]",
                      item.expiry
                        ? "text-muted-foreground"
                        : "text-muted-foreground opacity-35 hover:opacity-80 focus:opacity-100",
                    )}
                  />
                  {days !== null && (
                    <span className={cn("flex items-center gap-1 text-xs", urgencyStyle(days))}>
                      {days <= 2 && <AlertTriangle className="h-3.5 w-3.5" />}
                      {days < 0
                        ? `Périmé depuis ${Math.abs(days)} j`
                        : days === 0
                          ? "À consommer aujourd'hui"
                          : `${days} j restants`}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Retirer ${ing.label}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
