// Volet PÉDAGO du Gardien de clôture (#181 É4, plan D5 étages 2+3), gate
// `ELEVE_GATE_PEDAGO` (flags.ts, défaut OFF). Vérifie qu'une formation générée par la
// Fabrique (É3, formation-fabrique.ts) est une vraie FORMATION et pas un quiz déguisé
// (risque #9 du plan #181, §4.9) :
//
//   Étage 2 (déterministe, systématique) :
//     - COUVERTURE  : chaque module du curriculum a-t-il ses items générés ? chaque
//                     compétence déclarée est-elle exercée par au moins un item ?
//     - ORDRE       : dans chaque module, une leçon apparaît-elle AVANT les exercices ?
//     - SOURCES     : chaque item `lecon` porte-t-il des sources NON VIDES ?
//     - LISIBILITÉ  : longueur de leçon / longueur de phrase bornées (heuristique simple).
//
//   Étage 3 (échantillonnage jugé, D5§3) :
//     - EXACTITUDE  : tire N affirmations au hasard (déterministe, seed injectée) parmi
//                     les leçons, relit leur source déclarée (`lirePage`) et demande à un
//                     juge (`juge`, dos à `askLLM`) « cette affirmation est-elle supportée
//                     par cette source ? ». Sous le seuil de support, cite les affirmations
//                     non supportées PRÉCISÉMENT (traçabilité, pas juste « il y a un
//                     problème »).
//
// PUR côté logique : aucune I/O directe dans les fonctions de vérification elles-mêmes —
// tout accès disque/réseau/LLM passe par `PedagoDeps` injectées (testable sans backend,
// sans réseau, sans LLM réel). Ne lève JAMAIS : fail-open, comme tous les autres volets du
// Gardien (#161, eleve-gate.ts) — ce volet AJOUTE des raisons à un nudge de relance, il ne
// bloque jamais la clôture en soi (pas de plancher façon ELEVE_GATE_TASTE_FLOOR ici : le
// plan #181 ne le demande pas pour PÉDAGO).
//
// Cas particulier « vérité formelle » (D5, code/maths) : NON câblé ici. Les sujets déjà
// fabriqués (café, photo argentique…) n'ont pas d'exercices exécutables — l'échantillonnage
// jugé est le mécanisme pertinent pour eux. Le mécanisme `ELEVE_GATE_TESTS`/`runProjectTests`
// (inspection.ts) existe déjà dans le Gardien et EST le point d'articulation prévu par le
// plan : un futur module de code/maths n'aurait qu'à déclarer un script `test` exécutable
// dans le projet généré pour en bénéficier gratuitement (le Gardien préfère toujours le
// déterminisme au jugement quand il existe). Limite honnête, à inscrire dans `limites.md`.

import fs from "node:fs";
import path from "node:path";
import type { Curriculum, FormationManifest, Item } from "./formation/formation-model.js";
import { loadManifest as loadManifestReel } from "./formation/formation-fabrique.js";
import { scrapeExternal } from "./vision.js";
import { askLLM } from "./llm/llm-engine.js";

// ---------------------------------------------------------------------------
// Dépendances injectables
// ---------------------------------------------------------------------------

export interface PedagoDeps {
  /** Charge le manifest de formation (`formation.json`) — `null` si absent/invalide
   *  (projet qui n'est pas une formation #181 : le volet devient non-applicable). */
  loadManifest: (projectDir: string) => FormationManifest | null;
  /** Charge la banque d'items d'un module — `[]` si absente/illisible. */
  loadBank: (projectDir: string, moduleId: string) => Item[];
  /** Relit une source déclarée (URL) et renvoie son texte — `null` si injoignable. */
  lirePage: (url: string) => Promise<string | null>;
  /** Juge « cette affirmation est-elle supportée par cette source ? ». */
  juge: (affirmation: string, source: string) => Promise<"oui" | "non" | "incertain">;
}

export interface PedagoOptions {
  /** Nombre d'affirmations échantillonnées à l'étage 3. Défaut 10. */
  nEchantillon?: number;
  /** Seuil de support minimal à l'étage 3 (fraction 0..1). Défaut 0.7 (70 %). */
  seuilSupport?: number;
  /** Graine déterministe du tirage (étage 3). Défaut : dérivée du sujet du manifest. */
  seed?: number;
  /** Longueur minimale (caractères) d'un contenu de leçon. Défaut 200 — sous ce seuil,
   *  la leçon est « squelettique » (risque #9 : dérive quiz déguisé). */
  longueurMin?: number;
  /** Nombre de mots max toléré par phrase (lisibilité). Défaut 40. */
  motsParPhraseMax?: number;
  /** Nombre minimal d'items QCM avant de juger un biais de position significatif
   *  (sous ce seuil, la distribution est trop petite pour être fiable). Défaut 5. */
  minQcmPourBiais?: number;
  /** Part max tolérée (0..1) de la position la plus fréquente de la bonne réponse
   *  parmi les QCM d'un même module, au-delà de laquelle on flag un biais
   *  (L115 — quiz observé où la bonne réponse restait systématiquement en position « a »). Défaut 0.5. */
  maxPartPositionBiais?: number;
}

export interface PedagoVerdict {
  ok: boolean;
  /** false = pas un projet de formation (pas de manifest) → volet neutre, ne pénalise pas. */
  applicable: boolean;
  couvertureOk: boolean;
  ordreOk: boolean;
  sourcesOk: boolean;
  lisibiliteOk: boolean;
  biaisPositionOk: boolean;
  exactitudeOk: boolean;
  /** true = étage 3 non exécuté (aucune affirmation exploitable / juge muet) → ne pénalise pas. */
  exactitudeSautee: boolean;
  raisons: string[];
}

function verdictNeutre(applicable: boolean): PedagoVerdict {
  return {
    ok: true,
    applicable,
    couvertureOk: true,
    ordreOk: true,
    sourcesOk: true,
    lisibiliteOk: true,
    biaisPositionOk: true,
    exactitudeOk: true,
    exactitudeSautee: true,
    raisons: [],
  };
}

// ---------------------------------------------------------------------------
// Étage 2a — COUVERTURE curriculum ↔ banques
// ---------------------------------------------------------------------------

function checkCouverture(curriculum: Curriculum, banks: Record<string, Item[]>): string[] {
  const raisons: string[] = [];

  const modulesVides = curriculum.modules.filter((m) => (banks[m.id] ?? []).length === 0).map((m) => m.id);
  if (modulesVides.length) {
    raisons.push(
      `COUVERTURE — ${modulesVides.length} module(s) SANS AUCUN item généré : ${modulesVides.join(", ")}. ` +
        `Chaque module du curriculum doit avoir sa banque (genererBanqueModule).`,
    );
  }

  const skillsDeclares = new Set(curriculum.modules.flatMap((m) => m.skillIds));
  const skillsExerces = new Set(Object.values(banks).flat().flatMap((it) => it.skillIds));
  const skillsOrphelins = [...skillsDeclares].filter((s) => !skillsExerces.has(s));
  if (skillsOrphelins.length) {
    raisons.push(
      `COUVERTURE — ${skillsOrphelins.length} compétence(s) déclarée(s) mais JAMAIS exercée(s) par un item : ` +
        `${skillsOrphelins.join(", ")}.`,
    );
  }

  return raisons;
}

// ---------------------------------------------------------------------------
// Étage 2b — ORDRE (leçon AVANT exercice, risque #9 « dérive quiz déguisé »)
// ---------------------------------------------------------------------------

function checkOrdre(curriculum: Curriculum, banks: Record<string, Item[]>): string[] {
  const raisons: string[] = [];
  for (const mod of curriculum.modules) {
    const items = banks[mod.id] ?? [];
    if (!items.length) continue; // déjà signalé par COUVERTURE
    const iExercice = items.findIndex((it) => it.type !== "lecon");
    if (iExercice === -1) continue; // que des leçons, rien à ordonner
    const iLecon = items.findIndex((it) => it.type === "lecon");
    if (iLecon === -1 || iLecon > iExercice) {
      raisons.push(
        `ORDRE — module « ${mod.id} » : un exercice apparaît AVANT (ou en l'absence de) toute leçon. ` +
          `« La leçon est le produit, l'exercice est la preuve » (risque « quiz déguisé », plan #181 §4.9) — ` +
          `place au moins une leçon avant les exercices de ce module.`,
      );
    }
  }
  return raisons;
}

// ---------------------------------------------------------------------------
// Étage 2c — SOURCES déclarées non vides
// ---------------------------------------------------------------------------

function checkSources(banks: Record<string, Item[]>): string[] {
  const manquantes: string[] = [];
  for (const [moduleId, items] of Object.entries(banks)) {
    for (const it of items) {
      if (it.type === "lecon" && (!it.sources || it.sources.length === 0)) {
        manquantes.push(`${moduleId}/${it.id}`);
      }
    }
  }
  if (!manquantes.length) return [];
  const shown = manquantes.slice(0, 10).join(", ");
  const extra = manquantes.length > 10 ? `, …(+${manquantes.length - 10})` : "";
  return [
    `SOURCES — ${manquantes.length} leçon(s) SANS SOURCE déclarée : ${shown}${extra}. ` +
      `Chaque leçon doit citer 1 à 3 URLs réelles (contrôle anti-hallucination, plan #181 D5).`,
  ];
}

// ---------------------------------------------------------------------------
// Étage 2d — LISIBILITÉ mesurable
// ---------------------------------------------------------------------------

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function splitSentences(s: string): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function checkLisibilite(
  banks: Record<string, Item[]>,
  opts: Required<Pick<PedagoOptions, "longueurMin" | "motsParPhraseMax">>,
): string[] {
  const raisons: string[] = [];
  const tropCourtes: string[] = [];
  const phrasesLongues: string[] = [];

  for (const [moduleId, items] of Object.entries(banks)) {
    for (const it of items) {
      if (it.type !== "lecon") continue;
      const contenu = it.contenu ?? "";
      if (contenu.trim().length < opts.longueurMin) {
        tropCourtes.push(`${moduleId}/${it.id} (${contenu.trim().length} car.)`);
        continue;
      }
      for (const phrase of splitSentences(contenu)) {
        const n = countWords(phrase);
        if (n > opts.motsParPhraseMax) {
          phrasesLongues.push(`${moduleId}/${it.id} (${n} mots)`);
          break; // une occurrence suffit à signaler l'item
        }
      }
    }
  }

  if (tropCourtes.length) {
    raisons.push(
      `LISIBILITÉ — ${tropCourtes.length} leçon(s) SQUELETTIQUE(S) (< ${opts.longueurMin} caractères) : ` +
        `${tropCourtes.slice(0, 10).join(", ")}. « La leçon est le produit » : développe un vrai corps de texte.`,
    );
  }
  if (phrasesLongues.length) {
    raisons.push(
      `LISIBILITÉ — ${phrasesLongues.length} leçon(s) avec au moins une phrase de plus de ${opts.motsParPhraseMax} mots : ` +
        `${phrasesLongues.slice(0, 10).join(", ")}. Raccourcis les phrases trop longues.`,
    );
  }

  return raisons;
}

// ---------------------------------------------------------------------------
// Étage 2e — BIAIS DE POSITION de la bonne réponse (L115, limites.md)
// ---------------------------------------------------------------------------
// Observé sur `toeic-quest` refondu : la bonne réponse restait en position "a"
// (index 0) à travers tout le quiz — biais de génération jamais contrôlé,
// exploitable par bourrinage. Détecte ce même biais pour les QCM générés via
// la fabrique #181 (Item.type === "qcm", champ `reponse` = index de la bonne
// réponse dans `choix`) : au-delà d'un seuil d'items, une position dominante
// (ex. toujours 0) déclenche un nudge de relance.

function checkBiaisPosition(
  banks: Record<string, Item[]>,
  opts: Required<Pick<PedagoOptions, "minQcmPourBiais" | "maxPartPositionBiais">>,
): string[] {
  const raisons: string[] = [];
  for (const [moduleId, items] of Object.entries(banks)) {
    const qcms = items.filter((it) => it.type === "qcm");
    if (qcms.length < opts.minQcmPourBiais) continue;

    const parPosition = new Map<number, number>();
    for (const it of qcms) {
      parPosition.set(it.reponse, (parPosition.get(it.reponse) ?? 0) + 1);
    }
    let positionDominante = 0;
    let count = 0;
    for (const [pos, n] of parPosition) {
      if (n > count) { positionDominante = pos; count = n; }
    }
    const part = count / qcms.length;
    if (part > opts.maxPartPositionBiais) {
      const lettre = String.fromCharCode(97 + positionDominante); // 0→a, 1→b, ...
      raisons.push(
        `BIAIS DE POSITION — module « ${moduleId} » : ${count}/${qcms.length} QCM (${Math.round(part * 100)}%) ` +
          `ont leur bonne réponse en position « ${lettre} » (index ${positionDominante}). ` +
          `Mélange l'ordre de \`choix\` à la génération (Fisher-Yates, seed déterministe) pour éviter un biais exploitable par bourrinage.`,
      );
    }
  }
  return raisons;
}

// ---------------------------------------------------------------------------
// Étage 3 — EXACTITUDE par échantillonnage jugé (D5§3)
// ---------------------------------------------------------------------------

/** RNG déterministe (mulberry32), seedé par un entier — même seed = même tirage. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash déterministe d'une chaîne (FNV-1a) → seed par défaut dérivée du sujet. */
export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Affirmation {
  moduleId: string;
  itemId: string;
  texte: string;
  source: string;
}

/** Extrait toutes les affirmations vérifiables (phrases assez longues) des leçons SOURCÉES. */
function extraireAffirmations(banks: Record<string, Item[]>): Affirmation[] {
  const out: Affirmation[] = [];
  for (const [moduleId, items] of Object.entries(banks)) {
    for (const it of items) {
      if (it.type !== "lecon" || !it.sources?.length) continue;
      const source = it.sources[0];
      for (const phrase of splitSentences(it.contenu)) {
        if (countWords(phrase) < 5) continue; // trop court pour être une affirmation vérifiable
        out.push({ moduleId, itemId: it.id, texte: phrase, source });
      }
    }
  }
  return out;
}

/** Tirage déterministe de N affirmations (Fisher-Yates partiel, seedé). PUR. */
export function tirerEchantillon(all: Affirmation[], n: number, seed: number): Affirmation[] {
  if (all.length <= n) return all;
  const rnd = mulberry32(seed);
  const idx = all.map((_, i) => i);
  for (let i = idx.length - 1; i > idx.length - 1 - n && i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(idx.length - n).map((i) => all[i]);
}

async function checkExactitude(
  banks: Record<string, Item[]>,
  deps: Pick<PedagoDeps, "lirePage" | "juge">,
  opts: Required<Pick<PedagoOptions, "nEchantillon" | "seuilSupport" | "seed">>,
): Promise<{ ok: boolean; sautee: boolean; raisons: string[] }> {
  const all = extraireAffirmations(banks);
  if (!all.length) return { ok: true, sautee: true, raisons: [] };

  const echantillon = tirerEchantillon(all, opts.nEchantillon, opts.seed);
  const nonSupportees: Affirmation[] = [];
  let jugees = 0;

  for (const aff of echantillon) {
    let texteSource: string | null;
    try {
      texteSource = await deps.lirePage(aff.source);
    } catch {
      texteSource = null;
    }
    if (!texteSource) continue; // source injoignable : ne compte ni pour ni contre (fail-open)

    let verdict: "oui" | "non" | "incertain";
    try {
      verdict = await deps.juge(aff.texte, texteSource);
    } catch {
      continue; // juge KO : ne compte pas (fail-open, comme tout le Gardien)
    }
    jugees++;
    if (verdict === "non") nonSupportees.push(aff);
  }

  if (jugees === 0) return { ok: true, sautee: true, raisons: [] };

  // Strictement AU-DESSUS du seuil (pas >=) : à 70% pile de support pour un seuil de 70%,
  // on considère qu'on est encore « sous » le seuil de confiance visé (le plan #181 D5
  // dit « sous un seuil de support » — comparaison volontairement stricte pour ne pas
  // laisser passer un cas limite comme 3 non-supportées sur 10, l'exemple même du plan).
  const tauxSupport = 1 - nonSupportees.length / jugees;
  const ok = tauxSupport > opts.seuilSupport;
  if (!ok) {
    const lignes = nonSupportees.map((a) => `  - ${a.moduleId}/${a.itemId} (source ${a.source}) : « ${a.texte} »`);
    return {
      ok,
      sautee: false,
      raisons: [
        `EXACTITUDE — ${nonSupportees.length}/${jugees} affirmation(s) échantillonnée(s) NON supportée(s) par leur ` +
          `source déclarée (taux de support ${(tauxSupport * 100).toFixed(0)}% < seuil ${(opts.seuilSupport * 100).toFixed(0)}%) :\n` +
          `${lignes.join("\n")}\nCorrige ou re-source ces affirmations précises.`,
      ],
    };
  }
  return { ok, sautee: false, raisons: [] };
}

// ---------------------------------------------------------------------------
// Orchestrateur du volet — PUR côté logique, deps injectées pour toute I/O.
// ---------------------------------------------------------------------------

/** Exécute le volet PÉDAGO complet (étages 2+3). Ne lève JAMAIS. */
export async function checkPedago(
  projectDir: string,
  deps: PedagoDeps,
  opts: PedagoOptions = {},
): Promise<PedagoVerdict> {
  let manifest: FormationManifest | null;
  try {
    manifest = deps.loadManifest(projectDir);
  } catch {
    manifest = null;
  }
  if (!manifest) return verdictNeutre(false); // pas une formation #181 → volet non-applicable, neutre

  const longueurMin = opts.longueurMin ?? 200;
  const motsParPhraseMax = opts.motsParPhraseMax ?? 40;
  const nEchantillon = Math.max(1, opts.nEchantillon ?? 10);
  const seuilSupport = opts.seuilSupport ?? 0.7;
  const seed = opts.seed ?? seedFromString(manifest.sujet);
  const minQcmPourBiais = opts.minQcmPourBiais ?? 5;
  const maxPartPositionBiais = opts.maxPartPositionBiais ?? 0.5;

  const banks: Record<string, Item[]> = {};
  for (const mod of manifest.curriculum.modules) {
    try {
      banks[mod.id] = deps.loadBank(projectDir, mod.id);
    } catch {
      banks[mod.id] = [];
    }
  }

  const raisonsCouverture = checkCouverture(manifest.curriculum, banks);
  const raisonsOrdre = checkOrdre(manifest.curriculum, banks);
  const raisonsSources = checkSources(banks);
  const raisonsLisibilite = checkLisibilite(banks, { longueurMin, motsParPhraseMax });
  const raisonsBiaisPosition = checkBiaisPosition(banks, { minQcmPourBiais, maxPartPositionBiais });

  let exactitude: { ok: boolean; sautee: boolean; raisons: string[] };
  try {
    exactitude = await checkExactitude(banks, deps, { nEchantillon, seuilSupport, seed });
  } catch {
    exactitude = { ok: true, sautee: true, raisons: [] };
  }

  const raisons = [
    ...raisonsCouverture,
    ...raisonsOrdre,
    ...raisonsSources,
    ...raisonsLisibilite,
    ...raisonsBiaisPosition,
    ...exactitude.raisons,
  ];

  return {
    ok: raisons.length === 0,
    applicable: true,
    couvertureOk: raisonsCouverture.length === 0,
    ordreOk: raisonsOrdre.length === 0,
    sourcesOk: raisonsSources.length === 0,
    lisibiliteOk: raisonsLisibilite.length === 0,
    biaisPositionOk: raisonsBiaisPosition.length === 0,
    exactitudeOk: exactitude.ok,
    exactitudeSautee: exactitude.sautee,
    raisons,
  };
}

// ---------------------------------------------------------------------------
// Deps réelles (réseau/LLM réels) — utilisées par eleve-gate.ts (realGateDeps).
// ---------------------------------------------------------------------------

function loadBankReel(projectDir: string, moduleId: string): Item[] {
  const f = path.join(projectDir, "src", "data", `bank-${moduleId}.json`);
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as Item[];
  } catch {
    return [];
  }
}

export const realPedagoDeps: PedagoDeps = {
  loadManifest: (projectDir) => loadManifestReel(projectDir),
  loadBank: loadBankReel,
  lirePage: async (url) => {
    try {
      const page = await scrapeExternal(url);
      return page.text?.trim() || null;
    } catch {
      return null;
    }
  },
  juge: async (affirmation, source) => {
    const system = "Tu es un vérificateur factuel strict. Réponds UNIQUEMENT par un mot : oui, non ou incertain.";
    const user =
      `Source (extrait, éventuellement tronqué) :\n"""${source.slice(0, 3000)}"""\n\n` +
      `Affirmation à vérifier : "${affirmation}"\n\n` +
      `Cette affirmation est-elle SUPPORTÉE par cette source ? Réponds UNIQUEMENT par : oui, non, ou incertain.`;
    try {
      const raw = await askLLM(system, user, { maxTokens: 10, timeoutMs: 30_000 });
      const t = raw.trim().toLowerCase();
      if (t.startsWith("oui")) return "oui";
      if (t.startsWith("non")) return "non";
      return "incertain";
    } catch {
      return "incertain";
    }
  },
};

/** Fonction prête à brancher dans `GateDeps.checkPedago` (eleve-gate.ts). */
export function checkPedagoReel(projectDir: string, opts: PedagoOptions = {}): Promise<PedagoVerdict> {
  return checkPedago(projectDir, realPedagoDeps, opts);
}
