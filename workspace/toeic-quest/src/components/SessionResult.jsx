import { useState, useEffect } from "react";
import { Mascot } from "./Mascot.jsx";
import { Confetti } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { cn } from "../lib/utils.js";
import { MODE_INFO } from "../data/questions.js";
import { getQuestionById } from "../data/bank/index.js";
import { CheckIcon, XIcon, BulbIcon, HomeIcon, RefreshIcon } from "./icons.jsx";

// ─── Écran de fin de session animé ───────────────────────────────────────────
export function SessionResult({ session, onBackHome, onRetry }) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [animatedXP, setAnimatedXP] = useState(0);

  const { mode, total, correct, xpEarned, timedOut } = session;
  const modeInfo = MODE_INFO[mode] || { emoji: "🎯", name: "Session" };
  const accuracy = Math.round((correct / total) * 100);
  const isPerfect = correct === total;
  const isGood = accuracy >= 70;

  useEffect(() => {
    if (isPerfect || isGood) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    }
  }, [isPerfect, isGood]);

  // Animate XP counter
  useEffect(() => {
    const duration = 1200;
    const steps = 30;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setAnimatedXP(Math.round((xpEarned * step) / steps));
      if (step >= steps) {
        clearInterval(timer);
        setAnimatedXP(xpEarned);
      }
    }, interval);
    return () => clearInterval(timer);
  }, [xpEarned]);

  const mascotMood = isPerfect ? "celebrating" : isGood ? "excited" : correct > 0 ? "happy" : "sad";
  const mascotMsg = isPerfect
    ? "PARFAIT ! Toutes les réponses sont correctes. Tu es un champion !"
    : isGood
    ? `Super travail ! ${correct} sur ${total} ! Continue comme ça !`
    : correct > 0
    ? `Bon début ! ${correct} sur ${total}. On s'améliore à chaque session !`
    : "Ne te décourage pas ! Chaque erreur est une leçon. Réessaie !";

  const wrongResults = session.results?.filter((r) => !r.correct) || [];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8 space-y-6">
      <Confetti show={showConfetti} count={40} />

      {/* Header */}
      <div className="text-center pt-8 animate-bounce-in">
        <Mascot mood={mascotMood} size={120} className="mx-auto" />
        <h1 className="font-display text-3xl sm:text-4xl font-bold mt-4">
          {isPerfect ? "Session parfaite !" : timedOut ? "Temps écoulé !" : "Session terminée !"}
        </h1>
        <p className="text-muted-foreground mt-2">{mascotMsg}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="animate-fade-in-up delay-1">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold tabular-nums text-primary">{correct}/{total}</div>
            <div className="text-xs text-muted-foreground mt-1">Bonnes réponses</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-2">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold tabular-nums text-accent-strong">{accuracy}%</div>
            <div className="text-xs text-muted-foreground mt-1">Précision</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-3">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold tabular-nums text-coral">+{animatedXP}</div>
            <div className="text-xs text-muted-foreground mt-1">XP gagnés</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-4">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl">{modeInfo.emoji}</div>
            <div className="text-xs text-muted-foreground mt-1">{modeInfo.name}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress visual bar */}
      <Card className="animate-fade-in-up delay-2">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Réussite</span>
            <span className="text-sm font-bold tabular-nums">{accuracy}%</span>
          </div>
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out",
                isPerfect ? "bg-gradient-to-r from-primary via-accent to-coral" :
                isGood ? "bg-gradient-to-r from-primary to-accent" :
                "bg-gradient-to-r from-destructive/60 to-accent/60"
              )}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Revue des erreurs : énoncé, ta réponse, la bonne, l'explication */}
      {wrongResults.length > 0 && (
        <Card className="animate-fade-in-up delay-3" data-testid="review-card">
          <CardContent className="pt-6">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <BulbIcon size={18} className="text-accent-strong" />
              Réponses à revoir ({wrongResults.length})
            </h3>
            <div className="space-y-4">
              {wrongResults.map((r, i) => {
                const q = getQuestionById(r.questionId);
                if (!q) {
                  return (
                    <div key={i} className="p-3 rounded-xl bg-destructive/5 border border-destructive/20 text-sm text-muted-foreground">
                      Question {r.questionId} — détail indisponible.
                    </div>
                  );
                }
                const given = q.choices?.[r.selected];
                const good = q.choices?.[q.answer];
                return (
                  <div key={i} data-testid="review-item" className="rounded-2xl border border-border overflow-hidden">
                    {/* Énoncé (+ contexte phrase à trous le cas échéant) */}
                    <div className="p-4 bg-muted/40 space-y-1">
                      {q.sentence && <p className="text-sm text-muted-foreground italic leading-relaxed">{q.sentence}</p>}
                      <p className="font-semibold text-sm" data-testid="review-question">{q.question || "Choisissez la bonne réponse"}</p>
                    </div>
                    <div className="p-4 space-y-2.5">
                      {/* Ta réponse */}
                      <div className="flex items-start gap-2.5 text-sm">
                        <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-destructive/10 text-destructive shrink-0">
                          <XIcon size={11} />
                        </span>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground block">Ta réponse</span>
                          <span className="text-destructive font-medium" data-testid="review-given">{given ?? "—"}</span>
                        </div>
                      </div>
                      {/* Bonne réponse */}
                      <div className="flex items-start gap-2.5 text-sm">
                        <span className="mt-0.5 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary shrink-0">
                          <CheckIcon size={11} />
                        </span>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground block">Bonne réponse</span>
                          <span className="text-primary font-medium" data-testid="review-correct">{good ?? "—"}</span>
                        </div>
                      </div>
                      {/* Explication */}
                      {q.explanation && (
                        <p className="text-sm text-muted-foreground leading-relaxed pt-1 border-t border-border" data-testid="review-explanation">
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in-up delay-4">
        <Button onClick={onRetry} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
          <RefreshIcon size={16} /> Refaire ce mode
        </Button>
        <Button onClick={onBackHome} size="lg" variant="outline" className="gap-2">
          <HomeIcon size={16} /> Retour au tableau de bord
        </Button>
      </div>
    </div>
  );
}
