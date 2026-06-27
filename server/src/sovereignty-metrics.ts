// #164 « Le Stratège » Phase 4 — MÉTRIQUE DE SOUVERAINETÉ.
//
// L'objectif de fond de Raf : que Mango dépende de MOINS EN MOINS de Claude. La preuve
// chiffrée = le **taux d'escalade Claude** (`resolvedBy === "maitre"`) qui BAISSE projet
// après projet. On ne réinvente aucun store : tout est déjà dans `.metrics.jsonl` (un
// `TurnMetrics` par tour, avec `project` + `resolvedBy` + `ts`). Ce module ne fait que
// CALCULER (fonctions PURES sur les lignes lues) — aucune I/O, ne lève jamais.
//
// « Escalade Claude » = un tour dont `resolvedBy === "maitre"` (le Maître a dû finir).
// `eleve` = résolu souverainement ; `none` = échec (compté au dénominateur mais pas
// comme escalade Claude). On n'inclut QUE les tours où `resolvedBy` est défini (les
// tours en mode Élève) — les lignes Claude-pur héritées n'ont pas ce champ.

import type { TurnMetrics } from "./metrics.js";

type Resolved = NonNullable<TurnMetrics["resolvedBy"]>;

export interface SovereigntyByProject {
  project: string;
  turns: number;
  eleve: number;
  maitre: number;
  none: number;
  claudeRate: number; // maitre / turns, 0..1
  lastTs: string;
}

export interface SovereigntyTrend {
  recentRate: number; // taux Claude des N projets les + récents
  previousRate: number; // taux Claude des N projets précédents
  improving: boolean; // recent < previous → on devient PLUS souverain
  sampleSufficient: boolean; // assez de projets pour conclure honnêtement ?
}

export interface SovereigntyReport {
  totalTurns: number; // tours avec resolvedBy défini
  eleve: number;
  maitre: number;
  none: number;
  claudeRate: number; // global
  sovereignRate: number; // eleve / total
  byProject: SovereigntyByProject[]; // du + récent au + ancien
  trend: SovereigntyTrend;
}

/** Garde les tours « mode Élève » (ceux qui portent un `resolvedBy`). */
function eleveTurns(metrics: TurnMetrics[]): (TurnMetrics & { resolvedBy: Resolved })[] {
  return metrics.filter((m): m is TurnMetrics & { resolvedBy: Resolved } =>
    m.resolvedBy === "eleve" || m.resolvedBy === "maitre" || m.resolvedBy === "none");
}

function rate(maitre: number, turns: number): number {
  return turns > 0 ? maitre / turns : 0;
}

/** Agrégat par projet, trié du PLUS RÉCENT (dernier `ts`) au plus ancien. */
export function sovereigntyByProject(metrics: TurnMetrics[]): SovereigntyByProject[] {
  const by = new Map<string, SovereigntyByProject>();
  for (const m of eleveTurns(metrics)) {
    const key = m.project || "(inconnu)";
    let agg = by.get(key);
    if (!agg) {
      agg = { project: key, turns: 0, eleve: 0, maitre: 0, none: 0, claudeRate: 0, lastTs: "" };
      by.set(key, agg);
    }
    agg.turns++;
    agg[m.resolvedBy]++;
    if (m.ts > agg.lastTs) agg.lastTs = m.ts;
  }
  const out = [...by.values()];
  for (const a of out) a.claudeRate = rate(a.maitre, a.turns);
  // tri antéchronologique (ISO ts comparable lexicographiquement)
  out.sort((a, b) => (a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0));
  return out;
}

/** Agrégat par TYPE de projet, trié du PLUS RÉCENT (dernier `ts`) au plus ancien. */
export function sovereigntyByType(metrics: TurnMetrics[]): SovereigntyByProject[] {
  const by = new Map<string, SovereigntyByProject>();
  for (const m of eleveTurns(metrics)) {
    const key = m.projectType || "(inconnu)";
    let agg = by.get(key);
    if (!agg) {
      agg = { project: key, turns: 0, eleve: 0, maitre: 0, none: 0, claudeRate: 0, lastTs: "" };
      by.set(key, agg);
    }
    agg.turns++;
    agg[m.resolvedBy]++;
    if (m.ts > agg.lastTs) agg.lastTs = m.ts;
  }
  const out = [...by.values()];
  for (const a of out) a.claudeRate = rate(a.maitre, a.turns);
  // tri antéchronologique (ISO ts comparable lexicographiquement)
  out.sort((a, b) => (a.lastTs < b.lastTs ? 1 : a.lastTs > b.lastTs ? -1 : 0));
  return out;
}

/**
 * Tendance : compare le taux Claude des `window` projets les + récents à celui des
 * `window` précédents. `improving` = on escalade MOINS vers Claude récemment (souverain).
 * Honnête : `sampleSufficient=false` si on n'a pas 2 fenêtres pleines (ne pas sur-conclure).
 */
export function sovereigntyTrend(metrics: TurnMetrics[], window = 5): SovereigntyTrend {
  const projects = sovereigntyByProject(metrics); // récent → ancien
  const recent = projects.slice(0, window);
  const previous = projects.slice(window, window * 2);
  const agg = (ps: SovereigntyByProject[]) => {
    const turns = ps.reduce((s, p) => s + p.turns, 0);
    const maitre = ps.reduce((s, p) => s + p.maitre, 0);
    return rate(maitre, turns);
  };
  const recentRate = agg(recent);
  const previousRate = agg(previous);
  const sampleSufficient = recent.length >= window && previous.length >= window;
  return { recentRate, previousRate, improving: recentRate < previousRate, sampleSufficient };
}

/** Rapport complet (global + par projet + tendance). PUR. */
export function sovereigntyReport(metrics: TurnMetrics[], window = 5): SovereigntyReport {
  const turns = eleveTurns(metrics);
  const total = turns.length;
  const maitre = turns.filter((m) => m.resolvedBy === "maitre").length;
  const eleve = turns.filter((m) => m.resolvedBy === "eleve").length;
  const none = turns.filter((m) => m.resolvedBy === "none").length;
  return {
    totalTurns: total,
    eleve,
    maitre,
    none,
    claudeRate: rate(maitre, total),
    sovereignRate: total > 0 ? eleve / total : 0,
    byProject: sovereigntyByProject(metrics),
    trend: sovereigntyTrend(metrics, window),
  };
}

/**
 * Les `n` projets au plus fort `claudeRate` (ordre DÉCROISSANT). PUR : ne mute pas
 * `report.byProject` (copie avant de trier). `n <= 0` → tableau vide.
 */
export function topClaudeProjects(report: SovereigntyReport, n: number): SovereigntyByProject[] {
  if (n <= 0) return [];
  return [...report.byProject]
    .sort((a, b) => b.claudeRate - a.claudeRate)
    .slice(0, n);
}

/**
 * Part de tours escaladés vers Claude (le Maître) parmi tous les tours mesurés.
 * Identique à `report.claudeRate` mais exposée comme fonction PURE isolée pour
 * les consommateurs qui n'ont besoin que de ce seul chiffre. Renvoie 0 si
 * `totalTurns` vaut 0 (aucun tour Élève mesuré). PUR : ne lève jamais.
 */
export function sovereigntyClaudeShare(report: SovereigntyReport): number {
  return report.totalTurns > 0 ? report.maitre / report.totalTurns : 0;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Ligne lisible pour le log / l'observabilité. */
export function formatSovereignty(rep: SovereigntyReport): string {
  if (rep.totalTurns === 0) return "🏴 Souveraineté : aucun tour Élève mesuré pour l'instant.";
  const trend = !rep.trend.sampleSufficient
    ? "tendance : échantillon insuffisant"
    : rep.trend.improving
      ? `tendance : escalade Claude EN BAISSE (${pct(rep.trend.previousRate)} → ${pct(rep.trend.recentRate)}) ✅`
      : `tendance : escalade Claude en hausse (${pct(rep.trend.previousRate)} → ${pct(rep.trend.recentRate)})`;
  return `🏴 Souveraineté : ${pct(rep.sovereignRate)} Élève · escalade Claude ${pct(rep.claudeRate)} (${rep.maitre}/${rep.totalTurns}) · ${trend}`;
}
