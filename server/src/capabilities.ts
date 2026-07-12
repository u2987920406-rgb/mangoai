// Conscience des limites de MangoOS — « apprendre à Mango sa frontière de compétences ».
import { getBrain, shortModelLabel } from "./brain/brain-registry.js";
//
// Né d'un cas RÉEL (jeu-de-petanques, 2026-06-27) : en mode Discuter, l'utilisateur a été
// guidé vers **Unity + Natif Android + 3D**, Mango a détaillé le setup (URP, Android SDK…)
// comme s'il allait le faire, puis a SILENCIEUSEMENT livré une app **React 2D web** — la
// seule chose que MangoOS sache scaffolder. L'utilisateur s'est « fait avoir ».
//
// Leçon (directive permanente de Raf : transformer une lacune en compétence acquise) :
// Mango doit CONNAÎTRE sa frontière et la DIRE tôt, au lieu de jouer un rôle qu'il ne peut
// tenir. Source UNIQUE de vérité ici → réutilisée par le prompt Discuter (clause) et,
// plus tard, par un durcissement du juge d'intention (détecter un mismatch de cadre).
//
// (2026-07-12, SOUV-B suite) — Conscience de l'ARCHITECTURE MULTI-CERVEAUX : cas réel
// remonté par Raf, en Discuter (chatEleve, ELEVE_MODEL = rôle `codeur`, ex. Qwythos —
// un cerveau TEXTE pur), il a demandé « as-tu la vision ? » et le cerveau a répondu
// « non » — vrai depuis SA perspective isolée, mais incohérent pour le SYSTÈME : un
// cerveau `vision` dédié (brain-registry.json, ex. qwen3-vl:8b) existe et est appelable
// via des outils (vois_ecran, sharingan_*) en Construire. Le cerveau actif n'avait AUCUNE
// clause l'informant de cette architecture → il jouait, comme pour #151/hors-périmètre,
// un rôle qu'il ne connaissait pas tenir. `brainArchitectureClause()` ci-dessous comble
// ce trou : LUE EN LIVE (getBrain), jamais figée, donc toujours exacte même si Raf change
// le cerveau vision dans Réglages → Atelier des cerveaux sans redémarrage.

/** Ce que MangoOS SAIT générer (le périmètre réel : apps web). */
export const MANGOOS_BUILDS = [
  "des applications WEB : SPA React + Vite + Tailwind (+ les stacks curées : Vue, Svelte, etc.)",
  "un backend léger optionnel (Express + SQLite) servi à côté du front",
  "des jeux et expériences interactives DANS LE NAVIGATEUR (Canvas 2D, ou 3D via Three.js)",
  "des PWA installables sur mobile (web, pas un binaire de store)",
] as const;

/** Ce que MangoOS NE SAIT PAS faire (hors périmètre — à dire honnêtement). */
export const MANGOOS_CANNOT = [
  "Unity, Unreal, ou tout moteur de jeu à export NATIF",
  "iOS natif (Swift/SwiftUI) ou Android natif (Kotlin/Java)",
  "Flutter, React Native, .NET MAUI (apps mobiles natives)",
  "applications desktop natives (un binaire .exe/.app/.dmg)",
] as const;

/**
 * Familles de technos HORS périmètre, par mots-clés. Sert au détecteur (et à durcir
 * le juge d'intention plus tard). Minuscule, frontières de mot gérées par le détecteur.
 */
export const OUT_OF_SCOPE_TECH: { family: string; keywords: string[] }[] = [
  { family: "moteur de jeu natif", keywords: ["unity", "unreal", "godot natif", "cryengine"] },
  { family: "mobile natif", keywords: ["flutter", "react native", "swift", "swiftui", "kotlin", "xcode", "android studio", "android sdk", "jetpack compose", ".net maui", "xamarin"] },
  { family: "desktop natif", keywords: ["electron", "tauri", "qt natif", "wpf", "winforms"] },
  { family: "binaire / store", keywords: ["app store", "play store", "apk", "ipa", "binaire natif", "application native"] },
];

/**
 * Détecte si un texte (demande / fil de discussion) dérive vers une techno hors périmètre.
 * PUR. Renvoie les familles touchées (vide = dans le périmètre). Frontières de mot pour
 * éviter les faux positifs (« swiftly », « community »…). Ne lève jamais.
 */
export function detectOutOfScope(text: string, allow: string[] = []): string[] {
  const t = ` ${(text ?? "").toLowerCase()} `;
  const allowed = new Set(allow.map((k) => k.toLowerCase()));
  const hits = new Set<string>();
  for (const { family, keywords } of OUT_OF_SCOPE_TECH) {
    for (const kw of keywords) {
      // (Phase 3a) Un mot-clé désormais DANS le périmètre (ex. « unity » quand
      // ELEVE_UNITY=on) ne déclenche plus le hors-périmètre — les autres mots-clés
      // de la même famille (unreal, godot natif…) restent détectés.
      if (allowed.has(kw)) continue;
      // frontière simple : le mot-clé entouré de non-alphanumérique (ou bornes de chaîne).
      const re = new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      if (re.test(t)) { hits.add(family); break; }
    }
  }
  return [...hits];
}

/**
 * (Phase 3a) Mots-clés à RÉINTÉGRER dans le périmètre selon les gates actifs. Quand
 * ELEVE_UNITY=on, Unity devient une compétence (domaine Unity) → on ne le signale plus
 * comme une dérive hors périmètre. Non-PUR (lit l'env) : passé à detectOutOfScope qui
 * reste PUR. Les autres moteurs natifs restent hors périmètre.
 */
export function scopeAllowList(): string[] {
  const allow: string[] = [];
  if (process.env.ELEVE_UNITY === "on") allow.push("unity");
  if (process.env.ELEVE_GODOT === "on") allow.push("godot natif");
  return allow;
}

/**
 * Clause LIVE (relit brain-registry.json à chaque appel — jamais figée) qui donne
 * au cerveau actif (`codeur`, le rôle qui pilote Construire/Discuter) la conscience
 * qu'il fait partie d'un SYSTÈME multi-cerveaux, même s'il n'a personnellement
 * aucune capacité de vision native. Empêche un « non » plat/incohérent quand
 * l'utilisateur demande directement si Mango « voit ». Import paresseux (require
 * dynamique évité — import direct du module registre, pas de cycle : brain-registry.ts
 * ne dépend pas de capabilities.ts).
 */
export function brainArchitectureClause(): string {
  let visionModel = "un cerveau vision dédié";
  try {
    // getBrain()/loadBrainRegistry() sont fail-open (fichier absent/corrompu →
    // défauts sains) — le try/catch ici est une double sécurité, pas le repli principal.
    const brain = getBrain("vision");
    const label = shortModelLabel(brain.model) ?? brain.model;
    if (label) visionModel = `\`${label}\` (${brain.provider})`;
  } catch {
    // fail-open total : la clause reste utile même sans info précise.
  }
  return `
⚠ TU FAIS PARTIE D'UN SYSTÈME MULTI-CERVEAUX — ne dis JAMAIS platement « non » si on te demande si tu as la vision :
- TOI (le cerveau qui exécute Construire/Discuter) es un cerveau TEXTE — tu n'as pas de vision native, c'est vrai et il faut le dire.
- MAIS le système MangoOS a un cerveau VISION dédié et opérationnel : ${visionModel}, appelable via les outils \`vois_ecran\`/\`sharingan_url\`/\`sharingan_image\`/\`lire_image\` quand ils sont disponibles.
- Réponse honnête et complète à « as-tu la vision ? » : « Moi-même non (cerveau texte), mais le système a un cerveau vision (${visionModel}) que je peux invoquer pour analyser une image ou un rendu d'écran. » — jamais un « non » sec qui ferait croire que MangoOS entier est aveugle.`;
}

/** Clause injectée dans le prompt Discuter (et réutilisable ailleurs). */
export const CAPABILITIES_CLAUSE = `
⚠ TES CAPACITÉS RÉELLES (sois HONNÊTE, ne joue pas un rôle que tu ne peux tenir) :
- MangoOS construit des applications WEB : ${MANGOOS_BUILDS.join(" ; ")}.
- Tu NE SAIS PAS faire : ${MANGOOS_CANNOT.join(" ; ")}.
- Si l'utilisateur DEMANDE ou DÉRIVE vers une de ces technos hors périmètre (Unity, natif iOS/Android, Flutter, jeu à moteur natif…), DIS-LE FRANCHEMENT et TÔT — n'attends pas la fin du cadrage. Exemple : « Je construis des apps web (React), je ne fais pas d'Unity ni de natif Android. »
- Ne détaille JAMAIS un setup que tu n'exécuteras pas (Unity/URP, Xcode, Android SDK…) comme si tu allais le réaliser : ce serait te faire passer pour un outil que tu n'es pas.
- À la place, PROPOSE l'équivalent WEB réellement faisable (ex. un jeu 3D dans le navigateur avec Three.js, une PWA mobile installable) et laisse l'utilisateur choisir en connaissance de cause.
- Mieux vaut une vérité utile qu'une fausse compétence : la confiance se gagne en disant ce que tu ne sais pas faire.`;
