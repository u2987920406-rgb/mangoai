// Theory of Mind sur Raf (inspiré de `harnais-2027/src/cognition/theory-of-mind.ts`
// — réimplémenté sans dépendance, scope volontairement réduit).
//
// NE REMPLACE PAS la mémoire délibérée (`feedback_*.md`, memory/) qui reste la
// source de vérité DURABLE — un fait confirmé et daté par Raf est plus fiable
// qu'une frustration devinée par heuristique. Ce module est un ajustement de
// SURFACE, PAR TÂCHE : une heuristique zéro-coût (aucun appel réseau) qui
// calibre le style de réponse de l'Élève sur l'instant présent (pressé ?
// exploratoire ? frustré ?), persistée dans le Blackboard existant
// (scope `raf:profil`) — pas de nouveau système de stockage.
//
// Frontière d'intégration (comme `eleve-workflow.ts`) : ce module expose
// `calibrateEleve()`/`tomSection()` prêts à être injectés dans la construction
// du prompt Élève (`relay-prompt.ts`, `buildEleveUser`) — le branchement réel
// dans ce chemin existant (signature partagée par de nombreux appelants) est
// un pas séparé, volontairement pas fait dans cette passe pour ne pas toucher
// à un point d'entrée à large rayon d'action sans un test d'intégration dédié.
import type { Blackboard } from "../kernel/kernel-blackboard.js";

export const RAF_TOM_SCOPE = "raf:profil";
const PROFILE_KEY = "current";

export type RafTone = "neutre" | "pressé" | "exploratoire" | "frustré" | "fatigué";

export interface RafProfile {
  tone: RafTone;
  /** 0-1, lissé (moyenne mobile) — plus de détail dans les messages = plus engagé. */
  engagement: number;
  /** 0-1, lissé — monte sur des signaux de frustration, redescend sinon. */
  frustrationLevel: number;
  lastUpdated: number;
}

const DEFAULT_PROFILE: RafProfile = { tone: "neutre", engagement: 0, frustrationLevel: 0, lastUpdated: 0 };

/** Heuristique rapide, ZÉRO coût réseau — pas d'appel LLM, contrairement à
 *  harnais-2027 (qui retombe sur un appel modèle si l'heuristique ne matche pas).
 *  Un signal manqué reste "neutre" plutôt que de dépenser un tour pour deviner. */
export function quickTone(message: string): RafTone {
  const m = (message ?? "").toLowerCase();
  if (/\?\?\?|comprends pas|marche pas|non ça va pas|arrête/.test(m)) return "frustré";
  if (m.length < 20 && /\.\s*$/.test(m.trim())) return "fatigué";
  if (/^(vite|urgent|dépêche|rapidement)/.test(m.trim())) return "pressé";
  if (m.split("\n").length > 3 || m.length > 300) return "exploratoire";
  return "neutre";
}

export function loadProfile(bb: Blackboard): RafProfile {
  return bb.get<RafProfile>(RAF_TOM_SCOPE, PROFILE_KEY) ?? { ...DEFAULT_PROFILE };
}

function saveProfile(bb: Blackboard, profile: RafProfile): void {
  bb.put(RAF_TOM_SCOPE, PROFILE_KEY, profile);
}

/**
 * Met à jour le profil à partir d'un nouveau message (tâche/instruction de Raf).
 * Pure côté calcul (le seul effet de bord est l'écriture Blackboard, comme le
 * reste du repo — `concept-registry.ts`, `kernel-artifacts.ts`). Ne lève jamais.
 */
export function updateProfile(message: string, bb: Blackboard): RafProfile {
  const prev = loadProfile(bb);
  const tone = quickTone(message);
  const length = (message ?? "").length;

  // Engagement : moyenne mobile, plus de détail = plus d'engagement (mêmes coefficients
  // que harnais-2027, où ils avaient déjà été calibrés empiriquement).
  const engagement = Math.min(1, prev.engagement * 0.8 + Math.min(1, length / 500) * 0.2);

  // Frustration : monte sur un ton frustré détecté, redescend doucement sinon.
  const frustrationLevel =
    tone === "frustré"
      ? Math.min(1, prev.frustrationLevel + 0.2)
      : Math.max(0, prev.frustrationLevel - 0.05);

  const profile: RafProfile = { tone, engagement, frustrationLevel, lastUpdated: Date.now() };
  saveProfile(bb, profile);
  return profile;
}

export interface EleveCalibration {
  temperature?: number;
  styleHint: string;
}

/** Calibre le style attendu de l'Élève selon le profil courant. Pure. */
export function calibrateEleve(profile: RafProfile): EleveCalibration {
  if (profile.frustrationLevel > 0.5) {
    return { temperature: 0.3, styleHint: "très direct, concret, pas de théorie — des résultats" };
  }
  if (profile.tone === "pressé") {
    return { temperature: 0.4, styleHint: "va droit au but, priorise la vitesse d'exécution" };
  }
  if (profile.tone === "fatigué") {
    return { temperature: 0.5, styleHint: "très concis, pas de bla-bla" };
  }
  if (profile.tone === "exploratoire") {
    return { temperature: 0.7, styleHint: "structuré, détaillé, explore les options pertinentes" };
  }
  return { styleHint: "direct, précis" };
}

/** Bloc de prompt PRÊT à injecter (borné, comme les sections axiomes/mémoire du
 *  repo) — non câblé automatiquement, cf. note de frontière d'intégration en tête. */
export function tomSection(profile: RafProfile): string {
  const c = calibrateEleve(profile);
  return `\n\n## STYLE ATTENDU (calibré sur l'échange en cours)\n${c.styleHint}`;
}
