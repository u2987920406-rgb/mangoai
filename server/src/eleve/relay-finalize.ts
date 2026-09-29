import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseContract } from "../contract.js";
import { executeContract } from "../executor.js";
import { inspectProject, type Inspection } from "../inspection.js";
import { hasBackend, BACKEND_DIR_NAME } from "../backend-generator.js";
import { selectAxioms } from "../axioms.js";
import { loadMemory } from "../memory.js";
import { detectProjectType, inferProjectType } from "../blueprints.js";
import { WORKSPACE_DIR } from "../projects.js";
import { type ModelProfile } from "../models/profile.js";
import { type LLMProvider } from "../llm/llm-engine.js";
import { buildEleveTools } from "../eleve-tools/eleve-tools.js";
import { buildEleveActionTools, installDependency, setExternalMcpTools } from "../eleve-tools/eleve-action-tools.js";
import { loadHooks } from "../mango-hooks-config.js";
import { runHooks, fireObservationHook } from "../mango-hooks.js";
import { loadExternalMcpTools, defaultMcpConfigPath } from "../mcp-external.js";
import { clearPlan, buildRelanceNudge, getPlan, formatPlanReminder } from "../eleve-plan.js";
import { checkAndRepairImages, formatImageCheck, buildImageRepairNudge } from "../eleve-image-check.js";
import { diagnose, formatDiagnosis, type Diagnosis } from "../stratege/stratege-signals.js";
import { route, newStrategeState, commitRemedy, formatRemedy, type StrategeState } from "../stratege.js";
import { recallProcedure, distillProcedure, learnedHint } from "../stratege/stratege-learn.js";
import { reclassifyAmbiguous, formatReclassify } from "../stratege/stratege-brain.js";
import { consultSpecialist, buildDelegateNudge, buildForgedResumeNudge } from "../specialist/specialist-delegate.js";
import { runSpecialistAgentic } from "../specialist/specialist-agentic.js";
import { recordUncoveredGap, markGap, getGap, recordForgeAttempt, forgeAttemptsExhausted } from "../self/self-evolution.js";
import { loadSpecialists, recordSpecialistWin } from "../specialist/specialist-agents.js";
import { forgeForGap } from "../agent/agent-forge.js";
import { autoForgeConfig, newAutoForgeState, canAutoForge, recordAutoForge, resolveGapBlockers, isTransientBlocker, type AutoForgeState } from "../self/self-evolution-autoforge.js";
import {
  executorLadder, nextExecutorRung, isBrainInadequate, brainEscalationNudge, formatExecutorEscalation,
  type ExecRung,
} from "../stratege/stratege-escalate.js";
import { runClosureGate, evaluateGate, changedFilesFromTrace } from "../eleve-gate.js";
import { appendBacklog } from "../project-backlog.js";
import { measureProjectDesign, measureSummary } from "../design/design-metrics.js";
import { flag } from "../flags.js";
import { memoireSection, buildMemoireTool, type MemoireDeps } from "../eleve-memoire.js";
import { safeEmbed } from "../notes-rag.js";
import { getBlackboard } from "../kernel/kernel-blackboard.js";
import { ARTIFACT_SCOPE } from "../kernel/kernel-artifacts.js";
import { scanFilesForBalance, formatBalanceRaison } from "../layout-balance.js";
import { isInterrupted } from "../interrupt.js";
import { runAgenticTask, type AgenticBuildResult, type DelegateOverride } from "../eleve-runtime.js";
import { startPreview } from "../preview.js";
import { runParcours } from "../eleve-parcours.js";
import { isMangoQaActive, emitPhaseComplete, waitForVerdict } from "../mangoqa.js";
import { speculativePrepass } from "../eleve-speculative/eleve-speculative-trigger.js";
import { resolveBinding, policyForBinding, type BrainPolicy } from "../brain/brain-runtime.js";
import { getTracer } from "../kernel/kernel-trace.js";
import { listProcedures, loadProcedure } from "../procedures.js";
import { constellationsSection } from "../constellations.js";
// Sous-modules eleve/ (feuille provider + contract + escalade + types).
import { ELEVE_MODEL, ELEVE_PROVIDER_DEFAULT, PROFILE, askEleveDispatch } from "./provider.js";
import { elevePost, supportsTools, askEleveAgentic, AGENTIC_TOOL_CONTRACT, AGENTIC_FALLBACK_SYSTEM, AGENTIC_VISION_CLAUSE } from "./contract.js";
import { escalateToClaude } from "./escalade.js";
import { gitDirtyPaths, hasRealCodeChange } from "../git-signals.js";

import { type RelayResult, type RelayOptions, type RelayDeps } from "./types.js";
import { type RelayContext } from "./relay-config.js";
import { runClosureParcours, runClosureMangoQA } from "./relay-closure.js";

export async function finalizeEscalationPhase(
  ctx: Omit<RelayContext, "finalizeEscalation">,
  lastErr: string,
  attempts: number,
  esc2?: { incomplete?: boolean; eleveSummary?: string },
): Promise<RelayResult> {
  const { task, projectDir, maitreModel, callProfile, deps, push, relayHooks, inspectReady, log } = ctx;
    // #b incrément 2 (reboucle Maître) — le Maître escalade, puis si la clôture (Gardien +
    // teste_parcours + MangoQA) est RED, il RE-CORRIGE avec le feedback précis, borné par
    // ELEVE_GATE_RELANCE_MAX. Gates tous OFF → issues vide → 1 escalade → retour (historique).
    const maxMaitreGate = Number(process.env.ELEVE_GATE_RELANCE_MAX) || 2;
    let feedback = lastErr;
    let axiomAny = false;
    let costTotal = 0;
    // CHANTIER 5b — le TOUR a-t-il produit du code, AVANT que le Maître soit appelé ?
    // (mesure 2026-09-29 : l'Élève écrit ses 19 modules puis atteint son plafond ; le
    // Maître reçoit un projet déjà fait, ne change rien, et le tour — pourtant jouable —
    // était déclaré « aucun fichier modifié »). Comparaison HEAD avant / après : fiable,
    // l'Élève committe son travail (commitVersion) en fin de tour.
    // Vérifié sur le run réel : le commit du projet arrive APRÈS l'escalade, donc
    // HEAD n'a pas encore bougé. Le signal fiable est l'état NON COMMITTÉ du dépôt
    // (les modules écrits par l'Élève y sont encore).
    let eleveCodeChanged = false;
    try {
      eleveCodeChanged = hasRealCodeChange(new Set<string>(), await gitDirtyPaths(projectDir));
    } catch { /* pas un dépôt git : rien de prouvable */ }

    for (let gTour = 0; ; gTour++) {
      push(`⤴ ESCALADE vers le MAÎTRE (Claude/${maitreModel})${gTour > 0 ? ` — re-correction clôture (${gTour}/${maxMaitreGate})` : esc2?.incomplete ? " — TERMINER la tâche" : ""}`);
      void fireObservationHook("OnEscalate", projectDir, feedback || "escalade Maître", relayHooks);
      const esc = await deps.escalate({
        task, projectDir, lastError: feedback, maitreModel, profile: callProfile,
        incomplete: esc2?.incomplete, eleveSummary: esc2?.eleveSummary,
        // CHANTIER 5b — l'Élève a-t-il déjà écrit du code ce tour-ci ? (voir types.ts)
        // Le Maître est appelé APRÈS son plafond : sans ce drapeau, le tour d'un jeu
        // pourtant JOUABLE était déclaré « aucun fichier modifié » (faux négatif).
        codeChangedBefore: eleveCodeChanged,
      });
      axiomAny = axiomAny || esc.axiom;
      costTotal += esc.costUsd;
      const insp = await inspectReady();
      if (!insp.ok) {
        push(`✗ build encore cassé après escalade — échec`);
        return { resolvedBy: "none", attempts, success: false, inspection: insp, axiom: axiomAny, costUsd: costTotal, log, echecCause: "build-casse", maitreAppele: true };
      }
      // (L113, run showcase 2026-07-09) build vert ne suffit PAS : un placeholder
      // jamais touché compile déjà. Sans changement de code réel, ce n'était pas
      // une résolution — c'est un abandon (souvent causé par L112 : le tour a été
      // interrompu avant d'écrire quoi que ce soit) déguisé en succès.
      if (!esc.codeChanged) {
        push(`✗ le Maître n'a modifié AUCUN fichier de code réel — échec (pas une résolution)`);
        // CHANTIER 1 — le build passe ici (on vient de le verifier) : annoncer
        // « le build ne passe pas » etait FAUX. La cause reelle est l'absence de
        // changement de code (un placeholder compile deja).
        return { resolvedBy: "none", attempts, success: false, inspection: insp, axiom: axiomAny, costUsd: costTotal, log, echecCause: "aucun-changement", maitreAppele: true };
      }
      // CHANTIER 5b — DIRE qui a produit le code. Mesure 2026-09-29 : le Maître a été
      // appelé alors que l'Élève venait d'écrire 19 modules (plafond atteint) ; il n'a
      // donc rien changé, et le tour était déclaré « échec » sur un jeu JOUABLE.
      if (!esc.codeChangedByMaitre) {
        push(`ℹ code écrit par l'Élève (le Maître n'avait rien à changer) — le tour compte comme résolu`);
      }
      push(`✓ build vert — résolu par le MAÎTRE${esc.axiom ? " (+1 axiome appris)" : ""}, coût $${esc.costUsd.toFixed(4)}`);

      // CLÔTURE après le Maître (mêmes garde-fous que l'Élève) — collecte les raisons RED.
      const issues: string[] = [];
      if (process.env.ELEVE_CLOSURE_GATE === "on") {
        try {
          const mResult = { text: esc2?.eleveSummary || "résolu par le Maître", toolTrace: [] as Array<{ name: string; args: string }> };
          const verdict = await runClosureGate(projectDir, task, mResult, WORKSPACE_DIR, inferProjectType(task));
          appendBacklog(projectDir, { actor: "Gardien", action: "clôture (après Maître)", detail: verdict.raisons.join(" ; ") || "OK", ok: verdict.ok });
          const goutLabel = verdict.design
            ? verdict.tasteScored
              ? `, goût ${verdict.design.overall}/100${verdict.tasteObserve ? " (observé)" : ""}`
              : ", goût non jugeable"
            : "";
          push(`🛡 Gardien (après Maître) — intention ${verdict.intent.couverture}/100${goutLabel}${verdict.ok ? " ✓" : " ✗"}`);
          // (N9) un volet SAUTÉ pour cause d'incident n'est plus silencieux.
          if (verdict.judgeSkipped) push(`  ⚠ juge d'intention KO (${verdict.judgeSkipped}) — couverture NEUTRE (100), NON vérifiée`);
          if (verdict.critiqueSkipped) push(`  ⚠ critique visuelle KO (${verdict.critiqueSkipped}) — goût + WCAG NON vérifiés ce tour`);
          // (revue 2026-07-03, action #6, constat B) juge ET critique KO ensemble → Gardien
          // dégradé à 2 regex triviales ; toujours visible, bloquant seulement si le gate est ON.
          if (verdict.dualSkip) push(`  ⚠ juge ET critique KO SIMULTANÉMENT — Gardien dégradé (2 regex triviales)${verdict.ok ? " — non bloquant, ELEVE_GATE_DUAL_SKIP_BLOCK=off" : ""}`);
          // (axiome 17, 2026-07-08) signal disponible non exploité — visible, jamais bloquant.
          if (verdict.signalGap) push(`  📶 ${verdict.signalGap}`);
          if (!verdict.ok) issues.push(...(verdict.raisons.length ? verdict.raisons : ["clôture qualité non atteinte"]));
        } catch (e) {
          push(`⚠ Gardien (après Maître) indisponible (${(e as Error).message.split("\n")[0]}) — on laisse passer`);
        }
      }
      if (process.env.ELEVE_GATE_PARCOURS === "on") {
        const pc = await runClosureParcours(projectDir);
        push(`🧭 teste_parcours (après Maître) — ${pc.skipped ? `sauté (${pc.skipped}) — NON vérifié ⚠` : pc.ok ? "aucune erreur console ✓" : `${pc.errors.length} erreur(s) console ✗`}`);
        if (!pc.ok) issues.push(`erreurs console : ${pc.errors.slice(0, 3).join(" | ") || "(voir preview)"}`);
      }
      {
        const qa = await runClosureMangoQA(projectDir);
        if (qa.action || !qa.ok) push(`🥭 MangoQA (après Maître) — ${qa.ok ? "GREEN ✓" : "RED ✗"}`);
        if (qa.skipped) push(`  ⚠ MangoQA KO (${qa.skipped}) — clôture NON vérifiée ce tour`);
        if (!qa.ok) issues.push(`MangoQA : ${qa.action}`);
      }

      if (issues.length === 0) {
        return { resolvedBy: "maitre", attempts, success: true, inspection: insp, axiom: axiomAny, costUsd: costTotal, log };
      }
      if (gTour >= maxMaitreGate) {
        push(`⚠ Clôture encore RED après ${gTour} re-correction(s) du Maître — livré mais INCOMPLET`);
        return { resolvedBy: "maitre", attempts, success: true, inspection: insp, axiom: axiomAny, costUsd: costTotal, log, incomplete: true };
      }
      push(`↻ Clôture RED → le Maître RE-CORRIGE (${gTour + 1}/${maxMaitreGate})`);
      feedback = `Le livrable compile mais ne passe pas la clôture qualité : ${issues.join(" ; ")}. Corrige EXACTEMENT ces points et garde le build vert.`;
    }
}
