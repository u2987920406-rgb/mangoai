import { useState, useCallback } from "react";
import { useProgress } from "./hooks/useProgress.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { SessionPlay } from "./components/SessionPlay.jsx";
import { SessionResult } from "./components/SessionResult.jsx";
import { Mascot } from "./components/Mascot.jsx";
import { XPBar, StreakBadge } from "./components/Gamification.jsx";
import { Button } from "./components/ui/button.jsx";
import { Badge } from "./components/ui/badge.jsx";
import { cn } from "./lib/utils.js";

// ─── TOEIC QUEST — App principale ────────────────────────────────────────────
export default function App() {
  const progress = useProgress();
  const [screen, setScreen] = useState("dashboard"); // dashboard | session | result
  const [activeMode, setActiveMode] = useState(null);
  const [lastSession, setLastSession] = useState(null);
  const [useTimer, setUseTimer] = useState(false);

  const handleStartMode = useCallback((mode) => {
    setActiveMode(mode);
    setScreen("session");
  }, []);

  const handleSessionFinish = useCallback((sessionData) => {
    if (sessionData === null) {
      // User quit
      setScreen("dashboard");
      return;
    }
    progress.recordSession(sessionData);
    setLastSession(sessionData);
    setScreen("result");
  }, [progress]);

  const handleBackHome = useCallback(() => {
    setScreen("dashboard");
    setActiveMode(null);
    setLastSession(null);
  }, []);

  const handleRetry = useCallback(() => {
    setScreen("session");
    setLastSession(null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-5xl px-4 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <button onClick={handleBackHome} className="flex items-center gap-2 shrink-0">
            <Mascot mood="happy" size={36} />
            <span className="font-extrabold text-lg hidden sm:block">
              TOEIC<span className="text-accent">QUEST</span>
            </span>
          </button>

          {/* XP bar (compact, only on dashboard) */}
          {screen === "dashboard" && (
            <div className="flex-1 max-w-xs hidden md:block">
              <XPBar
                level={progress.level}
                xpInLevel={progress.xpInLevel}
                xpForNext={progress.xpForNext}
                compact
              />
            </div>
          )}

          {/* Streak */}
          {progress.state.streak > 0 && (
            <StreakBadge streak={progress.state.streak} />
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-5xl px-4">
        {screen === "dashboard" && (
          <>
            {/* Timer toggle */}
            <div className="flex items-center justify-end gap-2 pt-4">
              <span className="text-sm text-muted-foreground">Mode examen (timer)</span>
              <button
                onClick={() => setUseTimer((t) => !t)}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  useTimer ? "bg-accent" : "bg-muted"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  useTimer ? "translate-x-6" : "translate-x-0.5"
                )} />
              </button>
            </div>
            <Dashboard progress={progress} onStartMode={handleStartMode} />
          </>
        )}

        {screen === "session" && activeMode && (
          <SessionPlay
            mode={activeMode}
            useTimer={useTimer}
            timerSeconds={300}
            onFinish={handleSessionFinish}
          />
        )}

        {screen === "result" && lastSession && (
          <SessionResult
            session={lastSession}
            onBackHome={handleBackHome}
            onRetry={handleRetry}
          />
        )}
      </main>

      {/* Footer */}
      {screen === "dashboard" && (
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