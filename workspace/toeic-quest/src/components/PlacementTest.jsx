import { useState } from "react";
import { SessionPlay } from "./SessionPlay.jsx";
import { Mascot } from "./Mascot.jsx";
import { Confetti } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { PLACEMENT } from "../data/bank/index.js";
import { LEVELS } from "../data/curriculum.js";

// Test de placement : situe l'utilisateur (Débutant / Intermédiaire / Avancé).
export function PlacementTest({ progress, onDone, onSkip }) {
  const [phase, setPhase] = useState("intro"); // intro | test | verdict
  const [verdict, setVerdict] = useState(null);

  const handleFinish = (sessionData) => {
    if (sessionData === null) { onSkip(); return; }
    const placed = progress.recordPlacement(sessionData.correct, sessionData.total);
    setVerdict({ level: placed, correct: sessionData.correct, total: sessionData.total });
    setPhase("verdict");
  };

  if (phase === "intro") {
    return (
      <div className="py-10 max-w-xl mx-auto text-center space-y-5">
        <Mascot mood="excited" size={120} className="mx-auto" />
        <h1 className="text-3xl font-extrabold">Test de placement</h1>
        <p className="text-muted-foreground">
          {PLACEMENT.length} questions rapides couvrant les 7 parties du TOEIC, de la plus simple à la plus
          corsée. Elles me permettent de situer ton niveau et d'adapter ton parcours. Aucun stress : c'est juste un repère !
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => setPhase("test")} className="bg-accent text-accent-foreground hover:bg-accent/90">
            ▶ Commencer le test
          </Button>
          <Button size="lg" variant="outline" onClick={onSkip}>Passer (démarrer en Débutant)</Button>
        </div>
      </div>
    );
  }

  if (phase === "test") {
    return <SessionPlay mode="mixed" questions={PLACEMENT} onFinish={handleFinish} />;
  }

  // verdict
  const lvl = LEVELS[verdict.level];
  return (
    <div className="py-10 max-w-xl mx-auto text-center space-y-5">
      <Confetti show count={40} />
      <Mascot mood="celebrating" size={120} className="mx-auto" />
      <h1 className="text-3xl font-extrabold">Niveau {lvl.name} {lvl.emoji}</h1>
      <p className="text-muted-foreground">
        Tu as obtenu <span className="font-bold text-foreground">{verdict.correct}/{verdict.total}</span>.
        Je te place au niveau <span className="font-bold text-foreground">{lvl.name}</span> (score visé {lvl.scoreRange}).
        On pourra monter de niveau en réussissant les bilans !
      </p>
      <Button size="lg" onClick={() => onDone(verdict.level)} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Voir mon parcours →
      </Button>
    </div>
  );
}
