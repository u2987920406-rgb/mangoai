// #180 É7, D6 — Scheduler BORNÉ multi-projets.
//
// Aujourd'hui (agent-lock.ts) : un seul run agentique GLOBAL, tous projets confondus
// (`busy: boolean`). La fenêtre desktop veut afficher plusieurs projets de front — mais
// l'EXÉCUTION agentique ne devient PAS N boucles concurrentes libres (D6, plan §2 D6) :
// un POOL de workers de taille fixe, gate `DESKTOP_MAX_CONCURRENT_RUNS` (défaut 1,
// configurable), qui partage le MÊME ledger `data/global-budget.json` que
// `NOCTURNAL_BUDGET_HARD` — la somme des coûts des runs CONCURRENTS est plafonnée par le
// MÊME budget dur. Deux runs de front ne peuvent pas, à eux deux, dépasser le plafond.
//
// `agent-lock.ts` n'est PAS modifié par ce module : zéro risque sur ses ~30 sites d'appel
// existants (chat, préviews, déploiement, GitHub). Ce pool est un mécanisme NOUVEAU,
// INDÉPENDANT, prouvé isolément (test-agent-scheduler.ts). Câblage dans les routes déjà
// vivantes (index.ts) : NON fait dans cette livraison — voir limites.md (L85), risque jugé
// trop élevé sur le chemin chaud pour la fin d'un plan XL déjà long ; ce module expose les
// primitives exactes (`tryAcquireRun`/`releaseRun`/`activeRunCount`) qu'un futur câblage
// utiliserait, testées de bout en bout contre le VRAI ledger sur disque.
//
// Réutilisation stricte du ledger existant (aucune réinvention, D6) : `readGlobalBudgetState`
// / `spendGlobalBudget` / `localDateStr` de nocturnal-budget.ts, TELS QUELS.
//
// Concurrence en mémoire (ce process) : `slots` est un Map simple — sûr ici car Node est
// mono-thread et cette fonction ne contient AUCUN point d'attente (`await`) entre la
// lecture (`slots.size`) et l'écriture (`slots.set`) : deux appels "concurrents" (deux
// promesses qui se résolvent l'une après l'autre sur la même tick) ne peuvent jamais
// s'entrelacer AU MILIEU de `tryAcquireRun` — la fonction s'exécute entièrement avant de
// rendre la main. Le ledger fichier partagé a la même propriété (cf. note dans
// nocturnal-budget.ts : readGlobalBudgetState/writeGlobalBudgetState sont 100% synchrones,
// donc jamais entrelacées EN INTRA-PROCESS ; le risque de course ne subsiste qu'ENTRE
// process séparés — déjà noté et accepté là-bas).

import { readGlobalBudgetState, spendGlobalBudget, localDateStr, type GlobalBudgetState } from "../nocturnal-budget.js";

export interface SchedulerConfig {
  /** Nombre de runs agentiques autorisés EN VOL simultanément. */
  maxConcurrentRuns: number;
}

/** Lit DESKTOP_MAX_CONCURRENT_RUNS (numérique, défaut 1 — équivalent au verrou global
 * historique). Valeur absente/invalide/< 1 → repli sûr à 1 (jamais 0, jamais négatif). */
export function schedulerConfig(env: NodeJS.ProcessEnv = process.env): SchedulerConfig {
  const raw = Number(env.DESKTOP_MAX_CONCURRENT_RUNS ?? 1);
  const n = Number.isFinite(raw) ? Math.floor(raw) : 1;
  return { maxConcurrentRuns: n >= 1 ? n : 1 };
}

export interface RunSlot {
  id: string;
  project: string;
  startedAt: number;
}

// État du pool — en mémoire, un seul process serveur (même famille que `busy` d'agent-lock.ts).
const slots = new Map<string, RunSlot>();

export function activeRunCount(): number {
  return slots.size;
}

export function activeRuns(): RunSlot[] {
  return [...slots.values()];
}

/** Vide le pool (tests uniquement — jamais appelé en production). */
export function _resetSchedulerForTests(): void {
  slots.clear();
}

export type AcquireRejectReason = "pool-full" | "budget-hard-cap";

export interface AcquireResult {
  acquired: boolean;
  reason?: AcquireRejectReason;
  /** État du ledger au moment de la décision (diagnostic). */
  activeRuns: number;
  maxConcurrentRuns: number;
}

export interface AcquireOptions {
  config?: SchedulerConfig;
  /** Le budget-$ dur est-il ARMÉ (NOCTURNAL_BUDGET_HARD) ? Comme decideBudgetStop,
   * capUsd<=0 ou gate off = illimité (aucune lecture du ledger). */
  budgetGateOn?: boolean;
  capUsd?: number;
  readState?: () => GlobalBudgetState | null;
  now?: Date;
}

/**
 * Tente de réserver un slot de run pour `id` (identifiant de run, ex. `${project}:${ts}`).
 * Réutilise le VRAI ledger (D6) : refuse un run qui ferait dépasser le plafond dur PARTAGÉ,
 * même si le pool a de la place. Deux vérifications indépendantes, dans l'ordre :
 *   1) taille du pool (DESKTOP_MAX_CONCURRENT_RUNS)
 *   2) budget-$ dur (si armé) — le cumul déjà dépensé cette fenêtre a-t-il ATTEINT le cap ?
 * Idempotent : ré-acquérir le même `id` déjà tenu réussit sans consommer un 2e slot.
 */
export function tryAcquireRun(id: string, project: string, opts: AcquireOptions = {}): AcquireResult {
  const config = opts.config ?? schedulerConfig();
  if (slots.has(id)) {
    return { acquired: true, activeRuns: slots.size, maxConcurrentRuns: config.maxConcurrentRuns };
  }
  if (slots.size >= config.maxConcurrentRuns) {
    return { acquired: false, reason: "pool-full", activeRuns: slots.size, maxConcurrentRuns: config.maxConcurrentRuns };
  }

  if (opts.budgetGateOn && typeof opts.capUsd === "number" && opts.capUsd > 0) {
    const readState = opts.readState ?? readGlobalBudgetState;
    const today = localDateStr(opts.now ?? new Date());
    const state = readState();
    const spent = state && state.date === today ? state.spentUsd : 0;
    if (spent >= opts.capUsd) {
      return { acquired: false, reason: "budget-hard-cap", activeRuns: slots.size, maxConcurrentRuns: config.maxConcurrentRuns };
    }
  }

  slots.set(id, { id, project, startedAt: Date.now() });
  return { acquired: true, activeRuns: slots.size, maxConcurrentRuns: config.maxConcurrentRuns };
}

export function releaseRun(id: string): void {
  slots.delete(id);
}

/** Enregistre le coût RÉEL d'un run terminé sur le ledger PARTAGÉ — réutilise
 * `spendGlobalBudget` de nocturnal-budget.ts TEL QUEL (aucune réinvention du ledger, D6). */
export function recordRunSpend(costUsd: number, file?: string, now?: Date): GlobalBudgetState {
  return spendGlobalBudget(costUsd, file, now);
}
