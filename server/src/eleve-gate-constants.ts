import fs from "node:fs";
import path from "node:path";

// Volet CONSTANTES du Gardien de clôture (#161) — L117 (limites.md).
//
// Incident déclencheur : `systeme-solaire` (nuit des 6 apps expert, 2026-07-10) — la
// vitesse orbitale de Saturne était fausse dans le code généré, jamais détecté car
// aucun gate ne relit les valeurs NUMÉRIQUES factuelles écrites par l'agent (seule la
// cohérence visuelle/goût est jugée, pas l'exactitude des chiffres sous-jacents).
//
// Portée DÉLIBÉRÉMENT ÉTROITE (souveraine, $0, zéro réseau/LLM) : une TABLE CURÉE des
// vitesses orbitales moyennes des 8 planètes (km/s, source : constantes IAU/NASA usuelles)
// plutôt que la piste generic « recherche web + n'importe quelle constante » de limites.md
// (plus large mais moins fiable/déterministe — laissée comme extension future si un
// domaine factuel dense au-delà du système solaire apparaît, cf. #181 formations).
//
// Extraction PURE par heuristique texte : cherche le nom d'une planète, puis dans une
// fenêtre de texte suivante un champ ressemblant à une vitesse orbitale (vitesse/speed/
// orbitalSpeed) suivi d'un nombre. Fail-open par construction : AMBIGU ou ABSENT → on
// saute cette planète (jamais un faux positif sur une valeur qu'on n'a pas identifiée
// avec confiance). Ne lève JAMAIS.

/** km/s — vitesse orbitale moyenne (source usuelle, arrondie au centième). */
export const VITESSES_ORBITALES_KM_S: Record<string, number> = {
  mercure: 47.87,
  venus: 35.02,
  terre: 29.78,
  mars: 24.07,
  jupiter: 13.07,
  saturne: 9.69,
  uranus: 6.81,
  neptune: 5.43,
};

// (#196 fault-finding, plan cohérence de contenu, 2026-07-24) — la sonde de la nuit
// précédente (probe-fault-corpus.ts, MangoQA) a utilisé une PÉRIODE orbitale (jours),
// un champ que la table vitesse ci-dessus ne détecte PAS (`extraireVitessesDeclarees`
// ne cherche que vitesse/speed/orbitalSpeed) — gap réel, confirmé en relisant le code
// avant d'écrire ce correctif. Même patron exact (table curée IAU/NASA, extraction PURE,
// tolérance 20%, fail-open) pour la PÉRIODE ORBITALE SIDÉRALE (jours terrestres).
/** jours — période orbitale sidérale moyenne (source usuelle, arrondie à l'entier). */
export const PERIODES_ORBITALES_JOURS: Record<string, number> = {
  mercure: 88,
  venus: 225,
  terre: 365,
  mars: 687,
  jupiter: 4333,
  saturne: 10759,
  uranus: 30687,
  neptune: 60190,
};

/** Alias FR/EN → clé canonique de VITESSES_ORBITALES_KM_S. */
const ALIAS: Record<string, string> = {
  mercury: "mercure",
  mercure: "mercure",
  venus: "venus",
  earth: "terre",
  terre: "terre",
  mars: "mars",
  jupiter: "jupiter",
  saturn: "saturne",
  saturne: "saturne",
  uranus: "uranus",
  neptune: "neptune",
};

const PLANET_NAMES = Object.keys(ALIAS);

/** Tolérance : au-delà de cet écart relatif, on considère la valeur factuellement fausse
 *  (pas juste arrondie/simplifiée pédagogiquement). Défaut 20 %. */
const TOLERANCE_DEFAUT = 0.2;

/** Fenêtre de texte après le nom de la planète où chercher le champ vitesse (caractères). */
const FENETRE = 200;

export interface ConstanteDetectee {
  planete: string; // nom canonique FR
  valeurTrouvee: number;
  valeurReference: number;
  ecartRelatif: number; // 0..n, ex. 0.35 = 35% d'écart
}

/** Extrait, PAR PLANÈTE, la première valeur de vitesse orbitale plausible trouvée après
 *  son nom dans le texte. PUR. Ambigu/absent pour une planète → simplement absente du
 *  résultat (jamais une valeur devinée). */
export function extraireVitessesDeclarees(code: string): Array<{ planete: string; valeur: number }> {
  const out: Array<{ planete: string; valeur: number }> = [];
  const seen = new Set<string>();
  const lower = code.toLowerCase();

  for (const alias of PLANET_NAMES) {
    const canon = ALIAS[alias];
    if (seen.has(canon)) continue; // 1 seule détection par planète (1ʳᵉ occurrence)
    const idx = lower.indexOf(alias);
    if (idx === -1) continue;
    const fenetre = code.slice(idx, idx + FENETRE);
    // Cherche un champ vitesse/speed suivi (séparateur souple : `:`, `=`, espaces) d'un nombre.
    const m = fenetre.match(/(?:vitesse(?:Orbitale)?|orbital ?speed|speed)\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i);
    if (!m) continue;
    const valeur = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) continue;
    seen.add(canon);
    out.push({ planete: canon, valeur });
  }
  return out;
}

/** Miroir exact de `extraireVitessesDeclarees` pour la PÉRIODE ORBITALE (jours) — même
 *  logique d'extraction PURE, même fenêtre, même fail-open (ambigu/absent → sauté). */
export function extrairePeriodesDeclarees(code: string): Array<{ planete: string; valeur: number }> {
  const out: Array<{ planete: string; valeur: number }> = [];
  const seen = new Set<string>();
  const lower = code.toLowerCase();

  for (const alias of PLANET_NAMES) {
    const canon = ALIAS[alias];
    if (seen.has(canon)) continue;
    const idx = lower.indexOf(alias);
    if (idx === -1) continue;
    const fenetre = code.slice(idx, idx + FENETRE);
    // Cherche un champ période/period suivi (séparateur souple) d'un nombre. `[a-z]*`
    // final couvre les suffixes d'unité courants dans les champs générés (periodeJours,
    // orbitalPeriodDays…) sans être un mot totalement libre (toujours ancré sur la racine
    // période/period). Ne matche jamais "vitesse" (motif disjoint).
    const m = fenetre.match(/(?:p[ée]riode(?:Orbitale)?[a-z]*|orbital ?period[a-z]*|period[a-z]*)\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i);
    if (!m) continue;
    const valeur = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0) continue;
    seen.add(canon);
    out.push({ planete: canon, valeur });
  }
  return out;
}

/** Compare les valeurs déclarées à la table de référence. PUR. */
export function comparerAReference(
  declarees: Array<{ planete: string; valeur: number }>,
  reference: Record<string, number> = VITESSES_ORBITALES_KM_S,
  tolerance: number = TOLERANCE_DEFAUT,
): ConstanteDetectee[] {
  const out: ConstanteDetectee[] = [];
  for (const { planete, valeur } of declarees) {
    const ref = reference[planete];
    if (ref === undefined) continue;
    const ecart = Math.abs(valeur - ref) / ref;
    if (ecart > tolerance) {
      out.push({ planete, valeurTrouvee: valeur, valeurReference: ref, ecartRelatif: ecart });
    }
  }
  return out;
}

export interface ConstantsVerdict {
  ok: boolean;
  /** false = aucune constante détectée (pas un simulateur du système solaire, ou
   *  extraction non concluante) → volet neutre, ne pénalise pas. */
  applicable: boolean;
  ecarts: ConstanteDetectee[];
  raisons: string[];
}

function fmt(n: number): string {
  return n.toFixed(2).replace(/\.00$/, "");
}

/** Lit tous les fichiers texte pertinents d'un projet et exécute le volet. Deps injectées
 *  pour l'I/O (testable sans disque). Ne lève JAMAIS. */
export interface ConstantsDeps {
  /** Concatène le contenu de tous les fichiers source pertinents (js/ts/jsx/tsx/json) du
   *  projet en une seule chaîne. Best-effort : fichier illisible → simplement absent. */
  readSourceConcat: (projectDir: string) => string;
}

/** Formatte les raisons d'un lot d'écarts pour UNE famille de constante (libellé+unité
 *  distincts) — factorisé pour ne pas dupliquer le texte entre vitesse et période. */
function raisonsPourFamille(ecarts: ConstanteDetectee[], libelle: string, unite: string): string[] {
  return ecarts.map(
    (e) =>
      `CONSTANTES — ${libelle} de ${e.planete} déclarée à ${fmt(e.valeurTrouvee)} ${unite}, ` +
      `référence ~${fmt(e.valeurReference)} ${unite} (écart ${Math.round(e.ecartRelatif * 100)}%). ` +
      `Vérifie/corrige cette constante (source : données orbitales usuelles IAU/NASA).`,
  );
}

/** Vérifie DEUX familles de constantes orbitales indépendamment (vitesse km/s, période
 *  jours — #196 fault-finding, 2026-07-24 : la sonde de la nuit précédente a prouvé que
 *  la table vitesse seule laissait passer une période fausse, un champ différent) et
 *  fusionne les résultats. `applicable` = vrai dès qu'AU MOINS une constante d'UNE des
 *  deux familles a été détectée (même si l'autre famille est absente du code). */
export function checkConstants(code: string, tolerance: number = TOLERANCE_DEFAUT): ConstantsVerdict {
  const vitessesDeclarees = extraireVitessesDeclarees(code);
  const periodesDeclarees = extrairePeriodesDeclarees(code);
  if (vitessesDeclarees.length === 0 && periodesDeclarees.length === 0) {
    return { ok: true, applicable: false, ecarts: [], raisons: [] };
  }

  const ecartsVitesse = comparerAReference(vitessesDeclarees, VITESSES_ORBITALES_KM_S, tolerance);
  const ecartsPeriode = comparerAReference(periodesDeclarees, PERIODES_ORBITALES_JOURS, tolerance);
  const ecarts = [...ecartsVitesse, ...ecartsPeriode];
  if (ecarts.length === 0) return { ok: true, applicable: true, ecarts: [], raisons: [] };

  const raisons = [
    ...raisonsPourFamille(ecartsVitesse, "vitesse orbitale", "km/s"),
    ...raisonsPourFamille(ecartsPeriode, "période orbitale", "jours"),
  ];
  return { ok: false, applicable: true, ecarts, raisons };
}

export async function checkConstantsProjet(projectDir: string, deps: ConstantsDeps): Promise<ConstantsVerdict> {
  try {
    const code = deps.readSourceConcat(projectDir);
    return checkConstants(code);
  } catch {
    return { ok: true, applicable: false, ecarts: [], raisons: [] };
  }
}

// ---------------------------------------------------------------------------
// Deps réelles — utilisées par eleve-gate.ts.
// ---------------------------------------------------------------------------

function readSourceConcatReel(projectDir: string): string {
  const exts = new Set([".js", ".jsx", ".ts", ".tsx", ".json"]);
  const out: string[] = [];
  let total = 0;
  const MAX = 500_000; // borne anti-OOM, cohérent avec le reste du repo

  function walk(dir: string): void {
    if (total > MAX) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (exts.has(path.extname(name))) {
        try {
          const c = fs.readFileSync(full, "utf8");
          total += c.length;
          out.push(c);
          if (total > MAX) return;
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(path.join(projectDir, "src"));
  return out.join("\n");
}

export const realConstantsDeps: ConstantsDeps = {
  readSourceConcat: readSourceConcatReel,
};

/** Fonction prête à brancher dans `GateDeps.checkConstants` (eleve-gate.ts). */
export function checkConstantsReel(projectDir: string): Promise<ConstantsVerdict> {
  return checkConstantsProjet(projectDir, realConstantsDeps);
}
