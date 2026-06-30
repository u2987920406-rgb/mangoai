import { Mascot } from "./Mascot.jsx";
import { XPBar, StreakBadge, ScoreDisplay, Reveal } from "./Gamification.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { MODE_INFO, BADGES } from "../data/questions.js";

export function Dashboard({ progress, onStartMode }) {
  const { state, level, xpInLevel, xpForNext } = progress;
  const earnedBadges = BADGES.filter((b) => state.badges.includes(b.id));
  const recentSessions = state.sessionHistory.slice(0, 5);

  // Recommend next lesson based on weakest skill
  const skills = ["listening", "reading", "vocab"];
  const weakest = skills.reduce((min, s) => {
    const stats = state.skillStats[s] || { correct: 0, total: 0 };
    const acc = stats.total > 0 ? stats.correct / stats.total : 1;
    const minStats = state.skillStats[min] || { correct: 0, total: 0 };
    const minAcc = minStats.total > 0 ? minStats.correct / minStats.total : 1;
    return acc < minAcc ? s : min;
  }, "listening");

  const mascotMood = state.streak >= 3 ? "excited" : "happy";
  const mascotMsg = state.totalSessions === 0
    ? "Bienvenue ! Je suis Mango. Prêt à conquérir le TOEIC ? Choisis un mode pour commencer !"
    : state.streak >= 3
    ? `Incroyable ! ${state.streak} jours de suite ! Tu es en feu ! 🔥`
    : `Content de te revoir ! Ton score estimé est de ${state.estimatedScore}. Continuons !`;

  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-accent/5 to-coral/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary border-0">TOEIC QUEST</Badge>
                {state.streak > 0 && <StreakBadge streak={state.streak} />}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Bonjour, futur TOEIC champion ! 👋
              </h1>
              <p className="text-muted-foreground text-lg">
                Prépare-toi au TOEIC de façon ludique. Gagne de l'XP, débloque des badges, grimpe ton score !
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <ScoreDisplay score={state.estimatedScore} size="md" />
                <div className="h-12 w-px bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-extrabold">{state.totalSessions}</div>
                  <div className="text-xs text-muted-foreground">Sessions</div>
                </div>
                <div className="h-12 w-px bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-extrabold">{earnedBadges.length}</div>
                  <div className="text-xs text-muted-foreground">Badges</div>
                </div>
              </div>
            </div>
            <div className="hidden sm:block">
              <Mascot mood={mascotMood} size={140} className="animate-float" />
            </div>
          </div>
        </div>
      </Reveal>

      {/* XP Bar */}
      <Reveal delay={100}>
        <Card>
          <CardContent className="pt-6">
            <XPBar level={level} xpInLevel={xpInLevel} xpForNext={xpForNext} />
          </CardContent>
        </Card>
      </Reveal>

      {/* Next lesson recommendation */}
      <Reveal delay={150}>
        <Card className="border-2 border-accent/30 bg-accent/5">
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="text-4xl">{MODE_INFO[weakest].emoji}</div>
            <div className="flex-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Prochaine leçon recommandée</div>
              <div className="font-bold text-lg">{MODE_INFO[weakest].name}</div>
              <div className="text-sm text-muted-foreground">{MODE_INFO[weakest].description}</div>
            </div>
            <Button onClick={() => onStartMode(weakest)} className="bg-accent text-accent-foreground hover:bg-accent/90">
              S'entraîner →
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      {/* Mode cards */}
      <Reveal delay={200}>
        <h2 className="text-xl font-bold mb-3">Modes d'entraînement</h2>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(MODE_INFO).map(([key, info], i) => (
          <Reveal key={key} delay={250 + i * 100}>
            <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300" >
              <CardContent className="pt-6" onClick={() => onStartMode(key)}>
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{info.emoji}</div>
                <h3 className="font-bold text-lg mb-1">{info.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{info.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{info.count} questions</Badge>
                  <span className="text-accent font-bold text-sm group-hover:translate-x-1 transition-transform">Jouer →</span>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>

      {/* Badges */}
      {earnedBadges.length > 0 && (
        <Reveal delay={400}>
          <h2 className="text-xl font-bold mb-3">Badges débloqués ({earnedBadges.length}/{BADGES.length})</h2>
          <div className="flex flex-wrap gap-3">
            {earnedBadges.map((badge) => (
              <div key={badge.id} className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 animate-scale-in">
                <span className="text-xl">{badge.emoji}</span>
                <span className="text-sm font-medium">{badge.name}</span>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <Reveal delay={450}>
          <h2 className="text-xl font-bold mb-3">Sessions récentes</h2>
          <div className="space-y-2">
            {recentSessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{MODE_INFO[s.mode]?.emoji}</span>
                  <div>
                    <div className="font-medium text-sm">{MODE_INFO[s.mode]?.name}</div>
                    <div className="text-xs text-muted-foreground">{s.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{s.correct}/{s.total} ✓</span>
                  <span className="font-bold text-accent">+{s.xpEarned} XP</span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}