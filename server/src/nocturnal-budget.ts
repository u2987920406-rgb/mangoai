// Budget-$ DUR global, PARTAGÉ entre TOUTES les boucles nocturnes (revue
// globale 2026-07-03, 🔴 « pas de budget-$ dur sur la nuit ni la Phase 0 »).
//
// nocturnal.ts était borné en TEMPS (45 min/projet, 8 h/lot) mais `costUsd`
// n'était JAMAIS comparé à un plafond. train-loop.ts (Phase 0) plafonne le
// NOMBRE d'escalades (--max-escalations), pas les dollars — chaque escalade
// pouvait coûter cher (query non bornée + jusqu'à 2 re-corrections). Coût
// réel possible $10-30/nuit malgré un cap affiché « 6 ».
//
// Généralise FINISH_BUDGET_USD (run-finish.ts) : là, le compteur était EN
// MÉMOIRE, local à un seul process (`results.reduce(...)`) — impossible à
// partager, puisque chacun de ces runners est un PROCESS SÉPARÉ (train-loop.ts
// n'est jamais importé en prod, comme audit-scan.ts ; nocturnal.ts tourne DANS
// le serveur Express ; run-tonight.ts/run-mango-nuit.ts sont des CLI ponctuels
// lancés à la main). Le seul canal de partage entre process est un FICHIER, lu
// et écrit atomiquement — même famille que breaker-verdict.json /
// nocturnal-stop.json.
//
// Fenêtre = LA NUIT (date locale YYYY-MM-DD) : le plafond se réinitialise
// chaque jour — même pattern que localDate()/lastAutoRun (planificateur
// nocturne, nocturnal.ts).
//
// Gate NOCTURNAL_BUDGET_HARD (off par défaut, flags.ts) : OFF → decideBudgetStop
// ne lit JAMAIS l'état (0 I/O), comportement byte-identique. Fonctions PURES
// sur deps injectées — même discipline que decideBreakerStop (nocturnal.ts).

import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync, dataDir } from "./safe-io.js";
import { flag } from "./flags.js";

const DATA_DIR = dataDir();
const GLOBAL_BUDGET_FILE = path.join(DATA_DIR, "global-budget.json");

/** Plafond $ par défaut d'une nuit quand NOCTURNAL_GLOBAL_BUDGET_USD est absent/invalide/≤ 0.
 * Pourquoi FINI : l'audit dormant (2026-09-30) a constaté que « 0/absent = illimité » laissait
 * la nuit sans aucun frein monétaire (coût réel possible $10-30/nuit, cf. en-tête). Jamais 0. */
export const DEFAULT_NIGHT_BUDGET_USD = 20;

/** Plafond $ effectif de la nuit : env si valide (> 0, fini), sinon DEFAULT_NIGHT_BUDGET_USD.
 * Source UNIQUE pour tous les runners (nocturnal, train-loop, run-tonight, run-mango-nuit…). */
export function globalBudgetCapUsd(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.NOCTURNAL_GLOBAL_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NIGHT_BUDGET_USD;
}

/** Plafond $ fini d'un runner à budget propre (FINISH_BUDGET_USD, GRAND_CHANTIER_BUDGET_USD) :
 * valeur env si > 0, sinon plafond par défaut FINI. Un `0` n'est plus « illimité ». */
export function finiteBudgetUsd(raw: string | undefined, fallback: number = DEFAULT_NIGHT_BUDGET_USD): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Cumul de dépense $ pour LA fenêtre (nuit) courante. */
export interface GlobalBudgetState {
  date: string; // YYYY-MM-DD — fenêtre courante
  spentUsd: number; // cumul dépensé pendant cette fenêtre
}

export interface BudgetStopDecision {
  stop: boolean;
  /** Raison lisible (loguée + persistée) quand stop=true. */
  reason?: string;
  spentUsd: number;
  capUsd: number;
}

/** Date locale YYYY-MM-DD — même format que localDate() (nocturnal.ts). PUR (now injectable). */
export function localDateStr(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const emptyState = (date: string): GlobalBudgetState => ({ date, spentUsd: 0 });

/** Remet le compteur à zéro si la fenêtre (date) a changé depuis le dernier
 * enregistrement — une nouvelle nuit repart de $0. PUR. */
export function rolledState(raw: GlobalBudgetState | null, today: string): GlobalBudgetState {
  if (!raw || raw.date !== today) return emptyState(today);
  return raw;
}

/**
 * Décide si un run doit s'arrêter, FAUTE DE BUDGET $, AVANT le prochain
 * projet/itération — jamais en cours de génération (même discipline que le
 * kill-switch réel et decideBreakerStop). PUR sur ses deps :
 * - gate OFF                → jamais (et `readState` n'est PAS appelé → 0 I/O)
 * - capUsd <= 0 (0/absent)  → illimité (comportement historique)
 * - cumul < cap             → continue
 * - cumul >= cap            → ARRÊT propre, raison lisible (persistable).
 */
export function decideBudgetStop(
  gateOn: boolean,
  capUsd: number,
  today: string,
  readState: () => GlobalBudgetState | null,
): BudgetStopDecision {
  if (!gateOn) return { stop: false, spentUsd: 0, capUsd };
  if (!(capUsd > 0)) return { stop: false, spentUsd: 0, capUsd };
  const state = rolledState(readState(), today);
  if (state.spentUsd >= capUsd) {
    return {
      stop: true,
      reason: `Budget-$ global nocturne dépassé : dépensé $${state.spentUsd.toFixed(2)} ≥ plafond $${capUsd.toFixed(2)} (fenêtre ${today})`,
      spentUsd: state.spentUsd,
      capUsd,
    };
  }
  return { stop: false, spentUsd: state.spentUsd, capUsd };
}

/** Comptabilise une dépense réelle (coût agent d'un projet/phase terminé),
 * IMMUTABLE (renvoie un NOUVEL état, ne mute jamais `raw`). N'a de sens
 * qu'appelée à la FRONTIÈRE d'itération, une fois le coût réel connu. PUR. */
export function recordSpend(raw: GlobalBudgetState | null, today: string, costUsd: number): GlobalBudgetState {
  const state = rolledState(raw, today);
  const add = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  return { date: state.date, spentUsd: state.spentUsd + add };
}

// ── I/O — ledger persisté (fichier partagé entre process) ───────────────────

/** Lecture fail-open du ledger partagé. `file` injectable pour les tests.
 * absent/illisible/invalide → null (traité comme "aucune dépense connue"). */
export function readGlobalBudgetState(file: string = GLOBAL_BUDGET_FILE): GlobalBudgetState | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<GlobalBudgetState>;
    if (typeof raw.date !== "string" || typeof raw.spentUsd !== "number" || !Number.isFinite(raw.spentUsd)) return null;
    return { date: raw.date, spentUsd: raw.spentUsd };
  } catch {
    return null;
  }
}

/** Écriture atomique (tmp+rename) du ledger partagé. Best-effort : la
 * persistance du budget ne doit jamais casser un run nocturne. */
export function writeGlobalBudgetState(state: GlobalBudgetState, file: string = GLOBAL_BUDGET_FILE): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    atomicWriteFileSync(file, JSON.stringify(state, null, 2));
  } catch {
    /* best effort */
  }
}

/** Comptabilise + persiste une dépense réelle sur le ledger PARTAGÉ (I/O
 * réelle, read-modify-write). Petite fenêtre de course possible si deux
 * process écrivent au même instant — improbable en pratique (un seul run
 * nocturne à la fois), même hypothèse que les autres fichiers d'état de ce
 * module (nocturnal-stop.json, breaker-verdict.json). Best-effort : n'importe
 * quelle panne d'I/O ici ne casse jamais le run appelant. */
export function spendGlobalBudget(costUsd: number, file: string = GLOBAL_BUDGET_FILE, now: Date = new Date()): GlobalBudgetState {
  const today = localDateStr(now);
  const next = recordSpend(readGlobalBudgetState(file), today, costUsd);
  writeGlobalBudgetState(next, file);
  return next;
}

/**
 * Garde-fou « prêt à l'emploi » pour les scripts de génération (run-6-souv-d,
 * run-3-complex-apps, run-souv-d-polish…) : à appeler à la FRONTIÈRE d'itération,
 * avant chaque projet. Pourquoi ici : l'audit dormant (2026-09-30) a relevé que
 * ces scripts n'importaient pas ce module du tout — le plafond nocturne ne les
 * voyait pas. Gate + plafond fini lus au même endroit que les autres runners.
 */
export function nightBudgetGate(): BudgetStopDecision {
  return decideBudgetStop(flag("NOCTURNAL_BUDGET_HARD"), globalBudgetCapUsd(), localDateStr(), () => readGlobalBudgetState());
}

/** Comptabilise le coût d'un projet terminé sur le ledger partagé (no-op si le gate est désarmé). */
export function nightBudgetSpend(costUsd: number): void {
  if (flag("NOCTURNAL_BUDGET_HARD")) spendGlobalBudget(costUsd);
}
