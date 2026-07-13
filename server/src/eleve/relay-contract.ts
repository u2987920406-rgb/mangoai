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
import { buildEleveUser } from "./relay-prompt.js";
import { type RelayContext } from "./relay-config.js";

export async function runContractPath(ctx: RelayContext): Promise<RelayResult> {
  const {
    task, projectDir, callProfile, callModel, callAskEleve, callMaxAttempts, callCaps,
    injectMeans, functionalGate, functionalMin, deps, push, inspectReady, finalizeEscalation, log,
  } = ctx;
  // ── Passe d'EXPLORATION agentique (Phase 1 — vers « Mango = Claude ») ─────────
  // Pour un cerveau assez fort (profil `agentic`, ex. GLM), on le laisse d'abord
  // EXPLORER le projet avec ses outils (read/list/search) et résumer ce qui compte
  // pour la tâche — comme Claude « regarde avant de coder ». Le résumé enrichit le
  // contexte de génération. ADDITIF, gaté (GLM seul), JAMAIS bloquant (un échec
  // retombe sur le chemin contrat normal). Opt-out global : ELEVE_AGENTIC=off.
  let explorationNote = "";
  if (callProfile.agentic && process.env.ELEVE_AGENTIC !== "off") {
    try {
      push("🔎 Exploration agentique du projet (outils)…");
      const reg = buildEleveTools(projectDir);
      const explore = await askEleveAgentic(
        "Tu es un développeur qui PRÉPARE une tâche. Explore le projet avec tes outils (read_file, list_files, search_code) pour comprendre ce qui est pertinent. Termine par un RÉSUMÉ bref et factuel : fichiers clés, structure, points à connaître pour réaliser la tâche. N'écris AUCUN code ici, ne propose pas de solution — juste ce que tu as constaté.",
        `Tâche à préparer : ${task}`,
        reg,
        { model: callModel, onTool: (n, a) => push(`  🔧 ${n} ${a.slice(0, 120)}`) },
      );
      explorationNote = explore.text.trim();
      push(`✓ Exploration : ${explore.toolTrace.length} appel(s) d'outil, contexte prêt`);
    } catch (e) {
      push(`⚠ Exploration agentique sautée (${(e as Error).message}) — on continue sans.`);
    }
  }

  let lastError = "";
  let lastInspection: Inspection = { ok: false, signal: "build-failed", detail: "", durationMs: 0 };

  for (let attempt = 1; attempt <= callMaxAttempts; attempt++) {
    push(`Tentative ${attempt}/${callMaxAttempts} — l'Élève (${callModel}) travaille…`);

    let raw: string;
    try {
      raw = await callAskEleve(callProfile.system, buildEleveUser(task, projectDir, lastError, injectMeans, callCaps, explorationNote));
    } catch (e) {
      lastError = `appel Élève impossible : ${(e as Error).message}`;
      push(`✗ ${lastError}`);
      continue;
    }

    const parsed = parseContract(raw);
    if (!parsed.ok) {
      lastError = `réponse hors-contrat : ${parsed.error}`;
      push(`✗ ${lastError}`);
      continue;
    }
    push(`Plan reçu (${parsed.actions.length} action(s))${parsed.repaired ? " [réparé]" : ""}`);

    const exec = await executeContract(parsed.actions, projectDir);
    if (!exec.ok) {
      const failed = exec.outcomes.find((o) => o.status === "failed");
      lastError = `exécution échouée : ${failed && "error" in failed ? failed.error : "?"}`;
      push(`✗ ${lastError}`);
      continue;
    }

    lastInspection = await inspectReady();
    if (lastInspection.ok) {
      // #104 Phase 2 — porte FONCTIONNELLE : un build vert ne suffit pas si l'app
      // est vide. Si la porte est active ET qu'un juge est fourni ET qu'il reste
      // des tentatives, on vérifie le score fonctionnel ; trop bas → on RELANCE
      // l'Élève avec un feedback STRUCTURÉ (ce qui manque + comment), pas
      // « réessaie ». Sans judge (cas par défaut) la porte est inerte.
      if (functionalGate && deps.judge && attempt < callMaxAttempts) {
        let verdict: { fonctionnel: number; note: string } | null = null;
        try { verdict = await deps.judge(projectDir, task); } catch { verdict = null; }
        if (verdict && verdict.fonctionnel < functionalMin) {
          lastError =
            `Le build PASSE mais l'app est FONCTIONNELLEMENT INCOMPLÈTE ` +
            `(score fonctionnel ${verdict.fonctionnel}/10 < ${functionalMin} requis). ` +
            `Ne te contente JAMAIS d'un projet qui compile et ne livre JAMAIS le template de démo : ` +
            `IMPLÉMENTE réellement CHAQUE fonctionnalité de la tâche (interactions au clic, états, ` +
            `persistance, validation — pas du décoratif). Diagnostic : ${verdict.note}`;
          push(`⚠ build vert MAIS fonctionnel ${verdict.fonctionnel}/10 < ${functionalMin} — relance avec feedback structuré`);
          continue;
        }
      }
      push(`✓ build vert — résolu par l'ÉLÈVE en ${attempt} tentative(s), coût 0`);
      return { resolvedBy: "eleve", attempts: attempt, success: true, inspection: lastInspection, axiom: false, costUsd: 0, log };
    }
    lastError = `build cassé (${lastInspection.signal}) : ${lastInspection.detail.slice(-300)}`;
    push(`✗ inspection objective : ${lastInspection.signal}`);
  }

  // ── Escalade vers le Maître — OPT-IN strict (défaut OFF, souveraineté 2026-07-13) ──
  if (process.env.ELEVE_ESCALATE_ON_BLOCK === "on") {
    push(`⤴ ${callMaxAttempts} échec(s) objectif(s) — escalade (opt-in)…`);
    return await finalizeEscalation(lastError, callMaxAttempts);
  }
  push(`✗ ${callMaxAttempts} échec(s) objectif(s), toujours cassé — j'ai vraiment essayé seul. ${lastError.slice(0, 300)}`);
  return { resolvedBy: "none", attempts: callMaxAttempts, success: false, inspection: lastInspection, axiom: false, costUsd: 0, log, incomplete: true };
}
