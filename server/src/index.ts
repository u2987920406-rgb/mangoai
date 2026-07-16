// MangoOS backend: chat endpoint (SSE) + project/preview management.
// Mode Miroir (#79) : projectName "__mirror__" → l'agent édite l'UI de Mango elle-même.
export const MIRROR_PROJECT = "__mirror__";
const MANGO_UI_DIR = path.resolve(import.meta.dirname, "..", "..", "ui");
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { ALLOWED_MODELS, ALLOWED_MODES, interruptAgent, runAgent, type AgentEvent, type Mode, type ModelChoice } from "./agent/agent.js";
import { appendHistory, loadHistory, formatToolLine, type ChatEntry } from "./history.js";
import { WORKSPACE_DIR } from "./projects.js";
import { stopPreview } from "./preview.js";
import { clearSession, getSession, saveSession } from "./sessions.js";
import { commitVersion, ensureRepo, changedFilesInLastCommit } from "./versions.js";
import { ensureErrorRelay, ensureInspectRelay } from "./relay.js";
import { ensureClickSourcePlugin, readSourceSnippet, buildVisualEditPrompt, type EditTarget } from "./clicksource.js";
import { deployProject, isDeployTarget } from "./deploy.js";
import { githubConfigured, pushToGitHub } from "./github.js";
import { interruptCompaction, maybeCompactSession } from "./compaction.js";
import { clearInterrupt, requestInterrupt } from "./interrupt.js";
import { ensureHomeScratch, cleanHomeScratch, graduateHomeScratch, detectsBuildIntent } from "./home-scratch.js";
import { closeBrowser } from "./vision.js";
import { shouldCaptureDiff, captureDiff } from "./vision-diff.js";
import { readMetrics, recordTurnMetrics } from "./metrics.js";
import { sovereigntyReport, formatSovereignty } from "./sovereignty-metrics.js";
import { runRelay, chatEleve, askEleveAgentic, ELEVE_PROVIDER } from "./eleve.js";
import { resolveBinding, deriveIntention, policyForBinding } from "./brain/brain-runtime.js";
import { requiredCapabilities, toolDemandSignal } from "./intent-capabilities.js";
// T5 : l'orchestration de l'Accueil passe le dispatcher via la façade cerveau unique.
import { assembleSystemPrompt, FIDELITY_CLAUSE } from "./scenario.js";
import { isAgentBusy } from "./agent/agent-lock.js";
import { getBus } from "./kernel/kernel-bus.js";
import { installMangoQaBridge } from "./kernel/kernel-mangoqa-bridge.js";
import { Blackboard, setBlackboard } from "./kernel/kernel-blackboard.js";
import { installTraceCollector, registerTraceRoutes } from "./trace-dashboard.js";
import { installArtifactStore, registerArtifactRoutes } from "./kernel/kernel-artifacts.js";
import { installReuseCollector, installReuseImpactCollector, registerReuseRoutes } from "./kernel/kernel-reuse-metrics.js";
import { registerCurationEffectRoutes } from "./kernel/kernel-curation-effect.js";
import { startChatTurn, finishChatTurn } from "./kernel/kernel-chat-bridge.js";
import { publishDesignReference, publishDesignProduced, buildProducedDesign, paletteFromContract } from "./kernel/kernel-design-events.js";
import { verifierChoixGabaritEnArrierePlan, analyserChaineEnAmontDuGabarit } from "./eleve-context-hook.js";
import { registerPromptLabRoutes } from "./promptlab.js";
import { registerTokenizerRoutes } from "./tokenizer.js";
import { registerIdeationRoutes } from "./ideation.js";
import { registerVeilleRoutes } from "./veille.js";
import { registerModelRouterRoutes } from "./model-router.js";
import { registerDocGeneratorRoutes } from "./docgenerator.js";
import { registerVersionGraphRoutes } from "./version-graph.js";
import { registerControleurRoutes } from "./qa-temporal.js";
import { registerMangoQaRoutes } from "./mangoqa.js";
import { registerStrategeRoutes } from "./stratege/stratege-routes.js";
import { registerFormationRoutes } from "./formation/formation-routes.js";
import { registerPerimeterRoutes } from "./perimeter-routes.js";
import { loadPlan, replaceIncrements, markIncrementDone, loadFluxCounts } from "./project-plan.js";
import { registerStripeRoutes } from "./stripe.js";
import { registerCronRoutes } from "./cron-scheduler.js";
import { registerControlBoardRoutes } from "./control-board-routes.js";
import { registerMetricsDashboardRoutes } from "./metrics-dashboard.js";
import { registerNotesRAGRoutes } from "./notes-rag.js";
import { registerMultiProjectRoutes } from "./multi-project.js";
import { registerAutoAblationRoutes } from "./auto-ablation.js";
import { registerDesignReviewRoutes } from "./design/design-review.js";
import { registerSuperAgentRoutes } from "./super-agent-builder.js";
import { registerKnowledgeStoresRoutes } from "./knowledge-stores-routes.js";
import { registerLibraryRoutes } from "./library-routes.js";
import { registerCouncilSkillsRoutes } from "./council-skills-routes.js";
import { registerBackendServerRoutes } from "./backend-server-routes.js";
import { registerProjectIORoutes } from "./project-io-routes.js";
import { registerFeedbackRoutes } from "./feedback-routes.js";
import { registerPdfRoutes } from "./pdf-routes.js";
import { registerTutorialRoutes } from "./tutorial.js";
import { registerNocturnalRoutes } from "./nocturnal.js";
import { registerPromptEvolutionRoutes } from "./prompt-evolution.js";
import { registerAbHarnessRoutes } from "./ab-harness.js";
import { registerRadarRoutes } from "./radar.js";
import { registerBuildReviewRoutes } from "./build-review-routes.js";
import { registerBrainRoutes } from "./brain/brain-routes.js";
import { registerBrainDispatchRoutes } from "./brain/brain-dispatch-routes.js";
import { registerOllamaRoutes } from "./ollama-routes.js";
import { registerTasteRoutes } from "./taste/taste-routes.js";
import { registerDesignCoachRoutes } from "./design/design-coach-routes.js";
import { registerSelfRoutes } from "./self/self-routes.js";
import { registerSpecialistRoutes } from "./specialist/specialist-routes.js";
import { registerEstheteRoutes } from "./esthete-routes.js";
import { ensureEstheteAgent } from "./esthete-agent.js";
import { registerSelfEvolutionRoutes } from "./self/self-evolution-routes.js";
import { startTasteNocturnalScheduler } from "./taste/taste-nocturnal.js";
import { startBlackboardDecayScheduler } from "./kernel/kernel-blackboard-decay.js";
import { prewarmVision } from "./vision-prewarm.js";
import { sweepOrphanPreviews } from "./preview-sweep.js";
import { lanIPv4s } from "./net.js";
import { bootstrapProfile, hasProfile, type OnboardingAnswers } from "./onboarding.js";
import { registerPerfectPlanRoutes } from "./perfect-plan-routes.js";
import { registerWireframeForkRoutes } from "./wireframe-fork-routes.js";
import { registerHomeConversationsRoutes } from "./home-conversations-routes.js";
import { registerAgentFactoryRoutes } from "./agent/agent-routes.js";
import { restoreAgents } from "./agent/agent-runtime.js";
// #138 OS d'apps — colonne de données partagée + surface Suite (la spine).
import { listDocs, getDoc, putDoc, deleteDoc, slug, subscribe } from "./shared-data.js";
import { registerSuiteRoutes } from "./suite-routes.js";
import {
  loadManifest, findManifestById, accessAllowsWrite,
  findCollectionSchema, validateAgainstSchema, type MangoAppManifest,
} from "./mango-app-contract.js";
// (Un, 2026-07-03) U4 — ensureManifest (A0.2) n'avait AUCUN appelant en prod : le
// gate MEMORY_MANIFEST promettait un comportement que rien ne déclenchait jamais.
import { ensureManifest } from "./memory-manifest.js";
import { registerChatRoute } from "./routes/chat-route.js";
import { registerImagesRoutes } from "./routes/images-routes.js";
import { registerProjectsRoutes } from "./routes/projects-routes.js";
import { registerHomeRoutes } from "./routes/home-routes.js";
import { registerPreviewRoutes } from "./routes/preview-routes.js";
import { registerSharedDataRoutes } from "./routes/shared-data-routes.js";
import { registerSystemRoutes } from "./routes/system-routes.js";

// Last-resort safety net: a bug in a fire-and-forget background task (review,
// compaction) or any forgotten await must never take the whole server down —
// Node's default is to exit on unhandled rejections.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandled-rejection]", reason instanceof Error ? (reason.stack ?? reason.message) : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaught-exception]", err.stack ?? err.message);
});

const PORT = Number(process.env.PORT ?? 3000);
// Écoute LAN (#149 v2) : par défaut 0.0.0.0 pour que le téléphone de Raf (même Wi-Fi) puisse
// ouvrir /taste/review. Repli localhost en posant HOST=localhost. Exposition LAN domicile
// uniquement — pas d'Internet (cf. décision d'archi : LAN + push ntfy, zéro tunnel).
const HOST = process.env.HOST ?? "0.0.0.0";
const app = express();
// (Un, 2026-07-03) U11 — CORS était grand ouvert (toute origine) alors que le
// serveur écoute sur le LAN : n'importe quelle page web visitée depuis une
// machine du réseau pouvait appeler l'API en cross-origin. Origines limitées à
// l'UI (5173), l'app générée (5174) et le backend lui-même (3000).
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"] }));
// Limite de corps relevée à 25 Mo : les pièces jointes du chat (ex. statut.md
// ~200 Ko, voire plusieurs fichiers) embarquent leur contenu dans le JSON du
// message. La limite Express par défaut (100 Ko) faisait échouer ces requêtes en
// 413 silencieux. 25 Mo = large marge sans risque (local-first, pas exposé).
app.use(express.json({ limit: "25mb" }));

// (N18, nuit 2026-07-03) le verrou agent vit désormais dans agent-lock.ts
// (module partagé) pour que la boucle NOCTURNE l'acquière aussi — fini les
// collisions chat/nocturne (currentQuery écrasé, vision d'un autre projet).

registerProjectsRoutes(app);

registerHomeRoutes(app);

// Body: { prompt: string, projectName: string, sessionId?: string }
// Streams AgentEvent objects as SSE. Creates the project on first message.
registerChatRoute(app, { mangoUiDir: MANGO_UI_DIR, mirrorProject: MIRROR_PROJECT });

registerPreviewRoutes(app);

registerSystemRoutes(app);

registerKnowledgeStoresRoutes(app);
registerLibraryRoutes(app);
registerCouncilSkillsRoutes(app);
registerBackendServerRoutes(app);
registerProjectIORoutes(app, () => isAgentBusy());
registerFeedbackRoutes(app);
registerBrainRoutes(app);
registerBrainDispatchRoutes(app);
registerOllamaRoutes(app);
registerTasteRoutes(app);
registerDesignCoachRoutes(app);
registerSelfRoutes(app); // Atelier de Mango — auto-amélioration (barreaux 1-4)
registerSpecialistRoutes(app); // La Forge — agents spécialisés forgés par Mango (slice 2a)
ensureEstheteAgent(); // Agent système « Esthète » — seed idempotent au boot (sidebar Design)
registerEstheteRoutes(app); // Chat conversationnel de l'Esthète (voit la preview, retouche)
registerSelfEvolutionRoutes(app); // #168 — Boucle d'auto-évolution (semi-auto) : lacunes → forge validée
registerHomeConversationsRoutes(app); // Écran « Conversation » : revoir/reprendre les discussions d'accueil

// Routes /api/image/* extraites vers routes/images-routes.ts (ordre préservé).
registerImagesRoutes(app);

registerSharedDataRoutes(app);

registerSuiteRoutes(app);

registerPromptLabRoutes(app);
registerTraceRoutes(app);
registerArtifactRoutes(app);
registerReuseRoutes(app);
registerCurationEffectRoutes(app);
registerTokenizerRoutes(app);
registerIdeationRoutes(app);
registerVeilleRoutes(app);
registerModelRouterRoutes(app);
registerDocGeneratorRoutes(app);
registerVersionGraphRoutes(app);
registerControleurRoutes(app);
registerMangoQaRoutes(app);
registerStrategeRoutes(app);
registerFormationRoutes(app); // #181 É3 — POST /api/formation { sujet } (fire-and-forget, verrou agent-lock)
registerPerimeterRoutes(app);
registerStripeRoutes(app);
registerCronRoutes(app);
registerControlBoardRoutes(app);
registerMetricsDashboardRoutes(app);
registerNotesRAGRoutes(app);
registerAutoAblationRoutes(app);
registerMultiProjectRoutes(app);
registerDesignReviewRoutes(app);
registerSuperAgentRoutes(app);
registerTutorialRoutes(app);
registerNocturnalRoutes(app);
registerRadarRoutes(app);
registerPromptEvolutionRoutes(app);
registerAbHarnessRoutes(app);
registerBuildReviewRoutes(app);
registerPerfectPlanRoutes(app);
registerWireframeForkRoutes(app);
registerAgentFactoryRoutes(app);
// Agent PDF (#145, Chantier 3) — async (charge pdfjs-dist + Ollama paresseusement),
// best-effort : un échec d'init ne doit jamais empêcher le serveur de démarrer.
registerPdfRoutes(app).catch((err) =>
  console.error("[pdf] init routes échouée :", err instanceof Error ? err.message : err),
);

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`MangoOS backend → http://localhost:${PORT}`);
  // URL LAN (#149 v2) : à ouvrir sur le téléphone (même Wi-Fi) pour /taste/review.
  if (HOST === "0.0.0.0") {
    for (const ip of lanIPv4s()) console.log(`MangoOS LAN     → http://${ip}:${PORT}  (validation goût : /taste/review)`);
  }
  // Anti-orphelin des APERÇUS : au boot le pool d'aperçus est vide, donc tout
  // serveur Vite qui squatte encore la plage 5174+ est un orphelin d'une session
  // backend morte (tuée sans le taskkill gracieux → enfants survivants). On les
  // balaie pour que les previews repartent propres. Best-effort, ne lève jamais.
  // Opt-out PREVIEW_SWEEP=off. Pendant idéal du check anti-orphelin du port 3000.
  try {
    const sweep = sweepOrphanPreviews();
    if (sweep.killed.length > 0) {
      console.log(`[preview-sweep] ${sweep.killed.length} aperçu(s) Vite orphelin(s) balayé(s) au boot : ${sweep.killed.join(", ")}`);
    }
  } catch (e) {
    console.warn("[preview-sweep] balayage ignoré :", e instanceof Error ? e.message : e);
  }
  // Pré-chauffe l'œil local (lève L22) : charge le VL `vision` (qwen3-vl:8b) en VRAM
  // en arrière-plan pour que le 1er regard (vois_ecran/Œil-Coach/Gardien) soit immédiat.
  // Fire-and-forget, ne lève jamais, saute si cloud ou VISION_PREWARM=off.
  void prewarmVision();
  // Curation de goût nocturne (#149 v2) — scheduler opt-in (config.enabled défaut false).
  startTasteNocturnalScheduler();
  // Decay mémoire du Blackboard (harnais-2027 §2) — no-op tant que BLACKBOARD_TTL=off.
  startBlackboardDecayScheduler();
  restoreAgents().catch((e) => console.warn("[agent-factory] restoreAgents:", e));
  // (Un, 2026-07-03) U4 — A0.2 : manifeste des magasins mémoire fichiers
  // (workspace/.memory-manifest.json). ensureManifest se gate déjà elle-même sur
  // MEMORY_MANIFEST (no-op tant qu'il est OFF, défaut) ; ce try/catch est une
  // deuxième ceinture fail-open — un souci d'écriture ne doit jamais empêcher le boot.
  try {
    ensureManifest(WORKSPACE_DIR);
  } catch (e) {
    console.warn("[memory-manifest] ensureManifest au boot ignoré :", e instanceof Error ? e.message : e);
  }
  // Kernel : branche MangoQA (fantôme externe) sur l'Event Bus via le pont
  // d'export — l'observateur '*' déverse le flux du bus dans .mangoqa/ que le
  // fantôme lit. Silencieux tant que rien ne publie (migration du chat à venir).
  installMangoQaBridge(getBus());
  // Kernel : collecteur de traces — s'abonne aux spans `kernel.trace` du Bus pour
  // alimenter le tableau de bord (/api/traces). Voit chat.turn ET brain.complete.
  installTraceCollector(getBus());
  // Kernel : observateur d'artefacts — persiste les designs (palettes Sharingan
  // cibles + rendus) du flux design.* dans le Blackboard, cross-projet et
  // sémantiquement interrogeable. Résout getBlackboard() à chaque événement → voit
  // le store SQLite une fois la persistance (ci-dessous) branchée en async.
  installArtifactStore(getBus());
  // Kernel : collecteur de réutilisation — compte les tours (chat.turn) et les
  // réutilisations effectives d'artefacts (artifact.reuse) pour mesurer si la
  // réinjection #118→#120 sert vraiment. Alimente /api/reuse.
  installReuseCollector(getBus());
  // Kernel : collecteur d'IMPACT — corrèle la réutilisation au coût/qualité du
  // tour (un tour qui réutilise coûte-t-il moins, va-t-il plus vite, réussit-il
  // mieux ?). Apparie artifact.reuse ↔ chat.turn par projet. Alimente
  // /api/reuse/impact.
  installReuseImpactCollector(getBus());
  // Kernel : persistance du Blackboard si BLACKBOARD_DB est défini (sinon mémoire,
  // comportement historique). node:sqlite est intégré au runtime → import DYNAMIQUE
  // pour ne charger le module que quand la persistance est activée. Fallback mémoire
  // si l'ouverture échoue : le Kernel ne refuse jamais de démarrer pour ça.
  const blackboardDb = (process.env.BLACKBOARD_DB ?? "").trim();
  if (blackboardDb) {
    import("./kernel/kernel-blackboard-sqlite.js")
      .then(({ SqliteStore }) => {
        setBlackboard(new Blackboard(new SqliteStore(blackboardDb)));
        console.log(`[kernel] Blackboard persistant → ${blackboardDb} (SQLite)`);
      })
      .catch((e) => console.warn("[kernel] Blackboard persistance indisponible, mémoire conservée:", e instanceof Error ? e.message : e));
  }
  // MangoOS passe TOUJOURS par l'abonnement Claude Code (query() + subscriptionEnv),
  // jamais par les crédits API : aucune ANTHROPIC_API_KEY n'est requise. Si une clé
  // traîne dans l'env, elle est neutralisée à chaque appel — on le signale juste.
  if (process.env.ANTHROPIC_API_KEY) {
    console.warn("ℹ️  ANTHROPIC_API_KEY détectée — ignorée : MangoOS utilise l'abonnement Claude Code, pas les crédits API.");
  }
});
// Node.js 18+ ferme les connexions après requestTimeout=300s (HTTP 408) par défaut.
// Les sessions SSE Claude Élite durent jusqu'à 1h → on désactive cette limite.
httpServer.requestTimeout = 0;

// (N20, nuit 2026-07-03) Shutdown PROPRE : tuer/crasher le backend (ce que fait
// chaque redémarrage, y compris la session automatique nocturne) laissait
// jusqu'à MAX_PREVIEWS serveurs Vite + un msedge headless orphelins qui
// squattaient les ports au réveil — la moitié de la procédure anti-orphelin
// du CLAUDE.md compensait CE trou. On draine le pool + on ferme Playwright.
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} reçu — arrêt des aperçus Vite + navigateur…`);
  // Borne dure : le shutdown lui-même ne doit jamais pendre (taskkill bornés à 3 s).
  const work = Promise.allSettled([stopPreview(), closeBrowser()]);
  await Promise.race([work, new Promise((r) => setTimeout(r, 8_000))]);
  process.exit(0);
}
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
// Windows : la fermeture de la console émet SIGHUP via le wrapper — best-effort.
process.on("SIGHUP", () => void gracefulShutdown("SIGHUP"));
