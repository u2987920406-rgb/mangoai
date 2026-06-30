import { useState, useEffect, useCallback, useRef } from "react";
import { Mascot } from "./Mascot.jsx";
import { SessionTimer, Confetti } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { cn } from "../lib/utils.js";
import { QUESTIONS, MODE_INFO } from "../data/questions.js";

// ─── Session de jeu (commun aux 3 modes) ─────────────────────────────────────
export function SessionPlay({ mode, onFinish, useTimer = false, timerSeconds = 300 }) {
  const questions = QUESTIONS[mode] || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [timerActive, setTimerActive] = useState(useTimer);
  const [timeUp, setTimeUp] = useState(false);
  const spokenRef = useRef(false);

  const q = questions[currentIdx];
  const modeInfo = MODE_INFO[mode];

  // SpeechSynthesis for listening mode
  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.lang = "en-US";
    window.speechSynthesis.speak(utter);
  }, []);

  // Auto-speak on new listening question
  useEffect(() => {
    spokenRef.current = false;
    setShowTranscript(false);
  }, [currentIdx]);

  useEffect(() => {
    if (mode === "listening" && q && !spokenRef.current) {
      spokenRef.current = true;
      // Small delay to let UI render
      setTimeout(() => speak(q.transcript), 300);
    }
  }, [q, mode, speak]);

  const handleSelect = (idx) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    const isCorrect = idx === q.answer;
    setResults((prev) => [...prev, { questionId: q.id, selected: idx, correct: isCorrect }]);
  };

  const handleNext = () => {
    if (currentIdx + 1 >= questions.length) {
      const correct = results.filter((r) => r.correct).length;
      const xpEarned = correct * 15 + (correct === questions.length ? 50 : 0);
      onFinish({
        mode,
        total: questions.length,
        correct,
        xpEarned,
        results,
      });
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelected(null);
      setAnswered(false);
    }
  };

  const handleTimerExpire = useCallback(() => {
    setTimeUp(true);
    setTimerActive(false);
    // Finish session with current results
    const correct = results.filter((r) => r.correct).length;
    const xpEarned = correct * 15;
    onFinish({
      mode,
      total: questions.length,
      correct,
      xpEarned,
      results,
      timedOut: true,
    });
  }, [results, questions.length, mode, onFinish]);

  if (timeUp) return null;

  if (!q) {
    return <div className="p-8 text-center text-muted-foreground">Aucune question disponible.</div>;
  }

  const isCorrect = answered && selected === q.answer;
  const progress = ((currentIdx + (answered ? 1 : 0)) / questions.length) * 100;
  // XP accumulé en direct pendant la session (15 par bonne réponse) — retour visuel
  // immédiat ; le total est consolidé dans la progression globale en fin de session.
  const sessionXp = results.filter((r) => r.correct).length * 15;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-8 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => { window.speechSynthesis?.cancel(); onFinish(null); }}>
          ← Quitter
        </Button>
        <div className="flex items-center gap-3">
          {timerActive && (
            <SessionTimer active={timerActive} seconds={timerSeconds} onExpire={handleTimerExpire} />
          )}
          <Badge
            variant="secondary"
            className={cn(
              "bg-accent/15 text-accent border-accent/30 font-bold tabular-nums transition-transform",
              answered && isCorrect && "scale-110"
            )}
          >
            ⭐ {sessionXp} XP
          </Badge>
          <Badge variant="secondary">
            {modeInfo.emoji} {currentIdx + 1}/{questions.length}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Question card */}
      <Card className="animate-fade-in-up" key={q.id}>
        <CardContent className="pt-6 space-y-4">
          {/* Image */}
          {q.image && (
            <div className="rounded-xl overflow-hidden mb-2">
              <img
                src={q.image}
                alt="Context"
                className="w-full h-48 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Listening: audio controls */}
          {mode === "listening" && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-listening/5 border border-listening/20">
              <Button
                size="icon"
                className="rounded-full bg-listening text-white hover:bg-listening/90 shrink-0"
                onClick={() => speak(q.transcript)}
              >
                ▶
              </Button>
              <div className="flex-1">
                <div className="text-sm font-medium">Écoutez l'audio</div>
                <div className="text-xs text-muted-foreground">Cliquez pour réécouter</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript((s) => !s)}
              >
                {showTranscript ? "Cacher" : "Transcript"}
              </Button>
            </div>
          )}

          {/* Transcript (collapsible for listening) */}
          {mode === "listening" && showTranscript && (
            <div className="p-4 rounded-xl bg-muted/50 text-sm text-foreground italic animate-fade-in">
              "{q.transcript}"
            </div>
          )}

          {/* Reading: passage */}
          {mode === "reading" && (
            <div className="p-4 rounded-xl bg-muted/30 text-sm text-foreground whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">
              {q.passage}
            </div>
          )}

          {/* Vocab: sentence with blank */}
          {mode === "vocab" && (
            <div className="p-4 rounded-xl bg-vocab/5 border border-vocab/20">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Complétez la phrase</div>
              <p className="text-lg text-foreground leading-relaxed">{q.sentence}</p>
            </div>
          )}

          {/* Question */}
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Question</div>
            <p className="font-bold text-lg">{q.question || "Choisissez la bonne réponse"}</p>
          </div>

          {/* Choices */}
          <div className="space-y-2">
            {q.choices.map((choice, idx) => {
              const isSelected = selected === idx;
              const isAnswer = idx === q.answer;
              let style = "border-border bg-card hover:border-accent/40 hover:bg-accent/5";
              if (answered) {
                if (isAnswer) {
                  style = "border-primary bg-primary/10 text-primary";
                } else if (isSelected) {
                  style = "border-destructive bg-destructive/10 text-destructive";
                } else {
                  style = "border-border bg-card opacity-60";
                }
              }
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={answered}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-3",
                    style,
                    !answered && "cursor-pointer active:scale-[0.99]"
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full border-2 text-sm font-bold shrink-0",
                    answered && isAnswer ? "border-primary bg-primary text-primary-foreground" :
                    answered && isSelected ? "border-destructive bg-destructive text-destructive-foreground" :
                    "border-border"
                  )}>
                    {answered && isAnswer ? "✓" : answered && isSelected ? "✗" : String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{choice}</span>
                </button>
              );
            })}
          </div>

          {/* Explanation after answer */}
          {answered && (
            <div className={cn(
              "p-4 rounded-xl animate-fade-in-up space-y-3",
              isCorrect ? "bg-primary/5 border border-primary/20" : "bg-destructive/5 border border-destructive/20"
            )}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{isCorrect ? "🎉" : "💡"}</span>
                <span className="font-bold">{isCorrect ? "Correct !" : "Pas tout à fait..."}</span>
              </div>
              <p className="text-sm text-foreground">{q.explanation}</p>
              <div className="flex items-center gap-2 pt-1">
                <Mascot mood={isCorrect ? "happy" : "thinking"} size={48} />
                <p className="text-sm text-muted-foreground italic">
                  {isCorrect
                    ? "Excellent ! Tu gagnes 15 XP pour cette question."
                    : "Pas de souci, on apprend de ses erreurs !"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next button */}
      {answered && (
        <div className="flex justify-end animate-fade-in-up">
          <Button onClick={handleNext} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
            {currentIdx + 1 >= questions.length ? "Voir les résultats →" : "Question suivante →"}
          </Button>
        </div>
      )}
    </div>
  );
}