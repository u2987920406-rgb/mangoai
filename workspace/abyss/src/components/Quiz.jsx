import { useState, useCallback } from "react";
import { QUIZ_QUESTIONS } from "../data/abyssData.js";

export function Quiz() {
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState([]);

  const question = QUIZ_QUESTIONS[currentQ];

  const handleSelect = useCallback(
    (idx) => {
      if (showFeedback) return;
      setSelectedAnswer(idx);
      setShowFeedback(true);
      const isCorrect = idx === question.correct;
      if (isCorrect) setScore((s) => s + 1);
      setAnswers((prev) => [...prev, { qIndex: currentQ, selected: idx, correct: isCorrect }]);
    },
    [showFeedback, currentQ, question]
  );

  const handleNext = useCallback(() => {
    if (currentQ < QUIZ_QUESTIONS.length - 1) {
      setCurrentQ((q) => q + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
    } else {
      setFinished(true);
    }
  }, [currentQ]);

  const handleRestart = useCallback(() => {
    setCurrentQ(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setScore(0);
    setFinished(false);
    setAnswers([]);
  }, []);

  // ── Écran de fin ──
  if (finished) {
    const percentage = Math.round((score / QUIZ_QUESTIONS.length) * 100);
    let message, emoji;
    if (percentage === 100) {
      message = "Parfait ! Vous êtes un véritable explorateur des abysses.";
      emoji = "🌊";
    } else if (percentage >= 60) {
      message = "Bien joué ! Vous connaissez bien les profondeurs.";
      emoji = "🐠";
    } else if (percentage >= 40) {
      message = "Pas mal ! Il reste encore des mystères à percer.";
      emoji = "🐟";
    } else {
      message = "Les abysses gardent leurs secrets... pour l'instant.";
      emoji = "🦑";
    }

    return (
      <section id="quiz" className="relative py-20 scroll-mt-20">
        <div className="mx-auto max-w-2xl px-6">
          <div className="abyss-reveal rounded-2xl bg-[#061325]/80 border border-cyan-400/20 p-8 md:p-12 text-center shadow-2xl">
            <div className="text-6xl mb-4">{emoji}</div>
            <h2 className="text-3xl font-bold text-white mb-2">Quiz terminé !</h2>
            <div className="my-6">
              <div className="text-5xl font-bold text-[#F2A33C]">{score}/{QUIZ_QUESTIONS.length}</div>
              <div className="text-white/50 text-sm mt-1">{percentage}% de bonnes réponses</div>
            </div>
            <p className="text-white/70 mb-8">{message}</p>

            {/* Récap des réponses */}
            <div className="space-y-2 mb-8 text-left">
              {QUIZ_QUESTIONS.map((q, i) => {
                const ans = answers.find((a) => a.qIndex === i);
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
                      ans?.correct
                        ? "bg-green-500/10 border border-green-400/20"
                        : "bg-red-500/10 border border-red-400/20"
                    }`}
                  >
                    <span className="text-lg">{ans?.correct ? "✓" : "✗"}</span>
                    <span className="text-white/70 flex-1">{q.question}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleRestart}
              className="px-6 py-3 rounded-full bg-[#F2A33C] text-[#031528] font-semibold text-sm hover:bg-[#ffba50] transition-colors"
            >
              Recommencer le quiz
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Question en cours ──
  return (
    <section id="quiz" className="relative py-20 scroll-mt-20">
      <div className="mx-auto max-w-2xl px-6">
        {/* En-tête */}
        <div className="text-center mb-8 abyss-reveal">
          <span className="text-xs uppercase tracking-[0.3em] text-cyan-300/60 font-medium">
            Testez vos connaissances
          </span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-3 mb-4">
            Quiz des abysses
          </h2>
        </div>

        <div className="abyss-reveal rounded-2xl bg-[#061325]/80 border border-white/10 p-6 md:p-8 shadow-2xl">
          {/* Barre de progression */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-white/50">
              Question {currentQ + 1} / {QUIZ_QUESTIONS.length}
            </span>
            <span className="text-sm text-[#F2A33C] font-semibold">Score : {score}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/10 mb-8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#F2A33C] transition-all duration-500"
              style={{ width: `${((currentQ + (showFeedback ? 1 : 0)) / QUIZ_QUESTIONS.length) * 100}%` }}
            />
          </div>

          {/* Question */}
          <h3 className="text-xl md:text-2xl font-bold text-white mb-6">
            {question.question}
          </h3>

          {/* Options */}
          <div className="space-y-3">
            {question.options.map((opt, idx) => {
              let style = "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:border-cyan-400/30";
              if (showFeedback) {
                if (idx === question.correct) {
                  style = "bg-green-500/15 border-green-400/40 text-white";
                } else if (idx === selectedAnswer) {
                  style = "bg-red-500/15 border-red-400/40 text-white";
                } else {
                  style = "bg-white/5 border-white/10 text-white/40";
                }
              }
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={showFeedback}
                  className={`w-full text-left px-5 py-4 rounded-xl border transition-all duration-300 ${style} ${
                    !showFeedback ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-sm font-mono">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt}</span>
                    {showFeedback && idx === question.correct && (
                      <span className="ml-auto text-green-400">✓</span>
                    )}
                    {showFeedback && idx === selectedAnswer && idx !== question.correct && (
                      <span className="ml-auto text-red-400">✗</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {showFeedback && (
            <div className="mt-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-400/20">
              <p className="text-sm text-white/80">
                <span className="text-cyan-300 font-semibold">
                  {selectedAnswer === question.correct ? "Correct ! " : "Pas tout à fait. "}
                </span>
                {question.explanation}
              </p>
              <button
                onClick={handleNext}
                className="mt-4 px-6 py-2.5 rounded-full bg-[#F2A33C] text-[#031528] font-semibold text-sm hover:bg-[#ffba50] transition-colors"
              >
                {currentQ < QUIZ_QUESTIONS.length - 1 ? "Question suivante →" : "Voir mon score →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}