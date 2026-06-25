// Œil-Coach (#152) — critique design MULTI-LENTILLES + boucle « critique → corrige → re-regarde ».
//
// Le saut UI/UX : un œil qui ne se contente pas de NOTER (juge-pixels #66) mais qui PILOTE
// l'itération. Sur le projet ouvert : rend l'écran → le critique sur plusieurs lentilles
// (hiérarchie, espacement, typo, couleur, alignement, densité, cohérence) en croisant le GOÛT
// appris + des MESURES objectives (contraste WCAG) → produit des correctifs CONCRETS → fait
// GLM les appliquer ($0) → re-regarde — en boucle bornée jusqu'à un seuil de qualité.
//
// Toutes les deps lourdes (aperçu, capture, cerveau vision, boucle d'édition) sont injectables
// → la logique (parsing, priorisation, boucle) est testable sans réseau ni navigateur.

import fs from "node:fs";
import path from "node:path";
import { startPreview as realStart, stopPreview as realStop } from "./preview.js";
import { capturePreview as realCapture } from "./vision.js";
import { dispatch as realDispatch } from "./brain-dispatch.js";
import { runRelay } from "./eleve.js";
import { assembleSystemPrompt } from "./scenario.js";
import { findTokensFile, walkStyleFiles } from "./taste-render.js";
import { measureDesign, measureSummary, type DesignMeasure } from "./design-metrics.js";
import type { JudgeContext } from "./taste-judge.js";

// Les 7 lentilles de la critique (le contraste/a11y est traité objectivement et injecté).
export const LENSES = [
  "hiérarchie",
  "espacement & rythme",
  "échelle typographique",
  "harmonie chromatique",
  "alignement",
  "densité & respiration",
  "cohérence",
] as const;

export interface Lens { name: string; score: number; issue: string; fix: string }
export interface DesignCritique {
  overall: number; // 0-100
  lenses: Lens[];
  measure?: DesignMeasure; // verdict objectif (contraste WCAG, hors-palette)
  raw?: string; // sortie brute du cerveau (diagnostic)
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de critique
// ─────────────────────────────────────────────────────────────────────────────

export function critiqueSystem(ctx: JudgeContext, measureText: string): string {
  const parts = [
    "Tu es l'ŒIL-COACH de Mango — un directeur artistique exigeant qui regarde le RENDU réel d'une interface et le critique pour le faire progresser.",
    ctx.tasteAxioms.trim() ? `GOÛT APPRIS DE RAF (priorité haute — épouse-le) :\n${ctx.tasteAxioms.trim()}` : "",
    ctx.designSystem.trim() ? `DESIGN SYSTEM du projet (cohérence) :\n${ctx.designSystem.trim()}` : "",
    measureText.trim() ? `MESURES OBJECTIVES déjà calculées (tiens-en compte, ne les contredis pas) :\n${measureText.trim()}` : "",
    `Note CHACUNE de ces ${LENSES.length} lentilles de 0 à 100, et pour chacune donne l'écart le PLUS important + un correctif CONCRET et ACTIONNABLE (quoi changer précisément : valeur, élément, propriété). Pas de généralités.`,
    `Lentilles : ${LENSES.join(", ")}.`,
    "Sois EXIGEANT : une interface correcte mais générique mérite 60-70, pas 90. Réserve 85+ à ce qui est vraiment soigné et distinctif.",
    "Format de sortie STRICT, une ligne par lentille puis le global, RIEN d'autre :",
    "LENTILLE: <nom> | <0-100> | <écart le plus important> → <correctif concret>",
    "(… une ligne par lentille …)",
    "GLOBAL: <0-100>",
  ];
  return parts.filter(Boolean).join("\n\n");
}

const CRITIQUE_USER = "Voici une capture du RENDU actuel de l'interface. Critique-la lentille par lentille selon le format imposé.";

// ─────────────────────────────────────────────────────────────────────────────
// Parsing (pur, robuste — calqué sur parseJudgeScore)
// ─────────────────────────────────────────────────────────────────────────────

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Parse la sortie du cerveau en critique structurée. Tolère prose/fences autour. */
export function parseCritique(text: string): DesignCritique {
  const lenses: Lens[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/LENTILLE\s*:?\s*([^|]+)\|\s*(\d{1,3})\s*\|\s*(.+)$/i);
    if (!m) continue;
    const name = m[1].trim();
    const score = clampScore(parseInt(m[2], 10));
    const rest = m[3].trim();
    const arrow = rest.split(/→|->/);
    const issue = (arrow[0] ?? rest).trim();
    const fix = (arrow[1] ?? "").trim();
    lenses.push({ name, score, issue, fix });
  }
  const globalM = text.match(/GLOBAL\s*:?\s*(\d{1,3})/i);
  let overall: number;
  if (globalM) overall = clampScore(parseInt(globalM[1], 10));
  else if (lenses.length) overall = clampScore(lenses.reduce((s, l) => s + l.score, 0) / lenses.length);
  else {
    // Repli ultime : premier entier 0-100 plausible, sinon 50.
    const any = text.match(/\b(\d{1,3})\b/);
    overall = any ? clampScore(parseInt(any[1], 10)) : 50;
  }
  return { overall, lenses, raw: text };
}

/** Les correctifs à donner à l'agent : lentilles les plus basses d'abord, sous le seuil. */
export function prioritizedFixes(critique: DesignCritique, threshold: number, max = 4): string[] {
  return critique.lenses
    .filter((l) => l.score < threshold && l.fix)
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .map((l) => `• [${l.name} ${l.score}/100] ${l.issue}${l.fix ? ` → ${l.fix}` : ""}`);
}

function coachPrompt(fixes: string[]): string {
  return [
    "Passe de RAFFINEMENT VISUEL pilotée par l'œil-coach. Le rendu actuel de l'app a été critiqué ; voici les écarts les PLUS importants à corriger MAINTENANT :",
    "",
    ...fixes,
    "",
    "Corrige PRÉCISÉMENT ces points (et seulement eux), sans ajouter de fonctionnalité ni casser le build. Après tes corrections, vérifie ton rendu (vois_ecran si dispo) : l'écran doit être visiblement plus net — hiérarchie, espacement, couleur, alignement, cohérence. Va jusqu'au bout (finish) quand c'est appliqué et que le build passe.",
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Critique d'un écran (rend + mesure + cerveau vision)
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachDeps {
  startPreview: (dir: string) => Promise<{ url: string }>;
  stopPreview: (dir?: string) => Promise<void>;
  capture: (url: string) => Promise<Buffer>;
  readCss: (dir: string) => string[];
  dispatch: (agentId: "vision", system: string, user: string, opts: { imageBase64: string; trustExternal?: boolean; freeform?: boolean }) => Promise<{ status: string; summary?: string }>;
  applyFixes: (prompt: string, dir: string, onLog: (line: string) => void) => Promise<{ success: boolean }>;
}

function readProjectCss(dir: string): string[] {
  const tokensFile = findTokensFile(dir);
  const styleFiles = walkStyleFiles(path.join(dir, "src"), tokensFile ?? "");
  const all = tokensFile ? [tokensFile, ...styleFiles] : styleFiles;
  const out: string[] = [];
  let total = 0;
  for (const f of all) {
    if (!/\.css$/i.test(f)) continue; // pairs de contraste fiables dans le CSS
    try {
      const c = fs.readFileSync(f, "utf8");
      total += c.length;
      if (total > 200_000) break;
      out.push(c);
    } catch { /* skip */ }
  }
  return out;
}

export const realCoachDeps: CoachDeps = {
  startPreview: (dir) => realStart(dir),
  stopPreview: (dir) => realStop(dir).catch(() => {}),
  capture: (url) => realCapture(url),
  readCss: readProjectCss,
  dispatch: (agentId, system, user, opts) => realDispatch(agentId, system, user, opts),
  applyFixes: async (prompt, dir, onLog) => {
    const systemFull = assembleSystemPrompt({ mode: "esthetique", model: "eleve", projectDir: dir });
    const r = await runRelay(prompt, dir, { systemFull, onLog });
    return { success: r.success };
  },
};

/** Rend l'écran, mesure l'objectif, fait critiquer par l'œil → critique structurée. */
export async function critiqueScreen(projectDir: string, ctx: JudgeContext, deps: CoachDeps = realCoachDeps): Promise<DesignCritique> {
  const { url } = await deps.startPreview(projectDir);
  const buf = await deps.capture(url);
  const measure = measureDesign(deps.readCss(projectDir));
  const res = await deps.dispatch("vision", critiqueSystem(ctx, measureSummary(measure)), CRITIQUE_USER, {
    imageBase64: buf.toString("base64"),
    trustExternal: true,
    freeform: true,
  });
  const critique = parseCritique(res.summary ?? "");
  critique.measure = measure;
  return critique;
}

// ─────────────────────────────────────────────────────────────────────────────
// La boucle coach
// ─────────────────────────────────────────────────────────────────────────────

export type CoachEvent =
  | { type: "status"; text: string }
  | { type: "critique"; round: number; critique: DesignCritique }
  | { type: "fixes"; round: number; fixes: string[] };

export interface CoachOptions { threshold?: number; maxRounds?: number }
export interface CoachResult {
  before: DesignCritique;
  after: DesignCritique;
  rounds: number;
  history: DesignCritique[];
  reason: "seuil-atteint" | "plafond-tours" | "aucun-correctif" | "pas-de-progrès";
}

/**
 * Boucle « critique → corrige → re-regarde » jusqu'au seuil (défaut 85) ou au plafond de
 * tours (défaut 3). Anti-thrash : s'arrête si un tour ne fait pas progresser le score.
 */
export async function runDesignCoach(
  projectDir: string,
  opts: CoachOptions,
  ctx: JudgeContext,
  onProgress: (ev: CoachEvent) => void = () => {},
  deps: CoachDeps = realCoachDeps,
): Promise<CoachResult> {
  const threshold = opts.threshold ?? 85;
  const maxRounds = opts.maxRounds ?? 3;

  onProgress({ type: "status", text: "👁 L'œil-coach regarde le rendu actuel…" });
  const before = await critiqueScreen(projectDir, ctx, deps);
  onProgress({ type: "critique", round: 0, critique: before });

  const history: DesignCritique[] = [before];
  let current = before;
  let round = 0;
  let reason: CoachResult["reason"] = "seuil-atteint";

  try {
    while (current.overall < threshold && round < maxRounds) {
      const fixes = prioritizedFixes(current, threshold);
      if (!fixes.length) { reason = "aucun-correctif"; break; }
      round++;
      onProgress({ type: "fixes", round, fixes });
      onProgress({ type: "status", text: `🛠 Tour ${round} — GLM applique ${fixes.length} correctif(s)…` });
      await deps.applyFixes(coachPrompt(fixes), projectDir, (line) => onProgress({ type: "status", text: line }));

      onProgress({ type: "status", text: `👁 L'œil-coach re-regarde (tour ${round})…` });
      const next = await critiqueScreen(projectDir, ctx, deps);
      onProgress({ type: "critique", round, critique: next });
      history.push(next);

      if (next.overall <= current.overall) { current = next; reason = "pas-de-progrès"; break; }
      current = next;
      if (current.overall >= threshold) { reason = "seuil-atteint"; break; }
      if (round >= maxRounds) { reason = "plafond-tours"; break; }
    }
    if (current.overall >= threshold) reason = "seuil-atteint";
    else if (round >= maxRounds && reason !== "pas-de-progrès" && reason !== "aucun-correctif") reason = "plafond-tours";
  } finally {
    await deps.stopPreview(projectDir);
  }

  return { before, after: current, rounds: round, history, reason };
}
