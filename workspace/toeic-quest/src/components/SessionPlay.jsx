import { useState, useEffect, useCallback, useRef } from "react";
import { Mascot } from "./Mascot.jsx";
import { SessionTimer } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { Badge } from "./ui/badge.jsx";
import { cn } from "../lib/utils.js";
import { QUESTIONS, MODE_INFO, XP_PER_CORRECT, xpForResults } from "../data/questions.js";
import { PART_EMOJI } from "../data/curriculum.js";
import { speakLine, speakSequence, cancelSpeech } from "../lib/speech.js";

// ─── Session de jeu — générique (modes libres ET modules du parcours) ─────────
// props : questions? (injectées) · mode · moduleId? · onFinish · useTimer · timerSeconds
export function SessionPlay({ mode, moduleId = null, questions: injected, onFinish, useTimer = false, timerSeconds = 300 }) {
  const questions = injected && injected.length ? injected : (QUESTIONS[mode] || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeLine, setActiveLine] = useState(-1);
  const [timerActive, setTimerActive] = useState(useTimer);
  const [timeUp, setTimeUp] = useState(false);
  const audioRef = useRef(null);          // contrôleur de lecture en cours
  const playedRef = useRef(false);

  const q = questions[currentIdx];
  const modeInfo = MODE_INFO[mode] || { emoji: "🎯" };

  // Type de question (piloté par les champs, pas par le mode → gère les bilans).
  const isConversation = !!(q && q.lines && q.lines.length);
  const isPrompt = !!(q && q.prompt);
  const isTalk = !!(q && q.transcript && q.skill === "listening" && !isConversation && !isPrompt);
  const hasAudio = isConversation || isPrompt || isTalk;
  const isReadingMulti = !!(q && q.passages && q.passages.length);
  const isReading = !!(q && (q.passage || isReadingMulti));
  const isVocab = !!(q && q.sentence);

  const stopAudio = useCallback(() => {
    audioRef.current?.cancel();
    audioRef.current = null;
    cancelSpeech();
    setActiveLine(-1);
  }, []);

  const playAudio = useCallback(() => {
    if (!q) return;
    stopAudio();
    if (isConversation) {
      audioRef.current = speakSequence(q.lines, {
        onLineStart: (i) => setActiveLine(i),
        onDone: () => setActiveLine(-1),
      });
    } else if (isPrompt) {
      audioRef.current = speakLine(q.prompt.text, { gender: q.prompt.gender || "female" });
    } else if (isTalk) {
      audioRef.current = speakLine(q.transcript, { gender: q.voiceGender || "female" });
    }
  }, [q, isConversation, isPrompt, isTalk, stopAudio]);

  // Réinitialise l'état à chaque nouvelle question + auto-lecture audio.
  useEffect(() => {
    playedRef.current = false;
    setShowTranscript(false);
    setActiveLine(-1);
  }, [currentIdx]);

  useEffect(() => {
    if (hasAudio && q && !playedRef.current) {
      playedRef.current = true;
      const t = setTimeout(playAudio, 350);
      return () => clearTimeout(t);
    }
  }, [q, hasAudio, playAudio]);

  // Nettoyage à la sortie.
  useEffect(() => () => stopAudio(), [stopAudio]);

  const handleSelect = (idx) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    const isCorrect = idx === q.answer;
    setResults((prev) => [
      ...prev,
      { questionId: q.id, selected: idx, correct: isCorrect, difficulty: q.difficulty || 1, part: q.part || null, skill: q.skill || mode },
    ]);
  };

  const finish = useCallback((finalResults, timedOut = false) => {
    stopAudio();
    const correct = finalResults.filter((r) => r.correct).length;
    const perfect = correct === questions.length && !timedOut;
    const xpEarned = xpForResults(finalResults) + (perfect ? 50 : 0);
    onFinish({ mode, moduleId, total: questions.length, correct, xpEarned, results: finalResults, timedOut });
  }, [stopAudio, questions.length, onFinish, mode, moduleId]);

  const handleNext = () => {
    if (currentIdx + 1 >= questions.length) {
      finish(results);
    } else {
      stopAudio();
      setCurrentIdx((prev) => prev + 1);
      setSelected(null);
      setAnswered(false);
    }
  };

  const handleTimerExpire = useCallback(() => {
    setTimeUp(true);
    setTimerActive(false);
    finish(results, true);
  }, [results, finish]);

  if (timeUp) return null;

  if (!q) {
    return <div className="p-8 text-center text-muted-foreground">Aucune question disponible pour ce module.</div>;
  }

  const isCorrect = answered && selected === q.answer;
  const progress = ((currentIdx + (answered ? 1 : 0)) / questions.length) * 100;
  // XP accumulé en direct (pondéré par difficulté) — retour visuel immédiat.
  const sessionXp = results.reduce((acc, r) => acc + (r.correct ? (XP_PER_CORRECT[r.difficulty] ?? 15) : 0), 0);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-8 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4 pt-4">
        <Button variant="ghost" size="sm" onClick={() => { stopAudio(); onFinish(null); }}>
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
            {(q.part && PART_EMOJI[q.part]) || modeInfo.emoji} {currentIdx + 1}/{questions.length}
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
          {/* Image de contexte */}
          {q.image && (
            <div className="rounded-xl overflow-hidden mb-2">
              <img src={q.image} alt="Contexte de la question" className="w-full h-48 object-cover" loading="lazy" />
            </div>
          )}

          {/* Audio (P1/P2/P4 monologue, ou conversation P3) */}
          {hasAudio && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-listening/5 border border-listening/20">
              <Button
                size="icon"
                className="rounded-full bg-listening text-white hover:bg-listening/90 shrink-0"
                onClick={playAudio}
                aria-label="Écouter l'audio"
              >
                ▶
              </Button>
              <div className="flex-1">
                <div className="text-sm font-medium">{isConversation ? "Écoutez la conversation" : "Écoutez l'audio"}</div>
                <div className="text-xs text-muted-foreground">Cliquez pour réécouter</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTranscript((s) => !s)}>
                {showTranscript ? "Cacher" : "Transcript"}
              </Button>
            </div>
          )}

          {/* Transcript conversation (P3) : bulles avec locuteur actif surligné */}
          {isConversation && showTranscript && (
            <div className="space-y-2 animate-fade-in">
              {q.lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-xl text-sm transition-all",
                    line.gender === "male" ? "bg-listening/5" : "bg-vocab/5",
                    activeLine === i && "ring-2 ring-accent scale-[1.01]"
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 text-white",
                    line.gender === "male" ? "bg-listening" : "bg-coral"
                  )}>
                    {line.speaker || (line.gender === "male" ? "M" : "W")}
                  </span>
                  <span className="flex-1 pt-0.5 text-foreground">{line.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Transcript simple (P1/P2/P4) */}
          {hasAudio && !isConversation && showTranscript && (
            <div className="p-4 rounded-xl bg-muted/50 text-sm text-foreground italic animate-fade-in">
              "{isPrompt ? q.prompt.text : q.transcript}"
            </div>
          )}

          {/* Lecture : passage simple ou multi-documents (P6/P7) */}
          {isReadingMulti && (
            <div className="space-y-3">
              {q.passages.map((p, i) => (
                <div key={i} className="p-4 rounded-xl bg-muted/30 text-sm text-foreground leading-relaxed">
                  {p.label && <div className="text-xs font-bold uppercase tracking-wide text-accent mb-1">{p.label}</div>}
                  <div className="whitespace-pre-line max-h-56 overflow-y-auto">{p.text}</div>
                </div>
              ))}
            </div>
          )}
          {isReading && !isReadingMulti && (
            <div className="p-4 rounded-xl bg-muted/30 text-sm text-foreground whitespace-pre-line leading-relaxed max-h-64 overflow-y-auto">
              {q.passage}
            </div>
          )}

          {/* Vocab : phrase à trous */}
          {isVocab && (
            <div className="p-4 rounded-xl bg-vocab/5 border border-vocab/20">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Complétez la phrase</div>
              <p className="text-lg text-foreground leading-relaxed">{q.sentence}</p>
            </div>
          )}

          {/* Énoncé */}
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Question</div>
            <p className="font-bold text-lg">{q.question || "Choisissez la bonne réponse"}</p>
          </div>

          {/* Choix */}
          <div className="space-y-2">
            {q.choices.map((choice, idx) => {
              const isSelected = selected === idx;
              const isAnswer = idx === q.answer;
              let style = "border-border bg-card hover:border-accent/40 hover:bg-accent/5";
              if (answered) {
                if (isAnswer) style = "border-primary bg-primary/10 text-primary";
                else if (isSelected) style = "border-destructive bg-destructive/10 text-destructive";
                else style = "border-border bg-card opacity-60";
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

          {/* Explication */}
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
                    ? `Excellent ! +${XP_PER_CORRECT[q.difficulty] ?? 15} XP pour cette question.`
                    : "Pas de souci, on apprend de ses erreurs !"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bouton suivant */}
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
