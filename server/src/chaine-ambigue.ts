// Boucle de vérification contextuelle — Étape 1bis (2026-07-08). Complément de
// verificateur-contexte.ts : celui-ci juge UN SEUL mot isolé. Raf a corrigé la
// limite (verbatim) : « il faut aussi ne pas oublier le contexte général. Ça
// fait partie de la base : si dès le départ on part dans le mauvais sens, tout
// ce qui en découle est faux. […] s'il y a plusieurs mots consécutifs qui sont
// en chaîne et qui peuvent causer des doutes, on prend tous ces plusieurs
// mots, on fait une probabilité, on regarde le contexte, tout ça avant de se
// dire "Ok on se lance dans cette voie-là". »
//
// Ce module ne remplace pas verifierChoix (qui reste le juge d'UN choix déjà
// fait) — il évalue la COHÉRENCE JOINTE de plusieurs termes ambigus consécutifs
// d'un brief, EN AMONT, avant que la direction structurelle du projet ne soit
// injectée dans le prompt système de l'Élève. Réutilise searchConcept/
// chercherDefinitionWeb existants (aucune nouvelle brique de récupération de
// définition, aucun changement de schéma ConceptEntry/ConceptGap).
//
// Verdict ternaire par PARSING TEXTE, jamais un score float thresholdé
// (axiome 15, méthode-fable.md : « juge probabiliste → catégorie, jamais un
// nombre qui traverse un seuil »). Fail-open vers "incertaine" sur toute
// erreur/JSON illisible — jamais un faux "coherente" silencieux.
import { searchConcept, type Embed } from "./concept-registry.js";
import type { Blackboard } from "./kernel-blackboard.js";

export type VerdictChaine = "coherente" | "incoherente" | "incertaine";

export interface TermeDetecte {
  terme: string;
  /** Hypothèse de sens proposée par l'extracteur POUR CE BRIEF précis — pas une
   *  définition validée, juste de quoi nourrir le jugement joint. */
  sensProbableDansLeBrief: string;
}

export interface RapportChaineAmbigue {
  verdict: VerdictChaine;
  termesEnJeu: string[];
  definitionsUtilisees: Record<string, string>;
  raisonnement: string;
  /** false si le juge (ou l'extracteur) a répondu hors-format — même discipline
   *  fail-open que RapportVerification.parsed. */
  parsed: boolean;
}

export interface ChaineDeps {
  /** Extraction des termes candidats (petit appel LLM, freeform JSON). */
  extraire: (system: string, user: string) => Promise<string>;
  /** Jugement joint — peut être le même rôle "juge" que verificateur-contexte. */
  juger: (system: string, user: string) => Promise<string>;
  chercherDefinitionWeb?: (mot: string) => Promise<string>;
  bb?: Blackboard;
  embed?: Embed;
  now?: number;
}

const EXTRACTION_SYSTEM = `Tu identifies les termes d'un brief qui, pris isolément, ont plusieurs sens possibles ET dont la confusion pourrait faire dériver TOUT le projet vers une mauvaise direction (ex. "cellule" = cellule de crise OU cellule biologique).
Ignore les mots qui n'ont clairement qu'un sens dans ce contexte précis — ne force pas une ambiguïté qui n'existe pas.
Réponds STRICTEMENT en JSON, une seule ligne, ce format exact :
{"termes":[{"terme":"...", "sensProbableDansLeBrief":"..."}]}
0 à 4 termes maximum. Réponds {"termes":[]} si aucun terme n'est réellement ambigu ici.`;

const JUGEMENT_CHAINE_SYSTEM = `Tu es un vérificateur de COHÉRENCE JOINTE (posture Zero-Trust). On te donne un brief complet et une liste de termes CONSÉCUTIFS potentiellement ambigus qui y apparaissent, chacun avec une définition candidate.
Ta tâche N'EST PAS de juger chaque terme isolément (un autre vérificateur s'en charge déjà) — c'est de juger si l'ENSEMBLE de ces termes, pris ENSEMBLE dans le contexte du brief, pointe vers UNE direction cohérente, ou si leur combinaison crée un doute réel sur la direction à prendre.
Réponds STRICTEMENT sur une seule ligne, ce format exact :
VERDICT: coherente|incoherente|incertaine | <raison courte en français>
Règles : "incertaine" en cas de doute réel (mieux vaut réévaluer que fabriquer une certitude) ; "incoherente" UNIQUEMENT si la combinaison des termes contredit concrètement une direction unique plausible pour ce brief.`;

function jugementChaineUser(brief: string, definitions: Record<string, string>): string {
  const lignes = Object.entries(definitions)
    .map(([mot, def]) => `- "${mot}" : ${def}`)
    .join("\n");
  return `Brief complet : ${brief}\n\nTermes en jeu et leurs définitions :\n${lignes}`;
}

/** Parse la réponse JSON de l'extracteur. Toute réponse illisible/absente →
 *  liste vide (jamais une hallucination de termes fabriquée par le parsing). Pur. */
export function parseTermesDetectes(text: string): TermeDetecte[] {
  const t = (text ?? "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const parsed: unknown = JSON.parse(m[0]);
    const termes = (parsed as { termes?: unknown } | null)?.termes;
    if (!Array.isArray(termes)) return [];
    const out: TermeDetecte[] = [];
    for (const item of termes) {
      const terme = (item as { terme?: unknown } | null)?.terme;
      const sens = (item as { sensProbableDansLeBrief?: unknown } | null)?.sensProbableDansLeBrief;
      if (typeof terme === "string" && terme.trim()) {
        out.push({ terme: terme.trim(), sensProbableDansLeBrief: typeof sens === "string" ? sens : "" });
      }
    }
    return out.slice(0, 4);
  } catch {
    return [];
  }
}

/** Parse la réponse du juge joint — même patron EXACT que parseVerdictContexte :
 *  format illisible → verdict FORCÉ "incertaine", jamais "coherente" par défaut. Pur. */
export function parseVerdictChaine(text: string): { verdict: VerdictChaine; raisonnement: string; parsed: boolean } {
  const t = (text ?? "").trim();
  const m = t.match(/VERDICT\s*:?\s*(coherente|incoherente|incertaine)/i);
  if (!m) return { verdict: "incertaine", raisonnement: t.slice(0, 200) || "réponse illisible", parsed: false };
  const verdict = m[1]!.toLowerCase() as VerdictChaine;
  const parts = t.split("|");
  const raisonnement = (parts.length >= 2 ? parts.slice(1).join("|").trim() : "").slice(0, 300);
  return { verdict, raisonnement, parsed: true };
}

/** Extrait les termes ambigus candidats d'un brief. Ne lève jamais : toute
 *  erreur → liste vide (le juge joint ne sera alors jamais appelé). */
export async function extraireTermesAmbigus(brief: string, deps: Pick<ChaineDeps, "extraire">): Promise<TermeDetecte[]> {
  try {
    const raw = await deps.extraire(EXTRACTION_SYSTEM, `Brief : ${brief}`);
    return parseTermesDetectes(raw);
  } catch {
    return [];
  }
}

/**
 * Cœur de la capacité : évalue la cohérence JOINTE des termes ambigus
 * consécutifs d'un brief, AVANT de s'engager dans une direction. Si moins de
 * 2 termes ambigus sont détectés, retourne directement "coherente" SANS
 * appeler le juge (rien à mettre "en chaîne" — un seul mot isolé reste le
 * rôle de verifierChoix, pas la peine de payer un appel LLM ici). Ne lève
 * jamais : toute erreur → "incertaine" (fail-open, jamais un faux "coherente"
 * qui laisserait passer une dérive silencieuse).
 */
export async function verifierChaineAmbigue(brief: string, deps: ChaineDeps): Promise<RapportChaineAmbigue> {
  let termes: TermeDetecte[];
  try {
    termes = await extraireTermesAmbigus(brief, deps);
  } catch {
    termes = [];
  }

  if (termes.length < 2) {
    return {
      verdict: "coherente",
      termesEnJeu: termes.map((t) => t.terme),
      definitionsUtilisees: {},
      raisonnement: "moins de 2 termes ambigus détectés — rien à évaluer en chaîne",
      parsed: true,
    };
  }

  const definitions: Record<string, string> = {};
  for (const { terme, sensProbableDansLeBrief } of termes) {
    try {
      const found = await searchConcept(terme, brief, { bb: deps.bb, embed: deps.embed });
      if (found) {
        definitions[terme] = found.entry.definitionValidee;
      } else if (deps.chercherDefinitionWeb) {
        const web = await deps.chercherDefinitionWeb(terme);
        definitions[terme] = web.trim() || sensProbableDansLeBrief;
      } else {
        definitions[terme] = sensProbableDansLeBrief;
      }
    } catch {
      definitions[terme] = sensProbableDansLeBrief;
    }
  }

  try {
    const raw = await deps.juger(JUGEMENT_CHAINE_SYSTEM, jugementChaineUser(brief, definitions));
    const { verdict, raisonnement, parsed } = parseVerdictChaine(raw);
    return { verdict, termesEnJeu: termes.map((t) => t.terme), definitionsUtilisees: definitions, raisonnement, parsed };
  } catch (err) {
    return {
      verdict: "incertaine",
      termesEnJeu: termes.map((t) => t.terme),
      definitionsUtilisees: definitions,
      raisonnement: `juge indisponible : ${(err as Error).message}`,
      parsed: false,
    };
  }
}
