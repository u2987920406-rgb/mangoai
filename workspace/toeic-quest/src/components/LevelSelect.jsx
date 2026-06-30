import { LEVELS, LEVEL_ORDER, modulesForLevel } from "../data/curriculum.js";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { Reveal } from "./Gamification.jsx";
import { cn } from "../lib/utils.js";

// Choix du niveau : 3 cartes (Débutant / Intermédiaire / Avancé).
export function LevelSelect({ progress, onPickLevel, onBack }) {
  const { state } = progress;
  const unlocked = state.unlockedLevel || "debutant";

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold">Ton parcours TOEIC</h1>
        <Button variant="ghost" size="sm" onClick={onBack}>← Accueil</Button>
      </div>
      <p className="text-muted-foreground">Un an de préparation, 7 parties officielles, vers le score 800+. Choisis ton niveau.</p>

      <div className="grid gap-4 sm:grid-cols-3">
        {Object.values(LEVELS).map((lvl, i) => {
          const mods = modulesForLevel(lvl.id);
          const done = mods.filter((m) => state.moduleProgress?.[m.id]?.completed).length;
          const isLocked = LEVEL_ORDER[lvl.id] > LEVEL_ORDER[unlocked];
          const pct = Math.round((done / mods.length) * 100);
          return (
            <Reveal key={lvl.id} delay={i * 100}>
              <Card className={cn("transition-all", !isLocked && "hover:shadow-lg hover:-translate-y-1 cursor-pointer", isLocked && "opacity-70")}>
                <CardContent className="pt-6 space-y-3" onClick={() => !isLocked && onPickLevel(lvl.id)}>
                  <div className="flex items-center justify-between">
                    <div className="text-4xl">{isLocked ? "🔒" : lvl.emoji}</div>
                    <Badge variant="secondary">Sem. {lvl.weeks}</Badge>
                  </div>
                  <h3 className="font-bold text-lg">{lvl.name}</h3>
                  <div className="text-sm text-muted-foreground">Score visé : {lvl.scoreRange}</div>
                  <div className="text-sm text-muted-foreground">{mods.length} modules</div>
                  {!isLocked ? (
                    <>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{done}/{mods.length} complétés</span>
                        <span className="text-accent-strong font-bold text-sm">Ouvrir →</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">Réussis le bilan du niveau précédent pour débloquer.</div>
                  )}
                </CardContent>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
