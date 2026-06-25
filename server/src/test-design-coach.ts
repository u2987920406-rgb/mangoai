// Tests de l'œil-coach (design-coach.ts) — aperçu/capture/cerveau/édition INJECTÉS.

import {
  parseCritique, prioritizedFixes, critiqueScreen, runDesignCoach,
  type CoachDeps, type DesignCritique,
} from "./design-coach.js";
import type { JudgeContext } from "./taste-judge.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const CTX: JudgeContext = { tasteAxioms: "", designSystem: "" };

// Construit une sortie de cerveau au format imposé.
function critiqueText(overall: number, lenses: Array<[string, number, string, string]>): string {
  const lines = lenses.map(([n, s, issue, fix]) => `LENTILLE: ${n} | ${s} | ${issue} → ${fix}`);
  return [...lines, `GLOBAL: ${overall}`].join("\n");
}

// ── parseCritique ──
{
  const c = parseCritique(critiqueText(72, [["hiérarchie", 60, "titres plats", "H1 à 2rem/700"], ["cohérence", 80, "ok", ""]]));
  check("parseCritique : overall depuis GLOBAL", c.overall === 72);
  check("parseCritique : 2 lentilles", c.lenses.length === 2);
  check("parseCritique : issue + fix séparés par →", c.lenses[0].issue === "titres plats" && c.lenses[0].fix === "H1 à 2rem/700");
}
{
  const c = parseCritique("LENTILLE: alignement | 40 | décalé → grille 8px\nLENTILLE: couleur | 60 | terne -> accent plus vif");
  check("parseCritique : GLOBAL absent → moyenne des lentilles", c.overall === 50);
  check("parseCritique : tolère la flèche ->", c.lenses[1].fix === "accent plus vif");
}
{
  const c = parseCritique("blabla sans format mais score 77 quelque part");
  check("parseCritique : repli premier entier plausible", c.overall === 77 && c.lenses.length === 0);
}
check("parseCritique : vide → défaut 50", parseCritique("").overall === 50);
check("parseCritique : clamp >100", parseCritique("GLOBAL: 250").overall === 100);

// ── prioritizedFixes ──
{
  const c = parseCritique(critiqueText(50, [
    ["hiérarchie", 40, "plat", "H1 plus gros"],
    ["couleur", 30, "terne", "accent vif"],
    ["cohérence", 90, "ok", "rien"],
    ["typo", 55, "échelle", ""],
  ]));
  const fixes = prioritizedFixes(c, 85, 4);
  check("prioritizedFixes : pire d'abord (couleur 30 avant hiérarchie 40)", fixes[0].includes("couleur") && fixes[1].includes("hiérarchie"));
  check("prioritizedFixes : exclut les lentilles ≥ seuil", !fixes.some((f) => f.includes("cohérence")));
  check("prioritizedFixes : exclut les lentilles sans correctif", !fixes.some((f) => f.includes("typo")));
  check("prioritizedFixes : plafond respecté", prioritizedFixes(c, 85, 1).length === 1);
}

// ── deps injectables : file de réponses du cerveau ──
function makeDeps(critiqueQueue: string[]): { deps: CoachDeps; applied: string[]; previews: number } {
  const applied: string[] = [];
  let previews = 0;
  let i = 0;
  const deps: CoachDeps = {
    startPreview: async () => { previews++; return { url: "http://127.0.0.1:5174" }; },
    stopPreview: async () => {},
    capture: async () => Buffer.from([0xff, 0xd8, 0xff]),
    readCss: () => [":root{--color-bg:#fff} .x{color:#999;background:#fff;font-size:14px}"],
    dispatch: async () => ({ status: "ok", summary: critiqueQueue[Math.min(i++, critiqueQueue.length - 1)] }),
    applyFixes: async (prompt) => { applied.push(prompt); return { success: true }; },
  };
  return { deps, applied, get previews() { return previews; } } as { deps: CoachDeps; applied: string[]; previews: number };
}

// ── critiqueScreen ──
{
  const { deps } = makeDeps([critiqueText(68, [["hiérarchie", 60, "plat", "H1 +gros"]])]);
  const c = await critiqueScreen("/proj", CTX, deps);
  check("critiqueScreen : renvoie la critique parsée", c.overall === 68 && c.lenses.length === 1);
  check("critiqueScreen : attache la mesure objective (contraste #999/#fff)", !!c.measure && c.measure.contrastFails.length >= 1);
}

// ── runDesignCoach : progresse jusqu'au seuil ──
{
  const { deps, applied } = makeDeps([
    critiqueText(60, [["hiérarchie", 50, "plat", "H1 +gros"], ["couleur", 55, "terne", "accent"]]), // avant
    critiqueText(80, [["hiérarchie", 80, "mieux", "ok"], ["couleur", 78, "mieux", "ok"]]),           // tour 1
    critiqueText(88, [["hiérarchie", 90, "net", "ok"], ["couleur", 88, "net", "ok"]]),               // tour 2 → seuil
  ]);
  const evs: string[] = [];
  const r = await runDesignCoach("/proj", { threshold: 85, maxRounds: 3 }, CTX, (ev) => evs.push(ev.type), deps);
  check("coach : avant=60, après=88", r.before.overall === 60 && r.after.overall === 88);
  check("coach : 2 tours d'édition", r.rounds === 2 && applied.length === 2);
  check("coach : raison = seuil-atteint", r.reason === "seuil-atteint");
  check("coach : émet des events critique", evs.filter((e) => e === "critique").length === 3);
}

// ── runDesignCoach : anti-thrash (pas de progrès → stop) ──
{
  const { deps, applied } = makeDeps([
    critiqueText(60, [["hiérarchie", 50, "plat", "H1 +gros"]]),
    critiqueText(58, [["hiérarchie", 48, "pareil", "H1 +gros"]]), // régresse → stop
  ]);
  const r = await runDesignCoach("/proj", { threshold: 85, maxRounds: 3 }, CTX, () => {}, deps);
  check("coach : s'arrête si pas de progrès", r.rounds === 1 && applied.length === 1 && r.reason === "pas-de-progrès");
}

// ── runDesignCoach : plafond de tours ──
{
  const { deps } = makeDeps([
    critiqueText(60, [["h", 60, "x", "f"]]),
    critiqueText(65, [["h", 65, "x", "f"]]),
    critiqueText(70, [["h", 70, "x", "f"]]),
  ]);
  const r = await runDesignCoach("/proj", { threshold: 85, maxRounds: 2 }, CTX, () => {}, deps);
  check("coach : plafond maxRounds=2 respecté", r.rounds === 2 && r.reason === "plafond-tours" && r.after.overall === 70);
}

// ── runDesignCoach : aucun correctif actionnable ──
{
  const { deps, applied } = makeDeps([
    critiqueText(60, [["hiérarchie", 50, "plat", ""]]), // sous seuil mais aucun fix → rien à faire
  ]);
  const r = await runDesignCoach("/proj", { threshold: 85, maxRounds: 3 }, CTX, () => {}, deps);
  check("coach : aucun correctif → stop sans édition", r.rounds === 0 && applied.length === 0 && r.reason === "aucun-correctif");
}

// ── runDesignCoach : déjà au-dessus du seuil → zéro tour ──
{
  const { deps, applied } = makeDeps([critiqueText(92, [["h", 92, "x", "f"]])]);
  const r = await runDesignCoach("/proj", { threshold: 85, maxRounds: 3 }, CTX, () => {}, deps);
  check("coach : déjà bon → 0 tour, seuil-atteint", r.rounds === 0 && applied.length === 0 && r.reason === "seuil-atteint");
}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
