// Boucle de vérification contextuelle — Étape 1 (2026-07-08), la boucle qui ne
// s'arrête jamais. Pour chaque choix engageant (gabarit, artefact réutilisé —
// périmètre ÉTROIT de cette étape, cf. le plan), vérifie que le CONTENU RÉEL du
// choix correspond au CONTEXTE de la tâche — jamais juste le nom.
//
// Principe non négociable (verbatim de Raf) : un hit dans l'index rapide
// (concept-registry.ts) donne une définition à bas coût, il ne dispense JAMAIS
// du jugement — la boucle retourne toujours, qu'on soit passé par le chemin
// rapide ou lent. Pattern "Corrective RAG" : retrieval ≠ pertinence, un juge
// tranche toujours après coup, en verdict ternaire (jamais un score qui
// traverse un seuil — méthode-fable.md axiome 15).
//
// Le juge lui-même reste faillible (même classe de modèle que celui qui s'est
// trompé sur l'incident "formation") : parade = contenu RÉEL toujours fourni
// (jamais le nom seul), verdict ternaire avec repli "incertain" JAMAIS
// "correspond" en cas de réponse illisible (fail-open ≠ fail-positif — même
// discipline que taste-judge.ts/eleve-judge.ts après l'audit du 2026-07-07).
import { searchConcept, recordConceptGap, type Embed } from "./concept-registry.js";
import type { Blackboard } from "./kernel-blackboard.js";

export type VerdictContexte = "correspond" | "ne-correspond-pas" | "incertain";

export interface RapportVerification {
  verdict: VerdictContexte;
  cheminUtilise: "rapide" | "lent" | "aucun";
  definitionUtilisee: string;
  raisonnement: string;
  /** false si le juge a répondu hors-format — verdict alors TOUJOURS "incertain",
   *  jamais un faux "correspond" silencieux (cf. incident neon-drift/eleve-judge). */
  parsed: boolean;
}

export interface VerificateurDeps {
  /** Chemin lent : recherche web injectable (l'Élève fournit chercher_web/lire_page
   *  réels ; les tests injectent un faux). Absent → chemin lent indisponible. */
  chercherDefinitionWeb?: (mot: string) => Promise<string>;
  /** Le petit juge (system, user) → texte. Injectable, zéro réseau en test. */
  juger: (system: string, user: string) => Promise<string>;
  bb?: Blackboard;
  embed?: Embed;
  now?: number;
}

const JUGEMENT_SYSTEM = `Tu es un vérificateur de correspondance contexte↔choix (posture Zero-Trust, scepticisme méthodique).
On te donne une définition d'un concept et le CONTENU RÉEL d'un choix fait pendant une construction (pas son nom).
Ta seule tâche : ce contenu réel correspond-il à la fois à la définition ET au contexte de la tâche ?
Réponds STRICTEMENT sur une seule ligne, ce format exact :
VERDICT: correspond|ne-correspond-pas|incertain | <raison courte en français>
Règles : "incertain" si tu as un doute réel (mieux vaut réévaluer que fabriquer une certitude) ; "ne-correspond-pas"
UNIQUEMENT si le contenu réel contredit concrètement la définition/le contexte, pas sur une simple préférence de style.`;

function jugementUser(contexteDeTache: string, mot: string, definition: string, contenuReel: string): string {
  return (
    `Contexte de la tâche : ${contexteDeTache}\n\n` +
    `Concept en jeu : "${mot}"\n` +
    `Définition (validée ou candidate) : ${definition}\n\n` +
    `Contenu RÉEL du choix fait :\n${contenuReel}`
  );
}

/** Parse la réponse du juge (prose, une ligne). `parsed:false` → verdict FORCÉ à
 *  "incertain", jamais "correspond" par défaut (voir discipline fail-open du
 *  projet). Pur. */
export function parseVerdictContexte(text: string): { verdict: VerdictContexte; raisonnement: string; parsed: boolean } {
  const t = (text ?? "").trim();
  const m = t.match(/VERDICT\s*:?\s*(correspond|ne-correspond-pas|incertain)/i);
  if (!m) return { verdict: "incertain", raisonnement: t.slice(0, 200) || "réponse illisible", parsed: false };
  const verdict = m[1]!.toLowerCase() as VerdictContexte;
  const parts = t.split("|");
  const raisonnement = (parts.length >= 2 ? parts.slice(1).join("|").trim() : "").slice(0, 300);
  return { verdict, raisonnement, parsed: true };
}

/**
 * Vérifie qu'un choix engageant (gabarit/artefact) correspond au contexte réel
 * de la tâche. Ne lève jamais : toute erreur (recherche web, juge) dégrade en
 * "incertain", jamais en faux "correspond" silencieux.
 *
 * `task` sert au dépôt de la lacune de sens (concept-gap) si le chemin lent est
 * emprunté — contexte pour Raf lors de la validation dans l'Atelier.
 */
export async function verifierChoix(
  mot: string,
  contexteDeTache: string,
  contenuReelDuChoix: string,
  task: string,
  deps: VerificateurDeps,
): Promise<RapportVerification> {
  let definition = "";
  let cheminUtilise: RapportVerification["cheminUtilise"] = "aucun";

  try {
    const found = await searchConcept(mot, contexteDeTache, { bb: deps.bb, embed: deps.embed });
    if (found) {
      definition = found.entry.definitionValidee;
      cheminUtilise = "rapide";
    } else if (deps.chercherDefinitionWeb) {
      definition = await deps.chercherDefinitionWeb(mot);
      cheminUtilise = "lent";
      if (definition.trim()) {
        recordConceptGap({ mot, definitionCandidate: definition, contexteDeValidite: contexteDeTache, task });
      }
    }
  } catch {
    // recherche (index ou web) indisponible — on continue SANS définition ;
    // le jugement ci-dessous sera nécessairement "incertain" (rien à comparer).
  }

  if (!definition.trim()) {
    return {
      verdict: "incertain",
      cheminUtilise,
      definitionUtilisee: "",
      raisonnement: "aucune définition disponible (ni index, ni recherche web) — impossible de juger",
      parsed: true, // pas un échec de PARSING, une absence de matière à juger
    };
  }

  try {
    const raw = await deps.juger(JUGEMENT_SYSTEM, jugementUser(contexteDeTache, mot, definition, contenuReelDuChoix));
    const { verdict, raisonnement, parsed } = parseVerdictContexte(raw);
    return { verdict, cheminUtilise, definitionUtilisee: definition, raisonnement, parsed };
  } catch (err) {
    return {
      verdict: "incertain",
      cheminUtilise,
      definitionUtilisee: definition,
      raisonnement: `juge indisponible : ${(err as Error).message}`,
      parsed: false,
    };
  }
}
