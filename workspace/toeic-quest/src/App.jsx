import { useState, useCallback } from "react";
import { useProgress } from "./hooks/useProgress.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { SessionPlay } from "./components/SessionPlay.jsx";
import { SessionResult } from "./components/SessionResult.jsx";
import { LevelSelect } from "./components/LevelSelect.jsx";
import { CurriculumMap } from "./components/CurriculumMap.jsx";
import { ModuleScreen } from "./components/ModuleScreen.jsx";
import { PlacementTest } from "./components/PlacementTest.jsx";
import { Diagnostic } from "./components/Diagnostic.jsx";
import { Mascot } from "./components/Mascot.jsx";
import { XPBar, StreakBadge } from "./components/Gamification.jsx";
import { buildSession, isModulePlayable } from "./data/bank/index.js";
import { getModule } from "./data/curriculum.js";

// ─── TOEIC QUEST — App principale (routeur parcours) ─────────────────────────
export default function App() {
  const progress = useProgress();
  const [route, setRoute] = useState({ name: "dashboard" });
  const [lastSession, setLastSession] = useState(null);
  const [sessionCfg, setSessionCfg] = useState(null); // { mode, moduleId, questions, size, returnTo }
  const [useTimer, setUseTimer] = useState(false);

  const go = useCallback((name, extra = {}) => setRoute({ name, ...extra }), []);
  const goHome = useCallback(() => { setRoute({ name: "dashboard" }); setLastSession(null); }, []);

  // Démarre une session de module (questions injectées).
  const startModuleSession = useCallback((mod, size) => {
    const questions = buildSession(mod.id, size);
    setSessionCfg({ mode: mod.skill, moduleId: mod.id, size, questions, returnTo: { name: "module", moduleId: mod.id } });
    go("session");
  }, [go]);

  // Démarre un mode libre (3 modes historiques).
  const startFreeMode = useCallback((mode) => {
    setSessionCfg({ mode, moduleId: null, questions: null, returnTo: { name: "dashboard" } });
    go("session");
  }, [go]);

  // Ouvre un module : direct vers la session s'il est jouable, sinon l'écran module.
  const openModule = useCallback((moduleId) => go("module", { moduleId }), [go]);

  const handleSessionFinish = useCallback((sessionData) => {
    if (sessionData === null) {
      setRoute(sessionCfg?.returnTo || { name: "dashboard" });
      return;
    }
    progress.recordSession(sessionData);
    setLastSession(sessionData);
    go("result");
  }, [progress, sessionCfg, go]);

  const handleRetry = useCallback(() => {
    if (!sessionCfg) { goHome(); return; }
    // Reconstruit une session fraîche (nouveau tirage pour les modules).
    const questions = sessionCfg.moduleId ? buildSession(sessionCfg.moduleId, sessionCfg.size) : null;
    setSessionCfg({ ...sessionCfg, questions });
    setLastSession(null);
    go("session");
  }, [sessionCfg, go, goHome]);

  const handlePlacementDone = useCallback((level) => go("curriculum", { level }), [go]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={goHome} className="flex items-center gap-2 shrink-0">
            <Mascot mood="happy" size={36} />
            <span className="font-extrabold text-lg hidden sm:block">
              TOEIC<span className="text-accent">QUEST</span>
            </span>
          </button>

          {route.name === "dashboard" && (
            <div className="flex-1 max-w-xs hidden md:block">
              <XPBar level={progress.level} xpInLevel={progress.xpInLevel} xpForNext={progress.xpForNext} compact />
            </div>
          )}

          {progress.state.streak > 0 && <StreakBadge streak={progress.state.streak} />}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4">
        {route.name === "dashboard" && (
          <Dashboard
            progress={progress}
            onStartMode={startFreeMode}
            onContinue={() => go("levelSelect")}
            onPlacement={() => go("placement")}
            onDiagnostic={() => go("diagnostic")}
            onOpenModule={openModule}
          />
        )}

        {route.name === "levelSelect" && (
          <LevelSelect progress={progress} onPickLevel={(level) => go("curriculum", { level })} onBack={goHome} />
        )}

        {route.name === "curriculum" && (
          <CurriculumMap
            progress={progress}
            level={route.level || progress.state.unlockedLevel || "debutant"}
            onOpenModule={(mod) => openModule(mod.id)}
            onChangeLevel={(level) => go("curriculum", { level })}
            onBack={() => go("levelSelect")}
          />
        )}

        {route.name === "module" && (
          <ModuleScreen
            progress={progress}
            moduleId={route.moduleId}
            useTimer={useTimer || !!getModule(route.moduleId)?.isExam}
            onToggleTimer={() => setUseTimer((t) => !t)}
            onStart={startModuleSession}
            onBack={() => go("curriculum", { level: getModule(route.moduleId)?.level })}
          />
        )}

        {route.name === "placement" && (
          <PlacementTest progress={progress} onDone={handlePlacementDone} onSkip={() => go("curriculum", { level: "debutant" })} />
        )}

        {route.name === "diagnostic" && (
          <Diagnostic progress={progress} onOpenModule={openModule} onBack={goHome} />
        )}

        {route.name === "session" && sessionCfg && (
          <SessionPlay
            mode={sessionCfg.mode}
            moduleId={sessionCfg.moduleId}
            questions={sessionCfg.questions}
            useTimer={useTimer || !!getModule(sessionCfg.moduleId)?.isExam}
            timerSeconds={300}
            onFinish={handleSessionFinish}
          />
        )}

        {route.name === "result" && lastSession && (
          <SessionResult session={lastSession} onBackHome={goHome} onRetry={handleRetry} />
        )}
      </main>

      {/* Footer */}
      {route.name === "dashboard" && (
        <footer className="border-t border-border mt-8">
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-muted-foreground">
            <p>TOEIC QUEST — Préparation ludique au TOEIC 🥭</p>
            <p className="mt-1 text-xs">Vos données sont stockées localement sur votre navigateur.</p>
          </div>
        </footer>
      )}
    </div>
  );
}
