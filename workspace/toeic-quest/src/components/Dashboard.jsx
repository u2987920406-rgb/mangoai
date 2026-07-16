import { Mascot } from "./Mascot.jsx";
import { XPBar, ScoreDisplay, Reveal } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { ModuleNode } from "./ModuleNode.jsx";
import { MODE_INFO, BADGES } from "../data/questions.js";
import { nextRecommendedModule, getModule, LEVELS, modulesForLevel, isModuleUnlocked } from "../data/curriculum.js";
import { isModulePlayable, FREE_SESSION_SIZE } from "../data/bank/index.js";
import { TargetIcon, ArrowRightIcon, CheckIcon, ChartIcon } from "./icons.jsx";

export function Dashboard({ progress, onStartMode, onOpenParcours, onPlacement, onDiagnostic, onOpenModule }) {
  const { state, level, xpInLevel, xpForNext } = progress;
  const earnedBadges = BADGES.filter((b) => state.badges.includes(b.id));
  const recentSessions = state.sessionHistory.slice(0, 5);
  const next = nextRecommendedModule(state);

  // ── Aperçu du parcours : le module suivant + son contexte immédiat (1 avant,
  //    2 après) — assez pour voir "où j'en suis" sans ouvrir la carte complète.
  const currentLevel = state.unlockedLevel || "debutant";
  const levelMods = modulesForLevel(currentLevel);
  const nextIdx = next ? levelMods.findIndex((m) => m.id === next.id) : -1;
  const previewStart = nextIdx > 0 ? nextIdx - 1 : 0;
  const preview = nextIdx >= 0 ? levelMods.slice(previewStart, previewStart + 4) : levelMods.slice(0, 4);
  const doneInLevel = levelMods.filter((m) => state.moduleProgress?.[m.id]?.completed).length;

  return (
    <div className="space-y-6 pb-8 pt-4">
      {/* Bandeau d'accueil compact — score et salutation, sans écraser le parcours en dessous */}
      <Reveal>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-accent/5 to-coral/5 p-5">
          <div className="flex items-center gap-4">
            <Mascot mood={state.streak >= 3 ? "excited" : "happy"} size={52} />
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-balance">
                {state.totalSessions === 0 ? "Bienvenue, futur champion du TOEIC." : "Bon retour, champion."}
              </h1>
              <p className="text-sm text-muted-foreground">Vers le score <span className="font-bold text-foreground">800+</span>.</p>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 pl-2 sm:pl-0">
            <ScoreDisplay score={state.estimatedScore} size="sm" />
            {state.streak > 0 && (
              <div className="text-center">
                <div className="text-lg font-extrabold">{state.streak} 🔥</div>
                <div className="text-xs text-muted-foreground">jours</div>
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* Invitation au test de placement — prioritaire tant qu'il n'est pas fait */}
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

      {/* ── SECTION PRINCIPALE : le parcours (52 semaines) ── */}
      <Reveal delay={120}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Ton parcours</h2>
          <Badge variant="secondary">{LEVELS[currentLevel].name} · {doneInLevel}/{levelMods.length} modules</Badge>
        </div>
        <Card className="border-2 border-accent/25">
          <CardContent className="pt-6 space-y-5">
            <XPBar level={level} xpInLevel={xpInLevel} xpForNext={xpForNext} />
            <div className="space-y-4 pt-1">
              {preview.map((mod) => (
                <ModuleNode
                  key={mod.id}
                  module={mod}
                  progress={state.moduleProgress?.[mod.id]}
                  unlocked={isModuleUnlocked(mod, state)}
                  playable={isModulePlayable(mod.id)}
                  isNext={next?.id === mod.id}
                  offset="left"
                  onClick={(m) => onOpenModule(m.id)}
                />
              ))}
            </div>
            <Button onClick={onOpenParcours} variant="outline" className="w-full justify-center gap-1.5">
              Voir tout le parcours (52 semaines) <ArrowRightIcon size={14} />
            </Button>
          </CardContent>
        </Card>
      </Reveal>

      {/* ── Outils secondaires — clairement en retrait, jamais en concurrence visuelle avec le parcours ── */}
      <Reveal delay={220}>
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Autres outils</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="group cursor-pointer hover:shadow-md transition-all">
            <CardContent className="py-4 flex items-center gap-3" onClick={onDiagnostic}>
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-vocab/10 text-accent-strong shrink-0">
                <ChartIcon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Diagnostic</div>
                <div className="font-bold text-sm">Forces & faiblesses</div>
              </div>
              <ArrowRightIcon size={14} className="text-muted-foreground group-hover:translate-x-1 transition-transform shrink-0" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Entraînement libre</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(MODE_INFO).map(([key, info]) => (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => onStartMode(key)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onStartMode(key)}
                    className="group flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-muted hover:bg-accent/10 transition-colors cursor-pointer"
                  >
                    <span className="text-base">{info.emoji}</span>
                    <h3 className="font-semibold text-sm">{info.name}</h3>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Badges */}
      {earnedBadges.length > 0 && (
        <Reveal delay={280}>
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
        <Reveal delay={320}>
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
