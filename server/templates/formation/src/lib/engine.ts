// Starter `formation` (#181 É2) — copie COMPILABLE du spine pur É1
// (server/src/formation-model.ts + server/src/formation-adaptive.ts).
//
// Pourquoi une COPIE et pas un import : ce starter est un projet Vite
// indépendant (client, aucun accès au code serveur au build). Décision D1 du
// plan #181 : « copie compilable du spine É1 dans le starter ».
//
// Décision de détail (zod vs TS pur) : on GARDE zod, pour trois raisons —
// (1) zod est déjà dans la SAFE_DEPENDENCIES d'`add_dependency` (utilisé par
// d'autres starters, ex. react-hook-form+zod), donc zéro coût d'acceptabilité ;
// (2) le poids réel (~13 Ko gzip) est négligeable à côté de react+tailwind+
// ts-fsrs déjà embarqués ; (3) le risque de DÉRIVE entre le schéma serveur
// (formation-model.ts) et une réécriture manuelle en TS pur est bien plus cher
// qu'une poignée de Ko — une formation entière peut être rejetée par un schéma
// qui a divergé silencieusement. Garder les DEUX fichiers fidèles/synchronisés
// à la main (même patron de validation, mêmes messages) est le pari le plus sûr.
//
// AUCUNE I/O ici (comme l'original) : pas de fetch/localStorage/Date.now bruts.
// L'horloge (`now`) et les dépendances sont injectées par l'appelant (lib/
// learner-store.ts, les écrans).

import { z } from "zod";

// ---------------------------------------------------------------------------
// Identifiants
// ---------------------------------------------------------------------------

/** Identifiant de compétence — chaîne simple, ex. "grammaire.present-simple". */
export type SkillId = string;
export const SkillIdSchema = z.string().min(1);

// ---------------------------------------------------------------------------
// ModuleSpec / Curriculum
// ---------------------------------------------------------------------------

export const ITEM_TYPES = ["qcm", "flashcard", "texte-a-trous", "appariement", "lecon"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface ModuleSpec {
  id: string;
  titre: string;
  skillIds: SkillId[];
  prerequis: string[];
  typesAttendus: ItemType[];
}

export const ModuleSpecSchema = z.object({
  id: z.string().min(1),
  titre: z.string().min(1),
  skillIds: z.array(SkillIdSchema).min(1),
  prerequis: z.array(z.string()),
  typesAttendus: z.array(z.enum(ITEM_TYPES)).min(1),
});

export interface Curriculum {
  sujet: string;
  langue: string;
  niveau: string;
  modules: ModuleSpec[];
}

export const CurriculumSchema = z.object({
  sujet: z.string().min(1),
  langue: z.string().min(1),
  niveau: z.string().min(1),
  modules: z.array(ModuleSpecSchema).min(1),
});

// ---------------------------------------------------------------------------
// Item — union discriminée par type
// ---------------------------------------------------------------------------

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;
const DifficultySchema = z.number().int().min(DIFFICULTY_MIN).max(DIFFICULTY_MAX);

const ItemBaseSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  skillIds: z.array(SkillIdSchema).min(1),
  difficulty: DifficultySchema,
});

export const QcmItemSchema = ItemBaseSchema.extend({
  type: z.literal("qcm"),
  question: z.string().min(1),
  choix: z.array(z.string().min(1)).min(2),
  reponse: z.number().int().min(0),
  explication: z.string().min(1),
}).refine((it) => it.reponse < it.choix.length, { message: "reponse hors bornes de choix" })
  .refine((it) => new Set(it.choix.map((c) => c.trim().toLowerCase())).size === it.choix.length, { message: "choix dupliqués" });

export const FlashcardItemSchema = ItemBaseSchema.extend({
  type: z.literal("flashcard"),
  recto: z.string().min(1),
  verso: z.string().min(1),
});

export const TexteATrousItemSchema = ItemBaseSchema.extend({
  type: z.literal("texte-a-trous"),
  texte: z.string().min(1).refine((t) => t.includes("___"), { message: "aucun trou (___) dans le texte" }),
  reponses: z.array(z.string().min(1)).min(1),
});

export const AppariementItemSchema = ItemBaseSchema.extend({
  type: z.literal("appariement"),
  paires: z.array(z.object({ gauche: z.string().min(1), droite: z.string().min(1) })).min(2),
});

export const LeconItemSchema = ItemBaseSchema.extend({
  type: z.literal("lecon"),
  titre: z.string().min(1),
  contenu: z.string().min(1),
  // Décision D5 : chaque leçon porte des sources déclarées, non vides —
  // l'apprenant VOIT les sources (contrôle anti-hallucination visible dans l'UI).
  sources: z.array(z.string().min(1)).min(1),
});

export const ItemSchema = z.discriminatedUnion("type", [
  QcmItemSchema,
  FlashcardItemSchema,
  TexteATrousItemSchema,
  AppariementItemSchema,
  LeconItemSchema,
]);

export type QcmItem = z.infer<typeof QcmItemSchema>;
export type FlashcardItem = z.infer<typeof FlashcardItemSchema>;
export type TexteATrousItem = z.infer<typeof TexteATrousItemSchema>;
export type AppariementItem = z.infer<typeof AppariementItemSchema>;
export type LeconItem = z.infer<typeof LeconItemSchema>;
export type Item = z.infer<typeof ItemSchema>;

// ---------------------------------------------------------------------------
// LearnerModel
// ---------------------------------------------------------------------------

/** État FSRS minimal porté par item — juste les CHAMPS, l'algorithme vit dans lib/spaced.ts. */
export interface ItemFsrsState {
  itemId: string;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview?: string;
}

export interface AnswerRecord {
  itemId: string;
  skillIds: SkillId[];
  difficulty: number;
  correct: boolean;
  at: string;
}

export interface LearnerModel {
  mastery: Record<SkillId, number>;
  moduleCourant: string;
  modulesValides: string[];
  historique: AnswerRecord[];
  fsrs: Record<string, ItemFsrsState>;
}

const ItemFsrsStateSchema = z.object({
  itemId: z.string().min(1),
  due: z.string().min(1),
  stability: z.number().min(0),
  difficulty: z.number().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastReview: z.string().optional(),
});

const AnswerRecordSchema = z.object({
  itemId: z.string().min(1),
  skillIds: z.array(SkillIdSchema).min(1),
  difficulty: DifficultySchema,
  correct: z.boolean(),
  at: z.string().min(1),
});

export const LearnerModelSchema = z.object({
  mastery: z.record(z.string(), z.number().min(0).max(1)),
  moduleCourant: z.string().min(1),
  modulesValides: z.array(z.string()),
  historique: z.array(AnswerRecordSchema),
  fsrs: z.record(z.string(), ItemFsrsStateSchema),
});

/** Modèle d'apprenant vierge — utilisé au premier lancement (avant le Placement). */
export function emptyLearnerModel(moduleCourant: string): LearnerModel {
  return { mastery: {}, moduleCourant, modulesValides: [], historique: [], fsrs: {} };
}

// ---------------------------------------------------------------------------
// FormationManifest (D6) — le starter n'écrit pas ce manifest (c'est la Fabrique,
// É3), mais le type voyage avec les données bundlées (curriculum + décisions).
// ---------------------------------------------------------------------------

export const MODULE_STATES = ["a_faire", "genere", "verifie", "integre"] as const;
export type ModuleState = (typeof MODULE_STATES)[number];

export interface FormationDecisions {
  palette: string[];
  typesItemsRetenus: ItemType[];
  sourcesMaitresses: string[];
}

export interface FormationManifest {
  sujet: string;
  curriculum: Curriculum;
  etatModules: Record<string, ModuleState>;
  decisions: FormationDecisions;
}

const FormationDecisionsSchema = z.object({
  palette: z.array(z.string().min(1)),
  typesItemsRetenus: z.array(z.enum(ITEM_TYPES)).min(1),
  sourcesMaitresses: z.array(z.string().min(1)),
});

export const FormationManifestSchema = z.object({
  sujet: z.string().min(1),
  curriculum: CurriculumSchema,
  etatModules: z.record(z.string(), z.enum(MODULE_STATES)),
  decisions: FormationDecisionsSchema,
}).refine(
  (m) => m.curriculum.modules.every((mod) => mod.id in m.etatModules),
  { message: "un module du curriculum n'a pas d'entrée dans etatModules" },
);

// ---------------------------------------------------------------------------
// Validateurs purs — verdict { valid, errors } plutôt qu'exception.
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function fromZod<T>(schema: z.ZodType<T>, value: unknown): ValidationResult {
  const r = schema.safeParse(value);
  if (r.success) return { valid: true, errors: [] };
  return { valid: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "(racine)"}: ${i.message}`) };
}

export function validateCurriculum(value: unknown): ValidationResult {
  const base = fromZod(CurriculumSchema, value);
  if (!base.valid) return base;
  const c = value as Curriculum;
  const errors: string[] = [];
  const ids = c.modules.map((m) => m.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length > 0) errors.push(`modules dupliqués : ${[...new Set(dup)].join(", ")}`);
  const idSet = new Set(ids);
  for (const m of c.modules) {
    for (const p of m.prerequis) {
      if (!idSet.has(p)) errors.push(`module ${m.id} : prérequis inconnu "${p}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateItem(value: unknown): ValidationResult {
  return fromZod(ItemSchema, value);
}

export function validateItems(values: unknown[]): { valid: boolean; validCount: number; total: number; errorsByIndex: Record<number, string[]> } {
  const errorsByIndex: Record<number, string[]> = {};
  let validCount = 0;
  values.forEach((v, i) => {
    const r = validateItem(v);
    if (r.valid) validCount++;
    else errorsByIndex[i] = r.errors;
  });
  return { valid: validCount === values.length, validCount, total: values.length, errorsByIndex };
}

export function validateLearnerModel(value: unknown): ValidationResult {
  return fromZod(LearnerModelSchema, value);
}

export function validateManifest(value: unknown): ValidationResult {
  return fromZod(FormationManifestSchema, value);
}

// ---------------------------------------------------------------------------
// Boucle adaptative RAPIDE (formation-adaptive.ts) — PURE, deps (`now`) injectées.
// ---------------------------------------------------------------------------

export interface MasteryOptions {
  alpha?: number;
  priorMastery?: number;
}

/** Estime la maîtrise (0..1) via EWMA pondérée par difficulté. Déterministe, < 1 ms. */
export function estimateMastery(
  answers: Array<Pick<AnswerRecord, "correct" | "difficulty">>,
  opts: MasteryOptions = {},
): number {
  const alpha = opts.alpha ?? 0.3;
  let mastery = opts.priorMastery ?? 0.5;
  if (answers.length === 0) return clamp01(mastery);

  for (const a of answers) {
    const score = a.correct ? 1 : 0;
    const w = clamp01((a.difficulty - DIFFICULTY_MIN) / (DIFFICULTY_MAX - DIFFICULTY_MIN));
    const effectiveAlpha = a.correct ? alpha * (0.5 + 0.5 * w) : alpha * (1 - 0.5 * w);
    mastery = mastery * (1 - effectiveAlpha) + score * effectiveAlpha;
  }
  return clamp01(mastery);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface DifficultyThresholds {
  up?: number;
  down?: number;
}

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

export interface SelectNextItemOptions {
  weakThreshold?: number;
}

/**
 * Sélectionne l'item suivant : 1) files FSRS échues (plus en retard d'abord),
 * 2) compétences faibles du module courant, 3) progression (premier item
 * jamais répondu), sinon le premier item global (stable). Déterministe à `now`
 * fixe.
 */
export function selectNextItem(
  items: Item[],
  learner: LearnerModel,
  now: Date,
): Item | null {
  if (items.length === 0) return null;
  const nowMs = now.getTime();

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

  const weakThreshold = 0.5;
  const courant = items
    .filter((it) => it.moduleId === learner.moduleCourant)
    .sort((a, b) => a.id.localeCompare(b.id));

  const weak = courant.filter((it) =>
    it.skillIds.some((s) => (learner.mastery[s] ?? 0) < weakThreshold),
  );
  if (weak.length > 0) return weak[0];

  const answered = new Set(learner.historique.map((h) => h.itemId));
  const unanswered = courant.filter((it) => !answered.has(it.id));
  if (unanswered.length > 0) return unanswered[0];

  const all = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return all[0] ?? null;
}

export interface DiagnoseOptions {
  masteryThreshold?: number;
  minAttempts?: number;
}

export interface WeaknessDiagnosis {
  skillId: SkillId;
  mastery: number;
  attempts: number;
  recentConsecutiveErrors: number;
}

/** Compétences PERSISTANTES sous seuil malgré N tentatives + patterns d'erreurs
 * récurrentes. Copie fidèle du spine serveur (É5 réutilise l'original côté serveur). */
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

    let recentConsecutiveErrors = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].correct) break;
      recentConsecutiveErrors++;
    }

    out.push({ skillId, mastery, attempts, recentConsecutiveErrors });
  }

  out.sort((a, b) => {
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return a.skillId.localeCompare(b.skillId);
  });
  return out;
}
