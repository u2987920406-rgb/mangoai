// Refonte v3 — lot 3 : LE TOUR COMPLET.
//
// `runTour(task)` fait tourner un parcours de bout en bout à travers les équipes :
// allumage → exécution dans l'ordre du doc 03 § 3 → clôture par la Vérification.
// C'est la pièce qui rend vérifiable le dernier critère du lot 3 (« un parcours
// complet de bout en bout tourne ») sans dépendre de la décision restée ouverte
// entre `brain.ts` et `v3/` : ce fichier n'appelle QUE `dispatchTeam`.
//
// Ce qu'il n'est pas : un remplaçant du relais de l'Élève. Le relais existant porte
// le function-calling, la reprise sur erreur, la clôture du Gardien — des choses que
// ce tour ne refait pas et ne doit pas refaire. `runTour` est le squelette de
// l'orchestration par équipes, exécutable et testable ; le brancher sur le produit
// est un geste séparé, et il attend l'arbitrage des façades.

import type { AgentResult } from "../agent/agent-contract.js";
import type { MutationCeiling } from "../eleve-tools/eleve-tool-capabilities.js";
import type { TaskContext, RequiredCapabilitiesOpts } from "../intent-capabilities.js";
import { TEAMS, type TeamId } from "./teams.js";
import { allumage } from "./team-ignition.js";
import { dispatchTeam, TeamBudget, type TeamResult, type TeamDispatchOpts } from "./team-dispatch.js";
import { TeamJournal, journalEquipes, type EntreeJournal } from "./team-journal.js";

export interface TourOpts extends RequiredCapabilitiesOpts {
  /** Plafond de mutation du tour. Défaut `read-only` — un défaut permissif donnerait
   *  le droit d'écrire à l'appelant qui oublie le paramètre. */
  ceiling?: MutationCeiling;
  context?: TaskContext;
  journal?: TeamJournal;
  budget?: TeamBudget;
  /** Options passées telles quelles à chaque `dispatchTeam` (transport `ask`, `sleep`,
   *  `session`…). C'est par là que les tests injectent un transport déterministe. */
  dispatchOpts?: Omit<TeamDispatchOpts, "ceiling" | "journal" | "budget" | "detail" | "cerveau">;
}

export interface TourResult {
  readonly task: string;
  /** Les équipes que l'allumage a retenues, dans l'ordre du bandeau. */
  readonly equipes: readonly TeamId[];
  /** Un résultat par appel effectué, dans l'ordre. La Vérification en produit deux
   *  (audit puis verdict) — c'est visible ici, pas caché. */
  readonly resultats: readonly TeamResult[];
  /** Le verdict d'adéquation, rendu par le JUGE — le cerveau interne de la
   *  🛡️ Vérification, distinct de celui qui a construit. Toujours présent : la
   *  clôture n'est pas désactivable. */
  readonly verdict: TeamResult;
  /** Ce que l'utilisateur verrait du tour (doc 03 § 6). */
  readonly bandeau: readonly EntreeJournal[];
}

/** Ce qu'une équipe reçoit : la demande d'origine, jamais écrasée, plus ce que les
 *  équipes précédentes ont rapporté. Court volontairement — un contexte qui enfle à
 *  chaque étape finit par coûter plus cher que le travail lui-même. */
function contexteAmont(task: string, faits: readonly TeamResult[]): string {
  if (!faits.length) return task;
  const digest = faits
    .filter((r) => !r.refuse)
    .map((r) => `- ${TEAMS[r.teamId].emoji} ${TEAMS[r.teamId].label} : ${r.summary.slice(0, 200)}`)
    .join("\n");
  return digest ? `${task}\n\n— Ce que les équipes précédentes ont rapporté —\n${digest}` : task;
}

/**
 * Un tour complet. Ne throw JAMAIS : chaque étape hérite de la garantie de `dispatch`,
 * et une équipe en échec n'interrompt pas le tour — la 🛡️ Vérification doit pouvoir
 * dire que ça s'est mal passé, ce qu'elle ne pourrait pas faire si l'échec avait
 * arrêté le parcours avant elle.
 */
export async function runTour(task: string, opts: TourOpts = {}): Promise<TourResult> {
  const journal = opts.journal ?? journalEquipes;
  // Budget NEUF par défaut, et non le budget du processus. Le plafond est par TOUR
  // (« un tour d'utilisateur repart à neuf ») : réutiliser le singleton sans le
  // réinitialiser aurait fait échouer le deuxième tour de chaque session, toutes
  // équipes refusées d'un coup. Un appelant qui veut plafonner à travers plusieurs
  // tours injecte le sien — c'est alors un choix, pas un effet de bord.
  const budget = opts.budget ?? new TeamBudget();
  const ceiling = opts.ceiling ?? "read-only";
  const base = { ...(opts.dispatchOpts ?? {}), ceiling, journal, budget };

  // Le plafond est passé à l'allumage, pas seulement au dispatch : c'est lui qui
  // porte l'intention « construire » (cf. Ignition dans teams.ts).
  const equipes = await allumage(task, opts.context ?? {}, { dispatch: opts.dispatch }, ceiling);
  const resultats: TeamResult[] = [];

  // Les équipes de travail, dans l'ordre du bandeau. La Vérification est traitée à part
  // en clôture : la faire passer dans cette boucle l'aurait rendue conditionnelle à
  // l'allumage, donc désactivable — exactement ce que le doc 03 § 2 interdit.
  for (const id of equipes) {
    if (id === "verification") continue;
    const r = await dispatchTeam(id, "", contexteAmont(task, resultats), {
      ...base,
      detail: `${TEAMS[id].label.toLowerCase()} — tour en cours`,
    });
    resultats.push(r);
  }

  // ── CLÔTURE — non désactivable, et en deux temps ────────────────────────────────
  // 1. L'auditeur VÉRIFIE (il a les outils de test).
  const audit = await dispatchTeam("verification", "", contexteAmont(task, resultats), {
    ...base,
    detail: "audit de clôture",
  });
  resultats.push(audit);

  // 2. Le JUGE tranche l'adéquation — sur un cerveau DISTINCT de celui qui a
  //    construit. C'est l'invariant « non négociable » du doc 03 § 2, et c'est la
  //    raison d'être du cerveau interne : un modèle ne rattrape pas ses propres
  //    angles morts. `test-brain-dispatch` garde la distinction côté registre ;
  //    ici on garde qu'elle est effectivement EMPRUNTÉE.
  const verdict = await dispatchTeam("verification", "", contexteAmont(task, resultats), {
    ...base,
    detail: "verdict d'adéquation",
    cerveau: "interne",
  });
  resultats.push(verdict);

  return { task, equipes, resultats, verdict, bandeau: journal.lignes() };
}

/** Le résultat brut d'un tour, réduit à ce qu'un appelant non-v3 attend d'un
 *  `AgentResult` — pour qu'un point de branchement futur n'ait pas à connaître les
 *  équipes pour lire une réponse. */
export function resultatDuTour(t: TourResult): AgentResult {
  return t.verdict;
}
