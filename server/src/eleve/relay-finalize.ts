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
    for (let gTour = 0; ; gTour++) {
      push(`⤴ ESCALADE vers le MAÎTRE (Claude/${maitreModel})${gTour > 0 ? ` — re-correction clôture (${gTour}/${maxMaitreGate})` : esc2?.incomplete ? " — TERMINER la tâche" : ""}`);
      void fireObservationHook("OnEscalate", projectDir, feedback || "escalade Maître", relayHooks);
      const esc = await deps.escalate({
        task, projectDir, lastError: feedback, maitreModel, profile: callProfile,
        incomplete: esc2?.incomplete, eleveSummary: esc2?.eleveSummary,
      });
      axiomAny = axiomAny || esc.axiom;
      costTotal += esc.costUsd;
      const insp = await inspectReady();
      if (!insp.ok) {
        push(`✗ build encore cassé après escalade — échec`);
        return { resolvedBy: "none", attempts, success: false, inspection: insp, axiom: axiomAny, costUsd: costTotal, log };
      }
      // (L113, run showcase 2026-07-09) build vert ne suffit PAS : un placeholder
      // jamais touché compile déjà. Sans changement de code réel, ce n'était pas
      // une résolution — c'est un abandon (souvent causé par L112 : le tour a été
      // interrompu avant d'écrire quoi que ce soit) déguisé en succès.
      if (!esc.codeChanged) {
        push(`✗ le Maître n'a modifié AUCUN fichier de code réel — échec (pas une résolution)`);
        return { resolvedBy: "none", attempts, success: false, inspection: insp, axiom: axiomAny, costUsd: costTotal, log };
      }
      push(`✓ build vert — résolu par le MAÎTRE${esc.axiom ? " (+1 axiome appris)" : ""}, coût $${esc.costUsd.toFixed(4)}`);

      // CLÔTURE après le Maître (mêmes garde-fous que l'Élève) — collecte les raisons RED.
      const issues: string[] = [];
      { // Gardien de clôture : figé ON en dur au lot 2 (refonte v3, mesuré le 2026-08-05).
        try {
          const mResult = { text: esc2?.eleveSummary || "résolu par le Maître", toolTrace: [] as Array<{ name: string; args: string }> };
          const verdict = await runClosureGate(projectDir, task, mResult, WORKSPACE_DIR, inferProjectType(task), {}, deps.gateDeps);
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
      { // Figé ON au lot 2 (refonte v3) — tournait déjà, gate retiré.
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
