// Le GARDIEN de clôture (#161) — vérifie 3 choses AVANT que l'Élève ait le droit
// de finir, et le renvoie corriger sinon (au même titre que le build) :
//   1. INTENTION — le livré couvre-t-il la demande ? (eleve-judge, cerveau souverain)
//   2. GOÛT — le rendu est-il au niveau du goût appris ? (Œil-Coach #152, critiqueScreen)
//   3. QA — contrastes WCAG / charte ? (mesures #111, déjà incluses dans la critique)
//
// CONVERGENT / NON-BLOQUANT (décision Raf) : le Gardien convertit (relance bornée)
// puis CÈDE (drapeau « incomplet ») — jamais un mur (fidèle à #111 blocking:false).
//
// ⚠ ANTI-RÉCURSION : on appelle critiqueScreen (critique en LECTURE), JAMAIS
// runDesignCoach (qui rappellerait runRelay). La correction est faite par la boucle
// runRelay EXISTANTE via le nudge. Le Gardien critique, le moteur corrige.
//
// Tout est gracieux (ne lève jamais) et deps injectables (tests sans navigateur/cloud).

import fs from "node:fs";
import path from "node:path";
import { critiqueScreen, prioritizedFixes, realCoachDeps, type DesignCritique } from "./design-coach.js";
import { buildJudgeContext } from "./taste-judge.js";
import { judgeIntention, type IntentVerdict } from "./eleve-judge.js";
import { getPlan, formatPlanReminder } from "./eleve-plan.js";
import { scanFilesForBalance, formatBalanceRaison, type BalanceFinding } from "./layout-balance.js";
import { runProjectTests, type TestRun } from "./inspection.js";

export interface GateVerdict {
  ok: boolean;
  intent: IntentVerdict;
  intentOk: boolean;
  design?: DesignCritique; // absent si le rendu n'est pas jugeable (tâche non-UI)
  tasteScored: boolean; // (L28) le goût a-t-il un score FIABLE ? sinon le volet goût est sauté
  tasteOk: boolean; // goût ≥ seuil OU non-scoré (sauté → ne pénalise pas)
  tasteObserve: boolean; // (L34) mode observe : le goût est SCORÉ et affiché mais ne bloque PAS
  wcagOk: boolean; // mesures objectives #111 (indépendantes du VL)
  balanceOk: boolean; // ÉQUILIBRE de mise en page (déterministe) — max-w sans centrage = collé à gauche
  balance: BalanceFinding[]; // détails des blocs à largeur max non centrés (vide si ok)
  testsRan: boolean; // (L55) la suite de tests a-t-elle vraiment tourné ? (script présent + gate on)
  testsOk: boolean; // (L55) tests verts OU non lancés (sauté → ne pénalise pas)
  tests?: TestRun; // détail de la suite de tests (absent si non lancée)
  raisons: string[]; // ce qu'il faut corriger (vide si ok)
}

export interface GateThresholds {
  intentMin: number;
  tasteMin: number;
  wcagMaxFails: number;
}

export function gateThresholds(opts: Partial<GateThresholds> = {}): GateThresholds {
  return {
    intentMin: opts.intentMin ?? Number(process.env.ELEVE_GATE_INTENT_MIN ?? 70),
    tasteMin: opts.tasteMin ?? Number(process.env.ELEVE_GATE_TASTE_MIN ?? 70),
    wcagMaxFails: opts.wcagMaxFails ?? Number(process.env.ELEVE_GATE_WCAG_MAX_FAILS ?? 0),
  };
}

export interface GateDeps {
  judge: (task: string, summary: string, files: string[], projectDir: string) => Promise<IntentVerdict>;
  critique: (projectDir: string, workspaceDir: string, projectType: string) => Promise<DesignCritique>;
  stopPreview: (dir: string) => Promise<void>;
  /** Garde déterministe d'équilibre : scanne les fichiers écrits (max-w sans centrage). */
  scanBalance: (projectDir: string, files: string[]) => BalanceFinding[];
  /** (L55) Lance la suite de tests du projet (gated ELEVE_GATE_TESTS). Ne lève jamais. */
  runTests: (projectDir: string) => Promise<TestRun>;
}

/** Lecteur réel : lit chaque fichier sous projectDir et délègue au détecteur pur. */
function realScanBalance(projectDir: string, files: string[]): BalanceFinding[] {
  return scanFilesForBalance(files, (f) => {
    try {
      return fs.readFileSync(path.join(projectDir, f), "utf8");
    } catch {
      return null;
    }
  });
}

const realGateDeps: GateDeps = {
  judge: (task, summary, files, projectDir) => judgeIntention(task, summary, files, projectDir),
  critique: (projectDir, workspaceDir, projectType) =>
    critiqueScreen(projectDir, buildJudgeContext(workspaceDir, projectType)),
  stopPreview: (dir) => realCoachDeps.stopPreview(dir),
  scanBalance: realScanBalance,
  runTests: (dir) => runProjectTests(dir),
};

/** Fichiers écrits par l'agent, dérivés de la trace d'outils. PUR. */
export function changedFilesFromTrace(trace: Array<{ name: string; args: string }>): string[] {
  const out: string[] = [];
  for (const t of trace) {
    if (t.name !== "write_file" && t.name !== "edit_file") continue;
    try {
      const a = JSON.parse(t.args) as { path?: unknown };
      if (typeof a.path === "string" && a.path.trim()) out.push(a.path.trim());
    } catch {
      /* trace illisible : on saute */
    }
  }
  return [...new Set(out)];
}

/** Exécute le Gardien : intention + goût + QA. Ne lève jamais. */
export async function runClosureGate(
  projectDir: string,
  task: string,
  result: { text: string; toolTrace: Array<{ name: string; args: string }> },
  workspaceDir: string,
  projectType: string,
  opts: Partial<GateThresholds> = {},
  deps: GateDeps = realGateDeps,
): Promise<GateVerdict> {
  const th = gateThresholds(opts);
  const files = changedFilesFromTrace(result.toolTrace);

  // 1. INTENTION (souverain, ne lève jamais).
  let intent: IntentVerdict;
  try {
    intent = await deps.judge(task, result.text, files, projectDir);
  } catch {
    intent = { couverture: 100, manques: [], note: "(juge KO)" };
  }
  const intentOk = intent.couverture >= th.intentMin;

  // 2+3. GOÛT + QA en UN regard (critiqueScreen → overall + measure WCAG). Si l'aperçu
  // échoue (tâche non-UI, pas de rendu) → on saute proprement : seule l'intention compte.
  // (L28) Le GOÛT (score VL) et la QA (mesures objectives #111) sont SÉPARÉS : si le VL
  // n'a pas rendu de score fiable (scored=false), on saute le goût mais on GARDE la QA
  // WCAG, qui ne dépend pas du parsing du VL. Plus jamais de faux 50 qui plombe.
  // (L34) Mode OBSERVE (défaut ON) : on FIABILISE le score du goût (parsing tolérant +
  // multi-passes) et on l'AFFICHE, mais il ne BLOQUE pas encore (on calibre d'abord sur le
  // goût réel de Raf avant de durcir). Passer ELEVE_GATE_TASTE_OBSERVE=off pour l'activer en frein.
  const tasteObserve = process.env.ELEVE_GATE_TASTE_OBSERVE !== "off";
  let design: DesignCritique | undefined;
  let tasteScored = false;
  let tasteOk = true;
  let wcagOk = true;
  try {
    design = await deps.critique(projectDir, workspaceDir, projectType);
    tasteScored = design.scored !== false; // tolère d'anciennes critiques sans le champ
    const wcagFails = design.measure?.contrastFails.length ?? 0;
    // En observe, le goût ne pèse jamais sur le verdict (tasteOk=true) — il est seulement mesuré.
    tasteOk = tasteObserve || !tasteScored || design.overall >= th.tasteMin;
    wcagOk = wcagFails <= th.wcagMaxFails;
  } catch {
    design = undefined; // pas de rendu jugeable → ne pénalise pas
  } finally {
    try {
      await deps.stopPreview(projectDir);
    } catch {
      /* nettoyage best-effort */
    }
  }

  // 4. ÉQUILIBRE (déterministe, indépendant du VL — comme la QA WCAG). Scanne les fichiers
  // écrits : un conteneur à largeur max sans centrage = contenu collé à gauche. Opt-out
  // ELEVE_GATE_BALANCE=off. Ne dépend pas d'un rendu → marche même sans aperçu/cloud.
  let balance: BalanceFinding[] = [];
  let balanceOk = true;
  if (process.env.ELEVE_GATE_BALANCE !== "off") {
    try {
      balance = deps.scanBalance(projectDir, files);
    } catch {
      balance = [];
    }
    balanceOk = balance.length === 0;
  }

  // 5. TESTS (#L55) — un build VERT ne prouve pas que ça MARCHE. Si le projet a un
  // vrai script `test`, on le lance : rouge → on renvoie l'Élève corriger (signal
  // FIABLE, comme l'intention/WCAG, pas bruité comme le goût). Gate ELEVE_GATE_TESTS
  // (défaut OFF → zéro régression). Sauté proprement si pas de test / pas de deps.
  let testsRan = false;
  let testsOk = true;
  let tests: TestRun | undefined;
  if (process.env.ELEVE_GATE_TESTS === "on") {
    try {
      tests = await deps.runTests(projectDir);
      if (tests.signal === "tests-ok" || tests.signal === "tests-failed") {
        testsRan = true;
        testsOk = tests.ok;
      }
      // no-test-script / no-deps / timeout → ne pénalise pas (testsOk reste true).
    } catch {
      tests = undefined;
    }
  }

  const raisons: string[] = [];
  if (!intentOk) {
    const m = intent.manques.length ? intent.manques.map((x) => `  - ${x}`).join("\n") : "  - la demande n'est pas couverte";
    raisons.push(`INTENTION ${intent.couverture}/100 (seuil ${th.intentMin}) — il manque :\n${m}`);
  }
  if (!balanceOk) {
    raisons.push(formatBalanceRaison(balance));
  }
  if (!testsOk && tests) {
    raisons.push(
      `TESTS rouges — la suite \`npm test\` échoue (build vert ≠ tests verts). ` +
        `Corrige le code jusqu'à ce que les tests passent :\n${tests.detail.slice(-1000)}`,
    );
  }
  if (design) {
    // Goût : seulement si FIABLE (L28) ET hors mode observe (L34). Un goût observé/non-scoré
    // ne produit AUCUNE raison → ne renvoie jamais l'Élève corriger pour du goût pas encore calibré.
    if (!tasteObserve && tasteScored && design.overall < th.tasteMin) {
      const fixes = prioritizedFixes(design, th.tasteMin);
      raisons.push(`GOÛT ${design.overall}/100 (seuil ${th.tasteMin}) — corrige :\n${fixes.map((f) => `  ${f}`).join("\n")}`);
    }
    const wf = design.measure?.contrastFails ?? [];
    if (wf.length > th.wcagMaxFails) {
      raisons.push(`QA — ${wf.length} contraste(s) texte/fond sous WCAG AA : corrige les couleurs pour la lisibilité.`);
    }
  }

  return { ok: intentOk && tasteOk && wcagOk && balanceOk && testsOk, intent, intentOk, design, tasteScored, tasteOk, tasteObserve, wcagOk, balanceOk, balance, testsRan, testsOk, tests, raisons };
}

/** Nudge de correction du Gardien (préfixe le plan #160). PUR. */
export function buildGateNudge(projectDir: string, verdict: GateVerdict, relance: number, max: number): string {
  const plan = getPlan(projectDir);
  const rappel = plan ? `${formatPlanReminder(plan)}\n\n` : "";
  return (
    `${rappel}🛡 Build VERT, mais le Gardien de clôture relève que ce n'est pas encore au niveau. ` +
    `Corrige MAINTENANT ces points PRÉCIS :\n\n${verdict.raisons.join("\n\n")}\n\n` +
    `Applique ces corrections (edit_file/write_file), vérifie avec check_build, puis re-appelle finish. ` +
    `(correction ${relance}/${max})`
  );
}

export type GateAction = { action: "ok" } | { action: "corrige"; nudge: string } | { action: "laisse-passer" };

/**
 * Décision pure du Gardien selon le verdict + le budget de corrections. PUR, testable.
 *
 * (L28) Anti-thrash : si le SEUL levier qui bloque est le GOÛT (intention OK, WCAG OK) et
 * que ce goût n'a PAS progressé depuis la correction précédente (`prevGout`), on cesse de
 * renvoyer corriger en boucle — le juge VL est bruité, insister ne fait que gaspiller des
 * tours. On cède (laisse-passer → INCOMPLET). Sur intention/WCAG (signaux fiables), on
 * relance normalement dans la limite du budget.
 */
export function evaluateGate(
  projectDir: string,
  verdict: GateVerdict,
  gateRelances: number,
  max: number,
  prevGout: number | null = null,
): GateAction {
  if (verdict.ok) return { action: "ok" };
  if (gateRelances >= max) return { action: "laisse-passer" };

  const onlyGout = verdict.intentOk && verdict.wcagOk && verdict.balanceOk && verdict.testsOk && verdict.tasteScored && !verdict.tasteOk;
  const gout = verdict.tasteScored ? verdict.design?.overall ?? null : null;
  if (onlyGout && gout !== null && prevGout !== null && gout <= prevGout) {
    return { action: "laisse-passer" };
  }
  return { action: "corrige", nudge: buildGateNudge(projectDir, verdict, gateRelances + 1, max) };
}
