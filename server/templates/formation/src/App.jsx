// Starter `formation` (#181 É2) — orchestrateur du moteur pédagogique.
// Machine d'états à un écran à la fois (patron education.md : "jamais une
// liste, un écran à la fois") : Placement -> CarteParcours <-> (Leçon |
// Exercice | Révision) -> Bilan -> CarteParcours.
//
// Cette app est le STARTER (D1) : le curriculum/banque importés depuis
// src/data/curriculum-cafe.ts sont un EXEMPLE de preuve — la Fabrique (É3)
// les remplacera par le sujet demandé, sans toucher au reste de ce fichier.
import { useEffect, useMemo, useState } from "react";
import { diagnoseWeaknesses, estimateMastery, selectNextItem } from "./lib/engine";
import { dueItemIds, reviewItem } from "./lib/spaced";
import { loadLearnerModel, recordAnswer, saveLearnerModel, startBackgroundSync, subscribeBankExt } from "./lib/learner-store";
import { curriculum, items as bankItems } from "./data/curriculum-cafe";

import Placement from "./screens/Placement";
import CarteParcours from "./screens/CarteParcours";
import Lecon from "./screens/Lecon";
import Exercice from "./screens/Exercice";
import Revision from "./screens/Revision";
import Bilan from "./screens/Bilan";

const SESSION_BUDGET = 5; // items avant de proposer un Bilan (évite les sessions sans fin)

export default function App() {
  const [learner, setLearner] = useState(() => loadLearnerModel(curriculum.modules[0].id));
  const [screen, setScreen] = useState("carte");
  const [currentItem, setCurrentItem] = useState(null);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  // Extensions du Tuteur (É5) par module — point d'intégration le plus fragile
  // du design (§5.5 du plan) : ici on se contente de FUSIONNER par id, sans
  // dédoublonner autrement ; l'app fonctionne à l'identique si rien n'arrive
  // jamais (backend éteint : `subscribeBankExt` ne fait alors jamais rien).
  const [bankExt, setBankExt] = useState({});
  const [revisionQueue, setRevisionQueue] = useState([]);
  const [revisionIndex, setRevisionIndex] = useState(0);

  const allItems = useMemo(() => {
    const extra = Object.values(bankExt).flat();
    const byId = new Map();
    for (const it of [...bankItems, ...extra]) byId.set(it.id, it);
    return [...byId.values()];
  }, [bankExt]);

  useEffect(() => {
    const isFirstVisit = learner.historique.length === 0 && learner.modulesValides.length === 0;
    setScreen(isFirstVisit ? "placement" : "carte");
    const stopSync = startBackgroundSync();
    return stopSync;
    // volontairement [] : le placement ne doit se déclencher qu'au tout premier montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen !== "carte") return;
    const sub = subscribeBankExt(learner.moduleCourant, (list) => {
      setBankExt((prev) => ({ ...prev, [learner.moduleCourant]: list }));
    });
    return () => sub.stop();
  }, [screen, learner.moduleCourant]);

  function persist(next) {
    setLearner(next);
    saveLearnerModel(next);
  }

  // ---------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------
  function handlePlacementComplete(answers) {
    const mastery = { ...learner.mastery };
    const bySkill = new Map();
    for (const a of answers) {
      for (const s of a.item.skillIds) {
        if (!bySkill.has(s)) bySkill.set(s, []);
        bySkill.get(s).push({ correct: a.correct, difficulty: a.item.difficulty });
      }
    }
    for (const [skill, records] of bySkill.entries()) {
      mastery[skill] = estimateMastery(records, { priorMastery: 0.5 });
    }
    persist({ ...learner, mastery });
    setScreen("carte");
  }

  // ---------------------------------------------------------------------
  // Application d'une réponse (partagée Exercice + Révision + Leçon)
  // ---------------------------------------------------------------------
  function applyAnswer(item, correct) {
    const now = new Date();
    let next = recordAnswer(learner, item, correct, now);

    // Maîtrise : recalculée depuis l'historique complet des compétences touchées.
    const mastery = { ...next.mastery };
    for (const skill of item.skillIds) {
      const records = next.historique
        .filter((h) => h.skillIds.includes(skill))
        .map((h) => ({ correct: h.correct, difficulty: h.difficulty }));
      mastery[skill] = estimateMastery(records, { priorMastery: 0.5 });
    }
    next = { ...next, mastery };

    // FSRS (ou repli Leitner, cf. lib/spaced.ts) : jamais de throw.
    const { state: fsrsState } = reviewItem(item.id, next.fsrs[item.id], correct, now);
    next = { ...next, fsrs: { ...next.fsrs, [item.id]: fsrsState } };

    // Validation de module : maîtrise moyenne des compétences du module >= 0,6.
    const mod = curriculum.modules.find((m) => m.id === item.moduleId);
    if (mod && !next.modulesValides.includes(mod.id)) {
      const values = mod.skillIds.map((s) => next.mastery[s] ?? 0);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      if (avg >= 0.6) {
        const modulesValides = [...next.modulesValides, mod.id];
        const nextModule = curriculum.modules.find(
          (m) =>
            !modulesValides.includes(m.id) &&
            m.prerequis.every((p) => modulesValides.includes(p)),
        );
        next = { ...next, modulesValides, moduleCourant: nextModule ? nextModule.id : next.moduleCourant };
      }
    }

    persist(next);
    return next;
  }

  // ---------------------------------------------------------------------
  // Carte de parcours -> ouvrir un module
  // ---------------------------------------------------------------------
  function openModule(moduleId) {
    const next = moduleId === learner.moduleCourant ? learner : { ...learner, moduleCourant: moduleId };
    if (next !== learner) persist(next);
    setSessionAnswers([]);
    goToNextInSession(next);
  }

  function goToNextInSession(learnerState) {
    if (sessionAnswers.length >= SESSION_BUDGET) {
      setScreen("bilan");
      return;
    }
    const item = selectNextItem(allItems, learnerState, new Date());
    if (!item) {
      setScreen("bilan");
      return;
    }
    setCurrentItem(item);
    setScreen(item.type === "lecon" ? "lecon" : "exercice");
  }

  function handleLeconDone() {
    const next = applyAnswer(currentItem, true);
    setSessionAnswers((prev) => [...prev, { item: currentItem, correct: true }]);
    if (sessionAnswers.length + 1 >= SESSION_BUDGET) {
      setScreen("bilan");
    } else {
      goToNextInSession(next);
    }
  }

  function handleExerciceAnswered(correct) {
    const next = applyAnswer(currentItem, correct);
    setSessionAnswers((prev) => [...prev, { item: currentItem, correct }]);
    if (sessionAnswers.length + 1 >= SESSION_BUDGET) {
      setScreen("bilan");
    } else {
      goToNextInSession(next);
    }
  }

  // ---------------------------------------------------------------------
  // Révision (file FSRS du jour)
  // ---------------------------------------------------------------------
  function openRevision() {
    const now = new Date();
    const dueIds = dueItemIds(learner.fsrs, now);
    const byId = new Map(allItems.map((it) => [it.id, it]));
    const queue = dueIds.map((id) => byId.get(id)).filter(Boolean);
    setRevisionQueue(queue);
    setRevisionIndex(0);
    setSessionAnswers([]);
    setScreen("revision");
  }

  function handleRevisionAnswered(correct) {
    const item = revisionQueue[revisionIndex];
    applyAnswer(item, correct);
    setSessionAnswers((prev) => [...prev, { item, correct }]);
    if (revisionIndex + 1 < revisionQueue.length) {
      setRevisionIndex(revisionIndex + 1);
    } else {
      setScreen("bilan");
    }
  }

  const dueCount = useMemo(() => dueItemIds(learner.fsrs, new Date()).length, [learner.fsrs]);
  const weaknesses = useMemo(() => diagnoseWeaknesses(learner), [learner]);

  if (screen === "placement") {
    return <Placement curriculum={curriculum} items={allItems} onComplete={handlePlacementComplete} />;
  }
  if (screen === "lecon" && currentItem) {
    return <Lecon item={currentItem} onDone={handleLeconDone} />;
  }
  if (screen === "exercice" && currentItem) {
    return (
      <Exercice
        item={currentItem}
        progress={`${sessionAnswers.length + 1}/${SESSION_BUDGET}`}
        onAnswered={handleExerciceAnswered}
      />
    );
  }
  if (screen === "revision") {
    return <Revision queue={revisionQueue} index={revisionIndex} onAnswered={handleRevisionAnswered} />;
  }
  if (screen === "bilan") {
    return <Bilan sessionAnswers={sessionAnswers} weaknesses={weaknesses} onRetour={() => setScreen("carte")} />;
  }
  return (
    <CarteParcours
      curriculum={curriculum}
      learner={learner}
      dueCount={dueCount}
      onOpenModule={openModule}
      onOpenRevision={openRevision}
    />
  );
}
