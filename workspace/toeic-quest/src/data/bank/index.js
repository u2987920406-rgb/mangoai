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

// Combien de questions sont réellement disponibles pour un module ?
// (pour les modules « mixed » = bilan/examen, on puise dans tout le niveau.)
export function availableForModule(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return 0;
  if (mod.skill === "mixed") return getByLevel(mod.level).length;
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

  if (mod.skill === "mixed") {
    const pool = getByLevel(mod.level);
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
