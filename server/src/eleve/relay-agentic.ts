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
import { curateImageBank, guaranteeLocalImages, formatImageBankForPrompt, formatGuarantee, type ImageBankEntry } from "../eleve-image-bank.js";
import { diagnose, formatDiagnosis, shouldStopRetrying, type BlockerClass, type Diagnosis } from "../stratege/stratege-signals.js";
import { route, newStrategeState, commitRemedy, formatRemedy, type StrategeState } from "../stratege.js";
import { recallProcedure, distillProcedure, learnedHint } from "../stratege/stratege-learn.js";
import { reclassifyAmbiguous, formatReclassify } from "../stratege/stratege-brain.js";
import { consultSpecialist, buildDelegateNudge, buildForgedResumeNudge } from "../specialist/specialist-delegate.js";
import { runSpecialistAgentic } from "../specialist/specialist-agentic.js";
import { recordUncoveredGap, markGap, getGap, recordForgeAttempt, forgeAttemptsExhausted, gapValueScore } from "../self/self-evolution.js";
import { loadSpecialists, recordSpecialistWin } from "../specialist/specialist-agents.js";
import { forgeForGap } from "../agent/agent-forge.js";
import { autoForgeConfig, newAutoForgeState, canAutoForge, recordAutoForge, resolveGapBlockers, isTransientBlocker, type AutoForgeState } from "../self/self-evolution-autoforge.js";
import {
  executorLadder, nextExecutorRung, isBrainInadequate, brainEscalationNudge, formatExecutorEscalation,
  type ExecRung,
} from "../stratege/stratege-escalate.js";
import { runClosureGate, evaluateGate, changedFilesFromTrace, readFilesFromTrace } from "../eleve-gate.js";
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
import { elevePost, supportsTools, askEleveAgentic, AGENTIC_TOOL_CONTRACT, AGENTIC_FALLBACK_SYSTEM, AGENTIC_VISION_CLAUSE, ELEVE_BUILDER_PROMPT, ELEVE_CONTROLEUR_PROMPT } from "./contract.js";
import { brainArchitectureClause } from "../capabilities.js";
import { escalateToClaude } from "./escalade.js";
import { type RelayResult, type RelayOptions, type RelayDeps } from "./types.js";
import { buildEleveUser } from "./relay-prompt.js";
import { measureCraftSummary, runClosureParcours, runClosureMangoQA } from "./relay-closure.js";
import { type RelayContext } from "./relay-config.js";

/** (A1.2) Câblage RÉEL des deps de mémoire : embarque via nomic (safeEmbed,
 *  fail-open → null) et cherche dans le Blackboard partagé (scope des artefacts
 *  design appris cross-projet). Le cœur d'eleve-memoire reste pur/testable ;
 *  seul ce câblage tire la plomberie réelle. */
function realMemoireDeps(): MemoireDeps {
  return {
    embed: (text: string) => safeEmbed(text),
    search: (vec: number[], k: number) => getBlackboard().search(ARTIFACT_SCOPE, vec, k),
  };
}

// (Phase 3b) Chargement IDEMPOTENT des outils MCP externes. La connexion stdio aux
// serveurs (Blender/GIMP/Inkscape) est async ; on la fait une seule fois puis on alimente
// le cache synchrone de eleve-action-tools. No-op immédiat si ELEVE_MCP_EXTERNAL!=on.
let externalMcpLoaded = false;
async function ensureExternalMcpLoaded(): Promise<void> {
  if (externalMcpLoaded || process.env.ELEVE_MCP_EXTERNAL !== "on") return;
  externalMcpLoaded = true; // pose le drapeau d'abord → pas de double connexion en parallèle
  try {
    const loaded = await loadExternalMcpTools(defaultMcpConfigPath());
    setExternalMcpTools(loaded.tools);
  } catch {
    /* serveurs MCP HS → on continue sans (zéro blocage du moteur) */
  }
}

export async function runAgenticEngine(ctx: RelayContext): Promise<RelayResult> {
  const {
    task, projectDir, opts, deps,
    callProfile, callModel, callProvider, callEndpoint, callPolicy, callCaps,
    injectMeans, push, relayHooks, inspectReady, finalizeEscalation, log,
  } = ctx;
    push(`🤖 Moteur agentique — l'Élève (${callModel}) construit avec ses outils…`);

    // (#171) PRÉ-PASSE SPÉCULATIF — opt-in `ELEVE_SPECULATIVE=on`, défaut OFF → ZÉRO régression.
    // Le cerveau frugal drafte une séquence d'étapes, on l'exécute en worktree isolé et on applique
    // le préfixe accepté ; la boucle séquentielle ci-dessous reprend depuis l'état appliqué. Ne casse
    // JAMAIS le build (try/catch + ne lève jamais). Jamais en test (transport injecté).
    if (process.env.ELEVE_SPECULATIVE === "on" && !deps.agenticPost) {
      try {
        const sp = await speculativePrepass(task, projectDir);
        if (sp.ran && sp.appliedFiles.length) {
          push(
            `⚡ Spéculation : ${sp.accepted}/${sp.drafted} étapes acceptées, ` +
            `${sp.appliedFiles.length} fichier(s) appliqué(s), ${sp.savedRoundTrips} tour(s) économisé(s)` +
            `${sp.escalate ? " — divergence, la boucle reprend la main" : ""}`,
          );
        } else {
          push(`⚡ Spéculation : ${sp.reason || "aucun gain"} → mode séquentiel`);
        }
      } catch {
        /* la spéculation est best-effort : un échec n'affecte pas le build séquentiel */
      }
    }

    const systemBase = opts.systemFull ?? AGENTIC_FALLBACK_SYSTEM;
    // (2026-07-12) défaut ON — Claude a mcp__vision__snapshot en PERMANENCE
    // (agent.ts), l'Élève n'avait vois_ecran QUE si ELEVE_VISION=on explicite
    // (opt-in). qwen3-vl:8b (vision, $0 local) validé fiable cette nuit → plus
    // de raison de coût de garder ce gate fermé. Coupure ELEVE_VISION=off si besoin.
    const visionClause = process.env.ELEVE_VISION !== "off" ? AGENTIC_VISION_CLAUSE : "";
    // (2026-07-12) Conscience de l'architecture multi-cerveaux, TOUJOURS injectée
    // (indépendante d'ELEVE_VISION) : même sans vois_ecran offert ce tour-ci, le
    // cerveau doit savoir que le SYSTÈME a un cerveau vision, pas juste lui. Voir
    // capabilities.ts pour le cas réel qui a motivé ce correctif.
    let brainClause = "";
    try { brainClause = brainArchitectureClause(); } catch { brainClause = ""; }
    // (A1.2/B1.3, 2026-07-03) Rappel PROACTIF de la mémoire cross-projet : on
    // embarque la tâche, on cherche les souvenirs pertinents (palettes/artefacts
    // appris) et on les injecte en section BORNÉE. FIGÉ ON au lot 2 — le flag n'existe plus,
    // le rappel est inconditionnel. Fail-open : jamais bloquant (memoireSection
    // rend "" si Ollama/Blackboard indispo). Jamais en test (transport injecté).
    let memoireClause = "";
    if (!deps.agenticPost) {
      try {
        memoireClause = await memoireSection(task, realMemoireDeps());
        if (memoireClause) push("  🧠 Mémoire : souvenirs pertinents injectés");
      } catch { memoireClause = ""; }
    }
    // (L123) Banque d'images LOCALES : on télécharge de VRAIES photos Pexels AVANT que
    // l'Élève code et on les injecte (« utilise EXACTEMENT ces chemins »). `imageBank`
    // est capturé par closure pour le filet de clôture (guaranteeLocalImages, plus bas).
    // Gaté ELEVE_IMAGE_BANK (défaut ON), jamais en test. Fail-open : sans clé Pexels /
    // réseau coupé → banque vide → system identique, aucune régression.
    let imagesClause = "";
    let imageBank: ImageBankEntry[] = [];
    if (process.env.ELEVE_IMAGE_BANK !== "off" && !deps.agenticPost) {
      try {
        imageBank = await curateImageBank(task, projectDir);
        imagesClause = formatImageBankForPrompt(imageBank);
        if (imageBank.length) push(`  🖼 Banque d'images : ${imageBank.length} vraies photos téléchargées dans public/images/`);
      } catch { imagesClause = ""; imageBank = []; }
    }
    const agenticSystem = `${systemBase}\n\n${AGENTIC_TOOL_CONTRACT}${visionClause}${brainClause}${memoireClause}${imagesClause}`;
    let user = buildEleveUser(task, projectDir, "", injectMeans, callCaps, "", true);
    // Phase E3 — un sous-agent peut prendre SON cerveau via agentType (= intention),
    // seulement s'il est explicitement routé, agentique et openai-compat ; sinon il
    // hérite du cerveau du parent (Phase D). En test (transport injecté), pas de switch.
    // Personas de sous-agents FIXES (2026-07-11, #182 suite) — équivalent Élève
    // des sous-agents Claude AGENTS.builder/AGENTS.controleur (agent.ts:91-104) :
    // même worker/cerveau que le parent (pas de changement de brain), mais un
    // system prompt dédié + toolset restreint (allowRun:false = pas de
    // run_command, comme Claude qui les prive de Bash — évite que des builders
    // parallèles se battent sur npm/le serveur de dev).
    const PERSONAS: Record<string, string> = { builder: ELEVE_BUILDER_PROMPT, controleur: ELEVE_CONTROLEUR_PROMPT };
    const resolveDelegateCtx = (agentType: string): DelegateOverride | null => {
      if (deps.agenticPost) return null;
      if (agentType === "builder" || agentType === "controleur") {
        return {
          system: `${agenticSystem}\n\n${PERSONAS[agentType]}`,
          post: elevePost(callModel, callProvider, callEndpoint),
          buildRegistry: (pd) => buildEleveActionTools(pd, { allowRun: false }),
          buildUser: (subtask) => buildEleveUser(subtask, projectDir, "", injectMeans, callCaps, "", true),
          allowDelegate: false,
          label: agentType,
        };
      }
      if (agentType !== "construire" && agentType !== "planifier" && agentType !== "discuter") return null;
      const b = resolveBinding(agentType);
      if (!b.card || !b.profile.agentic || !supportsTools(b.provider)) return null;
      const pol = policyForBinding(b);
      return {
        system: agenticSystem,
        post: elevePost(b.model, b.provider, { baseUrl: b.baseUrl, apiKeyEnv: b.apiKeyEnv }),
        buildRegistry: (pd) => buildEleveActionTools(pd, { allowRun: pol.allowRun }),
        buildUser: (subtask) => buildEleveUser(subtask, projectDir, "", injectMeans, callCaps, "", true),
        allowDelegate: pol.allowDelegate,
        label: b.card.label,
      };
    };
    // (Phase 3b) Pré-charge UNE fois les outils MCP externes (Blender/GIMP/Inkscape) avant
    // de bâtir le registre synchrone. Gaté ELEVE_MCP_EXTERNAL=on (sinon no-op immédiat) et
    // déduit du transport réel uniquement hors test (deps.agenticPost = transport injecté).
    if (!deps.agenticPost) await ensureExternalMcpLoaded();

    // Contexte commun à chaque (re)lancement du moteur. Seul le prompt `user`
    // change entre relances (on y ajoute un coup de pouce) — d'où l'extraction ici.
    // (A1.2) Enregistre l'outil `memoire_rappel` dans le registre construit, pour
    // que l'Élève interroge sa mémoire EN COURS de boucle. Figé ON au lot 2.
    const withMemoire = (pd: string, allowRun: boolean): ReturnType<typeof buildEleveActionTools> => {
      const reg = buildEleveActionTools(pd, { allowRun });
      if (!deps.agenticPost) {
        try { for (const t of buildMemoireTool(realMemoireDeps())) reg.register(t); } catch { /* mémoire best-effort */ }
      }
      return reg;
    };
    const runCtx = {
      projectDir,
      system: agenticSystem,
      post: deps.agenticPost ?? elevePost(callModel, callProvider, callEndpoint),
      buildRegistry: (pd: string) => withMemoire(pd, callPolicy.allowRun),
      buildUser: (subtask: string) => buildEleveUser(subtask, projectDir, "", injectMeans, callCaps, "", true),
      depth: 0,
      maxDepth: Number(process.env.ELEVE_DELEGATE_MAX_DEPTH ?? 2),
      budget: { spawned: 0, max: Number(process.env.ELEVE_DELEGATE_MAX_AGENTS ?? 4) },
      allowDelegate: callPolicy.allowDelegate,
      resolveDelegateCtx,
      tracer: getTracer(),
      onTool: (n: string, a: string) => push(`  🔧 ${n} ${a.slice(0, 100)}`),
      onLog: push,
      // (#160/L17) L'ancre EN COURS de boucle : si l'Élève a posé un plan, les gardes
      // anti-sur-exploration le lui rappellent (en plus du nudge d'auto-relance).
      planReminder: () => {
        const p = getPlan(projectDir);
        return p ? formatPlanReminder(p) : "";
      },
      // Stop coopératif : la boucle (et les sous-agents) sortent proprement dès que
      // l'utilisateur clique « Stop » (/api/stop → requestInterrupt). Closure
      // surchargeable pour les tests (deps.shouldAbort).
      shouldAbort: deps.shouldAbort ?? isInterrupted,
      // (#172) Hooks projet chargés en tête de run (relayHooks) — undefined si aucun.
      hooks: relayHooks.length ? relayHooks : undefined,
      // (B0.1 câblé en prod — revue Fable 🟠1) Le fusible de coût de la boucle,
      // opt-in par env : absent = strictement inerte (comportement identique).
      // ELEVE_BUDGET_PROMPT_CHARS = plafond du poids contexte cumulé ;
      // ELEVE_BUDGET_TOOL_CALLS = plafond du nombre total d'appels d'outils.
      loopBudget: (() => {
        const chars = Number(process.env.ELEVE_BUDGET_PROMPT_CHARS ?? 0);
        const calls = Number(process.env.ELEVE_BUDGET_TOOL_CALLS ?? 0);
        if (chars > 0 || calls > 0) {
          return { ...(chars > 0 ? { maxPromptChars: chars } : {}), ...(calls > 0 ? { maxToolCalls: calls } : {}) };
        }
        return undefined;
      })(),
      actorLabel: `Élève (${callModel})`, // (#183) boîte noire projet
    };

    // RÉVISION 2026-06-24 — « apprendre, pas secourir » (souveraineté). Sur blocage
    // build-vert, AU LIEU de courir vers Claude, on AUTO-RELANCE l'Élève (GLM, classe
    // Fable 5) avec un coup de pouce « arrête de lire, AGIS et termine » — il finit
    // LUI-MÊME, à coût 0. L'escalade Claude devient un dernier recours OPT-IN.
    // Budget d'AUTO-RELANCE quand l'Élève finit en build-vert sans appeler `finish`
    // (cas bénin : l'app compile/marche, GLM a juste « oublié » de conclure — L17/L35).
    // Décision de Raf (2026-06-27) : « continuer seul jusqu'au bout » plutôt que de
    // lui redemander à chaque fois. Relevé 2 → 6 ; le garde-fou anti-emballement est
    // désormais le bouton **Stop** (qui marche enfin) entre les mains de l'utilisateur.
    // (2026-07-13) Relevé 6 → 10 : Claude n'est plus le filet par défaut (ELEVE_ESCALATE_
    // TO_CLAUDE=off, voir plus bas) — l'Élève doit aller PLUS loin seul avant de rendre
    // la main, chaque relance restant $0/locale (le coût est juste du temps).
    const selfRelanceMax = Number(process.env.ELEVE_SELF_RELANCE_MAX ?? 10);
    let agErr = "";
    let result: AgenticBuildResult | null = null;
    let insp: Inspection = { ok: false, signal: "build-failed", detail: "", durationMs: 0 };
    let relances = 0;
    let nudge = "";
    // #196 partie C — règle des 3 essais : compteur LOCAL par SIGNATURE de blocage,
    // séparé de `relances`/`selfRelanceMax` (qui bornent le total, toutes causes
    // confondues). Remis à 0 dès que la classe diagnostiquée change.
    let consecutiveSameBlocker = 0;
    let lastBlockerClass: BlockerClass | null = null;
    // #161 — Gardien de clôture : compteur de corrections SÉPARÉ de selfRelanceMax
    // (les tours du Gardien ne consomment pas le budget anti-blocage). Gaté + non-bloquant.
    // 🟡 (revue #13.2) DOUBLES COMPTEURS : relances/selfRelanceMax ET gateRelances/gateRelanceMax
    // font la même chose en parallèle. Balance scannée 2× (garde autonome + gate post-Maître).
    // Trace réelle passée au gate post-Maître (ligne 1186) : toolTrace:[] (vide, vs trace réelle).
    // Unification en UN SEUL budget + passe vraie trace → backlog futur (cross-cutting complexe).
    let gateRelances = 0;
    const gateRelanceMax = Number(process.env.ELEVE_GATE_RELANCE_MAX ?? 2);
    // (L28) Anti-thrash : mémoire du goût du tour Gardien précédent pour ne pas relancer
    // en boucle sur un score VL qui ne progresse pas.
    let prevGateGout: number | null = null;
    // #164 « Le Stratège » — diagnostic déterministe ($0 réel) du blocage + (Phase 1)
    // ROUTAGE vers un remède CHOISI. Modes (`ELEVE_STRATEGE`) : `off` (défaut, rien) ·
    // `observe` (Phase 0 : log la cause, n'agit pas) · `on` (Phase 1 : log + AGIT —
    // installe la dépendance manquante, ou injecte un nudge ciblé). Borné par strategeState
    // (budget de déblocage + pas deux fois le même remède → aucune boucle).
    const strategeMode = (process.env.ELEVE_STRATEGE ?? "off").toLowerCase();
    const strategeLogs = strategeMode === "observe" || strategeMode === "on";
    const strategeActs = strategeMode === "on";
    // slice 2 (L48b) — DÉLÉGATION RÉELLE : sur plateau-iterations, le Stratège invoque le
    // spécialiste forgé pertinent (au lieu du seul nudge « décompose »). Gaté, défaut off.
    const delegateOn = strategeActs && (process.env.ELEVE_DELEGATE ?? "off").toLowerCase() === "on";
    // #175 — DÉLÉGATION D'EXÉCUTION : un spécialiste forgé en mode "action" AGIT (sa propre
    // boucle agentique, outils SCELLÉS par sa toolPolicy, budget réduit) au lieu de conseiller.
    // Gaté `ELEVE_DELEGATE_AGENTIC` (défaut off) → sans lui, consultSpecialist reste sur le
    // conseil texte (zéro régression). Le câblage (askEleveAgentic + registre action confiné au
    // projet) est fourni ICI et capturé par closure ; consultSpecialist choisit le runner selon
    // le mode de l'agent matché.
    const delegateAgenticRunner =
      process.env.ELEVE_DELEGATE_AGENTIC === "on"
        ? (id: string, subtask: string) =>
            runSpecialistAgentic(id, subtask, projectDir, {
              agentic: askEleveAgentic,
              buildTools: buildEleveActionTools,
            }).then((r) => ({ ok: r.ok, text: r.text }))
        : undefined;
    // #168 — Boucle d'AUTO-ÉVOLUTION (semi-auto). Quand un blocage n'est couvert par AUCUN
    // agent forgé, on l'inscrit comme lacune ouverte (store machine) → Mango PROPOSE, Raf
    // valide → le forgeron crée l'agent. Gaté, défaut off (zéro régression).
    const selfEvolveOn = (process.env.SELF_EVOLVE ?? "off").toLowerCase() !== "off";
    // Blocages = « mur de CAPACITÉ » (l'Élève est genuinement coincé) → dignes d'une lacune.
    // On EXCLUT les transitoires/auto-résolus : flaky-resource (réseau), missing/install-
    // dependency (l'install les règle), stratege-*/ambiguous (méta). Dédup : une lacune par
    // type et par build (évite le spam ; le compteur `hits` du store agrège les builds).
    // #168 tranche 3 — trigger PILOTABLE par env (SELF_EVOLVE_BLOCKERS, CSV). Défaut = les
    // classes « mur de capacité » (dont repetitive-failure). Élargir/restreindre sans recompiler.
    const GAP_WORTHY_BLOCKERS = resolveGapBlockers();
    const seenGapBlockers = new Set<string>();
    // #168 tranche 2 — DISJONCTEUR de la forge auto (« frein avant moteur »). La forge ne s'arme
    // seule que si `SELF_EVOLVE_AUTO=on` ET sous plafond de forges/run + garde-coût Opus. Défaut
    // OFF → comportement tranche 1 inchangé (Mango propose, Raf valide). État par run.
    const autoForgeCfg = autoForgeConfig();
    let autoForgeState: AutoForgeState = newAutoForgeState();
    // (2026-07-07, revue Fable — recommandation #1) Plafond de TENTATIVES d'auto-forge par
    // lacune, cross-run — sans lui, une lacune dont la forge échoue re-dépense de l'Opus à
    // CHAQUE run, indéfiniment (autoForgeState est neuf à chaque run, rien d'autre ne freine).
    const maxForgeAttempts = Math.max(0, Math.floor(Number(process.env.SELF_EVOLVE_MAX_FORGE_ATTEMPTS ?? 3)) || 3);
    // #196 (2026-07-22, demande de Raf) — SELF_EVOLVE_MIN_SCORE : la forge auto n'attend plus
    // seulement le disjoncteur de coût, elle attend aussi que `gapValueScore` (récurrence −
    // échecs − fraîcheur) dépasse ce seuil. Défaut 60 = ~3 récurrences fraîches sans échec
    // préalable (min(3,5)×20 − 0 − 0 = 60) : on ne grille plus la tentative auto sur la toute
    // première rencontre d'un blocage jamais confirmé récurrent. Le bouton manuel « Forger
    // l'agent » reste, lui, TOUJOURS disponible quel que soit le score — ce seuil ne borne que
    // le chemin SANS clic.
    const minAutoForgeScore = Math.max(0, Math.min(100, Number(process.env.SELF_EVOLVE_MIN_SCORE ?? 60) || 60));
    const strategeState: StrategeState = newStrategeState();
    // #164 Phase 2 — APPRENTISSAGE (gaté `ELEVE_STRATEGE_LEARN`, défaut off) : un remède qui
    // DÉBLOQUE est distillé en procédure #75 ; au prochain blocage du même type on la RAPPELLE.
    const strategeLearns = strategeActs && process.env.ELEVE_STRATEGE_LEARN === "on";
    // #164 Phase 3 — CERVEAU pour les cas AMBIGUS (gaté `ELEVE_STRATEGE_BRAIN`, défaut off).
    // `observe` : consulte le cerveau et LOG la reclassification, mais ne route pas dessus ;
    // `on` : consulte + ROUTE sur la classe raffinée (nécessite strategeActs). Escalade cloud
    // (barreau 2) opt-in séparé `STRATEGE_BRAIN_ESCALATE=on` (souverain par défaut : local seul).
    const strategeBrainMode = (process.env.ELEVE_STRATEGE_BRAIN ?? "off").toLowerCase();
    const strategeBrainObserves = strategeLogs && (strategeBrainMode === "observe" || strategeBrainMode === "on");
    const strategeBrainActs = strategeActs && strategeBrainMode === "on";
    const strategeEscalateCloud = process.env.STRATEGE_BRAIN_ESCALATE === "on";
    // #164 Phase 4 — ÉCHELLE D'ESCALADE DE L'EXÉCUTANT (gaté `ELEVE_BRAIN_ESCALATE`, défaut
    // off). Sur `brain-inadequate` (un blocage récidive après que SON remède a déjà été
    // tenté → le cerveau de l'Élève ne suffit pas pour CE projet), on MONTE le cerveau d'un
    // cran (barreau supérieur configurable) au lieu d'abandonner vers Claude. Borné par la
    // longueur de l'échelle (aucune boucle), jamais de descente. Claude reste un filet SÉPARÉ.
    const brainEscalateOn = process.env.ELEVE_BRAIN_ESCALATE === "on";
    const execLadder: ExecRung[] = executorLadder({ model: callModel, provider: callProvider });
    let execTier = 0; // barreau courant de l'exécutant (0 = cerveau de départ)
    const projectLabel = path.basename(projectDir);
    // Remède appliqué EN ATTENTE d'apprentissage : on ne distille QUE s'il mène au succès.
    // Object-ref (pas un `let`) : assigné dans une closure → TS ne le narrow pas à null.
    // (revue Fable #3) `agentId` optionnel : quand le remède en attente vient d'une délégation
    // à un spécialiste forgé, un succès qui suit attribue un WIN à CET agent précis (scorecard).
    const pendingLearn: { current: { d: Diagnosis; label: string; agentId?: string } | null } = { current: null };
    // (revue Fable #3) Winrate minimal + seuil d'échantillon avant de filtrer un agent forgé
    // du matching — un agent tout juste forgé (0-3 usages) n'est jamais jugé sur du bruit.
    const delegateMinWinrate = Number(process.env.ELEVE_DELEGATE_MIN_WINRATE ?? 0.25);
    const delegateMinUses = Math.max(1, Math.floor(Number(process.env.ELEVE_DELEGATE_MIN_USES ?? 4)) || 4);
    // Applique un remède : mémorise pour l'apprentissage + (Phase 2) préfixe la procédure
    // déjà apprise pour ce blocage si elle existe ("déjà vu ?"). Renvoie le nudge enrichi.
    const applyRemedyNudge = async (d: Diagnosis, label: string, baseNudge: string): Promise<string> => {
      pendingLearn.current = { d, label };
      // (L56) Ré-ancre le plan EXISTANT sur toute relance « remède » (decompose, etc.) :
      // on rappelle la progression (☑/☐) + la prochaine étape non cochée pour que l'Élève
      // REPRENNE son plan au lieu de le refaire et de réécrire les modules déjà bons.
      const plan = getPlan(projectDir);
      const anchored = plan ? `${formatPlanReminder(plan)}\n\n${baseNudge}` : baseNudge;
      if (!strategeLearns) return anchored;
      try {
        const recalled = await recallProcedure(WORKSPACE_DIR, d);
        if (recalled) {
          push(`  📚 Stratège se souvient : « ${recalled.name} » (déjà débloqué)`);
          return `${learnedHint(recalled)}\n\n${anchored}`;
        }
      } catch {
        /* le rappel est best-effort, ne casse jamais la boucle */
      }
      return anchored;
    };
    // Diagnostique le blocage courant (et le log si activé). Retourne le diagnostic pour
    // que les points d'intégration puissent router (Phase 1). Ne casse jamais la boucle.
    const strategeDiagnose = (deadImages = 0): Diagnosis | null => {
      if (!strategeLogs) return null;
      try {
        const d = diagnose({
          buildOk: insp.ok,
          finished: !!result?.finished,
          stuck: !!result?.stuck,
          iterations: result?.iterations ?? 0,
          maxIterations: Number(process.env.ELEVE_AGENTIC_MAX_ITER ?? 24),
          buildDetail: insp.detail,
          toolNames: (result?.toolTrace ?? []).map((t) => t.name),
          task,
          deadImages,
        });
        const line = formatDiagnosis(d);
        if (line) push(`  ${line}`);
        return d;
      } catch {
        return null; /* l'observation ne casse jamais la boucle */
      }
    };
    // #164 Phase 3 — diagnostic + (si AMBIGU et cerveau activé) reclassification via
    // l'échelle d'escalade bornée (barreau 1 gemma4:12b LOCAL $0 → barreau 2 cloud opt-in).
    // Renvoie le diagnostic RAFFINÉ si le cerveau a tranché (et le mode `on`), sinon le
    // diagnostic déterministe d'origine. Ne casse jamais la boucle.
    const strategeDiagnoseRefined = async (deadImages = 0): Promise<Diagnosis | null> => {
      const d = strategeDiagnose(deadImages);
      if (!d || d.blocker !== "ambiguous" || !strategeBrainObserves) return d;
      try {
        const refined = await reclassifyAmbiguous(
          {
            buildOk: insp.ok,
            finished: !!result?.finished,
            stuck: !!result?.stuck,
            iterations: result?.iterations ?? 0,
            maxIterations: Number(process.env.ELEVE_AGENTIC_MAX_ITER ?? 24),
            buildDetail: insp.detail,
            toolNames: (result?.toolTrace ?? []).map((t) => t.name),
            task,
            deadImages,
          },
          { escalateCloud: strategeEscalateCloud },
        );
        push(`  ${formatReclassify(d.blocker, refined)}`);
        // En mode `observe`, on log mais on ne route PAS sur la classe raffinée.
        return strategeBrainActs && refined ? refined : d;
      } catch {
        return d; // la reclassification ne casse jamais la boucle
      }
    };
    // #196 partie C — diagnostique ET met à jour le compteur de répétition (même
    // classe de blocage que le tour précédent = incrémente, sinon reset à 1). Les
    // DEUX points d'appel de la boucle passent par ici pour que le compteur soit
    // cohérent quel que soit le côté (build cassé / build vert non-fini).
    const diagnoseAndTrack = async (deadImages = 0): Promise<Diagnosis | null> => {
      const d = await strategeDiagnoseRefined(deadImages);
      if (d) {
        consecutiveSameBlocker = d.blocker === lastBlockerClass ? consecutiveSameBlocker + 1 : 1;
        lastBlockerClass = d.blocker;
      } else {
        consecutiveSameBlocker = 0;
        lastBlockerClass = null;
      }
      return d;
    };
    // #164 Phase 4 — tente une MONTÉE de cerveau de l'exécutant si le blocage est
    // `brain-inadequate` (récidive après remède déjà tenté). Si un barreau supérieur
    // existe : swap `runCtx.post` vers ce cerveau, arme le nudge, et signale au caller de
    // RELANCER (true). Sinon false → l'escalade normale (Claude opt-in) reprend la main.
    // Borné : `nextExecutorRung` renvoie null au sommet de l'échelle → aucune boucle.
    const tryBrainEscalation = (d: Diagnosis): boolean => {
      if (!brainEscalateOn || !isBrainInadequate(d, strategeState)) return false;
      const next = nextExecutorRung(execLadder, execTier);
      if (!next) return false; // sommet atteint → on rend la main (Claude opt-in)
      execTier = next.tier;
      runCtx.post = elevePost(next.model, next.provider);
      push(`  ${formatExecutorEscalation(d, next)}`);
      nudge = brainEscalationNudge(d, next);
      return true;
    };
    // Plan-ancre courant (pour le remède wandering — ré-ancrage L17).
    const currentPlanReminder = (): string => {
      try {
        const p = getPlan(projectDir);
        return p ? formatPlanReminder(p) : "";
      } catch {
        return "";
      }
    };
    // #160 — repartir sans plan périmé d'une tâche précédente. Si l'Élève appelle
    // planifier() pendant la boucle, son plan sera rappelé dans le nudge ci-dessous.
    clearPlan(projectDir);
    for (;;) {
      agErr = "";
      // Relance (nudge non vide) : reconstruit le prompt user FRAIS — sinon la liste
      // des fichiers date d'AVANT la tentative précédente (un projet neuf y figure
      // « vide » alors que 20 fichiers viennent d'être écrits) et l'Élève ré-explore,
      // réécrit du déjà-bon ou dérive de sa direction. On lui rappelle aussi ce qui
      // vient d'être écrit ce run pour qu'il reparte de l'existant.
      if (nudge && result) {
        user = buildEleveUser(task, projectDir, "", injectMeans, callCaps, "", true);
        const dejaEcrits = changedFilesFromTrace(result.toolTrace);
        if (dejaEcrits.length) {
          nudge += `\n\nDéjà écrit pendant ce run (pars de l'EXISTANT, ne refais rien de zéro) : ${dejaEcrits.slice(0, 30).join(", ")}`;
        }
        // (2026-07-21, diagnostic conso token — "formation mandarin") même patron côté
        // LECTURE : sans ce rappel, chaque relance relit les mêmes fichiers depuis zéro
        // (observé : ~10 fichiers relus en boucle sur plusieurs relances). buildRelanceNudge
        // dit déjà "n'explore plus" en général ; on rend ça CONCRET avec la vraie liste.
        const dejaLus = readFilesFromTrace(result.toolTrace);
        if (dejaLus.length) {
          nudge += `\n\nDéjà LU pendant ce run (ne les relis PAS sauf besoin précis d'un détail) : ${dejaLus.slice(0, 30).join(", ")}`;
        }
      }
      try {
        // runAgenticTask = la boucle + la DÉLÉGATION (Phase D/E3) : l'orchestrateur
        // confie des sous-tâches à des sous-agents bornés (profondeur + budget partagé),
        // chacun pouvant prendre SON cerveau par intention. Outils gatés par la politique.
        result = await runAgenticTask(nudge ? `${user}\n\n${nudge}` : user, runCtx);
        push(
          `✓ moteur : ${result.iterations} itération(s), ${result.toolTrace.length} appel(s) d'outil` +
            (result.finished ? " (finish)" : result.stuck ? " (bloqué)" : " (plafond)"),
        );
      } catch (e) {
        agErr = `moteur agentique : ${(e as Error).message}`;
        push(`⚠ ${agErr} — on laisse le juge trancher puis on escalade au besoin`);
      }
      // Stop coopératif : l'utilisateur a cliqué « Stop ». Arrêt VOLONTAIRE — on NE
      // PAS escalader vers Claude (ce n'est pas un échec), on NE relance PAS le
      // Stratège. Le travail déjà écrit sera committé par le tour (index.ts) → on
      // peut reprendre ensuite en renvoyant un message. On rend la main tout de suite.
      if (result?.aborted) {
        push("⏹ Arrêté à ta demande — ce qui est déjà fait est conservé. Relance-moi pour continuer.");
        return {
          resolvedBy: "eleve", attempts: 1, success: false, inspection: insp,
          axiom: false, costUsd: 0, log, incomplete: true, aborted: true,
        };
      }
      insp = await inspectReady();
      // Build cassé ou erreur moteur → on sort vers l'escalade (échec objectif réel).
      if (!insp.ok || agErr) {
        const d = await diagnoseAndTrack(); // #164 — nomme (P1) + reclasse si ambigu (P3) ; #196C — trace la répétition
        if (d) void fireObservationHook("OnBlock", projectDir, `${d.blocker}: ${d.detail ?? ""}`, relayHooks);
        // #168 — AUTO-ÉVOLUTION (trigger LARGE) : tout blocage « mur de capacité » non couvert
        // par un agent forgé → on l'inscrit comme lacune ouverte (une fois par type/build).
        // `recordUncoveredGap` ignore en interne si un agent couvre déjà (semi-auto : Raf valide).
        // #168 tranche 3 — on IGNORE les hoquets réseau transitoires (GLM cloud gratuit :
        // « fetch failed » parfois mal classé en plateau) : jamais de forge/relance sur du bruit.
        const gapTransient = isTransientBlocker(`${agErr} ${d?.detail ?? ""} ${d?.cause ?? ""}`);
        if (selfEvolveOn && d && !gapTransient && GAP_WORTHY_BLOCKERS.has(d.blocker) && !seenGapBlockers.has(d.blocker)) {
          seenGapBlockers.add(d.blocker);
          const g = recordUncoveredGap({ blocker: d.blocker, detail: d.detail, task });
          if (g.recorded && g.gap) {
            void fireObservationHook("OnGapRecorded", projectDir, g.gap.title, relayHooks);
            if (g.isNew) push(`  🧬 Auto-évolution : lacune « ${g.gap.title} » notée`);
            // #168 tranche 2 — FORGE AUTO sous DISJONCTEUR. Le moteur (créer un agent sans clic)
            // ne s'arme JAMAIS sans le frein : plafond de forges/run + garde-coût Opus + plafond
            // GLOBAL cross-run du registre (#2) + plafond de TENTATIVES par lacune (#1), gate OFF
            // par défaut. Refus → on reste en tranche 1 (la lacune attend la validation de Raf).
            const decision = canAutoForge(autoForgeCfg, autoForgeState, undefined, loadSpecialists().length);
            const attemptsLeft = !forgeAttemptsExhausted(g.gap, maxForgeAttempts);
            const gapScore = gapValueScore(g.gap);
            const scoreOk = gapScore >= minAutoForgeScore;
            if (decision.allow && g.gap.status === "proposed" && attemptsLeft && scoreOk) {
              push(`  🛡️ Disjoncteur : ${decision.reason} → forge auto…`);
              markGap(g.gap.id, "forging");
              recordForgeAttempt(g.gap.id);
              const fr = await forgeForGap(g.gap);
              if (fr.agent) {
                markGap(g.gap.id, "forged", { agentId: fr.agent.id });
                autoForgeState = recordAutoForge(autoForgeState);
                push(`  🧬 Forge AUTO : agent « ${fr.agent.name} » créé (${fr.agent.provider}/${fr.agent.model})`);
                // #168 tranche 3 — REPRISE AUTO DANS LE MÊME RUN, ROBUSTE. Après une forge réussie
                // on RELANCE tout de suite (si budget de relances) pour exploiter l'agent au lieu
                // d'attendre « le prochain blocage ». Deux niveaux : (1) consultSpecialist réussit →
                // nudge avec son analyse ; (2) l'invocation de son cerveau rate (hoquet GLM cloud —
                // constaté en OBS 2026-07-01, forge=2/reprise=0) → on relance QUAND MÊME avec le
                // remède du diagnostic + la mention de l'agent, au lieu d'escalader. Anti-boucle :
                // plafond forges/run (1) + seenGapBlockers (pas de 2ᵉ forge du même type) + budget.
                if (relances < selfRelanceMax) {
                  relances++;
                  const resume = await consultSpecialist(
                    { task, blockage: d.detail ?? d.cause ?? d.blocker, minWinrate: delegateMinWinrate, minUsesForFilter: delegateMinUses },
                    { runAgentic: delegateAgenticRunner },
                  );
                  if (resume) {
                    push(`  ↻ Reprise auto : délègue au nouvel agent « ${resume.agent.name} » (score ${resume.score}) — relance (${relances}/${selfRelanceMax}, coût 0)`);
                    nudge = buildDelegateNudge(resume.agent.name, resume.advice);
                    // (revue Fable #3) attribue un WIN à CET agent si le prochain finish réussit.
                    pendingLearn.current = { d, label: `délégation → ${resume.agent.name}`, agentId: resume.agent.id };
                  } else {
                    push(`  ↻ Reprise auto : nouvel agent « ${fr.agent.name} » créé (consultation indisponible) — relance avec le remède (${relances}/${selfRelanceMax}, coût 0)`);
                    nudge = buildForgedResumeNudge(fr.agent.name, d.blocker, d.remedy);
                  }
                  continue;
                }
                push(`  🧬 agent « ${fr.agent.name} » prêt — disponible au prochain blocage de ce type`);
              } else {
                markGap(g.gap.id, "proposed"); // échec → reste à valider
                const updated = getGap(g.gap.id);
                const attempts = updated?.forgeAttempts ?? 0;
                if (updated && forgeAttemptsExhausted(updated, maxForgeAttempts)) {
                  push(`  🧬 Forge auto échouée (${fr.error ?? "?"}) — plafond de ${maxForgeAttempts} tentative(s) atteint → validation manuelle requise dans l'Atelier`);
                } else {
                  push(`  🧬 Forge auto échouée (${fr.error ?? "?"}) → lacune à valider dans l'Atelier (tentative ${attempts}/${maxForgeAttempts})`);
                }
              }
            } else if (decision.allow && g.gap.status === "proposed" && !attemptsLeft) {
              push(`  🧬 Plafond de ${maxForgeAttempts} tentative(s) de forge atteint pour cette lacune → validation manuelle requise dans l'Atelier`);
            } else if (decision.allow && g.gap.status === "proposed" && attemptsLeft && !scoreOk) {
              push(`  🧬 Lacune notée (score ${gapScore}% < seuil ${minAutoForgeScore}%) — attend plus de récurrence avant la forge auto ; forçable dans l'Atelier`);
            } else if (g.isNew) {
              push(`  🧬 Forge à valider dans l'Atelier (${decision.reason})`);
            }
          }
        }
        // #196 partie C — règle des 3 essais : 3 tentatives CONSÉCUTIVES sur la MÊME
        // classe de blocage → on arrête de retenter ce chemin (mur de capacité, pas un
        // hoquet) et on rend la main tout de suite à l'escalade existante (le `break`
        // ci-dessous, même chemin que relances épuisées).
        if (d && shouldStopRetrying(consecutiveSameBlocker)) {
          push(`⛔ Stratège : 3 tentatives sur « ${d.blocker} » sans succès — traité comme un problème d'architecture, pas un bug. Escalade.`);
          break;
        }
        // #164 Phase 1 — sur build CASSÉ (pas une erreur moteur), le Stratège tente un remède
        // CHOISI avant d'abandonner : missing-dependency → installe la lib + relance ;
        // knowledge-gap → renvoie se documenter. Borné (strategeState + budget de relance).
        if (strategeActs && d && !agErr && relances < selfRelanceMax) {
          const r = route(d, strategeState, { planReminder: currentPlanReminder() });
          if (r.kind === "install-dependency") {
            push(`  ${formatRemedy(d, r)}`);
            commitRemedy(d, strategeState, r);
            const res = await installDependency(projectDir, r.pkg);
            if (res.ok) {
              relances++;
              push(`↻ Stratège : « ${r.pkg} » installé — relance de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
              nudge = await applyRemedyNudge(d, `installe ${r.pkg}`, r.nudge);
              continue;
            }
            push(`  ⚠ Stratège : install « ${r.pkg} » a échoué (${res.refused ? "hors allowlist" : "npm KO"}) — escalade`);
          } else if (r.kind === "reframe") {
            // (2026-07-14) Blocage récidivant : remise en question plutôt qu'abandon — voir
            // stratege.ts::reframeNudge. Pas de délégation ici : le reframe EST déjà le
            // changement d'angle (contrairement à "nudge"/plateau-iterations, qui délègue).
            push(`  ${formatRemedy(d, r)}`);
            commitRemedy(d, strategeState, r);
            relances++;
            push(`↻ Stratège : ${r.label} — relance de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
            nudge = await applyRemedyNudge(d, r.label, r.nudge);
            continue;
          } else if (r.kind === "nudge") {
            push(`  ${formatRemedy(d, r)}`);
            commitRemedy(d, strategeState, r);
            relances++;
            // slice 2 — sur plateau-iterations, on DÉLÈGUE vraiment : on cherche le spécialiste
            // forgé pertinent (match tâche↔agent) et on l'invoque pour une analyse experte, qui
            // remplace le nudge « décompose ». Aucun match → repli sur le nudge (inchangé).
            let remedyNudge = r.nudge;
            let delegatedAgentId: string | undefined;
            if (d.blocker === "plateau-iterations") {
              const consult = delegateOn
                ? await consultSpecialist(
                    { task, blockage: d.detail ?? "plafond d'itérations atteint", minWinrate: delegateMinWinrate, minUsesForFilter: delegateMinUses },
                    { runAgentic: delegateAgenticRunner },
                  )
                : null;
              if (consult) {
                push(`  🤝 Stratège délègue à « ${consult.agent.name} » (cible ${consult.agent.lacune || "—"}, score ${consult.score})`);
                remedyNudge = buildDelegateNudge(consult.agent.name, consult.advice);
                delegatedAgentId = consult.agent.id;
                // (la lacune éventuelle a déjà été inscrite par le hook large post-diagnostic #168)
              } else if (delegateOn) {
                push(`  ℹ Stratège : aucun spécialiste forgé pertinent → décomposition`);
              }
            }
            push(`↻ Stratège : ${r.label} — relance de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
            nudge = await applyRemedyNudge(d, r.label, remedyNudge);
            // (revue Fable #3) attribue un WIN à l'agent délégué si le prochain finish réussit.
            if (delegatedAgentId && pendingLearn.current) pendingLearn.current.agentId = delegatedAgentId;
            continue;
          }
          // r.kind === "escalate" → on tente une MONTÉE de cerveau (P4) avant le break.
        }
        // #164 Phase 4 — dernier recours souverain AVANT Claude : si le cerveau est
        // inadéquat (le blocage récidive malgré son remède déjà tenté) et qu'un barreau
        // supérieur existe, monte le cerveau de l'Élève et relance (borné par l'échelle).
        if (d && !agErr && relances < selfRelanceMax && tryBrainEscalation(d)) {
          relances++;
          push(`↻ Stratège : cerveau monté (barreau ${execTier}) — relance de l'Élève (${relances}/${selfRelanceMax})`);
          continue;
        }
        // (2026-07-14, Raf) — REPLI GÉNÉRIQUE : sur build cassé `ambiguous`, si ni un remède
        // déterministe, ni la reclassification cerveau (ELEVE_STRATEGE_BRAIN), ni une montée
        // de cerveau (ELEVE_BRAIN_ESCALATE) n'ont pu s'appliquer (gates off, ou aucun barreau
        // supérieur configuré), on abandonnait AVANT d'épuiser selfRelanceMax — contrairement
        // à plateau-iterations qui retombe TOUJOURS sur un nudge générique (ligne ~823 plus
        // bas). Constat réel (orbital-control) : `Could not resolve "./SatelliteDetail.css"`
        // est un cas trivial (fichier oublié) que renvoyer l'erreur exacte au modèle aurait
        // probablement réglé — aucun filet générique n'existait pour ce cas. On l'ajoute :
        // même relances restantes, on redonne une chance avec l'erreur telle quelle.
        if (d && !agErr && relances < selfRelanceMax) {
          relances++;
          push(`↻ Auto-relance ${relances}/${selfRelanceMax} de l'Élève (build cassé, ${d.blocker}) — erreur renvoyée telle quelle (coût 0)`);
          nudge = `⚠ BUILD CASSÉ : ${d.cause}${d.detail ? `\nDétail : ${d.detail}` : ""}\nCorrige EXACTEMENT ce problème (fichier manquant, import invalide, etc.), puis relance le build.`;
          continue;
        }
        break;
      }

      // (L30) MANAGER-QC des images : Mango ne fait pas confiance aveuglément à la
      // transcription de son ouvrier. Sur build-vert, il VÉRIFIE chaque image du
      // livrable et RÉPARE les URLs Pexels mal recopiées (bon id, slug inventé → 404)
      // en re-dérivant l'URL canonique via l'API. Déterministe, best-effort, gaté
      // (défaut ON, coupure ELEVE_IMAGE_CHECK=off). Les mortes non réparables (id
      // absent / photo supprimée) → on renvoie l'ouvrier corriger (borné).
      if (process.env.ELEVE_IMAGE_CHECK !== "off") {
        try {
          const imgReport = await checkAndRepairImages(projectDir);
          const line = formatImageCheck(imgReport);
          if (line) push(`  ${line}`);
          // (L123) Filet de DERNIER RECOURS : toute image encore cassée (URL Pexels morte
          // non réparable OU chemin local /images/x.jpg inventé) est remplacée par la
          // banque locale. On ne renvoie l'Élève QUE si la banque ne peut rien garantir
          // (vide/insuffisante). Sans banque (gate off), on garde l'ancien comportement.
          let stillBroken: string[] = imgReport.unrepairable;
          if (process.env.ELEVE_IMAGE_BANK !== "off") {
            const gr = await guaranteeLocalImages(projectDir, imageBank);
            const gl = formatGuarantee(gr);
            if (gl) push(`  ${gl}`);
            stillBroken = gr.stillBroken;
          }
          if (stillBroken.length > 0 && relances < selfRelanceMax) {
            relances++;
            push(`↻ Images cassées non garanties — renvoi de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
            nudge = buildImageRepairNudge(imgReport) ||
              `⚠ ${stillBroken.length} image(s) cassée(s) :\n${stillBroken.map((u) => `- ${u}`).join("\n")}\n` +
              `→ Remplace CHACUNE par une vraie photo via l'outil chercher_image (copie l'URL EXACTE), puis check_build et finish.`;
            continue;
          }
        } catch {
          /* le contrôle qualité des images ne casse jamais la livraison */
        }
      }

      // Garde d'ÉQUILIBRE de mise en page — TOUJOURS ACTIVE (déterministe, $0, AUCUN
      // cloud, indépendante du Gardien). Sur build-vert, scanne les fichiers écrits : un
      // conteneur à largeur max (max-w-* / max-width) SANS centrage (mx-auto / margin:auto)
      // = contenu collé à gauche → renvoie l'Élève ajouter le centrage. C'est le filet
      // PERMANENT contre le biais « collé à gauche » (cf. limites L54). Coupure ELEVE_GATE_BALANCE=off.
      if (result?.finished) {
        try {
          const balFiles = changedFilesFromTrace(result.toolTrace);
          const findings = scanFilesForBalance(balFiles, (f) => {
            try {
              return fs.readFileSync(path.join(projectDir, f), "utf8");
            } catch {
              return null;
            }
          });
          if (findings.length > 0 && relances < selfRelanceMax) {
            relances++;
            push(`↻ Équilibre : ${findings.length} bloc(s) à largeur max collé(s) à gauche — renvoi de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
            nudge = formatBalanceRaison(findings);
            continue;
          }
        } catch {
          /* la garde d'équilibre ne casse jamais la livraison */
        }
      }

      // #b incrément 2 — teste_parcours de clôture CÔTÉ ÉLÈVE (gaté ELEVE_GATE_PARCOURS=on,
      // défaut OFF) : ouvre la preview, et si l'app charge avec des erreurs console →
      // renvoie l'Élève corriger (reboucle bornée par selfRelanceMax). C'est la vérif
      // « ça marche vraiment » (#155) intégrée à la clôture, symétrique du chemin Maître.
      if (result?.finished && relances < selfRelanceMax) {
        const pc = await runClosureParcours(projectDir);
        if (!pc.ok) {
          relances++;
          push(`🧭 teste_parcours — ${pc.errors.length} erreur(s) console → renvoie l'Élève corriger (${relances}/${selfRelanceMax}, coût 0)`);
          nudge = `⚠ CLÔTURE — l'app se charge AVEC des erreurs console : ${pc.errors.slice(0, 3).join(" | ") || "(voir la preview)"}. Corrige-les, vérifie que la page charge proprement, puis appelle \`finish\`.`;
          continue;
        }
        push(pc.skipped ? `🧭 teste_parcours — sauté (${pc.skipped}) — NON vérifié ⚠` : `🧭 teste_parcours — aucune erreur console ✓`);
      }

      // #b incrément 3 — audit MangoQA CÔTÉ ÉLÈVE (si MangoQA tourne) : un verdict RED
      // devient un critère de re-correction (renvoie l'Élève corriger). Fail-open.
      if (result?.finished && relances < selfRelanceMax) {
        const qa = await runClosureMangoQA(projectDir);
        if (qa.skipped) push(`🥭 MangoQA KO (${qa.skipped}) — clôture NON vérifiée ce tour (fail-open, coût 0)`);
        if (!qa.ok) {
          relances++;
          push(`🥭 MangoQA RED → renvoie l'Élève corriger (${relances}/${selfRelanceMax}, coût 0)`);
          nudge = `⚠ CLÔTURE — MangoQA a rejeté le livrable. Action corrective : ${qa.action}. Applique-la, puis appelle \`finish\`.`;
          continue;
        }
      }

      // Build vert + finish explicite → AVANT de déclarer succès, le GARDIEN de
      // (#172, Phase 2) Point PreFinish EXTENSIBLE : les hooks de config déclarés sur
      // l'événement PreFinish s'exécutent quand l'Élève veut finir — un hook peut le
      // renvoyer corriger (deny/ask) EN AMONT du Gardien natif. Gaté ELEVE_HOOKS, borné
      // par gateRelanceMax, fail-open (un hook cassé ne bloque jamais la clôture).
      // Choix assumé : le Gardien #161 reste le gate PreFinish NATIF ci-dessous, NON
      // réécrit — son verdict riche (intention/goût/QA + evaluateGate/anti-thrash) ne se
      // réduit pas au contrat allow/deny du dispatcher (migration littérale = L71).
      if (process.env.ELEVE_HOOKS === "on" && result?.finished && (runCtx.hooks?.length ?? 0) > 0 && gateRelances < gateRelanceMax) {
        try {
          const pf = await runHooks({ event: "PreFinish", projectDir, detail: result.text }, runCtx.hooks!);
          if (pf.ran > 0 && pf.decision !== "allow") {
            gateRelances++;
            nudge = `Un hook de clôture (PreFinish) a refusé la livraison : ${pf.reasons.join(" ; ") || "revois le livrable"}. Corrige EXACTEMENT ce point, puis conclus.`;
            push(`↻ Hook PreFinish : renvoie l'Élève corriger (${gateRelances}/${gateRelanceMax})`);
            continue;
          }
        } catch { /* fail-open : jamais un tour cassé par un hook */ }
      }

      // clôture (#161) vérifie intention + goût + QA. Gaté ELEVE_CLOSURE_GATE=on
      // (défaut OFF → zéro régression). Convergent/non-bloquant : convertit (relance
      // bornée) puis cède (incomplete). Ne casse jamais la boucle (try/catch).
      if (result?.finished) {
        try {
          const verdict = await runClosureGate(projectDir, task, result, WORKSPACE_DIR, inferProjectType(task), {}, deps.gateDeps);
          appendBacklog(projectDir, { actor: "Gardien", action: "clôture", detail: verdict.raisons.join(" ; ") || "OK", ok: verdict.ok });
          const goutLabel = verdict.design
            ? verdict.tasteScored
              ? `, goût ${verdict.design.overall}/100${verdict.tasteObserve ? " (observé)" : ""}`
              : ", goût non jugeable (sauté)"
            : "";
          push(`🛡 Gardien — intention ${verdict.intent.couverture}/100${goutLabel}${verdict.ok ? " ✓" : " ✗"}`);
          // (N9) un volet SAUTÉ pour cause d'incident n'est plus silencieux :
          // « ok non vérifié » doit se voir dans le log, pas se déguiser en ✓.
          if (verdict.judgeSkipped) push(`  ⚠ juge d'intention KO (${verdict.judgeSkipped}) — couverture NEUTRE (100), NON vérifiée`);
          if (verdict.critiqueSkipped) push(`  ⚠ critique visuelle KO (${verdict.critiqueSkipped}) — goût + WCAG NON vérifiés ce tour`);
          // (axiome 17, 2026-07-08) signal disponible non exploité — visible, jamais bloquant.
          if (verdict.signalGap) push(`  📶 ${verdict.signalGap}`);
          // (N15, 2026-07-03) mesures d'ARTISANAT statiques (déterministes, $0) en
          // OBSERVATION : familles de polices, échelle typo, couleurs littérales,
          // motion présent. Non-bloquant pour l'instant (calibrage) — mais VISIBLE.
          try {
            const craft = measureCraftSummary(projectDir, changedFilesFromTrace(result.toolTrace));
            if (craft) push(`  🔎 artisanat : ${craft}`);
          } catch { /* observation best-effort */ }
          const decision = evaluateGate(projectDir, verdict, gateRelances, gateRelanceMax, prevGateGout);
          // mémorise le goût FIABLE de ce tour pour l'anti-thrash du tour suivant.
          if (verdict.tasteScored && verdict.design) prevGateGout = verdict.design.overall;
          if (decision.action === "corrige") {
            gateRelances++;
            nudge = decision.nudge;
            push(`↻ Gardien : renvoie l'Élève corriger (${gateRelances}/${gateRelanceMax}, coût 0)`);
            continue;
          }
          if (decision.action === "laisse-passer") {
            push(`⚠ Gardien : seuil non atteint après ${gateRelances} correction(s) — livré mais marqué INCOMPLET (à toi de trancher)`);
            return { resolvedBy: "eleve", attempts: 1, success: true, inspection: insp, axiom: false, costUsd: 0, log, incomplete: true };
          }
          // action "ok" → on tombe dans le succès normal ci-dessous.
        } catch (e) {
          push(`⚠ Gardien indisponible (${(e as Error).message.split("\n")[0]}) — on laisse passer`);
        }
      }
      // Build vert + finish explicite → résolu par l'Élève, coût 0.
      if (result?.finished) {
        // #164 Phase 2 — si un remède du Stratège a précédé CE succès, distille-le en
        // procédure #75 (situation→remède) → le prochain blocage du même type sera rappelé.
        if (pendingLearn.current) {
          const pl = pendingLearn.current;
          if (strategeLearns) {
            try {
              const res = await distillProcedure(WORKSPACE_DIR, pl.d, pl.label, projectLabel, new Date().toISOString());
              if (res.saved) push(`  📚 Stratège APPREND : procédure « débloquer ${pl.d.blocker} » distillée (réutilisable)`);
            } catch {
              /* l'apprentissage ne casse jamais une livraison */
            }
          }
          // (revue Fable #3) attribution du WIN — INDÉPENDANTE de strategeLearns (gouvernée
          // par ELEVE_DELEGATE, une autre gate) : le succès qui suit une délégation est
          // attribué à l'agent forgé consulté, jamais à un remède générique.
          if (pl.agentId) {
            try { recordSpecialistWin(pl.agentId); } catch { /* la scorecard ne casse jamais une livraison */ }
          }
          pendingLearn.current = null;
        }
        push(`✓ build vert — résolu par l'ÉLÈVE (moteur agentique), coût 0`);
        return { resolvedBy: "eleve", attempts: 1, success: true, inspection: insp, axiom: false, costUsd: 0, log };
      }
      // Build vert MAIS arrêt sans `finish` (blocage/plafond) : l'Élève se RELANCE.
      if (relances < selfRelanceMax) {
        const d = await diagnoseAndTrack(); // #164 — nomme (P1) + reclasse si ambigu (P3) ; #196C — trace la répétition
        if (d) void fireObservationHook("OnBlock", projectDir, `${d.blocker}: ${d.detail ?? ""}`, relayHooks);
        // #196 partie C — même règle des 3 essais que côté build cassé : 3 tentatives
        // consécutives sur la même classe (ex. plateau-iterations qui récidive malgré
        // décomposition) → mur d'architecture, pas un simple plafond à repousser.
        if (d && shouldStopRetrying(consecutiveSameBlocker)) {
          push(`⛔ Stratège : 3 tentatives sur « ${d.blocker} » sans succès — traité comme un problème d'architecture, pas un bug. Escalade.`);
          break;
        }
        relances++;
        // #164 Phase 1 — remède CHOISI : wandering → ré-ancre le plan (L17) ; plateau →
        // décompose via delegate. Escalade Stratège (ou mode off) → nudge générique (#160).
        if (strategeActs && d) {
          const r = route(d, strategeState, { planReminder: currentPlanReminder() });
          if (r.kind === "nudge" || r.kind === "reframe") {
            commitRemedy(d, strategeState, r);
            push(`↻ Stratège : ${r.kind === "reframe" ? "REMISE EN QUESTION — " : ""}${r.label} — relance de l'Élève (${relances}/${selfRelanceMax}, coût 0)`);
            nudge = await applyRemedyNudge(d, r.label, r.nudge);
            continue;
          }
        }
        // Défaut (Stratège off, ou escalade) : nudge générique plan-ancre (comportement #160).
        const why = result?.stuck ? "blocage (sur-exploration)" : "plafond d'itérations";
        push(`↻ Auto-relance ${relances}/${selfRelanceMax} de l'Élève — il continue seul jusqu'au bout (coût 0 ; clique Stop pour couper)`);
        nudge = buildRelanceNudge(projectDir, why, relances, selfRelanceMax);
        continue;
      }
      break; // relances épuisées, toujours bloqué sur build vert
    }

    if (insp.ok && !agErr) {
      // HONNÊTETÉ DU PLAFOND : un build vert ne prouve PAS que la tâche est faite.
      const blockReason = result?.stuck ? "blocage (sur-exploration)" : "plafond d'itérations";
      // Point 3 — escalade Claude = OPT-IN strict (ELEVE_ESCALATE_ON_BLOCK=on). Par
      // défaut on N'appelle PAS le Maître : on laisse la main à Raf (souveraineté).
      if (process.env.ELEVE_ESCALATE_ON_BLOCK === "on") {
        push(`⚠ Élève toujours bloqué après ${relances} relance(s) (${blockReason}) — escalade vers le Maître (opt-in)`);
        return await finalizeEscalation(`L'Élève s'est arrêté sans terminer (${blockReason}).`, 1, {
          incomplete: true,
          eleveSummary: result?.text || `${result?.toolTrace.length ?? 0} appel(s) d'outil, sans conclusion.`,
        });
      }
      push(
        `⚠ build vert mais pas de finish après ${relances} auto-relances (${blockReason}) — j'ai vraiment essayé seul. ` +
          `L'app compile ; il reste sans doute un détail. Relance-moi ou précise ce qui manque.`,
      );
      return { resolvedBy: "eleve", attempts: 1, success: true, inspection: insp, axiom: false, costUsd: 0, log, incomplete: true };
    }
    // Build cassé + relances épuisées — escalade Claude = OPT-IN strict, même
    // gate que le cas « bloqué » ci-dessus. Défaut OFF : échec honnête plutôt
    // qu'un appel Claude silencieux (2026-07-13, souveraineté).
    const breakReason = agErr || `build cassé (${insp.signal}) : ${insp.detail.slice(-300)}`;
    if (process.env.ELEVE_ESCALATE_ON_BLOCK === "on") {
      return await finalizeEscalation(breakReason, 1);
    }
    push(
      `✗ build toujours cassé après ${relances} auto-relance(s) — j'ai vraiment essayé seul. ` +
        `${breakReason.slice(0, 300)} Précise ce qui bloque ou relance-moi.`,
    );
    return { resolvedBy: "none", attempts: 1, success: false, inspection: insp, axiom: false, costUsd: 0, log, incomplete: true };
}
