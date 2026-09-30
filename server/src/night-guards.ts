// Garde-fous de la nuit, UNE seule porte d'entrée pour tous les runners (audit dormant
// 2026-09-30). Avant : le Disjoncteur MangoQA n'était lu que par nocturnal.ts, et le
// plafond $ seulement par 4 runners sur 9 — les autres scripts de génération tournaient
// sans aucun frein. Ici on combine, à la FRONTIÈRE d'itération (jamais en cours de
// génération) :
//   1. l'autorité d'arrêt du Disjoncteur (MANGOQA_STOP_AUTHORITY, armée par défaut) ;
//   2. le plafond $ dur de la nuit (NOCTURNAL_BUDGET_HARD, armé par défaut, plafond fini).
// Fail-open sur MangoQA : verdict absent, illisible OU PÉRIMÉ → on continue. Le périmé
// compte : le runner MangoQA réécrit le verdict toutes les 5 s, donc un fichier vieux
// de plusieurs minutes vient d'un MangoQA mort — un `safe:false` figé ne doit pas
// bloquer les nuits à jamais (le cost-guard, lui, est glissant sur 12 h).
import { flag } from "./flags.js";
import { freshBreakerVerdict } from "./mangoqa.js";
import { decideBreakerStop } from "./nocturnal.js";
import { nightBudgetGate } from "./nocturnal-budget.js";
import { combineBreakerVerdict, listPerimeterIncidents } from "./perimeter-incidents.js";

export interface NightStopDecision {
  stop: boolean;
  cause?: "mangoqa-breaker" | "budget-hard";
  reason?: string;
}

/** Faut-il s'arrêter AVANT le prochain projet ? Disjoncteur d'abord, plafond $ ensuite. */
export function nightStopGate(): NightStopDecision {
  const breaker = decideBreakerStop(flag("MANGOQA_STOP_AUTHORITY"), () =>
    combineBreakerVerdict(freshBreakerVerdict(), listPerimeterIncidents()),
  );
  if (breaker.stop) return { stop: true, cause: "mangoqa-breaker", reason: breaker.reason };
  const budget = nightBudgetGate();
  if (budget.stop) return { stop: true, cause: "budget-hard", reason: budget.reason };
  return { stop: false };
}
