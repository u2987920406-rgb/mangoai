import { useState, useEffect } from "react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Badge } from "./ui/badge.jsx";
import { MangoMascot } from "./MangoMascot.jsx";
import { Confetti } from "./Gamification.jsx";
import { MODES } from "../data/gamification.js";

// ── Session Results Screen ───────────────────────────────────────────────────
export function SessionResults({ session, onRetry, onHome, newBadges = [] }) {
  const { mode, correct, total, xpGained, perfect, answers } = session;
  const [showConfetti, setShowConfetti] = useState(false);
  const [animatedXP, setAnimatedXP] = useState(0);
  const [animatedCorrect, setAnimatedCorrect] = useState(0);

  const modeInfo = MODES[mode];
  const percentage = Math.round((correct / total) * 100);
  const isGood = percentage >= 70;
  const isPerfect = perfect;

  // ── Animations on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isGood) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [isGood]);

  // Animate XP counter
  useEffect(() => {
    const duration = 1200;
    const steps = 30;
    const stepDuration = duration / steps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setAnimatedXP(Math.round((xpGained * step) / steps));
      setAnimatedCorrect(Math.round((correct * step) / steps));
      if (step >= steps) {
        clearInterval(interval);
        setAnimatedXP(xpGained);
        setAnimatedCorrect(correct);
      }
    }, stepDuration);
    return () => clearInterval(interval);
  }, [xpGained, correct]);

  const mascotMood = isPerfect ? "celebrating" : isGood ? "happy" : "encouraging";
  const mascotMessage = isPerfect
    ? "Sans faute ! Tu es un champion ! 🏆"
    : isGood
    ? "Excellent travail ! Continue comme ça ! 🌟"
    : "Ne lâche rien, tu progresses ! 💪";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {showConfetti && <Confetti count={40} />}

      {/* Header with mascot */}
      <div className="mb-6 flex flex-col items-center text-center animate-bounce-in">
        <MangoMascot mood={mascotMood} size={120} />
        <h2 className="mt-2 text-2xl font-extrabold text-foreground">{mascotMessage}</h2>
        <Badge className="mt-2 bg-[hsl(var(--mango))] text-white hover:bg-[hsl(var(--mango))]">
          {modeInfo?.icon} {modeInfo?.label}
        </Badge>
      </div>

      {/* Score circle */}
      <Card className="mb-4 animate-scale-in overflow-hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={isGood ? "hsl(var(--reading))" : "hsl(var(--mango))"}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - percentage / 100)}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="text-center">
                <div className="text-3xl font-extrabold text-foreground">{animatedCorrect}/{total}</div>
                <div className="text-xs text-muted-foreground">{percentage}%</div>
              </div>
            </div>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              {correct === total ? "Réussite parfaite !" : `${total - correct} erreur${total - correct > 1 ? "s" : ""}`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* XP gained */}
      <Card className="mb-4 animate-fade-in-up delay-1">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="font-semibold text-foreground">XP gagné</span>
          </div>
          <span className="text-2xl font-extrabold text-[hsl(var(--mango))]">+{animatedXP}</span>
        </CardContent>
      </Card>

      {/* New badges */}
      {newBadges.length > 0 && (
        <Card className="mb-4 animate-bounce-in delay-2 border-2 border-[hsl(var(--mango))]/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              🏅 Nouveau{newBadges.length > 1 ? "x" : ""} badge{newBadges.length > 1 ? "s" : ""} débloqué{newBadges.length > 1 ? "s" : ""} !
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {newBadges.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-xl border border-[hsl(var(--mango))] bg-[hsl(var(--mango))]/10 px-3 py-2">
                <span className="text-2xl">{b.icon}</span>
                <div>
                  <div className="text-sm font-bold text-foreground">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.description}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Answer review */}
      <Card className="mb-4 animate-fade-in-up delay-3">
        <CardHeader>
          <CardTitle className="text-base">Récapitulatif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${a.correct ? "bg-[hsl(var(--reading))] text-white" : "bg-[hsl(var(--coral))] text-white"}`}>
                {a.correct ? "✓" : "✗"}
              </span>
              <span className="text-muted-foreground">Question {i + 1}</span>
              <span className={`ml-auto text-xs font-medium ${a.correct ? "text-[hsl(var(--reading))]" : "text-[hsl(var(--coral))]"}`}>
                {a.correct ? "Correct" : "Incorrect"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 animate-fade-in-up delay-4">
        <Button onClick={onRetry} variant="outline" className="flex-1">
          🔄 Recommencer
        </Button>
        <Button onClick={onHome} className="flex-1 bg-[hsl(var(--mango))] text-white hover:bg-[hsl(var(--mango))]/90">
          🏠 Accueil
        </Button>
      </div>
    </div>
  );
}