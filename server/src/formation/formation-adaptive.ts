// Boucle adaptative RAPIDE du moteur pédagogique (#181 É1, cf. plan D4) — PUR.
//
// Aucune I/O directe : pas d'accès disque/réseau, pas de `Math.random()` ni de
// `Date.now()` bruts. Tout ce qui touche l'horloge est un paramètre `now`
// injecté par l'appelant (le starter É2 passera `new Date()`, les tests une
// date fixe) — pattern « deps injectées » de tout le repo (cf. `eleve-runtime.ts`).
//
// Ce module ne fait QUE la boucle RAPIDE côté client (estimation de maîtrise,
// sélection du prochain item, ajustement de difficulté, diagnostic de
// faiblesses). La boucle LENTE (le Tuteur, génération LLM) vit ailleurs (É5) ;
// `diagnoseWeaknesses` ici est le spine pur qu'É5 réutilisera tel quel.

import {
  DIFFICULTY_MIN,
  DIFFICULTY_MAX,
  type AnswerRecord,
  type Item,
  type ItemFsrsState,
  type LearnerModel,
  type SkillId,
} from "./formation-model.js";

// ---------------------------------------------------------------------------
// estimateMastery — EWMA pondérée par difficulté
// ---------------------------------------------------------------------------

export interface MasteryOptions {
  /** Taux d'apprentissage de base de l'EWMA (0..1). Défaut 0.3. */
  alpha?: number;
  /** Maîtrise de départ si aucune réponse. Défaut 0.5 (neutre). */
  priorMastery?: number;
}

/**
 * Estime la maîtrise (0..1) d'une compétence à partir d'une séquence de
 * réponses (dans l'ordre chronologique), en pondérant chaque mise à jour par
 * la difficulté de l'item (une réussite sur un item difficile compte plus
 * qu'une réussite sur un item facile ; un échec sur un item facile pèse plus
 * qu'un échec sur un item difficile). Déterministe, < 1 ms, aucune I/O.
 */
export function estimateMastery(
  answers: Array<Pick<AnswerRecord, "correct" | "difficulty">>,
  opts: MasteryOptions = {},
): number {
  const alpha = opts.alpha ?? 0.3;
  let mastery = opts.priorMastery ?? 0.5;
  if (answers.length === 0) return clamp01(mastery);

  for (const a of answers) {
    const score = a.correct ? 1 : 0;
    // Poids de difficulté normalisé en 0..1 (1 = plus difficile).
    const w = clamp01((a.difficulty - DIFFICULTY_MIN) / (DIFFICULTY_MAX - DIFFICULTY_MIN));
    // Une réussite difficile pousse fort ; un échec facile pousse fort aussi.
    // Un échec difficile ou une réussite facile pousse peu (information faible).
    const effectiveAlpha = a.correct ? alpha * (0.5 + 0.5 * w) : alpha * (1 - 0.5 * w);
    mastery = mastery * (1 - effectiveAlpha) + score * effectiveAlpha;
  }
  return clamp01(mastery);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ---------------------------------------------------------------------------
// adjustDifficulty
// ---------------------------------------------------------------------------

export interface DifficultyThresholds {
  /** Au-dessus de ce seuil de maîtrise, monter d'un cran. Défaut 0.8. */
  up?: number;
  /** En dessous de ce seuil de maîtrise, descendre d'un cran. Défaut 0.4. */
  down?: number;
}

/** Monte/descend la difficulté d'un cran selon la maîtrise, bornée [MIN, MAX]. */
export function adjustDifficulty(
  currentDifficulty: number,
  mastery: number,
  thresholds: DifficultyThresholds = {},
): number {
  const up = thresholds.up ?? 0.8;
  const down = thresholds.down ?? 0.4;
  let next = currentDifficulty;
  if (mastery >= up) next = currentDifficulty + 1;
  else if (mastery < down) next = currentDifficulty - 1;
  return Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, next));
}

// ---------------------------------------------------------------------------
// selectNextItem — files FSRS dues > compétences faibles > progression
// ---------------------------------------------------------------------------

export interface SelectNextItemOptions {
  /** Seuil de maîtrise en dessous duquel une compétence est jugée faible. Défaut 0.5. */
  weakThreshold?: number;
}

/**
 * Sélectionne l'item suivant à proposer, par ordre de priorité :
 * 1. items dont l'état FSRS est ÉCHU (due <= now), le plus en retard d'abord ;
 * 2. items du module courant touchant une compétence FAIBLE (mastery < seuil),
 *    triés par id pour la stabilité ;
 * 3. progression : premier item non répondu du module courant, dans l'ordre du curriculum.
 * Déterministe à `now` fixe : aucune horloge/aléa interne, tri stable par id
 * à égalité de critère.
 */
export function selectNextItem(
  items: Item[],
  learner: LearnerModel,
  now: Date,
): Item | null {
  if (items.length === 0) return null;
  const nowMs = now.getTime();

  // 1) files FSRS dues, la plus en retard en premier.
  const due = items
    .filter((it) => {
      const st = learner.fsrs[it.id];
      return st !== undefined && new Date(st.due).getTime() <= nowMs;
    })
    .sort((a, b) => {
      const da = new Date(learner.fsrs[a.id].due).getTime();
      const db = new Date(learner.fsrs[b.id].due).getTime();
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });
  if (due.length > 0) return due[0];

  // 2) compétences faibles dans le module courant.
  const weakThreshold = 0.5;
  const courant = items
    .filter((it) => it.moduleId === learner.moduleCourant)
    .sort((a, b) => a.id.localeCompare(b.id));

  const weak = courant.filter((it) =>
    it.skillIds.some((s) => (learner.mastery[s] ?? 0) < weakThreshold),
  );
  if (weak.length > 0) return weak[0];

  // 3) progression : premier item du module courant jamais répondu.
  const answered = new Set(learner.historique.map((h) => h.itemId));
  const unanswered = courant.filter((it) => !answered.has(it.id));
  if (unanswered.length > 0) return unanswered[0];

  // Rien à faire dans le module courant : renvoyer le premier item global (stable).
  const all = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return all[0] ?? null;
}

// ---------------------------------------------------------------------------
// diagnoseWeaknesses — compétences sous seuil malgré N tentatives (D4)
// ---------------------------------------------------------------------------

export interface DiagnoseOptions {
  /** Maîtrise en dessous de laquelle une compétence est considérée faible. Défaut 0.5. */
  masteryThreshold?: number;
  /** Nombre minimal de tentatives observées avant de diagnostiquer (évite le faux signal à froid). Défaut 3. */
  minAttempts?: number;
}

export interface WeaknessDiagnosis {
  skillId: SkillId;
  mastery: number;
  attempts: number;
  /** Nombre d'échecs consécutifs les plus récents sur cette compétence (pattern d'erreur récurrent). */
  recentConsecutiveErrors: number;
}

/**
 * Diagnostique les compétences PERSISTANTES sous le seuil de maîtrise malgré
 * un nombre suffisant de tentatives (pas un simple creux passager), et repère
 * les patterns d'erreurs récurrentes (échecs consécutifs récents). Réutilisé
 * tel quel par le Tuteur (É5) pour cibler la génération d'exercices.
 */
export function diagnoseWeaknesses(
  learner: LearnerModel,
  opts: DiagnoseOptions = {},
): WeaknessDiagnosis[] {
  const masteryThreshold = opts.masteryThreshold ?? 0.5;
  const minAttempts = opts.minAttempts ?? 3;

  const bySkill = new Map<SkillId, AnswerRecord[]>();
  for (const rec of learner.historique) {
    for (const s of rec.skillIds) {
      if (!bySkill.has(s)) bySkill.set(s, []);
      bySkill.get(s)!.push(rec);
    }
  }

  const out: WeaknessDiagnosis[] = [];
  for (const [skillId, records] of bySkill.entries()) {
    const attempts = records.length;
    if (attempts < minAttempts) continue;
    const mastery = learner.mastery[skillId] ?? 0.5;
    if (mastery >= masteryThreshold) continue;

    // Échecs consécutifs récents : compter depuis la fin tant que c'est faux.
    let recentConsecutiveErrors = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].correct) break;
      recentConsecutiveErrors++;
    }

    out.push({ skillId, mastery, attempts, recentConsecutiveErrors });
  }

  // Tri stable : compétences les plus faibles d'abord, puis par id.
  out.sort((a, b) => {
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.skillId.localeCompare(b.skillId);
  });
  return out;
}

export type { ItemFsrsState };
