import { lazy, Suspense, useState, useCallback } from "react";
import { useProgress } from "./hooks/useProgress.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Mascot } from "./components/Mascot.jsx";
import { XPBar, StreakBadge } from "./components/Gamification.jsx";
import { buildSession, buildFreeSession } from "./data/bank/index.js";
import { getModule } from "./data/curriculum.js";

// Écrans secondaires chargés à la demande (code-splitting) — l'accueil reste instantané.
const named = (p, key) => lazy(() => p().then((m) => ({ default: m[key] })));
const SessionPlay = named(() => import("./components/SessionPlay.jsx"), "SessionPlay");
const SessionResult = named(() => import("./components/SessionResult.jsx"), "SessionResult");
const LevelSelect = named(() => import("./components/LevelSelect.jsx"), "LevelSelect");
const CurriculumMap = named(() => import("./components/CurriculumMap.jsx"), "CurriculumMap");
const ModuleScreen = named(() => import("./components/ModuleScreen.jsx"), "ModuleScreen");
const PlacementTest = named(() => import("./components/PlacementTest.jsx"), "PlacementTest");
const Diagnostic = named(() => import("./components/Diagnostic.jsx"), "Diagnostic");

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Mascot mood="thinking" size={64} className="animate-float" />
    </div>
  );
}

// ─── YES I CAN TOEIC — App principale (routeur parcours) ─────────────────────
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
    const seenIds = progress.state.moduleProgress[mod.id]?.seenIds;
    const questions = buildSession(mod.id, size, seenIds);
    setSessionCfg({ mode: mod.skill, moduleId: mod.id, size, questions, returnTo: { name: "module", moduleId: mod.id } });
    go("session");
  }, [go, progress.state.moduleProgress]);

  // Démarre un mode libre (3 modes historiques) — échantillon plafonné, pas la banque entière.
  const startFreeMode = useCallback((mode) => {
    setSessionCfg({ mode, moduleId: null, questions: buildFreeSession(mode), returnTo: { name: "dashboard" } });
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
    // Reconstruit une session fraîche (nouveau tirage, module OU mode libre).
    const seenIds = sessionCfg.moduleId ? progress.state.moduleProgress[sessionCfg.moduleId]?.seenIds : undefined;
    const questions = sessionCfg.moduleId ? buildSession(sessionCfg.moduleId, sessionCfg.size, seenIds) : buildFreeSession(sessionCfg.mode);
    setSessionCfg({ ...sessionCfg, questions });
    setLastSession(null);
    go("session");
  }, [sessionCfg, go, goHome, progress.state.moduleProgress]);

  const handlePlacementDone = useCallback((level) => go("curriculum", { level }), [go]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-4">
          <button onClick={goHome} aria-label="Accueil Yes I Can Toeic" className="flex items-center gap-2 shrink-0">
            <Mascot mood="happy" size={36} />
            <span className="font-display font-bold text-lg hidden sm:block tracking-tight">
              Yes I Can <span className="text-accent-strong">Toeic</span>
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

      {/* Alerte discrète : la progression n'a pas pu être sauvegardée (quota,
          navigation privée, storage désactivé) — mieux que la perte silencieuse. */}
      {progress.saveError && (
        <div className="mx-auto max-w-5xl px-4 pt-3">
          <div role="alert" className="rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm px-4 py-2.5">
            Ta progression n'a pas pu être sauvegardée sur cet appareil — vérifie l'espace de stockage disponible ou désactive la navigation privée.
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4">
        <Suspense fallback={<ScreenLoader />}>
        {/* Chorégraphie d'écran : chaque route entre avec un léger glissement + fondu. */}
        <div key={route.name} className="animate-screen-in">
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
        </div>
        </Suspense>
      </main>

      {/* Footer */}
      {route.name === "dashboard" && (
        <footer className="border-t border-border mt-8" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-sm text-muted-foreground">
            <p className="font-semibold">Yes I Can Toeic — Préparation ludique au TOEIC</p>
            <p className="mt-1 text-xs">Vos données et vos images restent stockées localement sur votre navigateur.</p>
          </div>
        </footer>
      )}
    </div>
  );
}
