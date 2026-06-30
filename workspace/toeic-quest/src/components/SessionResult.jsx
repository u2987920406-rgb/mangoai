import { useState, useEffect } from "react";
import { Mascot } from "./Mascot.jsx";
import { Confetti } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { cn } from "../lib/utils.js";
import { MODE_INFO } from "../data/questions.js";

// ─── Écran de fin de session animé ───────────────────────────────────────────
export function SessionResult({ session, onBackHome, onRetry }) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [animatedXP, setAnimatedXP] = useState(0);
  const [animatedScore, setAnimatedScore] = useState(0);

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
    ? "PARFAIT ! Toutes les réponses sont correctes ! Tu es un champion ! 🏆"
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
        <h1 className="text-3xl font-extrabold mt-4">
          {isPerfect ? "Session Parfaite !" : timedOut ? "Temps écoulé !" : "Session terminée !"}
        </h1>
        <p className="text-muted-foreground mt-2">{mascotMsg}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="animate-fade-in-up delay-1">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold text-primary">{correct}/{total}</div>
            <div className="text-xs text-muted-foreground mt-1">Bonnes réponses</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-2">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold text-accent">{accuracy}%</div>
            <div className="text-xs text-muted-foreground mt-1">Précision</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-3">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold text-coral">+{animatedXP}</div>
            <div className="text-xs text-muted-foreground mt-1">XP gagnés</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in-up delay-4">
          <CardContent className="pt-5 text-center">
            <div className="text-3xl font-extrabold">{modeInfo.emoji}</div>
            <div className="text-xs text-muted-foreground mt-1">{modeInfo.name}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress visual bar */}
      <Card className="animate-fade-in-up delay-2">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Réussite</span>
            <span className="text-sm font-bold">{accuracy}%</span>
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

      {/* Wrong answers review */}
      {wrongResults.length > 0 && (
        <Card className="animate-fade-in-up delay-3">
          <CardContent className="pt-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <span>💡</span> Réponses à revoir ({wrongResults.length})
            </h3>
            <div className="space-y-2">
              {wrongResults.map((r, i) => {
                const q = session.results;
                return (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <span className="text-destructive text-lg">✗</span>
                    <span className="text-sm text-muted-foreground">Question {r.questionId}</span>
                    <Badge variant="secondary" className="ml-auto">À revoir</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in-up delay-4">
        <Button onClick={onRetry} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
          🔄 Refaire ce mode
        </Button>
        <Button onClick={onBackHome} size="lg" variant="outline">
          🏠 Retour au tableau de bord
        </Button>
      </div>
    </div>
  );
}