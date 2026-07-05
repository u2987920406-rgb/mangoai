// Starter `formation` (#181 É2) — moteur de répétition espacée (décision D3).
//
// FSRS (Free Spaced Repetition Scheduler, l'algorithme par défaut d'Anki depuis
// fin 2023) via la lib `ts-fsrs` (MIT, TypeScript, zéro dépendance). Par-dessus,
// un repli LEITNER pur (5 boîtes, intervalles fixes, JS pur, zéro dépendance) :
// si `ts-fsrs` manque ou que l'appel plante pour une raison quelconque (version
// incompatible, entrée corrompue…), on bascule automatiquement sur Leitner —
// LE MOTEUR NE CASSE JAMAIS. C'est la garantie testée dans ce fichier (voir le
// test offline du scaffold : mock qui fait planter `ts-fsrs`, la révision
// continue quand même).
//
// Le type `ItemFsrsState` (contrat avec lib/engine.ts, copie du spine É1) ne
// porte que les champs universels (due/stability/difficulty/reps/lapses).
// ts-fsrs a besoin de plus (state, elapsed_days, scheduled_days…) : on les
// RECONSTRUIT à chaque appel à partir de due/lastReview/reps (approximation
// documentée — limite honnête : un redémarrage ne perd pas la date d'échéance,
// mais un détail fin de l'état interne FSRS — ex. le numéro d'étape
// d'apprentissage — n'est pas persisté à l'identique d'une session à l'autre).

import * as fsrsLib from "ts-fsrs";
import type { ItemFsrsState } from "./engine";

export type SpacedEngine = "fsrs" | "leitner";

export interface ReviewResult {
  state: ItemFsrsState;
  /** Quel moteur a réellement produit ce résultat (observabilité / tests). */
  engine: SpacedEngine;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** État initial d'un item jamais révisé : échu immédiatement (due = now). */
export function createInitialFsrsState(itemId: string, now: Date): ItemFsrsState {
  return {
    itemId,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
  };
}

// ---------------------------------------------------------------------------
// FSRS (ts-fsrs) — instance mémoïsée, jamais construite deux fois inutilement.
// ---------------------------------------------------------------------------

let cachedScheduler: ReturnType<typeof fsrsLib.fsrs> | null | undefined;

/** Construit (ou réutilise) le scheduler FSRS. `null` si l'init échoue —
 * jamais d'exception qui remonte à l'appelant. */
function getScheduler(): ReturnType<typeof fsrsLib.fsrs> | null {
  if (cachedScheduler !== undefined) return cachedScheduler;
  try {
    cachedScheduler = fsrsLib.fsrs(fsrsLib.generatorParameters({ enable_fuzz: false }));
  } catch {
    cachedScheduler = null;
  }
  return cachedScheduler;
}

/** Reconstruit un Card ts-fsrs complet à partir de notre état réduit. */
function toFsrsCard(state: ItemFsrsState | undefined, now: Date): fsrsLib.Card {
  if (!state || state.reps === 0) {
    return fsrsLib.createEmptyCard(now);
  }
  const lastReview = state.lastReview ? new Date(state.lastReview) : now;
  const due = new Date(state.due);
  return {
    due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: Math.max(0, Math.round((now.getTime() - lastReview.getTime()) / MS_PER_DAY)),
    scheduled_days: Math.max(0, Math.round((due.getTime() - lastReview.getTime()) / MS_PER_DAY)),
    reps: state.reps,
    lapses: state.lapses,
    learning_steps: 0,
    // reps > 0 → au moins passé par un premier "Review" (state=2) une fois ;
    // c'est l'approximation documentée ci-dessus.
    state: state.reps > 0 ? 2 : 0,
    last_review: state.lastReview ? lastReview : undefined,
  } as fsrsLib.Card;
}

function fromFsrsCard(itemId: string, card: fsrsLib.Card, now: Date): ItemFsrsState {
  return {
    itemId,
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Leitner pur — repli JS sans dépendance, 5 boîtes, intervalles fixes (jours).
// ---------------------------------------------------------------------------

/** Intervalles (jours) des 5 boîtes Leitner : boîte 1 = révision quasi
 * immédiate, boîte 5 = les cartes bien sues reviennent rarement. */
export const LEITNER_INTERVALS_DAYS = [1, 2, 4, 9, 21] as const;

/** Le numéro de boîte (1..5) est réutilisé dans le champ `stability` en mode
 * Leitner (documenté : ce champ n'est PAS une vraie stabilité FSRS dans ce
 * mode — les deux moteurs ne mélangent jamais leurs données pour un même item
 * dans une session donnée : soit ts-fsrs est dispo pour toute la session, soit
 * il ne l'est pas). */
function leitnerReview(itemId: string, previous: ItemFsrsState | undefined, correct: boolean, now: Date): ItemFsrsState {
  const previousBox = previous ? Math.min(5, Math.max(1, Math.round(previous.stability) || 1)) : 1;
  const nextBox = correct ? Math.min(5, previousBox + 1) : 1;
  const intervalDays = LEITNER_INTERVALS_DAYS[nextBox - 1];
  const due = new Date(now.getTime() + intervalDays * MS_PER_DAY);
  return {
    itemId,
    due: due.toISOString(),
    stability: nextBox,
    difficulty: previous?.difficulty ?? 0,
    reps: (previous?.reps ?? 0) + 1,
    lapses: (previous?.lapses ?? 0) + (correct ? 0 : 1),
    lastReview: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Enregistre une révision (réussie ou non) et renvoie le nouvel état de la
 * carte. Essaie FSRS d'abord ; bascule sur Leitner AU MOINDRE PROBLÈME (lib
 * absente, scheduler non instanciable, calcul qui lève) — ne lève jamais.
 */
export function reviewItem(
  itemId: string,
  previous: ItemFsrsState | undefined,
  correct: boolean,
  now: Date,
): ReviewResult {
  const scheduler = getScheduler();
  if (scheduler) {
    try {
      const card = toFsrsCard(previous, now);
      const rating = correct ? fsrsLib.Rating.Good : fsrsLib.Rating.Again;
      const { card: nextCard } = scheduler.next(card, now, rating);
      return { state: fromFsrsCard(itemId, nextCard, now), engine: "fsrs" };
    } catch {
      // Repli silencieux — jamais planter le parcours de révision de l'apprenant.
    }
  }
  return { state: leitnerReview(itemId, previous, correct, now), engine: "leitner" };
}

/** Items dont la carte est échue (due <= now), triés du plus en retard au moins. */
export function dueItemIds(fsrs: Record<string, ItemFsrsState>, now: Date): string[] {
  const nowMs = now.getTime();
  return Object.values(fsrs)
    .filter((st) => new Date(st.due).getTime() <= nowMs)
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .map((st) => st.itemId);
}
