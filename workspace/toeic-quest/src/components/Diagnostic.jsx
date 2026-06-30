import { useState } from "react";
import { PART_NAME, PART_EMOJI, CURRICULUM } from "../data/curriculum.js";
import { PartBar } from "./PartBar.jsx";
import { ScoreDisplay, Reveal } from "./Gamification.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";

const PARTS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];

// Diagnostic par partie TOEIC : forces, faiblesses, recommandations.
export function Diagnostic({ progress, onOpenModule, onBack }) {
  const { state } = progress;
  const partStats = state.partStats || {};
  const [confirmReset, setConfirmReset] = useState(false);

  // Parties travaillées, triées par précision croissante (les plus faibles d'abord).
  const worked = PARTS
    .map((p) => ({ part: p, ...(partStats[p] || { correct: 0, total: 0 }) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => (a.correct / a.total) - (b.correct / b.total));

  const weakest = worked.filter((p) => p.correct / p.total < 0.8).slice(0, 2);

  // Modules recommandés pour renforcer les parties faibles.
  const recos = weakest.flatMap((w) =>
    CURRICULUM.filter((m) => m.parts.includes(w.part) && !m.isExam).slice(0, 1).map((m) => ({ ...m, weakPart: w.part }))
  );

  const lr = {
    listening: state.skillStats?.listening || { correct: 0, total: 0 },
    reading: state.skillStats?.reading || { correct: 0, total: 0 },
  };
  const acc = (s) => (s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0);

  return (
    <div className="py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-extrabold">Diagnostic</h1>
        <Button variant="ghost" size="sm" onClick={onBack}>← Accueil</Button>
      </div>

      {/* Score + L vs R */}
      <Reveal>
        <Card>
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
            <ScoreDisplay score={state.estimatedScore} size="lg" />
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-extrabold text-listening">{acc(lr.listening)}%</div>
                <div className="text-xs text-muted-foreground">🎧 Listening</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-extrabold text-reading">{acc(lr.reading)}%</div>
                <div className="text-xs text-muted-foreground">📖 Reading</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Maîtrise par partie */}
      <Reveal delay={100}>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="font-bold text-lg">Maîtrise par partie TOEIC</h2>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              {PARTS.map((p) => (
                <PartBar key={p} part={p} correct={partStats[p]?.correct || 0} total={partStats[p]?.total || 0} />
              ))}
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Recommandations */}
      {recos.length > 0 && (
        <Reveal delay={150}>
          <Card className="border-2 border-accent/30 bg-accent/5">
            <CardContent className="pt-6 space-y-3">
              <h2 className="font-bold text-lg">À renforcer en priorité</h2>
              {recos.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                  <span className="text-2xl">{PART_EMOJI[m.weakPart]}</span>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{PART_NAME[m.weakPart]}</div>
                    <div className="text-xs text-muted-foreground">Module conseillé : {m.title}</div>
                  </div>
                  <Button size="sm" onClick={() => onOpenModule(m.id)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    Travailler →
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </Reveal>
      )}

      {worked.length === 0 && (
        <p className="text-center text-muted-foreground py-8">Commence quelques sessions pour générer ton diagnostic par partie. 📊</p>
      )}

      {/* Réinitialisation de la progression */}
      <Reveal delay={200}>
        <Card className="border-destructive/20">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold">Réinitialiser ma progression</div>
              <div className="text-sm text-muted-foreground">Efface XP, niveau, badges, parcours et placement. Irréversible.</div>
            </div>
            {!confirmReset ? (
              <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setConfirmReset(true)}>
                Réinitialiser
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Annuler</Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { progress.resetProgress(); setConfirmReset(false); onBack(); }}
                >
                  Confirmer la remise à zéro
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}
