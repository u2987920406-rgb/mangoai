import { LEVELS, LEVEL_ORDER, modulesForLevel, isModuleUnlocked, nextRecommendedModule } from "../data/curriculum.js";
import { isModulePlayable } from "../data/bank/index.js";
import { ModuleNode } from "./ModuleNode.jsx";
import { ScoreDisplay } from "./Gamification.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { cn } from "../lib/utils.js";

// Carte de parcours « 1 an » : chemin vertical type Duolingo pour un niveau.
export function CurriculumMap({ progress, level, onOpenModule, onChangeLevel, onBack }) {
  const { state } = progress;
  const mods = modulesForLevel(level);
  const lvl = LEVELS[level];
  const next = nextRecommendedModule(state);
  const levelIds = Object.keys(LEVELS);
  const idx = levelIds.indexOf(level);

  return (
    <div className="py-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>← Niveaux</Button>
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <Button variant="outline" size="sm" onClick={() => onChangeLevel(levelIds[idx - 1])}>← {LEVELS[levelIds[idx - 1]].name}</Button>
          )}
          {idx < levelIds.length - 1 && LEVEL_ORDER[levelIds[idx + 1]] <= LEVEL_ORDER[state.unlockedLevel || "debutant"] && (
            <Button variant="outline" size="sm" onClick={() => onChangeLevel(levelIds[idx + 1])}>{LEVELS[levelIds[idx + 1]].name} →</Button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-accent/5 to-coral/5 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{lvl.emoji}</span>
            <h1 className="text-2xl font-extrabold">Niveau {lvl.name}</h1>
          </div>
          <p className="text-muted-foreground mt-1">Semaines {lvl.weeks} · score visé {lvl.scoreRange}</p>
          <Badge variant="secondary" className="mt-2">
            {mods.filter((m) => state.moduleProgress?.[m.id]?.completed).length}/{mods.length} modules complétés
          </Badge>
        </div>
        <ScoreDisplay score={state.estimatedScore} size="md" />
      </div>

      {/* Chemin de modules */}
      <div className="relative space-y-5 max-w-2xl mx-auto">
        {mods.map((mod, i) => {
          const unlocked = isModuleUnlocked(mod, state);
          const playable = isModulePlayable(mod.id);
          return (
            <div key={mod.id} className="relative">
              {i < mods.length - 1 && (
                <div className={cn("absolute left-8 top-16 w-0.5 h-5 -translate-x-1/2", unlocked ? "bg-accent/40" : "bg-border")} />
              )}
              <ModuleNode
                module={mod}
                progress={state.moduleProgress?.[mod.id]}
                unlocked={unlocked}
                playable={playable}
                isNext={next?.id === mod.id}
                offset={i % 2 === 0 ? "left" : "right"}
                onClick={onOpenModule}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
