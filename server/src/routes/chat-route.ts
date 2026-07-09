// Route POST /api/chat (SSE) — extraite verbatim de index.ts (comportement inchangé).
// Enregistrée via registerChatRoute(app, deps) ; deps = les seules variables du
// scope de index.ts que le handler capturait (MANGO_UI_DIR, MIRROR_PROJECT).
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { ALLOWED_MODELS, ALLOWED_MODES, interruptAgent, runAgent, type AgentEvent, type Mode, type ModelChoice } from "../agent.js";
import { appendHistory, loadHistory, formatToolLine, type ChatEntry } from "../history.js";
import { createProject, deleteProject, listProjects, listTemplates, projectDir, projectExists, WORKSPACE_DIR } from "../projects.js";
import { loadHooks } from "../mango-hooks-config.js";
import { axiomStats } from "../axioms.js";
import { computeInsights } from "../metrics-insights.js";
import { inferProjectType } from "../blueprints.js";
import { previewStatus, previewList, isPreviewing, startPreview, stopPreview } from "../preview.js";
import { clearSession, getSession, saveSession } from "../sessions.js";
import { commitVersion, ensureRepo, changedFilesInLastCommit } from "../versions.js";
import { ensureErrorRelay, ensureInspectRelay } from "../relay.js";
import { ensureClickSourcePlugin, readSourceSnippet, buildVisualEditPrompt, type EditTarget } from "../clicksource.js";
import { deployProject, isDeployTarget } from "../deploy.js";
import { githubConfigured, pushToGitHub } from "../github.js";
import { spawnBackgroundReview } from "../review.js";
import { spawnPatrol } from "../patrol.js";
import { interruptCompaction, maybeCompactSession } from "../compaction.js";
import { clearInterrupt, requestInterrupt } from "../interrupt.js";
import { generateKreaImage } from "../krea.js";
import { slugify as fluxSlugify } from "../eleve-flux-tools.js";
import { saveUpload } from "../uploads.js";
import { ensureHomeScratch, cleanHomeScratch, graduateHomeScratch, detectsBuildIntent } from "../home-scratch.js";
import { setVisionContext, snapZone, visionStatus, getPreviewUrl, closeBrowser } from "../vision.js";
import { shouldCaptureDiff, captureDiff } from "../vision-diff.js";
import { readMetrics, recordTurnMetrics } from "../metrics.js";
import { sovereigntyReport, formatSovereignty } from "../sovereignty-metrics.js";
import { runRelay, chatEleve, askEleveAgentic, ELEVE_PROVIDER } from "../eleve.js";
import { buildEleveDiscussTools } from "../eleve-action-tools.js";
import { resolveBinding, deriveIntention, policyForBinding } from "../brain-runtime.js";
import { requiredCapabilities, toolDemandSignal } from "../intent-capabilities.js";
import { runFrontierOrchestration } from "../frontier-orchestration.js";
import { dispatch } from "../brain-dispatch.js";
import { assembleSystemPrompt, FIDELITY_CLAUSE } from "../scenario.js";
import { flag } from "../flags.js";
import { getBrain } from "../brain-registry.js";
import { temporalContext } from "../temporal-context.js";
import { domainTemplateSection } from "../template-library.js";
import { isAgentBusy, tryAcquireAgent, releaseAgent } from "../agent-lock.js";
import { uxuiProfile } from "../models/uxui.js";
import { layoutProfile } from "../models/layout.js";
import { getBus } from "../kernel-bus.js";
import { installMangoQaBridge } from "../kernel-mangoqa-bridge.js";
import { Blackboard, setBlackboard } from "../kernel-blackboard.js";
import { installTraceCollector, registerTraceRoutes } from "../trace-dashboard.js";
import { installArtifactStore, registerArtifactRoutes } from "../kernel-artifacts.js";
import { installReuseCollector, installReuseImpactCollector, registerReuseRoutes, detectArtifactReads, detectPaletteReuse, detectArtefactReuse, publishReuse } from "../kernel-reuse-metrics.js";
import { takeArtefactUsage } from "../eleve-artefact-usage.js";
import { registerCurationEffectRoutes } from "../kernel-curation-effect.js";
import { startChatTurn, finishChatTurn } from "../kernel-chat-bridge.js";
import type { Span } from "../kernel-trace.js";
import { publishDesignReference, publishDesignProduced, buildProducedDesign, paletteFromContract } from "../kernel-design-events.js";
import { loadContract } from "../perfect-plan.js";
import { generateLexique } from "../lexique.js";
import { verifierChoixGabaritEnArrierePlan, analyserChaineEnAmontDuGabarit } from "../eleve-context-hook.js";
import { registerPromptLabRoutes } from "../promptlab.js";
import { registerTokenizerRoutes } from "../tokenizer.js";
import { registerIdeationRoutes } from "../ideation.js";
import { registerVeilleRoutes } from "../veille.js";
import { registerModelRouterRoutes } from "../model-router.js";
import { registerDocGeneratorRoutes } from "../docgenerator.js";
import { registerVersionGraphRoutes } from "../version-graph.js";
import { registerControleurRoutes } from "../qa-temporal.js";
import { emitPhaseComplete, spawnVerdictWatcher, isMangoQaActive, registerMangoQaRoutes } from "../mangoqa.js";
import { registerStrategeRoutes, maybeInjectStrategeBriefing } from "../stratege-routes.js";
import { registerFormationRoutes } from "../formation-routes.js";
import { registerPerimeterRoutes } from "../perimeter-routes.js";
import { loadPlan, replaceIncrements, markIncrementDone, loadFluxCounts } from "../project-plan.js";
import { registerStripeRoutes } from "../stripe.js";
import { registerCronRoutes } from "../cron-scheduler.js";
import { registerMetricsDashboardRoutes } from "../metrics-dashboard.js";
import { registerNotesRAGRoutes } from "../notes-rag.js";
import { registerMultiProjectRoutes } from "../multi-project.js";
import { registerAutoAblationRoutes } from "../auto-ablation.js";
import { registerDesignReviewRoutes } from "../design-review.js";
import { registerSuperAgentRoutes } from "../super-agent-builder.js";
import { registerKnowledgeStoresRoutes } from "../knowledge-stores-routes.js";
import { registerLibraryRoutes } from "../library-routes.js";
import { registerCouncilSkillsRoutes } from "../council-skills-routes.js";
import { registerBackendServerRoutes } from "../backend-server-routes.js";
import { registerProjectIORoutes } from "../project-io-routes.js";
import { registerFeedbackRoutes } from "../feedback-routes.js";
import { registerPdfRoutes } from "../pdf-routes.js";
import { registerTutorialRoutes } from "../tutorial.js";
import { registerNocturnalRoutes } from "../nocturnal.js";
import { registerPromptEvolutionRoutes } from "../prompt-evolution.js";
import { registerAbHarnessRoutes } from "../ab-harness.js";
import { registerRadarRoutes } from "../radar.js";
import { registerBuildReviewRoutes } from "../build-review-routes.js";
import { loadReview } from "../build-review.js";
import { registerBrainRoutes } from "../brain-routes.js";
import { registerBrainDispatchRoutes } from "../brain-dispatch-routes.js";
import { registerOllamaRoutes } from "../ollama-routes.js";
import { registerTasteRoutes } from "../taste-routes.js";
import { registerDesignCoachRoutes } from "../design-coach-routes.js";
import { registerSelfRoutes } from "../self-routes.js";
import { registerSpecialistRoutes } from "../specialist-routes.js";
import { registerEstheteRoutes } from "../esthete-routes.js";
import { ensureEstheteAgent } from "../esthete-agent.js";
import { registerSelfEvolutionRoutes } from "../self-evolution-routes.js";
import { startTasteNocturnalScheduler } from "../taste-nocturnal.js";
import { prewarmVision } from "../vision-prewarm.js";
import { sweepOrphanPreviews } from "../preview-sweep.js";
import { lanIPv4s } from "../net.js";
import { bootstrapProfile, hasProfile, type OnboardingAnswers } from "../onboarding.js";
import { registerPerfectPlanRoutes } from "../perfect-plan-routes.js";
import { registerHomeConversationsRoutes } from "../home-conversations-routes.js";
import { registerAgentFactoryRoutes } from "../agent-routes.js";
import { restoreAgents } from "../agent-runtime.js";
// #138 OS d'apps — colonne de données partagée + surface Suite (la spine).
import { listDocs, getDoc, putDoc, deleteDoc, slug, subscribe } from "../shared-data.js";
import { registerSuiteRoutes } from "../suite-routes.js";
import {
  loadManifest, findManifestById, accessAllowsWrite,
  findCollectionSchema, validateAgainstSchema, type MangoAppManifest,
} from "../mango-app-contract.js";
// (Un, 2026-07-03) U4 — ensureManifest (A0.2) n'avait AUCUN appelant en prod : le
// gate MEMORY_MANIFEST promettait un comportement que rien ne déclenchait jamais.
import { ensureManifest } from "../memory-manifest.js";

export interface ChatRouteDeps {
  mangoUiDir: string;
  mirrorProject: string;
}

export function registerChatRoute(app: express.Express, deps: ChatRouteDeps): void {
  const MANGO_UI_DIR = deps.mangoUiDir;
  const MIRROR_PROJECT = deps.mirrorProject;

app.post("/api/chat", async (req, res) => {
  const { prompt, projectName, sessionId, model, mode, template, editTarget, tutorialId, clientMode, styleStrength, incrementId, intention } = req.body as {
    prompt?: string;
    projectName?: string;
    sessionId?: string;
    model?: string;
    mode?: string;
    template?: string;
    editTarget?: EditTarget; // #6 : cible d'une édition visuelle (clic→source)
    tutorialId?: number; // #56 Chantier C : tour joué DANS le tutoriel (posture pédagogue)
    clientMode?: boolean; // Mode Client : désactive le goût personnel, ancre sur les fichiers du client
    styleStrength?: number; // Curseur de style 0→100 (% du goût personnel ; 100 = défaut plein style)
    incrementId?: string; // #139 Gros Projet : id de l'incrément Kanban construit ce tour (réconcilié après commit)
    intention?: string; // Phase E2 — bouton actif (construire|planifier|discuter) pour le routage multi-cerveaux
  };
  // Posture tutoriel injectée dans le system prompt quand on construit dans un tuto.
  const tutorial = typeof tutorialId === "number" && tutorialId >= 1 ? { id: tutorialId } : null;
  // Curseur de style : 0→100 % du goût personnel (défaut 100). Borné et arrondi.
  const styleStrengthN = typeof styleStrength === "number" && !Number.isNaN(styleStrength)
    ? Math.max(0, Math.min(100, Math.round(styleStrength)))
    : 100;
  // Third brain option (Phase Ultime jalon D): "eleve" routes the turn to the
  // local student (Gemma via Ollama) through the relay loop instead of Claude.
  // Claude stays the escalation tier. Any other value = a normal Claude turn.
  const useEleve = model === "eleve" || model === "uxui" || model === "layout";
  const chosenModel = ALLOWED_MODELS.includes(model as ModelChoice)
    ? (model as ModelChoice)
    : undefined;
  // "nocturne" est un mode INTERNE (génération autonome) — hors d'ALLOWED_MODES,
  // donc jamais sélectionnable via /api/chat : une valeur inconnue retombe sur Élite.
  const chosenMode: Mode = (ALLOWED_MODES as readonly string[]).includes(mode as string) ? (mode as Mode) : "elite";
  const projectType = inferProjectType(prompt ?? "");
  if (!prompt?.trim() || !projectName?.trim()) {
    res.status(400).json({ error: "prompt and projectName are required" });
    return;
  }
  // (N18) acquisition ATOMIQUE (test+set en un appel) — plus de fenêtre entre
  // le « if busy » et le « busy = true ».
  // From here on the lock is held; EVERYTHING that can throw must sit inside
  // the try below so the finally always releases it. A stuck lock used to
  // freeze the whole UI — including preview switching, which 409s while a turn
  // "runs". Between here and the try there is only synchronous header setup.
  if (!tryAcquireAgent()) {
    res.status(409).json({ error: "Agent is already working, wait for it to finish" });
    return;
  }
  // Nouveau tour → on repart d'un drapeau d'interruption propre (un Stop d'un tour
  // précédent ne doit pas arrêter celui-ci). Le clic « Stop » l'armera via /api/stop.
  clearInterrupt();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Everything worth re-rendering on reload is collected here and written to
  // the project's .chat-history.json once the turn ends.
  const turn: ChatEntry[] = [];
  let historyDir: string | null = null;
  // Kernel : span du tour (getTracer) ouvert dans le try, clos dans le finally
  // où l'issue est publiée sur l'Event Bus. Ref hors try pour le control-flow TS.
  let turnSpan: Span | null = null;
  // Kernel : chemins lus par l'agent ce tour — un Read sur .components/.skills/
  // .procedures = réutilisation effective d'un artefact réinjecté (#121).
  const turnToolReads: string[] = [];
  // Kernel : couleurs produites par le build ce tour (#122) — comparées aux
  // palettes en mémoire pour détecter la réutilisation de palette.
  const turnProducedColors: string[] = [];
  // Object refs (not plain lets): assigned inside streamAgentTurn's closure,
  // read in the finally block — TS control-flow can't track the assignment.
  const lastContext: { current: { tokens: number; window: number } | null } = { current: null };
  const lastResult: { current: { costUsd: number; numTurns: number } | null } = { current: null };
  // Élève relay outcome (jalon D), folded into this turn's metrics line.
  const relayMeta: { current: { resolvedBy: "eleve" | "maitre" | "none"; attempts: number } | null } = { current: null };
  // Files changed by this turn's commit (#73 patrol delta), filled after commit.
  const patrolFiles: { current: string[] } = { current: [] };
  const turnStart = Date.now();
  const record = (role: ChatEntry["role"], text: string) =>
    turn.push({ role, text, ts: new Date().toISOString() });
  const recordEvent = (event: AgentEvent) => {
    if (event.type === "text") record("agent", event.text);
    else if (event.type === "thinking") record("thinking", event.text);
    else if (event.type === "tool") record("tool", formatToolLine(event.name, event.detail));
    else if (event.type === "error") record("error", event.message);
    else if (event.type === "result" && !event.ok) record("error", `L'agent s'est arrêté : ${event.error}`);
  };

  try {
    // Kernel : ouvre le span de ce tour de chat. Le chat parle enfin au Kernel —
    // ce span (et l'enveloppe d'issue publiée dans le finally) alimentent les
    // visages de MangoQA. Fire-and-forget : startChatTurn ne lève jamais.
    turnSpan = startChatTurn({ project: projectName, mode: chosenMode, model: useEleve ? "eleve" : (chosenModel ?? "sonnet") });

    // A background compaction may be rewriting this project's session — stop it
    // and wait so the turn resumes a stable session id (old or new, both valid).
    // Inside the try: if it rejects, the finally still releases agentBusy.
    await interruptCompaction();

    // Mode Miroir (#79) — l'agent édite l'UI de Mango elle-même.
    const isMirror = projectName === MIRROR_PROJECT;

    let dir: string;
    const isNewProject = !isMirror && !projectExists(projectName);
    if (isMirror) {
      dir = MANGO_UI_DIR;
      send({ type: "status", text: "🪞 Mode Miroir — l'agent édite l'interface de Mango." });
    } else if (isNewProject) {
      send({ type: "status", text: "Création du projet (template + npm install)…" });
      dir = await createProject(projectName, template || undefined);
    } else {
      dir = projectDir(projectName);
    }
    if (!isMirror) {
      ensureErrorRelay(dir);
      // #5 : tampon de source (dev-only, vite.config.js) + relais clic→source
      // (index.html) — pour l'édition visuelle. Idempotents, sans effet en prod.
      ensureClickSourcePlugin(dir);
      ensureInspectRelay(dir);
      // Snapshot the pre-agent state so the first rollback point always exists
      await ensureRepo(dir);
      historyDir = dir;
      // #176-global É5 — Stratège : surfaçage PUSH d'un briefing court au
      // DÉMARRAGE de session (jumeau spawnVerdictWatcher). Ancre = la création
      // du projet (première conversation), jamais un tour suivant → aucune
      // duplication. Gate STRATEGE_GLOBAL off / briefing vide ⇒ aucune écriture
      // (fire-and-forget, ne bloque jamais ce tour).
      if (isNewProject) maybeInjectStrategeBriefing(historyDir);
    }
    record("user", prompt);

    // Idée #45 Porte A — le contrat de langage se construit TOUT SEUL en
    // arrière-plan depuis la 1ʳᵉ phrase d'intention (recherche web si le domaine
    // est inconnu). Fire-and-forget façon review/compaction : non bloquant,
    // erreurs avalées, ne tourne QUE si .lexique.md est absent/vide. Ne ralentit
    // JAMAIS la réponse de chat.
    if (!isMirror) void generateLexique(dir, prompt).catch(() => {});

    // Kernel — publie la CIBLE design sur le Bus (palette de référence du Perfect
    // Plan) → l'Œil Design (MangoQA) la lit comme `brief` et mesure enfin la
    // conformité au brief (briefDrift). Fire-and-forget, rien si pas de palette.
    if (!isMirror) {
      try {
        const refPalette = paletteFromContract(loadContract(dir));
        publishDesignReference({ project: projectName, palette: refPalette, source: "perfect-plan" });
      } catch {
        /* publier la cible ne casse jamais un tour */
      }
    }

    // Édition visuelle ciblée (#6) : si le tour vient d'un clic→source, on enrichit
    // la tâche envoyée à l'agent avec le fichier:ligne EXACT + l'extrait (edit
    // chirurgical), sans polluer le message affiché ni le titre de version. On
    // capture aussi les octets du fichier cible pour VÉRIFIER objectivement que
    // l'édition a pris (diff non vide — la discipline de mesure appliquée en prod).
    let agentPrompt = prompt;
    let editFile: string | null = null;
    let editBytesBefore: string | null = null;
    if (editTarget?.src) {
      const built = buildVisualEditPrompt(dir, editTarget, prompt);
      if (built) {
        agentPrompt = built.prompt;
        editFile = built.file;
        try {
          editBytesBefore = fs.readFileSync(path.join(dir, built.file), "utf8");
        } catch {
          editBytesBefore = null;
        }
        send({ type: "status", text: `🎯 Édition ciblée : ${built.file}:${built.line}` });
      } else {
        send({ type: "status", text: "⚠ Source de l'élément introuvable — édition en tour normal." });
      }
    }

    let url: string;
    if (isMirror) {
      // Le dev server de Mango tourne déjà sur 5173 — pas besoin de démarrer.
      url = "http://localhost:5173";
      send({ type: "preview", url });
    } else {
      send({ type: "status", text: "Démarrage de l'aperçu…" });
      ({ url } = await startPreview(dir));
      send({ type: "preview", url });
    }
    // Vision mode: bind the snapshot tool to this project's preview, set the
    // per-turn budget for the chosen effort mode, purge last turn's snapshots.
    setVisionContext(dir, url, chosenMode);

    // Idée #80 — capture avant/après (modes vision seulement). Le "before" est
    // pris MAINTENANT (rien n'a encore changé) ; le "after" après le commit.
    // ~2 s de latence, acceptée dans ces modes soignés. Best-effort → null.
    let diffBefore: string | null = null;
    const diffTs = Date.now();
    if (!isMirror && shouldCaptureDiff(chosenMode) && getPreviewUrl()) {
      diffBefore = await captureDiff(dir, getPreviewUrl()!, "before", diffTs).catch(() => null);
    }

    // Runs one agent turn. Returns "session-not-found" when resuming a session
    // the SDK no longer knows (e.g. the project folder was moved/renamed) so
    // the caller can retry with a fresh conversation. The failed "result"
    // event is held back until we know it isn't that case.
    const streamAgentTurn = async (session?: string): Promise<"ok" | "session-not-found"> => {
      let pendingFailure: unknown = null;
      for await (const event of runAgent(agentPrompt, dir, session, chosenModel, chosenMode, tutorial, Boolean(clientMode), styleStrengthN)) {
        if (session && event.type === "error" && /No conversation found/i.test(event.message)) {
          return "session-not-found";
        }
        if (session && event.type === "result" && !event.ok) {
          pendingFailure = event;
          continue;
        }
        if (event.type === "result" && event.sessionId) {
          saveSession(projectName, event.sessionId);
          lastResult.current = { costUsd: event.costUsd, numTurns: event.numTurns };
          if (event.contextTokens && event.contextWindow) {
            lastContext.current = { tokens: event.contextTokens, window: event.contextWindow };
          }
        }
        if (event.type === "tool" && event.name === "Read") turnToolReads.push(event.detail);
        recordEvent(event);
        send(event);
      }
      if (pendingFailure) {
        recordEvent(pendingFailure as AgentEvent);
        send(pendingFailure);
      }
      return "ok";
    };

    if (useEleve && model === "eleve" && chosenMode === "discuss") {
      // Tour CONVERSATIONNEL de l'Élève (boutons Discuter / Planifier) : l'Élève
      // (GLM-5.2 cloud ou Gemma local) répond en TEXTE, ZÉRO build. Même posture
      // que le mode discuss de Claude (DISCUSS_RULES + contexte projet via
      // assembleSystemPrompt), mais le cerveau est l'Élève. Ainsi « rester sur
      // l'Élève » vaut pour les 3 actions, pas seulement Construire.
      // Phase E2 — multi-cerveaux : Planifier et Discuter routent vers LEUR cerveau
      // (registre .brains). Sans affectation → repli global (.env), inchangé.
      // #182 É2 — LE MÊME joint calcule aussi les capacités que la tâche réclame
      // (requiredCaps) : le registre d'outils de la ligne 562 suit le BESOIN, pas la posture.
      let hasProjectAttachment = false;
      try {
        const assetsDir = path.join(dir, ".assets");
        hasProjectAttachment = fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0;
      } catch { /* best-effort */ }
      const { intention: derivedIntention, requiredCaps } = await deriveIntention(true, intention, prompt, {
        hasAttachment: hasProjectAttachment,
      });
      const binding = resolveBinding(derivedIntention);
      const agentTier = binding.provider === "ollama" ? "local" : "cloud";
      const eleveName = binding.card?.label ?? process.env.ELEVE_MODEL ?? "Élève";
      send({ type: "status", text: `💬 L'agent ${eleveName} (${agentTier}) réfléchit…` });
      const system = assembleSystemPrompt({ mode: "discuss", model: "eleve", projectDir: dir });
      // L'Élève n'a pas de session SDK persistante comme Claude : on lui repasse
      // le fil récent comme contexte (loadHistory lit les tours ANTÉRIEURS ; le
      // message courant est ajouté en fin — il sera persisté dans le `finally`).
      const recent = loadHistory(dir)
        .filter((e) => e.role === "user" || e.role === "agent")
        .slice(-12)
        .map((e) => `${e.role === "user" ? "Humain" : "MangoOS"} : ${e.text}`)
        .join("\n");
      const userMsg = recent ? `${recent}\n\nHumain : ${prompt}` : prompt;
      // Discuter AGENTIQUE EN LECTURE : quand le cerveau gère les outils (GLM cloud
      // function-calling), l'Élève peut VRAIMENT lire le projet (list/read/search,
      // borné, lecture seule) pour fonder ses conseils — fini le « je lance la
      // recherche ? » à vide en boucle. Sinon (modèle sans outils) → chat pur, et le
      // prompt discuss lui interdit de faire semblant de chercher (il demande à coller).
      let answer: string;
      if (ELEVE_PROVIDER === "openai") {
        try {
          const r = await askEleveAgentic(system, userMsg, buildEleveDiscussTools(dir, requiredCaps), {
            model: binding.model,
            onTool: (name, args) => send({ type: "tool", name, detail: args }),
          });
          answer = r.text.trim() || "(réponse vide de l'Élève)";
        } catch {
          answer = (await chatEleve(system, userMsg, binding.model, binding.provider, { baseUrl: binding.baseUrl, apiKeyEnv: binding.apiKeyEnv })).trim() || "(réponse vide de l'Élève)";
        }
      } else {
        answer = (await chatEleve(system, userMsg, binding.model, binding.provider, { baseUrl: binding.baseUrl, apiKeyEnv: binding.apiKeyEnv })).trim() || "(réponse vide de l'Élève)";
      }
      record("agent", answer);
      send({ type: "text", text: answer });
      lastResult.current = { costUsd: 0, numTurns: 1 };
      relayMeta.current = { resolvedBy: "eleve", attempts: 1 };
    } else if (useEleve) {
      // Élève path (jalon D + agents spécialisés #145) : le modèle local tente la
      // tâche à coût zéro, un juge objectif évalue, escalade vers Claude si besoin.
      // Pour uxui/layout, le profil spécialisé est injecté dans runRelay.
      const specialistProfile =
        model === "uxui" ? uxuiProfile :
        model === "layout" ? layoutProfile :
        undefined;
      const specialistModel = specialistProfile
        ? (model === "uxui"
            ? (process.env.UXUI_AGENT_MODEL ?? process.env.ELEVE_MODEL ?? "gemma4:12b")
            : (process.env.LAYOUT_AGENT_MODEL ?? process.env.ELEVE_MODEL ?? "gemma4:12b"))
        : undefined;
      // Phase E2 — Construire route vers SON cerveau (registre .brains) : modèle,
      // provider et profil (caps/agentic mesurés) viennent du binding. Spécialistes
      // (uxui/layout) gardent leur profil explicite. Sans affectation → repli global.
      // Construire lève déjà le plafond de mutation ET n'est pas filtré par capacité
      // (buildEleveActionTools = policyFromCaps("mutation","all"), D1) — on ne passe
      // ici que l'INTENTION (le cerveau), requiredCaps n'a aucun effet à filtrer côté outils.
      const buildBinding = !specialistProfile && model === "eleve"
        ? resolveBinding((await deriveIntention(false, intention, agentPrompt)).intention)
        : null;
      const agentLabel = model === "uxui" ? "UX/UI" : model === "layout" ? "Layout CSS" : (buildBinding?.card?.label ?? process.env.ELEVE_MODEL ?? "Élève");
      // « local » pour Ollama local, « cloud » pour un endpoint distant (Ollama Cloud, etc.).
      const provForTier = buildBinding?.provider ?? (ELEVE_PROVIDER === "openai" ? "openai" : "ollama");
      const agentTier = provForTier === "ollama" ? "local" : "cloud";
      send({ type: "status", text: `🎓 L'agent ${agentLabel} (${agentTier}) prend la main…` });
      // Prompt système COMPLET (toute la coquille : skills, design system, identité,
      // mémoire…) — mêmes blocs que Claude. Le moteur agentique (profil fort + GLM)
      // s'en sert pour piloter la coquille entière, pas un prompt nu. Sur le chemin
      // contrat (Gemma) runRelay l'ignore → zéro impact.
      // Nuit 2026-07-03 — template de DOMAINE (bibliothèque locale) : squelette +
      // contraintes design du domaine détecté sur la demande. "" si non détecté.
      let templateSection = "";
      try {
        templateSection = domainTemplateSection(agentPrompt);
      } catch {
        templateSection = "";
      }
      // Boucle de vérification contextuelle — Étape 1bis (gate ELEVE_CONTEXT_CHAINE,
      // off par défaut) : cohérence JOINTE des termes ambigus consécutifs du brief,
      // AVANT que la direction structurelle (templateSection) ne soit injectée dans
      // le prompt système. Ne touche jamais createProject/la réponse SSE — seul un
      // verdict "incoherente" PARSÉ vide templateSection ce tour-là (repli sur le
      // chemin déjà sûr "aucun domaine détecté").
      if (templateSection) {
        const { suppressDomain } = await analyserChaineEnAmontDuGabarit(agentPrompt).catch(() => ({ suppressDomain: false, rapport: null }));
        if (suppressDomain) {
          send({ type: "status", text: "⚠️ Direction ambiguë détectée dans le brief — gabarit de domaine non appliqué ce tour, clarification recommandée." });
          templateSection = "";
        }
      }
      const systemFull = assembleSystemPrompt({ mode: chosenMode, model: "eleve", projectDir: dir, clientMode: Boolean(clientMode), styleStrength: styleStrengthN, templateSection });
      const r = await runRelay(agentPrompt, dir, {
        ...(specialistProfile
          ? { profile: specialistProfile, eleveModel: specialistModel }
          : buildBinding
            ? { profile: buildBinding.profile, eleveModel: buildBinding.model, provider: buildBinding.provider, toolPolicy: policyForBinding(buildBinding), endpoint: { baseUrl: buildBinding.baseUrl, apiKeyEnv: buildBinding.apiKeyEnv } }
            : {}),
        systemFull,
        onLog: (line) => {
          record("status", line);
          send({ type: "status", text: line });
        },
      });
      relayMeta.current = { resolvedBy: r.resolvedBy, attempts: r.attempts };
      lastResult.current = { costUsd: r.costUsd, numTurns: r.attempts };
      const verdict =
        r.resolvedBy === "eleve"
          ? (r.incomplete
              ? (r.aborted
                  ? `⏹ Arrêté à ta demande — ce qui était déjà fait est conservé. Relance-moi pour reprendre là où on en était.`
                  : `⚠ Build vert. L'agent ${agentLabel} a continué seul jusqu'au bout de son budget d'auto-relances sans appeler « terminé » — l'app compile, il reste peut-être un détail. Relance-moi ou précise ce qui manque.`)
              : `✅ Résolu par l'agent ${agentLabel} (${agentTier}) en ${r.attempts} tentative(s) — coût Claude $0.00.`)
          : r.resolvedBy === "maitre"
            ? `👑 L'agent a buté → escaladé au Maître (Claude), corrigé${r.axiom ? " + 1 axiome appris" : ""} — coût $${r.costUsd.toFixed(4)}.`
            : `❌ Échec : ni l'agent ni le Maître n'ont fait passer le build (${r.inspection.signal}).`;
      if (r.success) {
        record("agent", verdict);
        send({ type: "text", text: verdict });
      } else {
        record("error", verdict);
        send({ type: "error", message: verdict });
      }
    } else {
      // Resume the project's previous conversation if the client didn't pass one
      const effectiveSession = sessionId ?? getSession(projectName);
      send({ type: "status", text: "L'agent travaille…" });
      const outcome = await streamAgentTurn(effectiveSession);
      if (outcome === "session-not-found") {
        clearSession(projectName);
        send({ type: "status", text: "Ancienne conversation introuvable — nouvelle conversation démarrée." });
        await streamAgentTurn(undefined);
      }
    }

    // Boucle de vérification contextuelle — Étape 1 (gate ELEVE_CONTEXT_LOOP,
    // off par défaut) : le gabarit choisi correspond-il au sens réel du mot
    // employé par l'utilisateur ? Fire-and-forget, jamais bloquant (même patron
    // que generateLexique). Déclenché ICI, APRÈS la génération réelle (runRelay/
    // streamAgentTurn ci-dessus), pas juste après createProject — L111 (audit
    // CTXLOOP 2026-07-09, 2/3 contrôles « déjà vu » en faux négatif) : lu trop
    // tôt, ce hook comparait le PLACEHOLDER générique du scaffold au brief
    // spécifique (les templates de contenu comme vitrine/ecommerce/threejs n'ont
    // aucun contenu distinctif avant que l'Élève/Claude n'écrive quelque chose).
    // Ici src/App.jsx contient déjà le vrai contenu généré pour ce tour.
    if (isNewProject && template) void verifierChoixGabaritEnArrierePlan(template, prompt, dir).catch(() => {});

    // Vérification d'effet de l'édition visuelle (#6) : signal OBJECTIF que le
    // changement a pris (le fichier cible a changé d'octets), au lieu de le
    // supposer. C'est la parade du caveat n°7 appliquée à la production, dans le
    // seul cas où l'on connaît la cible : un clic→source.
    if (editFile && !turn.some((e) => e.role === "error")) {
      let after: string | null = null;
      try {
        after = fs.readFileSync(path.join(dir, editFile), "utf8");
      } catch {
        after = null;
      }
      const changed = after !== null && after !== editBytesBefore;
      const msg = changed
        ? `✓ Élément modifié — ${editFile} a bien changé.`
        : `⚠ ${editFile} n'a PAS changé — l'édition n'a peut-être pas pris. Reformule ou précise l'élément.`;
      record("status", msg);
      send({ type: changed ? "status" : "error", ...(changed ? { text: msg } : { message: msg }) });
    }

    if (!isMirror) {
      const version = await commitVersion(dir, prompt.replace(/\s+/g, " ").slice(0, 72));
      if (version) {
        record("status", `📌 Version sauvegardée (${version.hash})`);
        send({ type: "version", ...version });
        // Capture the turn's delta for the patrol (#73) — spawned in `finally`.
        patrolFiles.current = await changedFilesInLastCommit(dir).catch(() => []);

        // #139 Gros Projet — garde-fou : si ce tour construisait un incrément
        // Kanban précis, on le marque `done` dans le manifest (au cas où l'agent
        // aurait oublié de cocher .project-plan.json). No-op hors mode projet.
        if (chosenMode === "projet" && incrementId) {
          try {
            markIncrementDone(dir, incrementId, patrolFiles.current);
          } catch {
            /* réconcilier le manifest ne casse jamais un tour */
          }
        }

        // Kernel — publie le RENDU design sur le Bus : palette déclarée + couleurs
        // + paires de contraste extraites des fichiers de STYLE changés ce tour.
        // L'Œil observe ce flux ; fire-and-forget, rien si le tour n'a pas touché
        // au design. Lecture bornée aux fichiers changés (pas tout le projet).
        try {
          const styleFiles = patrolFiles.current
            .filter((f) => /\.(css|scss|jsx|tsx|html|vue|svelte)$/.test(f))
            .slice(0, 20)
            .map((f) => {
              try {
                return { path: f, content: fs.readFileSync(path.join(dir, f), "utf8") };
              } catch {
                return null;
              }
            })
            .filter((x): x is { path: string; content: string } => x !== null);
          if (styleFiles.length > 0) {
            // Capture la palette produite pour mesurer la réutilisation de palette
            // (#122) dans le finally — recouvrement avec les palettes en mémoire.
            const produced = buildProducedDesign(styleFiles);
            turnProducedColors.push(...produced.palette, ...produced.usedColors);
            publishDesignProduced({ project: projectName, files: styleFiles });
          }
        } catch {
          /* publier le rendu ne casse jamais un tour */
        }

        // Mango QA — audit autonome (si le runner est actif — détection automatique par sentinelle).
        // ASYNCHRONE (architecture « audit fantôme ») : on émet le signal et on
        // lance un watcher fire-and-forget — le tour ne bloque JAMAIS sur le
        // verdict. Le watcher l'écrit dans l'historique dès qu'il arrive (même
        // au-delà de l'ancien timeout 60 s : un gros projet met ~143 s) et le
        // chat le re-fetch, comme les patrouilleurs #73. historyDir est null en
        // mode Miroir → pas de surfaçage (cohérent avec la patrouille).
        if (isMangoQaActive()) {
          emitPhaseComplete(projectName, mode ?? 'elite', patrolFiles.current);
          send({ type: "status", text: "🛡️ Mango QA — audit lancé (le verdict s'affichera dès qu'il est prêt)" });
          if (historyDir) spawnVerdictWatcher(projectName, historyDir);
        }
        // Idée #80 — le tour a changé quelque chose : capture le "after" (Vite HMR
        // a déjà rafraîchi) et envoie le diff avant/après au chat en SSE live.
        if (diffBefore && getPreviewUrl()) {
          await new Promise((r) => setTimeout(r, 800)); // laisse Vite HMR rafraîchir
          const diffAfter = await captureDiff(dir, getPreviewUrl()!, "after", diffTs).catch(() => null);
          if (diffAfter) {
            const base = `/api/projects/${encodeURIComponent(projectName)}/diff`;
            send({ type: "diff", before: `${base}/${diffBefore}`, after: `${base}/${diffAfter}` });
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record("error", message);
    send({ type: "error", message });
  } finally {
    releaseAgent();
    if (historyDir) {
      try {
        appendHistory(historyDir, turn);
      } catch (err) {
        console.error("[history]", err instanceof Error ? err.message : err);
      }
      // Hermes pattern: review only delivered, non-failed turns — after the
      // response, so it never costs the user any latency.
      if (turn.some((e) => e.role === "agent") && !turn.some((e) => e.role === "error")) {
        spawnBackgroundReview(historyDir, turn);
        // L'armée automatique (#73) : patrouilleurs spécialisés réveillés par le
        // delta du tour, en parallèle de la review (verrou séparé). historyDir est
        // null en mode Miroir → patrouille sautée (pas d'audit sur l'UI de Mango).
        if (patrolFiles.current.length > 0) {
          spawnPatrol(historyDir, projectType, patrolFiles.current);
        }
      }
      // Hermes context_compressor transposed: compact between turns, in the
      // background, once the context crosses the threshold.
      const ctx = lastContext.current;
      if (!turn.some((e) => e.role === "error") && ctx) {
        const session = getSession(projectName);
        if (session) {
          maybeCompactSession(projectName, historyDir, session, ctx.tokens, ctx.window);
        }
      }
    }
    // One dated record per turn (idea 14): the raw material of the learning
    // curve and of the 2026-06-22 cost audit.
    recordTurnMetrics({
      ts: new Date().toISOString(),
      project: projectName,
      model: useEleve ? "eleve" : (chosenModel ?? "sonnet"),
      mode: chosenMode,
      costUsd: lastResult.current?.costUsd ?? 0,
      numTurns: lastResult.current?.numTurns ?? 0,
      contextTokens: lastContext.current?.tokens,
      contextWindow: lastContext.current?.window,
      snapshots: visionStatus().used,
      durationMs: Date.now() - turnStart,
      error: turn.some((e) => e.role === "error"),
      projectType,
      ...(relayMeta.current
        ? { resolvedBy: relayMeta.current.resolvedBy, attempts: relayMeta.current.attempts }
        : {}),
    });
    // Kernel : publie les réutilisations effectives d'artefacts de ce tour, en UN
    // seul événement (un tour = un recordReuse, le taux reste juste) : lectures de
    // bibliothèque (Read sur .components/.skills/.procedures, #121) + réutilisation
    // de palette (recouvrement de couleurs avec une palette en mémoire, #122) +
    // usage de la mémoire d'artefacts (chercher_artefact a servi du matériel, #156/
    // L29 — capte la réutilisation d'identité invisible au recouvrement de hex).
    // Avant finishChatTurn pour que le tour soit compté au dénominateur du taux.
    publishReuse(projectName, [
      ...detectArtifactReads(turnToolReads),
      ...detectPaletteReuse(turnProducedColors, { exclude: projectName }),
      ...detectArtefactReuse(takeArtefactUsage(projectDir(projectName)), projectName),
    ]);
    // Kernel : clôt le span et publie l'issue du tour sur l'Event Bus. C'est le
    // signal réel que lisent le Disjoncteur (échecs/coût/emballement) et MangoQA.
    // Fire-and-forget — n'altère ni le SSE ni la réponse.
    finishChatTurn(turnSpan, {
      project: projectName,
      mode: chosenMode,
      model: useEleve ? "eleve" : (chosenModel ?? "sonnet"),
      ok: !turn.some((e) => e.role === "error"),
      costUsd: lastResult.current?.costUsd ?? 0,
      numTurns: lastResult.current?.numTurns ?? 0,
      durationMs: Date.now() - turnStart,
      contextTokens: lastContext.current?.tokens,
      ...(relayMeta.current ? { resolvedBy: relayMeta.current.resolvedBy } : {}),
      ...(turn.some((e) => e.role === "error") ? { error: "turn ended with error" } : {}),
    });
    send({ type: "done" });
    res.end();
  }
});
}
