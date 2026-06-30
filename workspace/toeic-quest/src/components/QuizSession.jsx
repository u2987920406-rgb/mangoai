import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Badge } from "./ui/badge.jsx";
import { MangoMascot, MangoMascotBubble } from "./MangoMascot.jsx";
import { Timer } from "./Gamification.jsx";
import { getTopicImage } from "../data/images.js";
import { XP_PER_CORRECT, XP_BONUS_PERFECT_SESSION, XP_BONUS_STREAK } from "../data/gamification.js";

// ── Speech Synthesis helper ──────────────────────────────────────────────────
function speak(text, onEnd) {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// ── Main Quiz Session Component ──────────────────────────────────────────────
export function QuizSession({ mode, questions, onComplete, onExit, streak }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef(null);

  const q = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  // ── Timer logic ─────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    const totalSeconds = questions.length * 45; // 45s per question
    setTimeLeft(totalSeconds);
    setTimerActive(true);
  }, [questions.length]);

  useEffect(() => {
    if (timerActive && timeLeft !== null) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current);
            // Time's up — finish session
            handleFinish(correctCount, answers, false);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [timerActive]);

  // Auto-play audio for listening questions
  useEffect(() => {
    if (mode === "listening" && q?.transcript && !showFeedback) {
      setShowTranscript(false);
    }
  }, [currentIndex, mode, q]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  // ── Handle answer selection ─────────────────────────────────────────────────
  const handleSelectAnswer = (idx) => {
    if (showFeedback) return;
    setSelectedAnswer(idx);
    setShowFeedback(true);
    stopSpeaking();
    setIsSpeaking(false);

    const isCorrect = idx === q.answer;
    if (isCorrect) setCorrectCount((c) => c + 1);
    setAnswers((a) => [...a, { questionId: q.id, selected: idx, correct: isCorrect }]);
  };

  // ── Handle next / finish ────────────────────────────────────────────────────
  const handleNext = () => {
    if (isLast) {
      handleFinish(correctCount, answers, correctCount === questions.length);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setShowTranscript(false);
    }
  };

  const handleFinish = (correct, allAnswers, perfect) => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();

    const xpGained = correct * XP_PER_CORRECT + (perfect ? XP_BONUS_PERFECT_SESSION : 0) + (streak > 0 ? Math.min(streak * XP_BONUS_STREAK, 50) : 0);
    onComplete({
      mode,
      correct,
      total: questions.length,
      xpGained,
      perfect,
      answers: allAnswers,
      difficulty: q?.difficulty || 1,
    });
  };

  // ── Play audio for listening ───────────────────────────────────────────────
  const handlePlayAudio = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speak(q.transcript, () => setIsSpeaking(false));
    }
  };

  // ── Mascot mood based on state ──────────────────────────────────────────────
  const mascotMood = !showFeedback ? "encouraging" : selectedAnswer === q.answer ? "celebrating" : "sad";
  const mascotMessage = !showFeedback
    ? "Tu peux le faire ! 🎯"
    : selectedAnswer === q.answer
    ? "Bravo ! C'est exact ! 🎉"
    : "Pas de panique, on apprend de ses erreurs ! 💪";

  if (!q) return null;

  const image = getTopicImage(q.image || q.topic);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Top bar: progress + timer + exit */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onExit}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          ✕ Quitter
        </button>
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-[hsl(var(--mango))] to-[hsl(var(--coral))] transition-all duration-500"
            style={{ width: `${((currentIndex + (showFeedback ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-sm font-bold text-muted-foreground">
          {currentIndex + 1}/{questions.length}
        </span>
        {timeLeft !== null && <Timer seconds={timeLeft} />}
      </div>

      {/* Timer toggle */}
      {timeLeft === null && !showFeedback && currentIndex === 0 && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={startTimer}>
            ⏱ Mode chronométré
          </Button>
        </div>
      )}

      {/* Question card */}
      <Card className="animate-fade-in-up overflow-hidden">
        {/* Image header */}
        {image && (
          <div className="relative h-40 w-full overflow-hidden sm:h-48">
            <img src={image} alt={q.topic} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-3 left-4">
              <Badge className="bg-[hsl(var(--mango))] text-white hover:bg-[hsl(var(--mango))]">
                {q.topic}
              </Badge>
            </div>
          </div>
        )}

        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{q.question}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Listening: audio player + transcript toggle */}
          {mode === "listening" && q.transcript && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handlePlayAudio}
                  className={`bg-[hsl(var(--listening))] text-white hover:bg-[hsl(var(--listening))]/90 ${isSpeaking ? "animate-pulse" : ""}`}
                >
                  {isSpeaking ? "⏸ Pause" : "▶ Écouter"}
                </Button>
                <button
                  onClick={() => setShowTranscript((s) => !s)}
                  className="text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  {showTranscript ? "Masquer le transcript" : "Afficher le transcript"}
                </button>
              </div>
              {showTranscript && (
                <p className="animate-fade-in rounded-lg bg-card p-3 text-sm italic text-foreground">
                  "{q.transcript}"
                </p>
              )}
            </div>
          )}

          {/* Reading: passage display */}
          {mode === "reading" && q.passage && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{q.passage}</p>
            </div>
          )}

          {/* Vocabulary: fill-in / pair context */}
          {mode === "vocabulary" && q.sentence && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm leading-relaxed text-foreground">{q.sentence}</p>
            </div>
          )}

          {/* Answer choices */}
          <div className="space-y-2">
            {q.choices.map((choice, idx) => {
              const isSelected = selectedAnswer === idx;
              const isCorrect = idx === q.answer;
              let className = "w-full rounded-xl border-2 p-3 text-left text-sm font-medium transition-all ";

              if (!showFeedback) {
                className += "border-border bg-card hover:border-[hsl(var(--mango))] hover:bg-[hsl(var(--mango))]/5 cursor-pointer";
              } else if (isCorrect) {
                className += "border-[hsl(var(--reading))] bg-[hsl(var(--reading))]/10 text-foreground";
              } else if (isSelected && !isCorrect) {
                className += "border-[hsl(var(--coral))] bg-[hsl(var(--coral))]/10 text-foreground animate-shake";
              } else {
                className += "border-border bg-card opacity-60";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleSelectAnswer(idx)}
                  disabled={showFeedback}
                  className={className}
                >
                  <span className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      showFeedback && isCorrect ? "bg-[hsl(var(--reading))] text-white" :
                      showFeedback && isSelected && !isCorrect ? "bg-[hsl(var(--coral))] text-white" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {showFeedback && isCorrect ? "✓" : showFeedback && isSelected && !isCorrect ? "✗" : String.fromCharCode(65 + idx)}
                    </span>
                    {choice}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {showFeedback && (
            <div className="animate-fade-in-up space-y-3 rounded-xl border-2 border-[hsl(var(--mango))]/30 bg-[hsl(var(--mango))]/5 p-4">
              <div className="flex items-start gap-3">
                <MangoMascot mood={mascotMood} size={56} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">{mascotMessage}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{q.explanation}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleNext} className="bg-[hsl(var(--mango))] text-white hover:bg-[hsl(var(--mango))]/90">
                  {isLast ? "Voir les résultats →" : "Question suivante →"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}