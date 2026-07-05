// Spine pur du moteur pédagogique (#181 É1) — types + schémas Zod du domaine
// « formation adaptative ». AUCUNE I/O, AUCUN accès réseau/disque : uniquement
// des types et des validateurs purs. Le moteur (starter É2) et la fabrique (É3)
// consomment ces types ; le Tuteur (É5) et le volet PÉDAGO (É4) aussi.
//
// Patron de validation calqué sur `run-toeic-content.ts:validate` (schéma
// strict par type d'item, retourne un verdict + raisons, jamais ne lève).

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
  /** Compétences travaillées par ce module. */
  skillIds: SkillId[];
  /** Modules dont la réussite est prérequise (ids). Vide = pas de prérequis. */
  prerequis: string[];
  /** Types d'items attendus dans ce module (au moins un). */
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

/** Difficulté bornée : 1 (facile) à 5 (difficile). */
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
  // D5 : chaque leçon porte des sources déclarées, non vides — contrôle anti-hallucination.
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

/** État FSRS minimal porté par item — juste les CHAMPS, pas l'algorithme (É2/ts-fsrs). */
export interface ItemFsrsState {
  itemId: string;
  /** Date d'échéance de la prochaine révision (ISO 8601). */
  due: string;
  /** Stabilité FSRS (jours) — mémoire estimée de la carte. */
  stability: number;
  /** Difficulté FSRS (1-10, distincte de `Item.difficulty` pédagogique). */
  difficulty: number;
  /** Nombre de révisions vues. */
  reps: number;
  /** Nombre d'échecs (lapses). */
  lapses: number;
  /** Dernière révision (ISO 8601), absente si jamais vue. */
  lastReview?: string;
}

/** Une réponse enregistrée dans l'historique récent d'erreurs. */
export interface AnswerRecord {
  itemId: string;
  skillIds: SkillId[];
  difficulty: number;
  correct: boolean;
  /** Horodatage ISO 8601 de la réponse. */
  at: string;
}

export interface LearnerModel {
  /** Maîtrise estimée par compétence, 0..1. Absence de clé = jamais rencontrée. */
  mastery: Record<SkillId, number>;
  /** Position courante dans le curriculum (id du module courant). */
  moduleCourant: string;
  /** Modules dont le seuil de maîtrise a été franchi (débloque la suite). */
  modulesValides: string[];
  /** Historique récent d'erreurs et de réussites, borné (le plus récent en fin de tableau). */
  historique: AnswerRecord[];
  /** État FSRS par item, indexé par itemId. */
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

// ---------------------------------------------------------------------------
// FormationManifest (D6)
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
  /** État par module, indexé par ModuleSpec.id. */
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
// Validateurs purs — verdict { valid, errors } plutôt qu'exception (jamais ne lève).
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

/** Valide un curriculum : schéma + pas de module id dupliqué + prérequis référencent des ids existants. */
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

/** Valide un item unique (union discriminée + règles spécifiques par type, cf. schémas ci-dessus). */
export function validateItem(value: unknown): ValidationResult {
  return fromZod(ItemSchema, value);
}

/** Valide un lot d'items ; renvoie un verdict global + le détail par item invalide. */
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

/** Valide un modèle d'apprenant. */
export function validateLearnerModel(value: unknown): ValidationResult {
  return fromZod(LearnerModelSchema, value);
}

/** Valide un manifest de formation : schéma + cohérence curriculum <-> etatModules. */
export function validateManifest(value: unknown): ValidationResult {
  return fromZod(FormationManifestSchema, value);
}
