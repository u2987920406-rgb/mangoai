import { getModule, PART_NAME, PART_EMOJI, LEVELS } from "../data/curriculum.js";
import { availableForModule, isModulePlayable } from "../data/bank/index.js";
import { Mascot } from "./Mascot.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { cn } from "../lib/utils.js";
import { StarIcon, PlayIcon, HourglassIcon } from "./icons.jsx";

// Écran d'un module : objectif, parties travaillées, conseils, lancement de session.
export function ModuleScreen({ progress, moduleId, useTimer, onToggleTimer, onStart, onBack }) {
  const mod = getModule(moduleId);
  if (!mod) return <div className="p-8 text-center text-muted-foreground">Module introuvable.</div>;

  const { state } = progress;
  const prog = state.moduleProgress?.[moduleId];
  const available = availableForModule(moduleId);
  const playable = isModulePlayable(moduleId);
  const sessionSize = Math.min(mod.skill === "mixed" ? 12 : 10, available);

  return (
    <div className="py-6 space-y-5 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={onBack}>← Carte du parcours</Button>

      {/* En-tête module */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="text-5xl">{mod.emoji}</div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                {LEVELS[mod.level].name} · Semaine {mod.week}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">{mod.title}</h1>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {mod.parts.map((p) => (
                  <Badge key={p} variant="secondary" title={PART_NAME[p]}>{PART_EMOJI[p]} {p}</Badge>
                ))}
              </div>
            </div>
            {prog?.completed && (
              <div className="text-right">
                <div className="flex gap-0.5 justify-end">
                  {[1, 2, 3].map((n) => (
                    <StarIcon key={n} size={18} className={cn(n <= (prog.stars || 0) ? "text-accent-strong" : "text-border")} />
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{Math.round((prog.bestAccuracy || 0) * 100)}% au mieux</div>
              </div>
            )}
          </div>

          <p className="text-foreground">{mod.goal}</p>

          {/* Conseil */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/20">
            <Mascot mood="thinking" size={44} />
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-accent-strong mb-1">Conseil de Mango</div>
              <p className="text-sm text-muted-foreground">{mod.tips}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lancement */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">Session d'entraînement</div>
              <div className="text-sm text-muted-foreground">
                {playable ? `${sessionSize} questions tirées de ce module` : `Seulement ${available} question(s) disponible(s) — bientôt enrichi`}
              </div>
            </div>
            <Badge variant="secondary">{available} dispo.</Badge>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{mod.isExam ? "Examen chronométré" : "Mode examen (timer)"}</span>
            <button
              onClick={onToggleTimer}
              role="switch"
              aria-checked={useTimer}
              aria-label="Activer le mode examen chronométré"
              className={cn("relative w-12 h-6 rounded-full transition-colors", useTimer ? "bg-accent" : "bg-muted")}
            >
              <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", useTimer ? "translate-x-6" : "translate-x-0.5")} />
            </button>
          </div>

          <Button
            onClick={() => onStart(mod, sessionSize)}
            disabled={!playable}
            size="lg"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2"
            data-testid="start-session"
          >
            {playable ? <><PlayIcon size={15} /> Commencer la session</> : <><HourglassIcon size={15} /> Bientôt disponible</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
