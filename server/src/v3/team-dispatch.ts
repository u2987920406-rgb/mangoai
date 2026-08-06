// Refonte v3 — lot 3 : `dispatchTeam`.
//
// Doc 03 § 4, mot pour mot : « AUCUNE RÉÉCRITURE. `dispatch(agentId, system, user,
// opts)` reste EXACTEMENT ce qu'il est. Trois ajouts seulement : `dispatchTeam`,
// le journal d'allumage, le budget par équipe. »
//
// Ce fichier est ces trois ajouts, et strictement eux. Tout ce qui suit est DÉJÀ
// dans `dispatch` et n'est pas refait ici : rate limiting par provider, fallback
// inter-providers, garde de souveraineté `localOnly`, contrat Mango, anti-injection
// sur l'entrée externe, timeout dégradé, « ne throw jamais ».
//
// C'est précisément pour ça que le dispatcher est le bon socle : l'enveloppe
// n'ajoute que du produit — une identité d'équipe, un périmètre d'outils, un
// plafond, une trace. Si elle ajoutait du transport, ce serait une réécriture.

import { dispatch, type DispatchOpts } from "../brain/brain-dispatch.js";
import type { AgentResult } from "../agent/agent-contract.js";
import {
  policyFromCaps,
  mergePolicies,
  TOOL_CAPABILITIES,
  type MutationCeiling,
} from "../eleve-tools/eleve-tool-capabilities.js";
import type { ToolPolicy } from "../eleve-tools/eleve-action-tools.js";
import { TEAMS, getTeam, teamCapabilities, type Team, type TeamId } from "./teams.js";
import { journalEquipes, TeamJournal } from "./team-journal.js";

export interface TeamDispatchOpts extends DispatchOpts {
  /** Plafond de mutation imposé par la POSTURE (axe sûreté, #182 D1). Défaut :
   *  `read-only`. Un défaut permissif serait un piège : l'appelant qui oublie le
   *  paramètre obtiendrait le droit d'écrire sans l'avoir demandé. */
  ceiling?: MutationCeiling;
  /** Policy de l'appelant, COMPOSÉE avec celle de l'équipe (allowlists → intersection).
   *  Sert à resserrer, jamais à élargir : `mergePolicies` ne rend pas d'outil. */
  policy?: ToolPolicy;
  /** Journal injectable (tests). Défaut : le journal du processus. */
  journal?: TeamJournal;
  /** Budget injectable (tests). Défaut : le budget du processus. */
  budget?: TeamBudget;
  /** Ce que l'équipe fait, en clair, pour le bandeau de statut. */
  detail?: string;
  /** Cerveau à employer : `principal` (défaut) ou `interne` — le juge de la
   *  🛡️ Vérification. Demander `interne` à une équipe qui n'en a pas est une erreur
   *  d'appelant, pas un repli silencieux : on retourne un résultat dégradé. */
  cerveau?: "principal" | "interne";
}

/** Résultat d'un allumage d'équipe : le résultat du cerveau, plus ce qui est propre
 *  à l'équipe. Sur-ensemble strict d'`AgentResult` — aucun consommateur existant
 *  n'a besoin de changer pour lire ce que `dispatch` rendait déjà. */
export interface TeamResult extends AgentResult {
  readonly teamId: TeamId;
  /** La policy effectivement appliquée — ce que l'équipe avait le droit de manier.
   *  Journalisée pour que « pourquoi n'a-t-elle pas utilisé tel outil ? » ait une
   *  réponse factuelle et non une reconstitution. */
  readonly toolPolicy: ToolPolicy;
  /** true si l'allumage a été refusé AVANT tout appel modèle (budget, cerveau absent). */
  readonly refuse: boolean;
}

/**
 * La policy d'outils d'une équipe : allowlist de SES outils, resserrée par le plafond
 * de mutation. PURE.
 *
 * On passe par `policyFromCaps(ceiling, capacités-de-l'équipe)` — le traducteur
 * existant — puis on INTERSECTE avec les outils déclarés de l'équipe. Les deux étapes
 * sont nécessaires et aucune n'est redondante :
 *   · `policyFromCaps` applique le plafond read-only, qui écarte les outils mutants
 *     même quand l'équipe les possède. C'est la règle de sûreté, elle ne se duplique pas.
 *   · l'intersection applique l'appartenance : sans elle, 🎨 Design hériterait de TOUS
 *     les outils `read-local` du produit, parce que `verifie_design` en est un.
 */
export function teamToolPolicy(team: Team, ceiling: MutationCeiling): ToolPolicy {
  const parCapacite = policyFromCaps(ceiling, teamCapabilities(team));
  // `policyFromCaps` rend une allowlist dès que les capacités ne sont pas "all".
  const autorises = new Set(parCapacite.allowedTools ?? team.outils);
  const allowedTools = team.outils.filter((n) => autorises.has(n));
  const allowRun = team.outils.includes("run_command") && ceiling === "mutation";

  // ⚠️ PIÈGE : `applyToolPolicy` traite une allowlist VIDE comme « aucun filtre »
  // (`allowedTools && allowedTools.length ? … : null`). Rendre `{ allowedTools: [] }`
  // pour le 🧭 Orchestrateur — qui n'a aucun outil — lui aurait donc donné le registre
  // ENTIER, exactement l'inverse de l'intention. Une équipe sans outil sort donc avec
  // une denylist explicite de tout ce qui existe. (`finish` survit quand même :
  // `ALWAYS_KEEP_TOOLS` le protège, pour qu'un tour puisse toujours conclure.)
  if (!allowedTools.length) {
    return { allowedTools: [], deniedTools: [...TOOL_CAPABILITIES.keys()], allowRun: false };
  }
  return { allowedTools, allowRun };
}

/** Plafonds de tours consommés, par équipe, pour la session courante. Le budget est
 *  un plafond d'ALLUMAGES, pas un plafond de coût : un coût ne se connaît qu'après
 *  l'appel, un allumage se compte avant. C'est ce qui rend l'extinction PROPRE. */
export class TeamBudget {
  private readonly consommes = new Map<TeamId, number>();

  restant(id: TeamId): number {
    return Math.max(0, TEAMS[id].maxTours - (this.consommes.get(id) ?? 0));
  }

  /** Réserve un tour. `false` → plafond atteint : l'équipe s'éteint proprement,
   *  elle ne bloque pas le tour (doc 03 § 4 : « dépassement = extinction propre,
   *  jamais un blocage »). */
  reserve(id: TeamId): boolean {
    const utilise = this.consommes.get(id) ?? 0;
    if (utilise >= TEAMS[id].maxTours) return false;
    this.consommes.set(id, utilise + 1);
    return true;
  }

  reset(): void {
    this.consommes.clear();
  }
}

/** Budget du processus. Un tour d'utilisateur appelle `reset()` en entrée. */
export const budgetEquipes = new TeamBudget();

function degradeEquipe(
  team: Team,
  raison: string,
  toolPolicy: ToolPolicy,
): TeamResult {
  return {
    status: "error",
    agent: team.brain,
    summary: raison,
    data: {},
    confidence: 0,
    durationMs: 0,
    teamId: team.id,
    toolPolicy,
    refuse: true,
  };
}

/**
 * Allume une équipe, lui pose sa question, l'éteint. Ne throw JAMAIS — hérite de la
 * garantie de `dispatch` et l'étend aux refus propres à l'équipe (équipe inconnue,
 * budget épuisé, cerveau interne absent), qui sortent en `refuse: true` sans appel modèle.
 *
 * Le system prompt est la MISSION de l'équipe, préfixée à celui de l'appelant. C'est
 * ce qui donne son périmètre à l'équipe : sans mission injectée, `dispatchTeam` ne
 * serait qu'un alias de `dispatch` avec un nom plus joli.
 */
export async function dispatchTeam(
  teamId: string,
  system: string,
  user: string,
  opts: TeamDispatchOpts = {},
): Promise<TeamResult> {
  const team = getTeam(teamId);
  const ceiling = opts.ceiling ?? "read-only";

  if (!team) {
    // Pas de journal : on ne sait pas quoi journaliser, et inventer un identifiant
    // polluerait le bandeau avec une équipe qui n'existe pas.
    return {
      status: "error",
      agent: "orchestrateur",
      summary: `équipe inconnue : ${teamId}`,
      data: {},
      confidence: 0,
      durationMs: 0,
      teamId: "orchestrateur",
      toolPolicy: { allowedTools: [] },
      refuse: true,
    };
  }

  const policyEquipe = teamToolPolicy(team, ceiling);
  // `mergePolicies` fait primer l'appelant sur `allowRun` — c'est sa sémantique, et
  // elle est juste pour un sous-agent scellé. Ici elle ne l'est pas : elle permettrait
  // à un appelant de RENDRE le shell à une équipe que le plafond read-only vient de le
  // lui retirer. La policy de l'appelant doit resserrer, jamais élargir : on ET les deux.
  const toolPolicy: ToolPolicy = opts.policy
    ? { ...mergePolicies(policyEquipe, opts.policy), allowRun: policyEquipe.allowRun === true && opts.policy.allowRun !== false }
    : policyEquipe;
  const journal = opts.journal ?? journalEquipes;
  const budget = opts.budget ?? budgetEquipes;

  if (!budget.reserve(team.id)) {
    journal.eteint(team.id, `budget épuisé (${team.maxTours} tours)`);
    return degradeEquipe(team, `budget d'équipe épuisé (${team.maxTours} tours)`, toolPolicy);
  }

  // Cerveau : principal, ou l'interne quand l'appelant le demande explicitement.
  let brain = team.brain;
  if (opts.cerveau === "interne") {
    if (!team.brainInterne) {
      journal.eteint(team.id, "cerveau interne demandé mais inexistant", true);
      return degradeEquipe(team, `l'équipe ${team.id} n'a pas de cerveau interne`, toolPolicy);
    }
    brain = team.brainInterne;
  }

  journal.allume(team.id, opts.detail ?? "");
  const missionSystem = `Tu es l'équipe ${team.emoji} ${team.label}.\nMission : ${team.mission}\n\n${system}`;

  // On retire les options propres à l'équipe avant de passer la main : `dispatch`
  // ne les connaît pas, et lui passer des clés inconnues masquerait une faute de frappe.
  const { ceiling: _c, policy: _p, journal: _j, budget: _b, detail: _d, cerveau: _cv, ...dispatchOpts } = opts;
  const r = await dispatch(brain, missionSystem, user, dispatchOpts);

  journal.eteint(team.id, r.summary.slice(0, 120), r.status === "error" || r.status === "timeout");
  return { ...r, teamId: team.id, toolPolicy, refuse: false };
}
