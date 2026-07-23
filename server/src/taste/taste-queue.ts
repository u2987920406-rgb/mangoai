// Moteur de Goût (#149 v2) — FILE D'ATTENTE des runs de goût (curation asynchrone).
//
// La curation devient asynchrone : la nuit génère et pré-trie des variantes, Raf valide
// plus tard (depuis son téléphone). Ce module persiste chaque « run » (lot de K variantes
// notées) en attente de décision, jusqu'à ce que Raf choisisse. Les images JPEG vivent sur
// disque dans `.skins/<runId>/<id>.jpg` (generateTasteSkins ne restaure QUE les sources, pas
// les screenshots) ; ce fichier ne porte que l'index + les métadonnées.
//
// Pur-I/O, deps `fs`/`now` injectables → testable sans disque réel.

import fsDefault from "node:fs";
import path from "node:path";
import { atomicWriteFileSync, dataDir } from "../safe-io.js";
import { projectDir } from "../projects.js";
import type { SkinRender } from "./taste-render.js";

const DATA_DIR = dataDir();
const QUEUE_FILE = path.join(DATA_DIR, "taste-queue.json");

export type TasteRunStatus = "pending" | "decided" | "expired";

export interface TasteRun {
  id: string;
  project: string;
  maille: "skin" | "hero";
  createdAt: string; // ISO
  status: TasteRunStatus;
  skins: SkinRender[]; // notées + triées par le juge (recommended en tête)
  chosenId?: string;
  note?: string;
  decidedAt?: string;
}

/** Vue allégée pour la liste (la boîte de réception mobile n'a pas besoin de tout). */
export interface TasteRunSummary {
  id: string;
  project: string;
  maille: "skin" | "hero";
  createdAt: string;
  status: TasteRunStatus;
  count: number; // variantes rendues (ok)
  recommendedId?: string;
  recommendedName?: string;
  recommendedScore?: number;
}

export interface QueueDeps {
  readFileSync: (p: string, enc: "utf8") => string;
  writeFileSync: (p: string, data: string) => void;
  mkdirSync: (p: string, opts: { recursive: true }) => void;
  now: () => number;
}

const realDeps: QueueDeps = {
  readFileSync: (p, enc) => fsDefault.readFileSync(p, enc),
  writeFileSync: (p, data) => atomicWriteFileSync(p, data),
  mkdirSync: (p, opts) => { fsDefault.mkdirSync(p, opts); },
  now: () => Date.now(),
};

/** Dossier des screenshots d'un run (sous .skins/ du projet, scopé par runId). */
export function runSkinsDir(project: string, runId: string): string {
  return path.join(projectDir(project), ".skins", runId);
}

export function genRunId(now: () => number = Date.now): string {
  return now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function loadRuns(file: string = QUEUE_FILE, deps: QueueDeps = realDeps): TasteRun[] {
  try {
    const arr = JSON.parse(deps.readFileSync(file, "utf8")) as TasteRun[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveRuns(runs: TasteRun[], file: string = QUEUE_FILE, deps: QueueDeps = realDeps): void {
  deps.mkdirSync(path.dirname(file), { recursive: true });
  deps.writeFileSync(file, JSON.stringify(runs, null, 2));
}

/** Ajoute un run en tête (le plus récent d'abord). Renvoie le run enregistré. */
export function enqueueRun(run: TasteRun, file: string = QUEUE_FILE, deps: QueueDeps = realDeps): TasteRun {
  const runs = loadRuns(file, deps);
  runs.unshift(run);
  saveRuns(runs, file, deps);
  return run;
}

export function getRun(id: string, file: string = QUEUE_FILE, deps: QueueDeps = realDeps): TasteRun | undefined {
  return loadRuns(file, deps).find((r) => r.id === id);
}

function okSkins(r: TasteRun): SkinRender[] {
  return r.skins.filter((s) => s.ok !== false);
}

function summarize(r: TasteRun): TasteRunSummary {
  const oks = okSkins(r);
  const top = oks.find((s) => s.recommended) ?? oks[0];
  return {
    id: r.id,
    project: r.project,
    maille: r.maille,
    createdAt: r.createdAt,
    status: r.status,
    count: oks.length,
    recommendedId: top?.id,
    recommendedName: top?.name,
    recommendedScore: top?.score,
  };
}

/** Runs en attente, plus récents d'abord, en vue allégée. */
export function listPending(file: string = QUEUE_FILE, deps: QueueDeps = realDeps): TasteRunSummary[] {
  return loadRuns(file, deps)
    .filter((r) => r.status === "pending")
    .map(summarize);
}

export interface DecideResult {
  ok: boolean;
  run?: TasteRun;
  reason?: "not-found" | "already-decided" | "unknown-skin";
}

/**
 * Matérialise la décision de Raf sur un run. Idempotent : un run déjà décidé n'est pas
 * re-décidé (renvoie ok:false reason:already-decided). Ne distille PAS l'axiome — la route
 * appelante le fait (via processFeedback) pour garder ce module pur-I/O.
 */
export function decideRun(
  id: string,
  chosenId: string,
  note: string | undefined,
  file: string = QUEUE_FILE,
  deps: QueueDeps = realDeps,
): DecideResult {
  const runs = loadRuns(file, deps);
  const run = runs.find((r) => r.id === id);
  if (!run) return { ok: false, reason: "not-found" };
  if (run.status === "decided") return { ok: false, run, reason: "already-decided" };
  if (!run.skins.some((s) => s.id === chosenId && s.ok !== false)) return { ok: false, run, reason: "unknown-skin" };
  run.status = "decided";
  run.chosenId = chosenId;
  run.note = note;
  run.decidedAt = new Date(deps.now()).toISOString();
  saveRuns(runs, file, deps);
  return { ok: true, run };
}

/** Purge les runs décidés/expirés plus vieux que maxAgeDays. Renvoie le nombre retiré. */
export function pruneOld(
  maxAgeDays = 7,
  file: string = QUEUE_FILE,
  deps: QueueDeps = realDeps,
): number {
  const runs = loadRuns(file, deps);
  const cutoff = deps.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const kept = runs.filter((r) => {
    if (r.status === "pending") return true; // un pending n'expire jamais tout seul
    const ref = Date.parse(r.decidedAt ?? r.createdAt);
    return Number.isNaN(ref) ? true : ref >= cutoff;
  });
  const removed = runs.length - kept.length;
  if (removed > 0) saveRuns(kept, file, deps);
  return removed;
}

export { QUEUE_FILE };
