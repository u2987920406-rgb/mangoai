import { cn } from "../lib/utils.js";
import { LockIcon, HourglassIcon, StarIcon } from "./icons.jsx";

// Couleur de thème (token @theme) → valeur HSL utilisable inline.
function colorVar(color, alpha) {
  return `hsl(var(--color-${color})${alpha != null ? ` / ${alpha}` : ""})`;
}

// Nœud d'un module sur la carte de parcours (style Duolingo).
//   états : verrouillé 🔒 · bientôt 🕒 · courant (pulse) · complété (étoiles)
export function ModuleNode({ module, progress, unlocked, playable, isNext, offset, onClick }) {
  const stars = progress?.stars || 0;
  const completed = progress?.completed;
  const locked = !unlocked;
  const active = !locked && playable;

  let style;
  if (active && completed) {
    style = { backgroundColor: "hsl(var(--color-primary) / 0.15)", borderColor: "hsl(var(--color-primary))", color: "hsl(var(--color-primary))" };
  } else if (active) {
    style = { backgroundColor: colorVar(module.color, 0.15), borderColor: colorVar(module.color) };
  }

  return (
    <div className={cn("flex items-center gap-4", offset === "right" && "flex-row-reverse text-right")}>
      {/* Pastille */}
      <button
        onClick={() => active && onClick(module)}
        disabled={!active}
        style={style}
        className={cn(
          "relative flex items-center justify-center w-16 h-16 rounded-2xl text-2xl font-bold shrink-0 border-2 transition-all",
          !active && "bg-muted border-border text-muted-foreground cursor-not-allowed",
          active && "hover:scale-105",
          isNext && active && "ring-4 ring-accent/40 animate-pulse-mango"
        )}
        aria-label={module.title}
      >
        {locked ? <LockIcon size={22} /> : !playable ? <HourglassIcon size={22} /> : module.emoji}
        {completed && (
          <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex gap-0.5 px-1 py-0.5 rounded-full bg-card border border-border shadow-sm">
            {[1, 2, 3].map((n) => (
              <StarIcon key={n} size={10} className={cn(n <= stars ? "text-accent-strong" : "text-border")} />
            ))}
          </span>
        )}
      </button>

      {/* Étiquette */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">Semaine {module.week}</div>
        <div className={cn("font-bold truncate", locked && "text-muted-foreground")}>{module.title}</div>
        <div className="text-xs text-muted-foreground">
          {locked ? "Verrouillé" : !playable ? "Bientôt disponible" : completed ? "Complété" : isNext ? "À faire maintenant" : "Disponible"}
        </div>
      </div>
    </div>
  );
}
