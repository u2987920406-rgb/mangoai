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

import { critiqueScreen, prioritizedFixes, realCoachDeps, type DesignCritique } from "./design-coach.js";
import { buildJudgeContext } from "./taste-judge.js";
import { judgeIntention, type IntentVerdict } from "./eleve-judge.js";
import { getPlan, formatPlanReminder } from "./eleve-plan.js";

export interface GateVerdict {
  ok: boolean;
  intent: IntentVerdict;
  design?: DesignCritique; // absent si le rendu n'est pas jugeable (tâche non-UI)
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
}

const realGateDeps: GateDeps = {
  judge: (task, summary, files, projectDir) => judgeIntention(task, summary, files, projectDir),
  critique: (projectDir, workspaceDir, projectType) =>
    critiqueScreen(projectDir, buildJudgeContext(workspaceDir, projectType)),
  stopPreview: (dir) => realCoachDeps.stopPreview(dir),
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
  let design: DesignCritique | undefined;
  let designOk = true;
  try {
    design = await deps.critique(projectDir, workspaceDir, projectType);
    const wcagFails = design.measure?.contrastFails.length ?? 0;
    designOk = design.overall >= th.tasteMin && wcagFails <= th.wcagMaxFails;
  } catch {
    design = undefined;
    designOk = true; // pas de rendu jugeable → ne pénalise pas
  } finally {
    try {
      await deps.stopPreview(projectDir);
    } catch {
      /* nettoyage best-effort */
    }
  }

  const raisons: string[] = [];
  if (!intentOk) {
    const m = intent.manques.length ? intent.manques.map((x) => `  - ${x}`).join("\n") : "  - la demande n'est pas couverte";
    raisons.push(`INTENTION ${intent.couverture}/100 (seuil ${th.intentMin}) — il manque :\n${m}`);
  }
  if (design && !designOk) {
    if (design.overall < th.tasteMin) {
      const fixes = prioritizedFixes(design, th.tasteMin);
      raisons.push(`GOÛT ${design.overall}/100 (seuil ${th.tasteMin}) — corrige :\n${fixes.map((f) => `  ${f}`).join("\n")}`);
    }
    const wf = design.measure?.contrastFails ?? [];
    if (wf.length > th.wcagMaxFails) {
      raisons.push(`QA — ${wf.length} contraste(s) texte/fond sous WCAG AA : corrige les couleurs pour la lisibilité.`);
    }
  }

  return { ok: intentOk && designOk, intent, design, raisons };
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

/** Décision pure du Gardien selon le verdict + le budget de corrections. PUR, testable. */
export function evaluateGate(projectDir: string, verdict: GateVerdict, gateRelances: number, max: number): GateAction {
  if (verdict.ok) return { action: "ok" };
  if (gateRelances < max) return { action: "corrige", nudge: buildGateNudge(projectDir, verdict, gateRelances + 1, max) };
  return { action: "laisse-passer" };
}
