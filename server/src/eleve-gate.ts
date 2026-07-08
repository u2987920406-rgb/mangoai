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
import { checkPedagoReel, type PedagoVerdict } from "./eleve-gate-pedago.js";
import { flag } from "./flags.js";

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
  placeholdersOk: boolean; // garde « vraies images » : aucun placeholder aléatoire vivant dans le code écrit
  placeholders: PlaceholderFinding[]; // URLs de placeholder trouvées (vide si ok)
  judgeSkipped?: string; // (N9) le juge d'intention a ÉCHOUÉ (verdict neutre 100) — raison
  critiqueSkipped?: string; // (N9) la critique visuelle a ÉCHOUÉ (goût/WCAG sautés) — raison
  dualSkip: boolean; // (revue 2026-07-03, action #6) juge ET critique KO SIMULTANÉMENT ce tour —
  // « intention+goût+QA » se réduit alors à 2 regex triviales. Toujours calculé (observabilité),
  // ne BLOQUE la clôture que si ELEVE_GATE_DUAL_SKIP_BLOCK=on (voir `ok`).
  testsRan: boolean; // (L55) la suite de tests a-t-elle vraiment tourné ? (script présent + gate on)
  testsOk: boolean; // (L55) tests verts OU non lancés (sauté → ne pénalise pas)
  tests?: TestRun; // détail de la suite de tests (absent si non lancée)
  // (#181 É4) Volet PÉDAGO — présent SEULEMENT si ELEVE_GATE_PEDAGO=on ET applicable
  // (projet de formation). Absent en gate OFF → verdict byte-identique à avant ce volet.
  pedago?: PedagoVerdict;
  pedagoOk?: boolean;
  // (axiome 17, 2026-07-08 — expérience #183) « la clôture doit atteindre le signal le
  // plus HAUT ATTEIGNABLE, pas le plus commode. » Un script de test RÉEL existe mais
  // ELEVE_GATE_TESTS=off → un signal plus fiable que le seul build était disponible et
  // n'a pas été pris. TOUJOURS surfacé (observabilité, même style que judgeSkipped/
  // critiqueSkipped) ; NE bloque PAS la clôture (`ok` inchangé) — c'est un signal, pas
  // encore une garde durcie.
  signalGap?: string;
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
  /** Garde déterministe « vraies images » : placeholders aléatoires dans les fichiers écrits. */
  scanPlaceholders: (projectDir: string, files: string[]) => PlaceholderFinding[];
  /** (L55) Lance la suite de tests du projet (gated ELEVE_GATE_TESTS). Ne lève jamais. */
  runTests: (projectDir: string) => Promise<TestRun>;
  /** (#181 É4) Volet PÉDAGO (gated ELEVE_GATE_PEDAGO). Optionnel : absent → volet sauté
   *  (comportement historique). Ne lève jamais côté implémentation réelle. */
  checkPedago?: (projectDir: string) => Promise<PedagoVerdict>;
  /** (axiome 17) Un script `test` RÉEL (≠ placeholder npm par défaut) existe-t-il dans
   *  package.json ? Sert UNIQUEMENT à signaler un signal disponible non exploité — ne
   *  lève jamais, best-effort. */
  hasTestScript: (projectDir: string) => boolean;
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

// ── Garde « vraies images » (règle ⭐ de Raf) ────────────────────────────────────
// Un placeholder ALÉATOIRE qui CHARGE (picsum, loremflickr…) passe le check 404 et
// toutes les clôtures — image hors-sujet garantie, indétectée. Détection déterministe
// sur les fichiers écrits, même mécanique que la garde d'équilibre.
export interface PlaceholderFinding { file: string; url: string }

const PLACEHOLDER_URL_RE =
  /https?:\/\/(?:www\.)?(?:picsum\.photos|loremflickr\.com|via\.placeholder\.com|unsplash\.it|placekitten\.com|placehold\.co|placebear\.com|dummyimage\.com|baconmockup\.com)[^"'`\s)>,]*/gi;

/** Détecteur PUR : URLs de placeholder aléatoire dans les fichiers écrits. */
export function scanFilesForPlaceholders(files: string[], read: (f: string) => string | null): PlaceholderFinding[] {
  const out: PlaceholderFinding[] = [];
  for (const f of files) {
    if (!/\.(jsx?|tsx?|css|html?|json|md|svelte|vue)$/i.test(f)) continue;
    const src = read(f);
    if (!src) continue;
    for (const m of src.matchAll(PLACEHOLDER_URL_RE)) out.push({ file: f, url: m[0] });
  }
  return out;
}

export function formatPlaceholdersRaison(findings: PlaceholderFinding[]): string {
  const lines = findings.slice(0, 8).map((p) => `  - ${p.file} : ${p.url}`);
  return (
    `IMAGES — ${findings.length} URL(s) de placeholder ALÉATOIRE dans le code (interdites : l'image ne correspondra jamais au contenu) :\n` +
    `${lines.join("\n")}\n` +
    `  Remplace CHAQUE URL par une vraie photo via chercher_image('description anglaise de la scène') — copie l'URL Pexels EXACTE renvoyée.`
  );
}

function realScanPlaceholders(projectDir: string, files: string[]): PlaceholderFinding[] {
  return scanFilesForPlaceholders(files, (f) => {
    try {
      return fs.readFileSync(path.join(projectDir, f), "utf8");
    } catch {
      return null;
    }
  });
}

// (axiome 17) Placeholder que `npm init`/nos templates posent par défaut — ne compte
// PAS comme un signal disponible (il échoue toujours, exprès, ce n'est pas un test).
const NPM_DEFAULT_TEST_SCRIPT = /Error: no test specified/i;

/** Un script `test` RÉEL (≠ placeholder par défaut) existe-t-il dans package.json ?
 * PUR modulo lecture fichier ; ne lève jamais (dossier/JSON absent → false). */
export function hasRealTestScript(projectDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const test = pkg.scripts?.test;
    return typeof test === "string" && test.trim().length > 0 && !NPM_DEFAULT_TEST_SCRIPT.test(test);
  } catch {
    return false;
  }
}

const realGateDeps: GateDeps = {
  judge: (task, summary, files, projectDir) => judgeIntention(task, summary, files, projectDir),
  critique: (projectDir, workspaceDir, projectType) =>
    critiqueScreen(projectDir, buildJudgeContext(workspaceDir, projectType)),
  stopPreview: (dir) => realCoachDeps.stopPreview(dir),
  scanBalance: realScanBalance,
  scanPlaceholders: realScanPlaceholders,
  runTests: (dir) => runProjectTests(dir),
  checkPedago: (dir) => checkPedagoReel(dir),
  hasTestScript: hasRealTestScript,
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
  // (N9, nuit 2026-07-03) un juge KO (hoquet réseau) donnait un 100/100 SILENCIEUX,
  // indiscernable d'une vraie validation dans les logs. La note "(juge KO)" existe
  // depuis toujours — on la SURFACE désormais (champ judgeSkipped + log appelant).
  let intent: IntentVerdict;
  let judgeSkipped: string | undefined;
  try {
    intent = await deps.judge(task, result.text, files, projectDir);
  } catch (e) {
    judgeSkipped = (e as Error).message.split("\n")[0];
    intent = { couverture: 100, manques: [], note: "(juge KO)", parsed: false };
  }
  // (2026-07-07) une réponse du juge NON PARSABLE (hors-format) donnait un 100/100
  // silencieux, indiscernable d'une vraie validation — même famille de bug que
  // l'incident neon-drift (taste-judge.ts). On la surface désormais comme judgeSkipped.
  if (!intent.parsed && !judgeSkipped) judgeSkipped = `juge illisible (hors-format) : ${intent.note}`;
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
  let critiqueSkipped: string | undefined; // (N9) raison si la critique a échoué (≠ tâche non-UI)
  let tasteScored = false;
  let tasteOk = true;
  let wcagOk = true;
  try {
    design = await deps.critique(projectDir, workspaceDir, projectType);
    tasteScored = design.scored !== false; // tolère d'anciennes critiques sans le champ
    const wcagFails = design.measure?.contrastFails.length ?? 0;
    // En observe, le goût ne pèse pas sur le verdict — SAUF échec grossier : un score
    // fiable sous le PLANCHER (défaut 50/100) bloque même en observe. « Build-vert ≠
    // réussi » : une app laide mais couvrante ne doit plus sortir verte sans un regard.
    const tasteFloor = Number(process.env.ELEVE_GATE_TASTE_FLOOR ?? 50);
    tasteOk = !tasteScored || (tasteObserve ? design.overall >= tasteFloor : design.overall >= th.tasteMin);
    wcagOk = wcagFails <= th.wcagMaxFails;
  } catch (e) {
    design = undefined; // pas de rendu jugeable → ne pénalise pas
    // (N9) mais on garde la RAISON : un échec d'infra (preview morte, orphelin
    // port…) doit être discernable d'une tâche non-UI dans les logs.
    critiqueSkipped = (e as Error).message.split("\n")[0];
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

  // 4bis. VRAIES IMAGES (déterministe) — un placeholder aléatoire vivant est indétectable
  // par le check 404 et par le VL : garde dédiée, opt-out ELEVE_GATE_PLACEHOLDERS=off.
  let placeholders: PlaceholderFinding[] = [];
  let placeholdersOk = true;
  if (process.env.ELEVE_GATE_PLACEHOLDERS !== "off") {
    try {
      placeholders = deps.scanPlaceholders(projectDir, files);
    } catch {
      placeholders = [];
    }
    placeholdersOk = placeholders.length === 0;
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

  // 5bis. SIGNAL GAP (axiome 17, 2026-07-08) — « la clôture doit atteindre le signal le
  // plus HAUT ATTEIGNABLE, pas le plus commode. » Un script `test` RÉEL existe mais le
  // gate ELEVE_GATE_TESTS est OFF (ou le script n'a pas tourné) → un signal plus fiable
  // que le seul build était disponible et n'a pas été pris. TOUJOURS calculé (même
  // pattern que judgeSkipped/critiqueSkipped), ne bloque JAMAIS `ok` — observabilité
  // d'abord, durcissement en garde réel = décision séparée.
  let signalGap: string | undefined;
  try {
    if (!testsRan && deps.hasTestScript(projectDir)) {
      signalGap =
        process.env.ELEVE_GATE_TESTS === "on"
          ? "un script `test` réel existe mais n'a pas produit de signal exploitable ce tour (voir `tests`)"
          : "un script `test` réel existe dans package.json mais n'est pas exécuté à la clôture (ELEVE_GATE_TESTS=off) — signal disponible non exploité";
    }
  } catch {
    signalGap = undefined;
  }

  // 6. PÉDAGO (#181 É4, opt-in ELEVE_GATE_PEDAGO, défaut OFF) — couverture curriculum↔
  // banques, leçon-avant-exercice, sources déclarées, lisibilité, échantillon d'exactitude
  // sourcé (D5 étages 2+3). Applicable SEULEMENT aux projets de formation (manifest
  // formation.json présent) — neutre sinon. Gate OFF ou deps.checkPedago absent → jamais
  // appelé, verdict byte-identique (pas de champ `pedago`/`pedagoOk` dans le retour).
  let pedago: PedagoVerdict | undefined;
  if (flag("ELEVE_GATE_PEDAGO") && deps.checkPedago) {
    try {
      pedago = await deps.checkPedago(projectDir);
    } catch {
      pedago = undefined;
    }
  }
  const pedagoOk = !pedago || pedago.ok;

  const raisons: string[] = [];
  if (!intentOk) {
    const m = intent.manques.length ? intent.manques.map((x) => `  - ${x}`).join("\n") : "  - la demande n'est pas couverte";
    raisons.push(`INTENTION ${intent.couverture}/100 (seuil ${th.intentMin}) — il manque :\n${m}`);
  }
  if (!balanceOk) {
    raisons.push(formatBalanceRaison(balance));
  }
  if (!placeholdersOk) {
    raisons.push(formatPlaceholdersRaison(placeholders));
  }
  if (!testsOk && tests) {
    raisons.push(
      `TESTS rouges — la suite \`npm test\` échoue (build vert ≠ tests verts). ` +
        `Corrige le code jusqu'à ce que les tests passent :\n${tests.detail.slice(-1000)}`,
    );
  }
  if (pedago && !pedago.ok) {
    raisons.push(...pedago.raisons);
  }
  if (design) {
    // Goût : seulement si FIABLE (L28) ET hors mode observe (L34). Un goût observé/non-scoré
    // ne produit AUCUNE raison → ne renvoie jamais l'Élève corriger pour du goût pas encore calibré.
    if (!tasteObserve && tasteScored && design.overall < th.tasteMin) {
      const fixes = prioritizedFixes(design, th.tasteMin);
      raisons.push(`GOÛT ${design.overall}/100 (seuil ${th.tasteMin}) — corrige :\n${fixes.map((f) => `  ${f}`).join("\n")}`);
    } else if (tasteObserve && tasteScored && !tasteOk) {
      // Échec GROSSIER sous le plancher : bloque même en observe (build-vert ≠ réussi).
      const fixes = prioritizedFixes(design, th.tasteMin);
      raisons.push(`GOÛT ${design.overall}/100 — ÉCHEC GROSSIER (plancher ${Number(process.env.ELEVE_GATE_TASTE_FLOOR ?? 50)}, même en observation) — corrige :\n${fixes.map((f) => `  ${f}`).join("\n")}`);
    }
    const wf = design.measure?.contrastFails ?? [];
    if (wf.length > th.wcagMaxFails) {
      raisons.push(`QA — ${wf.length} contraste(s) texte/fond sous WCAG AA : corrige les couleurs pour la lisibilité.`);
    }
  }

  // (revue 2026-07-03, action #6, constat B) Si le juge d'intention ET la critique
  // visuelle échouent TOUS LES DEUX sur le même tour (même infra Ollama/preview
  // indisponible), le Gardien "intention+goût+QA" se réduit silencieusement à 2
  // regex triviales — tout en restant marqué VERT. `dualSkip` le rend TOUJOURS
  // visible ; ELEVE_GATE_DUAL_SKIP_BLOCK=on (défaut OFF) le fait aussi BLOQUER
  // (compté non-vérifié plutôt que vert) au lieu de se contenter du log N9.
  const dualSkip = Boolean(judgeSkipped && critiqueSkipped);
  const dualSkipBlocks = dualSkip && flag("ELEVE_GATE_DUAL_SKIP_BLOCK");
  if (dualSkipBlocks) {
    raisons.push(
      `GARDIEN DÉGRADÉ — juge d'intention (${judgeSkipped}) ET critique visuelle (${critiqueSkipped}) ont échoué SIMULTANÉMENT : ` +
        `rien n'a été réellement vérifié ce tour (intention+goût+QA réduits à 2 regex triviales). Relance quand l'infra (Ollama/preview) est disponible.`,
    );
  }
  return {
    ok: intentOk && tasteOk && wcagOk && balanceOk && placeholdersOk && testsOk && !dualSkipBlocks && pedagoOk,
    intent, intentOk, design, tasteScored, tasteOk, tasteObserve, wcagOk, balanceOk, balance,
    placeholdersOk, placeholders, judgeSkipped, critiqueSkipped, dualSkip, testsRan, testsOk, tests, raisons,
    ...(pedago ? { pedago, pedagoOk } : {}),
    ...(signalGap ? { signalGap } : {}),
  };
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

  const onlyGout = verdict.intentOk && verdict.wcagOk && verdict.balanceOk && (verdict.placeholdersOk ?? true) && verdict.testsOk && (verdict.pedagoOk ?? true) && verdict.tasteScored && !verdict.tasteOk;
  const gout = verdict.tasteScored ? verdict.design?.overall ?? null : null;
  if (onlyGout && gout !== null && prevGout !== null && gout <= prevGout) {
    return { action: "laisse-passer" };
  }
  return { action: "corrige", nudge: buildGateNudge(projectDir, verdict, gateRelances + 1, max) };
}
