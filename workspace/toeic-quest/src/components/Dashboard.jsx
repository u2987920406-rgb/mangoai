import { Mascot } from "./Mascot.jsx";
import { XPBar, ScoreDisplay, Reveal } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { MODE_INFO, BADGES } from "../data/questions.js";
import { nextRecommendedModule, getModule, LEVELS } from "../data/curriculum.js";
import { FREE_SESSION_SIZE } from "../data/bank/index.js";
import { TargetIcon, MapIcon, ChartIcon, ArrowRightIcon, CheckIcon } from "./icons.jsx";

export function Dashboard({ progress, onStartMode, onContinue, onPlacement, onDiagnostic, onOpenModule }) {
  const { state, level, xpInLevel, xpForNext } = progress;
  const earnedBadges = BADGES.filter((b) => state.badges.includes(b.id));
  const recentSessions = state.sessionHistory.slice(0, 5);
  const next = nextRecommendedModule(state);

  const mascotMood = state.streak >= 3 ? "excited" : "happy";

  return (
    <div className="space-y-6 pb-8 pt-4">
      {/* Hero */}
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-accent/5 to-coral/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary border-0">TOEIC QUEST</Badge>
              </div>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-balance">
                {state.totalSessions === 0 ? "Bienvenue, futur champion du TOEIC." : "Bon retour, champion."}
              </h1>
              <p className="text-muted-foreground text-lg">
                Une vraie formation TOEIC sur un an : 7 parties officielles, 3 niveaux, des conversations,
                vers le score <span className="font-bold text-foreground">800+</span>.
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

      {/* Invitation au test de placement (si non fait) */}
      {!state.placementDone && (
        <Reveal delay={80}>
          <Card className="border-2 border-accent/40 bg-accent/5">
            <CardContent className="pt-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/15 text-accent-strong shrink-0">
                <TargetIcon size={26} />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="font-bold text-lg">Commence par un test de placement</div>
                <div className="text-sm text-muted-foreground">12 questions pour situer ton niveau et personnaliser ton parcours.</div>
              </div>
              <Button onClick={onPlacement} className="bg-accent text-accent-foreground hover:bg-accent/90">Passer le test →</Button>
            </CardContent>
          </Card>
        </Reveal>
      )}

      {/* XP Bar */}
      <Reveal delay={100}>
        <Card><CardContent className="pt-6"><XPBar level={level} xpInLevel={xpInLevel} xpForNext={xpForNext} /></CardContent></Card>
      </Reveal>

      {/* CTA parcours */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Reveal delay={150}>
          <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all h-full border-2 border-accent/30 bg-accent/5">
            <CardContent className="pt-6 h-full flex flex-col" onClick={() => next && onOpenModule(next.id)}>
              <div className="text-3xl mb-2">{next ? next.emoji : "🚀"}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Continuer le parcours</div>
              <div className="font-bold text-lg leading-tight mt-0.5">{next ? next.title : "Tout est complété !"}</div>
              {next && <div className="text-sm text-muted-foreground mt-1">{LEVELS[next.level].name} · Semaine {next.week}</div>}
              <div className="mt-auto pt-3 text-accent-strong font-bold text-sm group-hover:translate-x-1 transition-transform flex items-center gap-1">Reprendre <ArrowRightIcon size={14} /></div>
            </CardContent>
          </Card>
        </Reveal>
        <Reveal delay={200}>
          <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all h-full">
            <CardContent className="pt-6 h-full flex flex-col" onClick={onContinue}>
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-listening/10 text-listening mb-3">
                <MapIcon size={22} />
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Carte du parcours</div>
              <div className="font-bold text-lg mt-0.5">52 semaines, 3 niveaux</div>
              <div className="text-sm text-muted-foreground mt-1">Visualise toute ta progression.</div>
              <div className="mt-auto pt-3 text-accent-strong font-bold text-sm group-hover:translate-x-1 transition-transform flex items-center gap-1">Ouvrir <ArrowRightIcon size={14} /></div>
            </CardContent>
          </Card>
        </Reveal>
        <Reveal delay={250}>
          <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all h-full">
            <CardContent className="pt-6 h-full flex flex-col" onClick={onDiagnostic}>
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-vocab/10 text-accent-strong mb-3">
                <ChartIcon size={22} />
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Diagnostic</div>
              <div className="font-bold text-lg mt-0.5">Forces & faiblesses</div>
              <div className="text-sm text-muted-foreground mt-1">Ta maîtrise des 7 parties TOEIC.</div>
              <div className="mt-auto pt-3 text-accent-strong font-bold text-sm group-hover:translate-x-1 transition-transform flex items-center gap-1">Analyser <ArrowRightIcon size={14} /></div>
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {/* Entraînement libre (3 modes historiques) */}
      <Reveal delay={300}>
        <h2 className="text-xl font-bold mb-3">Entraînement libre</h2>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(MODE_INFO).map(([key, info], i) => (
          <Reveal key={key} delay={320 + i * 80}>
            <Card className="group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
              <CardContent className="pt-6" onClick={() => onStartMode(key)}>
                <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{info.emoji}</div>
                <h3 className="font-bold text-lg mb-1">{info.name}</h3>
                <p className="text-sm text-muted-foreground mb-3">{info.description}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="tabular-nums">{FREE_SESSION_SIZE} questions · banque de {info.count}</Badge>
                  <span className="flex items-center gap-1 text-accent-strong font-bold text-sm group-hover:translate-x-1 transition-transform">Jouer <ArrowRightIcon size={14} /></span>
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

      {/* Sessions récentes */}
      {recentSessions.length > 0 && (
        <Reveal delay={450}>
          <h2 className="text-xl font-bold mb-3">Sessions récentes</h2>
          <div className="space-y-2">
            {recentSessions.map((s, i) => {
              const mod = s.moduleId ? getModule(s.moduleId) : null;
              const emoji = mod ? mod.emoji : (MODE_INFO[s.mode]?.emoji || "🎯");
              const label = mod ? mod.title : (MODE_INFO[s.mode]?.name || "Session");
              return (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{emoji}</span>
                    <div>
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground">{s.date}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    <span className="flex items-center gap-1 text-muted-foreground">{s.correct}/{s.total} <CheckIcon size={12} className="text-primary" /></span>
                    <span className="font-bold text-accent-strong">+{s.xpEarned} XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      )}
    </div>
  );
}
