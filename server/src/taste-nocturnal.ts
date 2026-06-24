// Moteur de Goût (#149 v2) — CURATION NOCTURNE : la nuit, pour quelques projets éligibles,
// génère K variantes, les fait pré-trier par l'œil (#66) et les met EN ATTENTE de la décision
// de Raf (taste-queue). Le matin, un push ntfy prévient ; Raf valide depuis son téléphone.
//
// Calqué sur le scheduler de `nocturnal.ts` (tick 15 min, 1×/jour à `hour`), mais OPT-IN
// (config.enabled défaut false) et indépendant du run de build nocturne. Toutes les deps
// lourdes (génération Vite, juge VL, push) sont injectables → testable sans réseau ni
// navigateur.

import fs from "node:fs";
import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import { listProjects, projectDir, WORKSPACE_DIR } from "./projects.js";
import { generateTasteSkins, findTokensFile, findHeroFile, type SkinRender } from "./taste-render.js";
import { judgeSkins, buildJudgeContext } from "./taste-judge.js";
import { enqueueRun, listPending, pruneOld, genRunId, runSkinsDir, type TasteRun } from "./taste-queue.js";
import { notifyNtfy } from "./notify.js";
import { lanBaseUrl } from "./net.js";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "taste-nocturnal-config.json");

export interface TasteNocturnalConfig {
  enabled: boolean;
  hour: number; // heure locale 0-23
  count: number; // projets traités par nuit
  maille: "skin" | "hero";
  k: number; // variantes par projet
  ntfyTopic: string; // push matinal (vide = désactivé)
  lastAutoRun?: string; // repère anti-double-run (date locale)
}

export const DEFAULT_TASTE_NOCTURNAL_CONFIG: TasteNocturnalConfig = {
  enabled: false, hour: 7, count: 3, maille: "hero", k: 3, ntfyTopic: "",
};

export function loadTasteNocturnalConfig(file = CONFIG_FILE): TasteNocturnalConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<TasteNocturnalConfig>;
    return { ...DEFAULT_TASTE_NOCTURNAL_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_TASTE_NOCTURNAL_CONFIG };
  }
}

export function saveTasteNocturnalConfig(cfg: TasteNocturnalConfig, file = CONFIG_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFileSync(file, JSON.stringify(cfg, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sélection des projets éligibles
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectDeps {
  listProjects: () => string[];
  dirOf: (project: string) => string;
  hasTokens: (dir: string) => boolean; // findTokensFile != null
  hasHero: (dir: string) => boolean; // findHeroFile != null
  mtime: (dir: string) => number; // date de dernière modif (tri)
}

const realSelectDeps: SelectDeps = {
  listProjects,
  dirOf: projectDir,
  hasTokens: (dir) => findTokensFile(dir) != null,
  hasHero: (dir) => findHeroFile(dir) != null,
  mtime: (dir) => { try { return fs.statSync(dir).mtimeMs; } catch { return 0; } },
};

/**
 * Projets aptes à une variation de goût : ont un fichier de tokens (et un hero si maille
 * "hero"), hors brouillons nocturnes `nuit-*`, triés du plus récemment modifié au plus
 * ancien, plafonnés à `limit`.
 */
export function selectEligibleProjects(limit: number, maille: "skin" | "hero", deps: SelectDeps = realSelectDeps): string[] {
  const cand = deps.listProjects()
    .filter((p) => !p.startsWith("nuit-"))
    .map((p) => ({ p, dir: deps.dirOf(p) }))
    .filter(({ dir }) => deps.hasTokens(dir) && (maille !== "hero" || deps.hasHero(dir)))
    .sort((a, b) => deps.mtime(b.dir) - deps.mtime(a.dir))
    .map(({ p }) => p);
  return cand.slice(0, Math.max(0, limit));
}

// ─────────────────────────────────────────────────────────────────────────────
// Génération d'un run de goût (mis en file d'attente)
// ─────────────────────────────────────────────────────────────────────────────

export interface EnqueueTasteDeps {
  generate: typeof generateTasteSkins;
  judge: typeof judgeSkins;
  buildCtx: typeof buildJudgeContext;
  enqueue: typeof enqueueRun;
  now: () => number;
}

const realEnqueueDeps: EnqueueTasteDeps = {
  generate: generateTasteSkins,
  judge: judgeSkins,
  buildCtx: buildJudgeContext,
  enqueue: enqueueRun,
  now: () => Date.now(),
};

/**
 * Génère K variantes pour un projet, les fait noter par l'œil, et met le run EN ATTENTE.
 * Renvoie le run (ou null si aucune variante exploitable). Non destructif (generateTasteSkins
 * restaure les sources). Ne lève pas (un projet en échec n'arrête pas le batch).
 */
export async function enqueueTasteRun(
  project: string,
  opts: { maille: "skin" | "hero"; k: number },
  deps: EnqueueTasteDeps = realEnqueueDeps,
): Promise<TasteRun | null> {
  const runId = genRunId(deps.now);
  const outDir = runSkinsDir(project, runId);
  let skins: SkinRender[];
  try {
    skins = await deps.generate(projectDir(project), { k: opts.k, maille: opts.maille, outDir }, () => {});
  } catch {
    return null;
  }
  if (!skins.some((s) => s.ok !== false)) return null;
  // L'œil note + trie (best-effort : un échec laisse les skins non notés).
  try {
    await deps.judge(outDir, skins, deps.buildCtx(WORKSPACE_DIR, project));
  } catch { /* non bloquant */ }
  const run: TasteRun = {
    id: runId,
    project,
    maille: opts.maille,
    createdAt: new Date(deps.now()).toISOString(),
    status: "pending",
    skins,
  };
  deps.enqueue(run);
  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch nocturne complet
// ─────────────────────────────────────────────────────────────────────────────

let running = false;
export function isTasteNocturnalRunning(): boolean { return running; }

export interface BatchDeps {
  select: (limit: number, maille: "skin" | "hero") => string[];
  enqueueRun: (project: string, opts: { maille: "skin" | "hero"; k: number }) => Promise<TasteRun | null>;
  notify: typeof notifyNtfy;
  pending: () => number; // nombre de runs en attente après le batch
  baseUrl: () => string; // URL LAN pour le lien de la notif
}

const realBatchDeps: BatchDeps = {
  select: (limit, maille) => selectEligibleProjects(limit, maille),
  enqueueRun: (project, opts) => enqueueTasteRun(project, opts),
  notify: notifyNtfy,
  pending: () => listPending().length,
  baseUrl: () => lanBaseUrl(Number(process.env.PORT) || 3000),
};

export interface BatchResult { generated: number; projects: string[]; notified: boolean; }

/**
 * Lance la curation de goût nocturne : sélectionne `cfg.count` projets, génère/juge/enfile un
 * run par projet (séquentiel — les aperçus Vite se disputeraient sinon), puis pousse une
 * notification si des runs sont en attente. Verrou anti-concurrence.
 */
export async function runNocturnalTasteBatch(
  cfg: TasteNocturnalConfig,
  deps: BatchDeps = realBatchDeps,
): Promise<BatchResult> {
  if (running) return { generated: 0, projects: [], notified: false };
  running = true;
  const done: string[] = [];
  try {
    const projects = deps.select(cfg.count, cfg.maille);
    for (const project of projects) {
      const run = await deps.enqueueRun(project, { maille: cfg.maille, k: cfg.k });
      if (run) done.push(project);
    }
  } finally {
    running = false;
  }
  let notified = false;
  const pending = deps.pending();
  if (done.length > 0 && pending > 0) {
    const res = await deps.notify(
      cfg.ntfyTopic,
      `${pending} variante${pending > 1 ? "s" : ""} de goût à valider`,
      `MangoOS a préparé ${done.length} projet${done.length > 1 ? "s" : ""} cette nuit. Ouvre pour valider.`,
      `${deps.baseUrl()}/taste/review`,
    );
    notified = res.sent;
  }
  return { generated: done.length, projects: done, notified };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler (calqué sur startNocturnalScheduler)
// ─────────────────────────────────────────────────────────────────────────────

function localDate(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tick unique du scheduler (exporté pour test). Renvoie true si un batch a été lancé. */
export async function tasteSchedulerTick(now = Date.now()): Promise<boolean> {
  const cfg = loadTasteNocturnalConfig();
  if (!cfg.enabled || running) return false;
  if (new Date(now).getHours() !== cfg.hour) return false;
  if (cfg.lastAutoRun === localDate(now)) return false;
  saveTasteNocturnalConfig({ ...cfg, lastAutoRun: localDate(now) });
  pruneOld();
  runNocturnalTasteBatch(cfg).catch((e) => console.error("[taste-nocturnal]", e instanceof Error ? e.message : e));
  return true;
}

export function startTasteNocturnalScheduler(): void {
  setInterval(() => { void tasteSchedulerTick(); }, 15 * 60 * 1000);
}

export { CONFIG_FILE, localDate };
