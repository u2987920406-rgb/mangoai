// ─── Banque de questions — agrégation & helpers ──────────────────────────────
import { DEBUTANT } from "./debutant.js";
import { DEBUTANT_GEN } from "./debutant.gen.js";
import { INTERMEDIAIRE } from "./intermediaire.js";
import { INTERMEDIAIRE_GEN } from "./intermediaire.gen.js";
import { AVANCE } from "./avance.js";
import { AVANCE_GEN } from "./avance.gen.js";
import { PLACEMENT } from "./placement.js";
import { CURRICULUM, getModule } from "../curriculum.js";

// Banque complète à plat (toutes questions taguées level/part/moduleId/skill).
// *.js = échantillons historiques/migrés ; *_GEN = contenu rédigé par GLM (l'Élève).
export const QUESTION_BANK = [
  ...DEBUTANT, ...DEBUTANT_GEN,
  ...INTERMEDIAIRE, ...INTERMEDIAIRE_GEN,
  ...AVANCE, ...AVANCE_GEN,
];

export { PLACEMENT };

// Mélange (Fisher-Yates) — copie, ne mute pas l'entrée.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getByModule(moduleId) {
  return QUESTION_BANK.filter((q) => q.moduleId === moduleId);
}

export function getByPart(part) {
  return QUESTION_BANK.filter((q) => q.part === part);
}

export function getByLevel(level) {
  return QUESTION_BANK.filter((q) => q.level === level);
}

// Un module « puise dans le niveau » (bilan ou examen) plutôt que d'avoir son
// propre contenu : on prend les questions du niveau filtrées par ses parties.
function levelPool(mod) {
  let pool = getByLevel(mod.level);
  if (Array.isArray(mod.parts) && mod.parts.length) {
    const set = new Set(mod.parts);
    pool = pool.filter((q) => set.has(q.part));
  }
  return pool;
}
const drawsFromLevel = (mod) => mod.skill === "mixed" || mod.isExam;

// Combien de questions sont réellement disponibles pour un module ?
// (bilan/examen → on puise dans le niveau, filtré par parties.)
export function availableForModule(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return 0;
  if (drawsFromLevel(mod)) return levelPool(mod).length;
  return getByModule(moduleId).length;
}

// Un module est jouable s'il a au moins MIN_PLAYABLE questions disponibles.
export const MIN_PLAYABLE = 6;
export function isModulePlayable(moduleId) {
  return availableForModule(moduleId) >= MIN_PLAYABLE;
}

// Construit une session de `n` questions pour un module.
//  - module normal : questions du module, mélangées.
//  - module « mixed » (bilan/examen) : échantillon réparti sur les parties du niveau.
export function buildSession(moduleId, n = 10) {
  const mod = getModule(moduleId);
  if (!mod) return [];

  if (drawsFromLevel(mod)) {
    const pool = levelPool(mod);
    // Répartit en visant la diversité des parties, puis complète au hasard.
    const byPart = {};
    for (const q of shuffle(pool)) {
      (byPart[q.part] = byPart[q.part] || []).push(q);
    }
    const picked = [];
    const parts = Object.keys(byPart);
    let idx = 0;
    while (picked.length < n && parts.some((p) => byPart[p].length)) {
      const p = parts[idx % parts.length];
      if (byPart[p].length) picked.push(byPart[p].shift());
      idx++;
    }
    return picked.slice(0, n);
  }

  return shuffle(getByModule(moduleId)).slice(0, n);
}

// ── Session « mode libre » : échantillon PLAFONNÉ (jamais la banque entière) ──
// Un mode libre tire FREE_SESSION_SIZE questions au hasard dans la compétence,
// comme buildSession le fait pour les modules. Fini les 200+ questions d'affilée.
export const FREE_SESSION_SIZE = 12;
export function buildFreeSession(mode, n = FREE_SESSION_SIZE) {
  const pool = QUESTION_BANK.filter((q) => q.skill === mode);
  return shuffle(pool).slice(0, n);
}

// ── Index par id (banque + placement) : retrouve une question depuis un résultat ──
let questionIndex = null;
export function getQuestionById(id) {
  if (!questionIndex) {
    questionIndex = new Map();
    for (const q of QUESTION_BANK) questionIndex.set(q.id, q);
    for (const q of PLACEMENT) questionIndex.set(q.id, q);
  }
  return questionIndex.get(id) || null;
}

// Regroupe la banque par compétence pour la façade « 3 modes libres » historique.
export function questionsBySkill() {
  return {
    listening: QUESTION_BANK.filter((q) => q.skill === "listening"),
    reading: QUESTION_BANK.filter((q) => q.skill === "reading"),
    vocab: QUESTION_BANK.filter((q) => q.skill === "vocab"),
  };
}

// Détermine le niveau de placement d'après le score du test.
//  <40 % → Débutant · 40-70 % → Intermédiaire · >70 % → Avancé.
export function resolvePlacement(correct, total) {
  const ratio = total > 0 ? correct / total : 0;
  let level = "debutant";
  if (ratio > 0.7) level = "avance";
  else if (ratio >= 0.4) level = "intermediaire";
  return { level, ratio };
}

// Premier module jouable d'un niveau (utile pour démarrer après placement).
export function firstPlayableModule(level) {
  const mod = CURRICULUM.find((m) => m.level === level && isModulePlayable(m.id));
  return mod || CURRICULUM.find((m) => m.level === level) || CURRICULUM[0];
}
