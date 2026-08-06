// Refonte v3 — lot 3 : L'ALLUMAGE DES ÉQUIPES.
//
// Doc 03 § 5 : l'Orchestrateur décide selon un escalier à 3 étages — déterministe,
// puis heuristique, puis routeur LLM en DERNIER recours. Et § 5, littéralement :
// « Ce mécanisme EXISTE DÉJÀ (intent-capabilities.ts) mais il est OFF et personne ne
// l'appelle allumage d'équipe. On le garde, on l'allume, on le nomme. »
//
// Ce fichier est donc le NOMMAGE, et rien de plus. Les trois étages ne sont pas
// réimplémentés : `requiredCapabilities` les porte déjà (1+2 purs et synchrones,
// 3 = routeur LLM borné par `looksAmbiguous`, rétabli sans gate au lot 3). Ici on
// traduit son résultat — un ensemble de capacités — en une liste d'équipes.
//
// La traduction est PURE et déterministe. C'est ce qui permet de la tester sans
// réseau, et c'est ce qui garantit qu'un même message allume toujours les mêmes
// équipes : un allumage aléatoire serait indébogable pour l'utilisateur.

import {
  requiredCapabilities,
  requiredCapabilitiesSync,
  type TaskContext,
  type RequiredCapabilitiesOpts,
} from "../intent-capabilities.js";
import type { Capability, MutationCeiling } from "../eleve-tools/eleve-tool-capabilities.js";
import { TEAMS, TEAM_IDS, teamCapabilities, type TeamId } from "./teams.js";
import { journalEquipes, TeamJournal } from "./team-journal.js";

/**
 * Ordre d'allumage — celui du schéma du doc 03 § 3, de haut en bas. Ce n'est pas
 * cosmétique : c'est l'ordre du bandeau de statut que l'utilisateur lit, et l'ordre
 * dans lequel les équipes s'exécutent quand elles s'enchaînent. La Vérification est
 * DERNIÈRE parce qu'elle vérifie ce que les autres ont produit.
 */
const ORDRE: readonly TeamId[] = [
  "orchestrateur",
  "analyse",
  "recherche",
  "vision",
  "construction",
  "design",
  "verification",
];

/**
 * Traduit (capacités réclamées, plafond de mutation) en liste d'équipes allumées.
 * PUR, zéro I/O.
 *
 * Les deux entrées sont nécessaires et aucune ne remplace l'autre — c'est la leçon
 * que `test-v3-parcours` a rendue en attrapant l'inverse. Les capacités disent ce que
 * la tâche RÉCLAME (axe intention, read-safe uniquement) ; le plafond dit si on
 * CONSTRUIT (axe posture). 🔨 Construction et 🧠 Analyse ne s'allument que sur le
 * second, parce que l'escalier ne produit structurellement jamais `write-fs` ni `plan`.
 *
 * Quatre règles :
 *   · `inconditionnelle` → allumée sans condition (🧭 Orchestrateur : il reçoit).
 *   · `cloture`  → allumée sans condition, TOUJOURS en dernier (🛡️ Vérification,
 *     « non désactivable » — doc 03 § 2). Aucun paramètre ne l'éteint ; si un jour un
 *     appelant peut la couper, la promesse produit tombe.
 *   · `capacites` → allumée si la tâche réclame au moins une de ses capacités.
 *   · `surMutation` → allumée dès que le plafond autorise la mutation.
 */
export function equipesAllumees(
  caps: ReadonlySet<Capability>,
  ceiling: MutationCeiling = "read-only",
): TeamId[] {
  const mute = ceiling === "mutation";
  const allumees: TeamId[] = [];
  for (const id of ORDRE) {
    const a = TEAMS[id].allumage;
    if (a.inconditionnelle || a.cloture) { allumees.push(id); continue; }
    if (a.surMutation && mute) { allumees.push(id); continue; }
    if (a.capacites?.some((c) => caps.has(c))) allumees.push(id);
  }
  return allumees;
}

/** Alias historique, plafond `read-only` — la posture Discuter, celle de l'accueil. */
export function equipesPourCapacites(caps: ReadonlySet<Capability>): TeamId[] {
  return equipesAllumees(caps, "read-only");
}

/**
 * Étages 1+2 seuls — PUR et SYNCHRONE, zéro appel modèle. C'est le chemin par défaut :
 * l'escalier ne monte à l'étage 3 que si les deux premiers sont muets. Un appelant qui
 * ne peut pas se permettre d'attendre (ou de payer) un tour LLM utilise celui-ci.
 */
export function allumageSync(
  task: string,
  context: TaskContext = {},
  ceiling: MutationCeiling = "read-only",
): TeamId[] {
  return equipesAllumees(requiredCapabilitiesSync(task, context), ceiling);
}

/**
 * L'escalier COMPLET, étage 3 compris. Ne throw jamais — `requiredCapabilities` hérite
 * de la garantie de `dispatch` (une erreur du routeur devient un ensemble vide, donc un
 * allumage déterministe, jamais une exception).
 */
export async function allumage(
  task: string,
  context: TaskContext = {},
  opts: RequiredCapabilitiesOpts = {},
  ceiling: MutationCeiling = "read-only",
): Promise<TeamId[]> {
  return equipesAllumees(await requiredCapabilities(task, context, opts), ceiling);
}

/**
 * Allumage OBSERVÉ — le premier branchement du socle sur le produit.
 *
 * Traduit les capacités en équipes et inscrit la décision au journal, SANS rien
 * exécuter. Deux propriétés en font quelque chose qu'on peut poser sur un chemin
 * chaud sans le mettre en risque :
 *   · elle ne change aucun comportement — retirez-la, le produit se comporte à
 *     l'octet près comme avant ;
 *   · elle ne ment pas — les équipes sont journalisées « pressenties », pas
 *     « allumées », parce que rien ne s'exécute encore.
 *
 * C'est la même discipline que le lot 2 a imposée aux gates : mesurer d'abord,
 * figer ensuite. On saura ce que le socle allumerait sur du trafic réel AVANT de
 * lui confier l'exécution.
 */
export function observeAllumage(
  caps: ReadonlySet<Capability>,
  detail = "",
  journal: TeamJournal = journalEquipes,
  ceiling: MutationCeiling = "read-only",
): TeamId[] {
  const equipes = equipesAllumees(caps, ceiling);
  for (const id of equipes) journal.pressent(id, detail);
  return equipes;
}

/**
 * Les capacités qu'aucune équipe ne saurait HONORER. Une capacité réclamée que personne
 * ne porte, c'est une demande utilisateur qui tombe dans le vide en silence.
 *
 * La couverture se mesure sur les capacités DÉRIVÉES DES OUTILS, pas sur les conditions
 * d'allumage : `parmi` dit quand une équipe s'allume, pas ce qu'elle sait faire une fois
 * allumée. Les deux diffèrent — 🔨 Construction ne s'allume pas sur `read-local`, mais
 * elle lit des fichiers toute la journée. Confondre les deux aurait déclaré `read-local`
 * (offert par défaut à CHAQUE tâche) comme non couvert, à chaque appel.
 *
 * `delegate` est la seule capacité sans porteur, et c'est explicite : `TOOL_CAPABILITIES`
 * la déclare « réservée » et aucun outil ne la porte encore.
 */
export function capacitesSansEquipe(caps: ReadonlySet<Capability>): Capability[] {
  const couvertes = new Set<Capability>();
  for (const id of TEAM_IDS) {
    for (const c of teamCapabilities(TEAMS[id])) couvertes.add(c);
  }
  return [...caps].filter((c) => !couvertes.has(c));
}
