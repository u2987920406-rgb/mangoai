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
  scored: boolean; // (L28) le score est-il FIABLE (GLOBAL: ou moyenne de lentilles) ? sinon repli neutre, à NE PAS juger
  measure?: DesignMeasure; // verdict objectif (contraste WCAG, hors-palette)
  raw?: string; // sortie brute du cerveau (diagnostic)
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt de critique
// ─────────────────────────────────────────────────────────────────────────────

// (L34) Prompt VOLONTAIREMENT SIMPLE et COURT : un petit modèle vision (qwen3-vl:8b)
// répondait VIDE au prompt rigide multi-lentilles en pipes (7 lignes `LENTILLE: x | n | … → …`).
// On mène par la note globale (capturée même si le modèle s'arrête tôt), puis quelques
// remarques en langage naturel — que `parseCritique` lit en mode tolérant.
// (L34) Un petit modèle vision (qwen3-vl:8b) répond VIDE si le prompt système est trop long
// AVEC une image. Le goût appris (`tasteAxioms`) atteignait ~3100 car → prompt ~3800 car → vide.
// On PLAFONNE le contexte texte injecté dans le prompt vision (le modèle voit l'image, pas un roman).
// Défaut 0 : mesuré, le VL local 8b répond VIDE dès ~800+ car de prompt système avec image
// (703 car OK, 902 KO). Le goût appris complet (~3100 car) ne tient pas → on le DROPPE du prompt
// vision par défaut. Le rétablir (cap >0) suppose un VL plus grand (cloud/qwen3.5). Voir L34.
const MAX_AXIOMS_CHARS = Number(process.env.GATE_TASTE_AXIOMS_CHARS ?? 0);
const MAX_MEASURE_CHARS = 400;
function cap(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + " …";
}

export function critiqueSystem(ctx: JudgeContext, measureText: string): string {
  const parts = [
    "Tu es un directeur artistique exigeant. Regarde cette interface et juge son design.",
    ctx.tasteAxioms.trim() ? `GOÛT DE RAF (épouse-le) :\n${cap(ctx.tasteAxioms, MAX_AXIOMS_CHARS)}` : "",
    measureText.trim() ? `MESURES OBJECTIVES (tiens-en compte) :\n${cap(measureText, MAX_MEASURE_CHARS)}` : "",
    "Réponds AINSI, en commençant OBLIGATOIREMENT par la note globale sur la 1ʳᵉ ligne :",
    "GLOBAL: <0-100>",
    "puis une courte ligne par aspect, format simple :",
    "<aspect>: <0-100> — <correctif concret en quelques mots>",
    `Aspects : ${LENSES.join(", ")}.`,
    "Sois exigeant et BREF : une interface correcte mais générique = 60-70 ; réserve 85+ au vraiment soigné et distinctif.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

const CRITIQUE_USER = "Voici le rendu actuel de l'interface. Donne d'abord `GLOBAL: <note>` puis tes remarques par aspect.";

// (L28/L34) Rappel doux si la 1ʳᵉ réponse n'avait pas de score lisible. On reste SIMPLE.
const STRICT_FORMAT_REMINDER =
  "⚠ Ta réponse n'avait pas de note lisible. Recommence en COMMENÇANT par une ligne " +
  "exactement de la forme `GLOBAL: <0-100>` (ex. `GLOBAL: 72`), puis tes remarques.";

// ─────────────────────────────────────────────────────────────────────────────
// Parsing (pur, robuste — calqué sur parseJudgeScore)
// ─────────────────────────────────────────────────────────────────────────────

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Minuscule + sans accents — pour matcher les noms de lentilles quel que soit le style du VL. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Parse la sortie du cerveau en critique structurée. (L34) TOLÉRANT au style naturel du VL :
 * un petit modèle vision (qwen3-vl:8b) ne suit pas le format en pipes `LENTILLE: x | n | …`.
 * On essaie le format strict, PUIS un repli : on cherche chaque lentille CONNUE suivie d'un
 * nombre 0-100 (quel que soit le séparateur), et un GLOBAL aux libellés naturels.
 * Garde le filet L28 : `scored=false` si rien de fiable (jamais un faux 50 qui plombe le Gardien).
 */
export function parseCritique(text: string): DesignCritique {
  const lenses: Lens[] = [];
  const lines = text.split("\n");

  // 1) Format STRICT en pipes (préféré quand le VL l'honore). 1 seule suffit pour être fiable.
  for (const line of lines) {
    const m = line.match(/LENTILLE\s*:?\s*([^|]+)\|\s*(\d{1,3})\s*\|\s*(.+)$/i);
    if (!m) continue;
    const score = clampScore(parseInt(m[2], 10));
    const arrow = m[3].trim().split(/→|->/);
    lenses.push({ name: m[1].trim(), score, issue: (arrow[0] ?? m[3]).trim(), fix: (arrow[1] ?? "").trim() });
  }
  const strictCount = lenses.length;

  // 2) Repli TOLÉRANT : pour chaque lentille connue non encore captée, on cherche une ligne
  //    qui la nomme suivie d'un nombre 0-100 (« Hiérarchie : 70/100 — … », « - cohérence (65): … »).
  if (lenses.length < LENSES.length) {
    for (const lens of LENSES) {
      const ln = norm(lens);
      const lnHead = ln.split(/\s|&/)[0]; // ex. "espacement", "echelle", "harmonie"
      if (lenses.some((l) => norm(l.name).includes(lnHead))) continue;
      for (const line of lines) {
        const nl = norm(line);
        if (!nl.includes(lnHead)) continue;
        const sm = line.match(/(\d{1,3})\s*(?:\/\s*100)?/);
        if (!sm) continue;
        const raw = parseInt(sm[1], 10);
        if (raw > 100) continue; // évite les années/montants
        const after = line.slice(line.indexOf(sm[0]) + sm[0].length).replace(/^[\s:|.\-–—]+/, "").trim();
        const arrow = after.split(/→|->/);
        lenses.push({ name: lens, score: clampScore(raw), issue: (arrow[0] ?? after).trim(), fix: (arrow[1] ?? "").trim() });
        break;
      }
    }
  }

  // 3) GLOBAL — tolérant aux libellés naturels (GLOBAL / Note globale / Score global / Overall / Total).
  const globalM = text.match(/(?:GLOBAL|NOTE\s+GLOBALE|SCORE\s+GLOBAL\w*|OVERALL|TOTAL)\s*:?\s*(\d{1,3})\s*(?:\/\s*100)?/i);

  let overall: number;
  let scored: boolean;
  if (globalM) {
    overall = clampScore(parseInt(globalM[1], 10));
    scored = true;
  } else if (strictCount >= 1 || lenses.length >= 2) {
    // Fiable si : ≥1 lentille au format STRICT (le VL a explicitement noté), OU ≥2 lentilles
    // captées par le repli tolérant (signal fort, pas un nombre isolé au hasard — filet L28).
    overall = clampScore(lenses.reduce((s, l) => s + l.score, 0) / lenses.length);
    scored = true;
  } else {
    // Filet L28 : rien de fiable → valeur d'affichage neutre mais scored=false (le Gardien saute le goût).
    const any = text.match(/\b(\d{1,3})\b/);
    overall = any ? clampScore(Math.min(100, parseInt(any[1], 10))) : 50;
    scored = false;
  }
  return { overall, lenses, scored, raw: text };
}

/** (L34) Moyenne plusieurs critiques scorées pour tuer le bruit du VL (L1/L19). PUR. */
export function averageCritiques(cs: DesignCritique[]): DesignCritique {
  const overall = clampScore(cs.reduce((s, c) => s + c.overall, 0) / cs.length);
  const byName = new Map<string, { scores: number[]; issue: string; fix: string }>();
  for (const c of cs) {
    for (const l of c.lenses) {
      const e = byName.get(l.name) ?? { scores: [], issue: l.issue, fix: l.fix };
      e.scores.push(l.score);
      if (!e.issue && l.issue) e.issue = l.issue;
      if (!e.fix && l.fix) e.fix = l.fix;
      byName.set(l.name, e);
    }
  }
  const lenses: Lens[] = [...byName.entries()].map(([name, e]) => ({
    name,
    score: clampScore(e.scores.reduce((s, n) => s + n, 0) / e.scores.length),
    issue: e.issue,
    fix: e.fix,
  }));
  return { overall, lenses, scored: true, raw: cs.map((c) => c.raw ?? "").join("\n--- passe ---\n") };
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
/** Une passe de critique : 1 regard du VL + (L28) UNE reprise si le format n'était pas lisible. */
async function critiqueOnce(system: string, imageBase64: string, deps: CoachDeps): Promise<DesignCritique> {
  const res = await deps.dispatch("vision", system, CRITIQUE_USER, { imageBase64, trustExternal: true, freeform: true });
  let critique = parseCritique(res.summary ?? "");
  // (L28) UNE reprise si le VL n'a pas rendu de score exploitable. On ne fabrique JAMAIS un 50 :
  // si la reprise échoue aussi, scored reste false et l'appelant saute proprement le goût.
  if (!critique.scored) {
    const res2 = await deps.dispatch("vision", `${system}\n\n${STRICT_FORMAT_REMINDER}`, CRITIQUE_USER, { imageBase64, trustExternal: true, freeform: true });
    const c2 = parseCritique(res2.summary ?? "");
    if (c2.scored) critique = c2;
  }
  return critique;
}

export async function critiqueScreen(projectDir: string, ctx: JudgeContext, deps: CoachDeps = realCoachDeps): Promise<DesignCritique> {
  const { url } = await deps.startPreview(projectDir);
  const buf = await deps.capture(url);
  const measure = measureDesign(deps.readCss(projectDir));
  const imageBase64 = buf.toString("base64");
  const system = critiqueSystem(ctx, measureSummary(measure));

  // (L34) MULTI-PASSES moyennées pour tuer le bruit du juge VL (L1/L19 : ±10 sur le même écran).
  // GATE_TASTE_PASSES (défaut 2, borné 1-5). On garde les passes SCORÉES et on les moyenne ;
  // si aucune n'est scorée, on rend la dernière (scored=false → goût sauté, filet L28 intact).
  const passes = Math.max(1, Math.min(5, Math.round(Number(process.env.GATE_TASTE_PASSES ?? 3))));
  const all: DesignCritique[] = [];
  for (let i = 0; i < passes; i++) all.push(await critiqueOnce(system, imageBase64, deps));
  const scored = all.filter((c) => c.scored);
  const critique = scored.length ? averageCritiques(scored) : all[all.length - 1];

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
  reason: "seuil-atteint" | "plafond-tours" | "aucun-correctif" | "pas-de-progrès" | "non-jugeable";
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

  // (L28) Pas de score fiable au départ → on ne PILOTE pas une boucle d'édition sur un
  // faux 50 (gaspillage de relances). On rend la main proprement.
  if (!before.scored) {
    onProgress({ type: "status", text: "👁 Rendu non jugeable (pas de score fiable) — coach sauté." });
    await deps.stopPreview(projectDir);
    return { before, after: before, rounds: 0, history, reason: "non-jugeable" };
  }

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
