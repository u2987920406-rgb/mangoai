// design-loop.ts (#196, 2026-07-23) — Loop Design v1.
//
// UNE SEULE loop câblée en dur (pas de framework générique à 6 rôles configurables —
// décision prise avec Raf après une discussion sur les "Loops" façon Anthropic/Elliott
// Pierret : ne pas généraliser avant d'avoir prouvé qu'UNE loop marche vraiment).
// Tourne après un build Construire réussi, SI le projet l'a activée (opt-in, même
// patron que multi-project.ts). Toujours OUVERTE : ne clôture jamais rien seule,
// s'arrête et attend Raf.
//
// Réutilise au maximum ce qui existe déjà — chaque rôle de la loop a un équivalent
// réel dans MangoOS, sauf le compteur de cycle et la condition d'arrêt :
//   Planificateur (audit)      → measureProjectDesign/measureSummary (design-metrics.ts,
//                                 DÉTERMINISTE, pas de LLM — même moteur que l'outil verifie_design)
//   Builder (correction)       → runAgent avec un systemPromptOverride scopé (#193, section Code)
//   Vérificateur (avant/après) → comparePair (taste-compare.ts) — jugement RELATIF par
//                                 paires, pas une note absolue. Leçon apprise le
//                                 2026-07-07 (Loop Engineering) : un juge absolu (taste-judge.ts)
//                                 s'est révélé non-discriminant (6 apps toutes à 92-94/100).
//   Mémoire                    → appendBacklog (.backlog.jsonl, patron déjà établi)
//   Gestionnaire                → compteur de cycle local (pas de fichier d'état en v1 —
//                                 le run vit le temps de la requête HTTP)
//   Contrôleur                 → shouldContinueLoop (pur, ci-dessous)
import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { atomicWriteFileSync } from "./safe-io.js";
import { projectDir, WORKSPACE_DIR } from "./projects.js";
import { measureProjectDesign, measureSummary } from "./design/design-metrics.js";
import { scanFiles, readSafe } from "./eleve-tools/eleve-design-tools.js";
import { runAgent } from "./agent/agent.js";
import { capturePreview } from "./vision.js";
import { comparePair, type PairOutcome } from "./taste/taste-compare.js";
import { buildJudgeContext } from "./taste/taste-judge.js";
import { appendBacklog } from "./project-backlog.js";

const FLAG_FILE = ".loop-design.json";

export function isLoopDesignEnabled(dir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(dir, FLAG_FILE), "utf8");
    return Boolean((JSON.parse(raw) as { enabled?: boolean }).enabled);
  } catch {
    return false;
  }
}

export function setLoopDesignEnabled(dir: string, enabled: boolean): void {
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteFileSync(path.join(dir, FLAG_FILE), JSON.stringify({ enabled }, null, 2));
}

export interface LoopStopInput {
  cycle: number;
  maxCycles: number;
  hasIssues: boolean;
  /** null au 1er cycle (pas encore de comparaison avant/après). */
  verdict: PairOutcome | null;
  costUsd: number;
  maxCostUsd: number;
}

export interface LoopStopDecision {
  continue: boolean;
  reason: string;
}

/** Le Contrôleur : décide si la loop continue. PUR, testable seule, ne lève jamais. */
export function shouldContinueLoop(input: LoopStopInput): LoopStopDecision {
  if (!input.hasIssues) return { continue: false, reason: "aucun écart de design détecté" };
  if (input.cycle >= input.maxCycles) return { continue: false, reason: `plafond de ${input.maxCycles} cycle(s) atteint` };
  if (input.costUsd >= input.maxCostUsd) {
    return { continue: false, reason: `garde-coût atteint ($${input.costUsd.toFixed(2)} ≥ $${input.maxCostUsd.toFixed(2)})` };
  }
  if (input.verdict === "instable") return { continue: false, reason: "vérificateur instable (biais d'ordre détecté) — pas de verdict fiable" };
  if (input.verdict === "A" || input.verdict === "tie") return { continue: false, reason: "pas d'amélioration constatée (convergence)" };
  // verdict === "B" (la nouvelle version bat l'ancienne) ou null (1er cycle, rien à comparer encore) → continue
  return { continue: true, reason: input.verdict === null ? "premier cycle" : "amélioration constatée, écarts restants" };
}

/** Audit déterministe (aucun LLM) — même moteur que l'outil verifie_design. Renvoie
 *  null si rien à vérifier ou si aucun écart. PUR côté mesure, I/O borné en lecture. */
function auditDesign(dir: string): string | null {
  const { css, components } = scanFiles(dir);
  if (css.length === 0 && components.length === 0) return null;
  const measure = measureProjectDesign({
    cssFiles: css.map(readSafe).filter(Boolean),
    componentFiles: components.map(readSafe).filter(Boolean),
    indexHtml: readSafe(path.join(dir, "index.html")),
    packageJson: readSafe(path.join(dir, "package.json")),
  });
  const summary = measureSummary(measure);
  return summary || null;
}

const BUILDER_SYSTEM_OVERRIDE =
  "Tu es un correcteur de design ciblé pour MangoOS (Loop Design, cycle automatique après un build réussi). " +
  "Corrige PRÉCISÉMENT les écarts de design signalés — pas de nouvelle fonctionnalité, pas de refonte, pas de scope creep. " +
  "Utilise tes outils de lecture/écriture directement, sans demander confirmation. " +
  "Termine par un résumé court (2-3 lignes) de ce que tu as changé.";

export interface RunLoopOptions {
  /** Même forme que le send() SSE de chat-route.ts — les statuts de la loop
   *  s'affichent dans le MÊME flux, à la suite du tour principal. */
  send: (event: { type: string; [key: string]: unknown }) => void;
  maxCycles?: number;
  maxCostUsd?: number;
}

/**
 * L'orchestrateur. Ne lève jamais : un échec de n'importe quelle étape arrête
 * proprement LA LOOP (jamais le tour principal, déjà terminé à ce stade — la
 * loop tourne juste avant la fermeture du flux SSE).
 */
export async function runDesignLoop(
  dir: string,
  previewUrl: string,
  projectType: string | undefined,
  opts: RunLoopOptions,
): Promise<void> {
  const { send } = opts;
  const maxCycles = opts.maxCycles ?? 3;
  const maxCostUsd = opts.maxCostUsd ?? 0.3;
  let cycle = 0;
  let totalCost = 0;
  let verdict: PairOutcome | null = null;
  let prevShot: Buffer;

  try {
    prevShot = await capturePreview(previewUrl);
  } catch (e) {
    send({ type: "status", text: `🔁 Loop Design : capture d'écran indisponible (${(e as Error).message}) — abandon.` });
    return;
  }

  for (;;) {
    const issues = auditDesign(dir);
    const decision = shouldContinueLoop({
      cycle, maxCycles, hasIssues: Boolean(issues), verdict, costUsd: totalCost, maxCostUsd,
    });
    if (!decision.continue) {
      send({ type: "status", text: `🔁 Loop Design : arrêtée après ${cycle} cycle(s) — ${decision.reason}.` });
      appendBacklog(dir, { actor: "Loop Design", action: "arrêt", detail: decision.reason });
      return;
    }
    cycle++;
    send({ type: "status", text: `🔁 Loop Design : cycle ${cycle}/${maxCycles} — ${issues}` });

    let fixCost = 0;
    try {
      const userPrompt = `Écarts de design détectés (mesure déterministe) :\n\n${issues}\n\nCorrige-les.`;
      for await (const event of runAgent(userPrompt, dir, undefined, "sonnet", "elite", null, false, undefined, BUILDER_SYSTEM_OVERRIDE)) {
        if (event.type === "tool") send({ type: "tool", name: event.name, detail: event.detail });
        if (event.type === "result") fixCost = event.costUsd;
      }
    } catch (e) {
      send({ type: "status", text: `🔁 Loop Design : correction échouée (${(e as Error).message}) — arrêt.` });
      appendBacklog(dir, { actor: "Loop Design", action: `cycle ${cycle}`, detail: "correction échouée", ok: false });
      return;
    }
    totalCost += fixCost;

    let newShot: Buffer;
    try {
      newShot = await capturePreview(previewUrl);
    } catch (e) {
      send({ type: "status", text: `🔁 Loop Design : capture d'écran indisponible après correction (${(e as Error).message}) — arrêt.` });
      appendBacklog(dir, { actor: "Loop Design", action: `cycle ${cycle}`, detail: "capture après correction échouée", ok: false });
      return;
    }

    const ctx = buildJudgeContext(WORKSPACE_DIR, projectType);
    const cmp = await comparePair(prevShot, newShot, ctx);
    verdict = cmp.verdict;
    appendBacklog(dir, {
      actor: "Loop Design",
      action: `cycle ${cycle}`,
      detail: `vérificateur: ${cmp.verdict} (${cmp.reason}) — coût $${fixCost.toFixed(4)}`,
      ok: cmp.verdict === "B",
    });
    send({ type: "status", text: `🔁 Loop Design : cycle ${cycle} — vérificateur dit "${cmp.verdict}" (${cmp.reason})` });
    prevShot = newShot;
  }
}

export function registerLoopDesignRoutes(app: Express): void {
  app.get("/api/loop-design/status/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    res.json({ enabled: isLoopDesignEnabled(projectDir(name)) });
  });

  app.post("/api/loop-design/status/:name", (req: Request, res: Response) => {
    const name = req.params["name"] as string;
    const enabled = Boolean((req.body as { enabled?: unknown })?.enabled);
    setLoopDesignEnabled(projectDir(name), enabled);
    res.json({ ok: true, enabled });
  });
}
