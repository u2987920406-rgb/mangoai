import { PART_NAME, PART_EMOJI } from "../data/curriculum.js";
import { cn } from "../lib/utils.js";

// Barre de maîtrise d'une partie TOEIC (P1-P7) — diagnostic.
export function PartBar({ part, correct, total }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const tone = total === 0 ? "bg-muted-foreground/30" : pct >= 80 ? "bg-primary" : pct >= 55 ? "bg-accent" : "bg-coral";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium flex items-center gap-1.5">
          <span>{PART_EMOJI[part]}</span>
          {PART_NAME[part]}
        </span>
        <span className={cn("tabular-nums font-bold", total === 0 && "text-muted-foreground")}>
          {total > 0 ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${total > 0 ? pct : 3}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{total > 0 ? `${correct}/${total} questions` : "Pas encore travaillé"}</div>
    </div>
  );
}
