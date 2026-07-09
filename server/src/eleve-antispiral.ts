// Garde anti-spirale pour la boucle agentique (askEleveAgentic).
//
// Problème mesuré (run L42, 2026-06-28) : sur un fichier de taille moyenne, l'Élève GLM
// enchaîne read_file/search_code sans jamais écrire et épuise son budget d'itérations
// AVANT la phase d'action (usedChecks/usedTests=false, diff vide). Même classe que L35
// (sur-exploration), mais fatale pour l'auto-amélioration.
//
// Remède (opt-in, gaté SELF_ANTISPIRAL) : trois leviers purs et bornés —
//   1. NUDGE : après `nudgeAfter` explorations CONSÉCUTIVES, on injecte un message
//      « passe à l'action » (et on remet le compteur consécutif à zéro → re-nudge si rechute).
//   2. CAP  : au-delà de `capAfter` explorations au TOTAL, on retire les outils d'exploration
//      de la liste offerte au modèle → il ne peut plus qu'écrire/vérifier/conclure.
//   3. ANTI-DOUBLON : un appel d'exploration STRICTEMENT identique (même nom + mêmes args)
//      déjà fait renvoie un message « tu l'as déjà, agis » sans ré-exécuter l'outil.
//
// Tout est pur/déterministe ici (état immuable) ; l'intégration vit dans askEleveAgentic.

import type { OpenAITool } from "./kernel/kernel-mcp.js";

export interface AntiSpiralCfg {
  /** Noms d'outils considérés comme « exploration » (lecture/recherche, sans effet). */
  explorationTools: string[];
  /** Explorations CONSÉCUTIVES avant d'injecter un nudge « passe à l'action ». */
  nudgeAfter: number;
  /** Explorations au TOTAL avant de retirer les outils d'exploration de la liste. */
  capAfter: number;
}

export const DEFAULT_EXPLORATION_TOOLS = ["read_file", "list_files", "search_code"];

/** Config par défaut de la boucle d'auto-amélioration, tunable par env, opt-out SELF_ANTISPIRAL=off. */
export function selfAntiSpiralCfg(env: NodeJS.ProcessEnv = process.env): AntiSpiralCfg | null {
  if (String(env.SELF_ANTISPIRAL ?? "on").toLowerCase() === "off") return null;
  const nudge = Number(env.SELF_ANTISPIRAL_NUDGE ?? 6);
  const cap = Number(env.SELF_ANTISPIRAL_CAP ?? 14);
  const nudgeAfter = Number.isFinite(nudge) && nudge > 0 ? Math.floor(nudge) : 6;
  let capAfter = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 14;
  // Le cap doit rester >= au seuil de nudge, sinon le nudge ne se déclenche jamais.
  if (capAfter < nudgeAfter) capAfter = nudgeAfter;
  return { explorationTools: DEFAULT_EXPLORATION_TOOLS, nudgeAfter, capAfter };
}

export interface SpiralState {
  /** Explorations au total depuis le début. */
  total: number;
  /** Explorations consécutives (remis à 0 dès une action). */
  consecutive: number;
  /** Nombre de nudges déjà injectés (escalade le ton). */
  nudges: number;
}

export function newSpiralState(): SpiralState {
  return { total: 0, consecutive: 0, nudges: 0 };
}

export function isExplorationTool(cfg: AntiSpiralCfg, name: string): boolean {
  return cfg.explorationTools.includes(name);
}

/** Met à jour l'état après UN appel d'outil. Immuable. */
export function recordTool(state: SpiralState, cfg: AntiSpiralCfg, name: string): SpiralState {
  if (isExplorationTool(cfg, name)) {
    return { ...state, total: state.total + 1, consecutive: state.consecutive + 1 };
  }
  // Une action concrète casse la série consécutive.
  return { ...state, consecutive: 0 };
}

/** Faut-il cesser d'OFFRIR les outils d'exploration au modèle ? */
export function explorationCapped(state: SpiralState, cfg: AntiSpiralCfg): boolean {
  return state.total >= cfg.capAfter;
}

/** Faut-il injecter un nudge maintenant ? (l'appelant incrémente nudges + remet consecutive à 0) */
export function dueForNudge(state: SpiralState, cfg: AntiSpiralCfg): boolean {
  return state.consecutive >= cfg.nudgeAfter;
}

/** Retire les outils d'exploration de la liste offerte au modèle. */
export function filterOutExploration(tools: OpenAITool[], cfg: AntiSpiralCfg): OpenAITool[] {
  return tools.filter((t) => !cfg.explorationTools.includes(t.function.name));
}

/** Clé d'unicité d'un appel (nom + args bruts) pour l'anti-doublon. */
export function callKey(name: string, rawArgs: string): string {
  return `${name}:${rawArgs}`;
}

/** Message de nudge (ton escaladé au 2ᵉ). `nudges` = compteur APRÈS incrément. */
export function nudgeMessage(nudges: number): string {
  return nudges >= 2
    ? "⚠️ STOP. Tu répètes des explorations (lecture/recherche) sans produire de code. " +
        "Tu en sais déjà assez. À ton PROCHAIN appel, écris ou édite le fichier cible " +
        "(write_file / edit_file). N'appelle plus read_file / list_files / search_code."
    : "⚠️ Tu enchaînes les explorations sans agir. Tu en sais assez pour commencer. " +
        "Passe MAINTENANT à l'action : écris/édite le fichier cible, puis vérifie " +
        "(check_types / run_tests). Évite de relire ce que tu as déjà lu.";
}

/** Notice unique quand le cap retire les outils d'exploration. */
export function capNoticeMessage(): string {
  return "🔒 Outils d'exploration (read_file / list_files / search_code) désactivés : " +
    "tu as assez exploré. Sers-toi de tes outils d'ACTION (write_file, edit_file, " +
    "check_types, run_tests) pour avancer, ou conclus si la tâche est faite.";
}

/** Réponse renvoyée à la place d'un appel d'exploration STRICTEMENT identique déjà fait. */
export function duplicateExplorationMessage(name: string): string {
  return `↩️ Tu as déjà fait cet appel « ${name} » à l'identique — le résultat est plus haut ` +
    "dans la conversation. Ne le refais pas : sers-t'en et passe à l'action (écrire / vérifier).";
}
