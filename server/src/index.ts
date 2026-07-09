// MangoOS backend: chat endpoint (SSE) + project/preview management.
// Mode Miroir (#79) : projectName "__mirror__" → l'agent édite l'UI de Mango elle-même.
export const MIRROR_PROJECT = "__mirror__";
const MANGO_UI_DIR = path.resolve(import.meta.dirname, "..", "..", "ui");
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { ALLOWED_MODELS, ALLOWED_MODES, interruptAgent, runAgent, type AgentEvent, type Mode, type ModelChoice } from "./agent.js";
import { appendHistory, loadHistory, formatToolLine, type ChatEntry } from "./history.js";
import { createProject, deleteProject, listProjects, listTemplates, projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { loadHooks } from "./mango-hooks-config.js";
import { axiomStats } from "./axioms.js";
import { computeInsights } from "./metrics-insights.js";
import { inferProjectType } from "./blueprints.js";
import { previewStatus, previewList, isPreviewing, startPreview, stopPreview } from "./preview.js";
import { clearSession, getSession, saveSession } from "./sessions.js";
import { commitVersion, ensureRepo, changedFilesInLastCommit } from "./versions.js";
import { ensureErrorRelay, ensureInspectRelay } from "./relay.js";
import { ensureClickSourcePlugin, readSourceSnippet, buildVisualEditPrompt, type EditTarget } from "./clicksource.js";
import { deployProject, isDeployTarget } from "./deploy.js";
import { githubConfigured, pushToGitHub } from "./github.js";
import { spawnBackgroundReview } from "./review.js";
import { spawnPatrol } from "./patrol.js";
import { interruptCompaction, maybeCompactSession } from "./compaction.js";
import { clearInterrupt, requestInterrupt } from "./interrupt.js";
import { generateKreaImage } from "./krea.js";
import { slugify as fluxSlugify } from "./eleve-flux-tools.js";
import { saveUpload } from "./uploads.js";
import { ensureHomeScratch, cleanHomeScratch, graduateHomeScratch, detectsBuildIntent } from "./home-scratch.js";
import { setVisionContext, snapZone, visionStatus, getPreviewUrl, closeBrowser } from "./vision.js";
import { shouldCaptureDiff, captureDiff } from "./vision-diff.js";
import { readMetrics, recordTurnMetrics } from "./metrics.js";
import { sovereigntyReport, formatSovereignty } from "./sovereignty-metrics.js";
import { runRelay, chatEleve, askEleveAgentic, ELEVE_PROVIDER } from "./eleve.js";
import { buildEleveDiscussTools } from "./eleve-action-tools.js";
import { resolveBinding, deriveIntention, policyForBinding } from "./brain-runtime.js";
import { requiredCapabilities, toolDemandSignal } from "./intent-capabilities.js";
import { runFrontierOrchestration } from "./frontier-orchestration.js";
import { dispatch } from "./brain-dispatch.js";
import { assembleSystemPrompt, FIDELITY_CLAUSE } from "./scenario.js";
import { flag } from "./flags.js";
import { getBrain } from "./brain-registry.js";
import { temporalContext } from "./temporal-context.js";
import { domainTemplateSection } from "./template-library.js";
import { isAgentBusy, tryAcquireAgent, releaseAgent } from "./agent-lock.js";
import { uxuiProfile } from "./models/uxui.js";
import { layoutProfile } from "./models/layout.js";
import { getBus } from "./kernel-bus.js";
import { installMangoQaBridge } from "./kernel-mangoqa-bridge.js";
import { Blackboard, setBlackboard } from "./kernel-blackboard.js";
import { installTraceCollector, registerTraceRoutes } from "./trace-dashboard.js";
import { installArtifactStore, registerArtifactRoutes } from "./kernel-artifacts.js";
import { installReuseCollector, installReuseImpactCollector, registerReuseRoutes, detectArtifactReads, detectPaletteReuse, detectArtefactReuse, publishReuse } from "./kernel-reuse-metrics.js";
import { takeArtefactUsage } from "./eleve-artefact-usage.js";
import { registerCurationEffectRoutes } from "./kernel-curation-effect.js";
import { startChatTurn, finishChatTurn } from "./kernel-chat-bridge.js";
import type { Span } from "./kernel-trace.js";
import { publishDesignReference, publishDesignProduced, buildProducedDesign, paletteFromContract } from "./kernel-design-events.js";
import { loadContract } from "./perfect-plan.js";
import { generateLexique } from "./lexique.js";
import { verifierChoixGabaritEnArrierePlan, analyserChaineEnAmontDuGabarit } from "./eleve-context-hook.js";
import { registerPromptLabRoutes } from "./promptlab.js";
import { registerTokenizerRoutes } from "./tokenizer.js";
import { registerIdeationRoutes } from "./ideation.js";
import { registerVeilleRoutes } from "./veille.js";
import { registerModelRouterRoutes } from "./model-router.js";
import { registerDocGeneratorRoutes } from "./docgenerator.js";
import { registerVersionGraphRoutes } from "./version-graph.js";
import { registerControleurRoutes } from "./qa-temporal.js";
import { emitPhaseComplete, spawnVerdictWatcher, isMangoQaActive, registerMangoQaRoutes } from "./mangoqa.js";
import { registerStrategeRoutes, maybeInjectStrategeBriefing } from "./stratege-routes.js";
import { registerFormationRoutes } from "./formation-routes.js";
import { registerPerimeterRoutes } from "./perimeter-routes.js";
import { loadPlan, replaceIncrements, markIncrementDone, loadFluxCounts } from "./project-plan.js";
import { registerStripeRoutes } from "./stripe.js";
import { registerCronRoutes } from "./cron-scheduler.js";
import { registerMetricsDashboardRoutes } from "./metrics-dashboard.js";
import { registerNotesRAGRoutes } from "./notes-rag.js";
import { registerMultiProjectRoutes } from "./multi-project.js";
import { registerAutoAblationRoutes } from "./auto-ablation.js";
import { registerDesignReviewRoutes } from "./design-review.js";
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
import { loadReview } from "./build-review.js";
import { registerBrainRoutes } from "./brain-routes.js";
import { registerBrainDispatchRoutes } from "./brain-dispatch-routes.js";
import { registerOllamaRoutes } from "./ollama-routes.js";
import { registerTasteRoutes } from "./taste-routes.js";
import { registerDesignCoachRoutes } from "./design-coach-routes.js";
import { registerSelfRoutes } from "./self-routes.js";
import { registerSpecialistRoutes } from "./specialist-routes.js";
import { registerEstheteRoutes } from "./esthete-routes.js";
import { ensureEstheteAgent } from "./esthete-agent.js";
import { registerSelfEvolutionRoutes } from "./self-evolution-routes.js";
import { startTasteNocturnalScheduler } from "./taste-nocturnal.js";
import { prewarmVision } from "./vision-prewarm.js";
import { sweepOrphanPreviews } from "./preview-sweep.js";
import { lanIPv4s } from "./net.js";
import { bootstrapProfile, hasProfile, type OnboardingAnswers } from "./onboarding.js";
import { registerPerfectPlanRoutes } from "./perfect-plan-routes.js";
import { registerHomeConversationsRoutes } from "./home-conversations-routes.js";
import { registerAgentFactoryRoutes } from "./agent-routes.js";
import { restoreAgents } from "./agent-runtime.js";
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

app.get("/api/projects", (_req, res) => {
  const projects = listProjects();
  // #93 — la note de revue utilisateur (1-5) par projet, pour afficher les étoiles
  // dans « Mes projets » (vision directe : revu ? + combien d'étoiles). Léger : lit
  // le .build-review.json de chaque projet ; absent → le projet n'est pas dans la map.
  const reviews: Record<string, { score: number }> = {};
  for (const name of projects) {
    const r = loadReview(name);
    if (r && typeof r.score === "number" && r.score > 0) reviews[name] = { score: r.score };
  }
  res.json({
    projects,
    reviews,
    templates: listTemplates(),
    preview: previewStatus(),
    githubEnabled: githubConfigured(),
  });
});

app.delete("/api/projects/:name", async (req, res) => {
  const name = req.params["name"] as string;
  try {
    // Si l'aperçu tourne sur CE projet, l'arrêter d'abord : sinon le dev server
    // Vite garde le dossier verrouillé (Windows) et rmSync échoue.
    const dir = path.resolve(projectDir(name));
    if (isPreviewing(dir)) {
      await stopPreview(dir);
    }
    deleteProject(name);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// #139 Gros Projet — le manifest d'orchestration (.project-plan.json) lu par le
// Kanban du cockpit. `plan` = null tant qu'aucun squelette n'a été scaffoldé ;
// `flux` = compteurs de cohérence de l'Auditeur de Flux (MangoQA) si présents.
app.get("/api/projects/:name/plan", (req, res) => {
  const name = req.params["name"] as string;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  const dir = projectDir(name);
  res.json({ plan: loadPlan(dir), flux: loadFluxCounts(dir) });
});

// Édition Kanban : réordre / ajout / renommage des incréments (PAS le build, qui
// passe par /api/chat avec mode:"projet"). Le squelette n'est jamais touché ici.
app.put("/api/projects/:name/plan", (req, res) => {
  const name = req.params["name"] as string;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  const { increments } = req.body as { increments?: unknown };
  const plan = replaceIncrements(projectDir(name), increments);
  if (!plan) {
    res.status(409).json({ error: "Aucun plan de chantier pour ce projet (squelette pas encore posé)." });
    return;
  }
  res.json({ plan });
});

// Noms HUMAINS des cerveaux non-Élève sélectionnables à l'Accueil (#182 D3 — divulgation).
const HOME_BRAIN_NAMES: Record<string, string> = {
  fable: "Fable", sonnet: "Sonnet", opus: "Opus", haiku: "Haiku",
};

// #182 D3/É5 suite — expose le gate HOME_QUICK_MODEL au client (aucune route
// générique /api/flags n'existe déjà ; on en ajoute une isolée, minimale).
app.get("/api/flags/home-quick-model", (_req, res) => {
  res.json({ enabled: flag("HOME_QUICK_MODEL") });
});

// ── Chat d'accueil — conversation directe avec MangoOS (sans projectName) ──
app.post("/api/home-chat", async (req, res) => {
  const { messages, model, convId } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    convId?: string; // brouillon de la conversation d'accueil (disque + outils)
  };
  if (!messages?.length) {
    res.status(400).json({ error: "messages required" });
    return;
  }
  // Chaque tour d'accueil repart d'un drapeau d'arrêt PROPRE — même règle que /api/chat.
  // Sans ça, un seul « Stop » (drapeau module de interrupt.ts) rendait TOUTES les
  // discussions d'accueil suivantes muettes (« ⏹ Arrêté à ta demande »). Bug débusqué
  // en montant l'Accueil conversationnel du shell 2.0 (2026-07-02).
  clearInterrupt();
  const MODEL_MAP: Record<string, string> = {
    fable:  "claude-fable-5",              // Fable 5 — le plus capable (via abonnement, cf. llm-engine)
    sonnet: "claude-sonnet-4-6",
    opus:   "claude-opus-4-8",
    haiku:  "claude-haiku-4-5-20251001",
  };
  const resolvedModel = MODEL_MAP[model ?? "sonnet"] ?? "claude-sonnet-4-6";
  const last = messages[messages.length - 1];
  const history = messages
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "Humain" : "MangoOS"} : ${m.content}`)
    .join("\n");

  // Mango propose-t-il de passer à l'atelier ? (intention de CONSTRUIRE détectée)
  const suggestGraduate = detectsBuildIntent(last?.content ?? "");

  try {
    // ── ÉLÈVE (GLM) → home AGENTIQUE : la page d'accueil « peut tout faire dès le départ ».
    // Le brouillon `convId` donne un disque (.assets) ; l'Élève reçoit les outils de LECTURE
    // (read/list/search + web + lire_document + lire_archive + requete_web GET) — PAS d'écriture
    // ni de build (c'est Raf qui valide la graduation vers l'atelier). Repli chatEleve sans outils.
    if (model === "eleve" && ELEVE_PROVIDER === "openai" && convId) {
      const scratch = ensureHomeScratch(convId);
      const sys = [
        flag("TEMPORAL_AWARENESS") ? temporalContext() : "",
        "Tu es MangoOS, l'assistant IA personnel de Raf — chaleureux, direct, concis. Réponds en français sauf si on te parle en anglais.",
        "Tu es une application AUTONOME sur la machine de Raf — NI Claude Code, NI un terminal, NI un outil externe. Ne renvoie jamais vers un terminal/des réglages d'un autre logiciel : tout se fait DANS MangoOS.",
        "TU AS DES OUTILS, sers-t'en SANS demander la permission : LIS les fichiers joints et le brouillon (read_file/list_files/search_code), OUVRE une archive (.zip/.rar → lire_archive), lis un PDF/Word/Excel (lire_document), lis le WEB (lire_page/chercher_web/extraire_site) et interroge une API en GET (requete_web). Les pièces jointes de Raf sont dans .assets/. Ne dis JAMAIS « je n'ai pas accès au disque/à internet » ni « colle le contenu » : ouvre-les toi-même.",
        FIDELITY_CLAUSE,
        "Tu es ici en posture DISCUTER (lire, analyser, conseiller) — tu n'écris pas de fichiers et ne construis pas d'app ICI. Quand Raf veut CONSTRUIRE ou PLANIFIER, propose-lui de passer dans l'ATELIER (workspace) : « on ouvre l'atelier ? j'y emporte nos fichiers et le contexte » — c'est LUI qui valide.",
        history ? `\n— Historique —\n${history}` : "",
      ].filter(Boolean).join("\n");
      // #182 É2 — le registre offert suit le BESOIN de la tâche, pas la posture : une
      // pièce jointe dans .assets/ ou un mot-clé « regarde/rends » ÉLARGIT les capacités
      // read-safe (vision incluse) au-delà du défaut (read-local + read-web).
      let hasAttachment = false;
      try {
        const assetsDir = path.join(scratch, ".assets");
        hasAttachment = fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length > 0;
      } catch { /* best-effort */ }
      const homeCaps = await requiredCapabilities(last.content, { hasAttachment });
      const r = await askEleveAgentic(sys, last.content, buildEleveDiscussTools(scratch, homeCaps), {
        model: process.env.ELEVE_MODEL,
      });
      res.json({ text: (r.text ?? "").trim() || "(réponse vide de l'Élève)", suggestGraduate });
      return;
    }

    // ── Repli : conversation TEXTE (Claude, ou Élève sans brouillon/endpoint cloud) ──
    const system = [
      flag("TEMPORAL_AWARENESS") ? temporalContext() : "",
      "Tu es MangoOS, l'assistant IA personnel de Raf. Tu es chaleureux, direct et concis.",
      "Réponds en français sauf si on te parle en anglais.",
      "Tu es une application autonome qui tourne sur la machine de Raf — tu n'es NI Claude Code, NI un terminal, NI un outil externe. Ne mentionne jamais « Claude Code », ne renvoie jamais vers un terminal, une commande slash, ou des réglages d'un autre logiciel : tout (permissions, actions, génération) se fait à l'intérieur de MangoOS.",
      "ACCÈS AUX FICHIERS : dans cette conversation tu n'as pas d'outils de lecture disque — pour qu'on te montre un fichier, demande à Raf de l'ATTACHER avec le bouton trombone 📎 ; son contenu t'arrivera dans le message entre des balises [[FILE:nom]]…[[/FILE]]. Ne prétends jamais avoir lu un fichier que tu n'as pas reçu ainsi.",
      history ? `\n— Historique —\n${history}` : "",
    ].filter(Boolean).join("\n");
    let text: string;
    if (model === "eleve") {
      text = await chatEleve(system, last.content);
    } else if (model === "qwen") {
      // Qwen (« KUEN ») — VL/juge local via Ollama Cloud, souverain. Routage explicite du provider.
      const { askLLM } = await import("./llm-engine.js");
      text = await askLLM(system, last.content, { provider: "ollama", model: "qwen3.5:cloud", maxTokens: 2048 });
    } else {
      // ── Cerveau NON-ÉLÈVE (Fable/Opus/Sonnet/Haiku) — chemin TEXTE PUR (askLLM sans
      // outils). #182 D3/É5 : ne plus rester SILENCIEUX quand la tâche réclame des outils.
      let hasAttachment = false;
      if (convId) {
        try {
          const a = path.join(ensureHomeScratch(convId), ".assets");
          hasAttachment = fs.existsSync(a) && fs.readdirSync(a).length > 0;
        } catch { /* best-effort */ }
      }
      const demanded = toolDemandSignal(last.content, { hasAttachment });
      // #182 D3/É5 suite — sous le gate, le registre `accueil` (popup rapide, n'importe
      // quel modèle Ollama installé) REMPLACE le MODEL_MAP figé comme source du
      // brainOverride. OFF (défaut) → accueilBrain reste null, comportement byte-identique.
      const accueilBrain = flag("HOME_QUICK_MODEL") ? getBrain("accueil") : null;
      const brainOverride = accueilBrain ?? { provider: "claude" as const, model: resolvedModel };
      const brainName = accueilBrain && accueilBrain.provider !== "claude"
        ? (accueilBrain.model ?? "Ce cerveau")
        : HOME_BRAIN_NAMES[model ?? "sonnet"] ?? "Ce cerveau";
      // Sans ça, le modèle n'a AUCUN moyen de savoir quel cerveau il est réellement
      // (le prompt partagé `system` ne le dit jamais) — il ne peut donc que rester
      // vague quand Raf demande « quel modèle es-tu ? ». On ne l'ajoute QUE quand
      // Raf a choisi un cerveau via la popup rapide (`accueilBrain`), pour garder
      // le repli Claude par défaut byte-identique (gate OFF ou choix jamais fait).
      const systemForBrain = accueilBrain
        ? `${system}\nIdentité : le cerveau qui te fait fonctionner en ce moment est « ${brainName} » (choisi par Raf via la popup rapide de l'accueil). Si Raf demande quel modèle/cerveau tu utilises, réponds-le honnêtement et précisément (ex. « J'utilise ${brainName} en ce moment »), ne reste jamais vague.`
        : system;

      if (demanded.size > 0 && flag("FRONTIER_TOOLS_ANY_BRAIN") && convId && ELEVE_PROVIDER === "openai") {
        // ── Mode ON — ORCHESTRATION : l'Élève outille, le cerveau choisi raisonne. ──
        const scratch = ensureHomeScratch(convId);
        const caps = await requiredCapabilities(last.content, { hasAttachment });
        const fr = await runFrontierOrchestration(
          {
            task: last.content,
            scratchDir: scratch,
            requiredCaps: caps,
            brainLabel: model ?? "sonnet",
            brainName,
            brainOverride,
            system: systemForBrain,
          },
          {
            runEleveTools: (sys, task, tools) =>
              askEleveAgentic(sys, task, tools, { model: process.env.ELEVE_MODEL }),
            dispatch,
          },
        );
        text = fr.text;
      } else {
        // ── Mode OFF (défaut) — repli TEXTE, mais HONNÊTE : si la tâche réclamait des
        // outils, on le DIT (plus de repli muet) ; sinon comportement byte-identique. ──
        const { askLLM } = await import("./llm-engine.js");
        // Gate OFF (accueilBrain null) : appel STRICTEMENT identique à avant ce
        // chantier (aucun `provider` explicite — laisse askLLM/resolveProvider()
        // décider comme aujourd'hui). Gate ON : provider/model du registre `accueil`.
        text = accueilBrain
          ? await askLLM(systemForBrain, last.content, { provider: accueilBrain.provider, model: accueilBrain.model, maxTokens: 2048 })
          : await askLLM(system, last.content, { model: resolvedModel, maxTokens: 2048 });
        if (demanded.size > 0) {
          const disclosure =
            `${brainName} ne pilote pas les outils ici ; sélectionne l'Élève (GLM 5.2) ` +
            `pour une réponse outillée, ou je te réponds au mieux sans outils.`;
          text = `${disclosure}\n\n${text}`;
        }
      }
    }
    res.json({ text, suggestGraduate });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Body: { prompt: string, projectName: string, sessionId?: string }
// Streams AgentEvent objects as SSE. Creates the project on first message.
registerChatRoute(app, { mangoUiDir: MANGO_UI_DIR, mirrorProject: MIRROR_PROJECT });

// Multimodal input: stores a user-attached image/PDF under <project>/.assets/
// so the agent can Read it. Raw body (the file bytes), filename in the query.
// Works before the project scaffold exists (first message with attachments).
app.post(
  "/api/upload/:name",
  express.raw({ type: () => true, limit: "26mb" }),
  (req, res) => {
    try {
      const dir = projectDir(req.params.name);
      fs.mkdirSync(dir, { recursive: true });
      const relPath = saveUpload(dir, String(req.query.filename ?? ""), req.body as Buffer);
      res.json({ path: relPath });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Accueil : upload d'une pièce jointe dans le BROUILLON d'une conversation (disque caché
// .home/<convId>/.assets) → l'Élève agentique peut ensuite la LIRE (lire_archive/lire_document/Read).
app.post(
  "/api/home/upload/:convId",
  express.raw({ type: () => true, limit: "51mb" }),
  (req, res) => {
    try {
      const dir = ensureHomeScratch(req.params.convId);
      const relPath = saveUpload(dir, String(req.query.filename ?? ""), req.body as Buffer);
      res.json({ path: relPath });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  },
);

// Accueil → atelier : GRADUATION d'un brouillon en vrai projet workspace (scaffold + copie
// des pièces jointes + historique amorcé). C'est Raf qui décide (bouton ou proposition acceptée).
app.post("/api/home/graduate", async (req, res) => {
  const { convId, name, messages } = req.body as {
    convId?: string;
    name?: string;
    messages?: Array<{ role: string; content: string }>;
  };
  if (!convId || !name?.trim()) {
    res.status(400).json({ error: "convId et name requis" });
    return;
  }
  try {
    const out = await graduateHomeScratch(convId, name, Array.isArray(messages) ? messages : []);
    res.json({ ok: true, name: out.name });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Accueil : suppression du brouillon (quand Raf supprime la conversation côté UI).
app.delete("/api/home/scratch/:convId", (req, res) => {
  cleanHomeScratch(req.params.convId);
  res.json({ ok: true });
});

// Snap button: captures a user-drawn zone of the live preview and returns it
// as a base64 PNG that the UI attaches to the next message.
app.post("/api/snap", async (req, res) => {
  const { projectName, viewport, box } = req.body as {
    projectName?: string;
    viewport?: { width?: number; height?: number };
    box?: { x?: number; y?: number; width?: number; height?: number };
  };
  const nums = [viewport?.width, viewport?.height, box?.x, box?.y, box?.width, box?.height];
  if (!projectName?.trim() || nums.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
    res.status(400).json({ error: "projectName, viewport and box are required" });
    return;
  }
  if (!projectExists(projectName)) {
    res.status(404).json({ error: `Project "${projectName}" not found` });
    return;
  }
  const dir = projectDir(projectName);
  // Reusing the running preview is always safe; starting one for a NOT-yet-
  // previewed project while the agent works is not.
  if (isAgentBusy() && !isPreviewing(dir)) {
    res.status(409).json({ error: "L'agent travaille — la capture suivra le projet actif" });
    return;
  }
  try {
    const { url } = await startPreview(dir);
    const buf = await snapZone(
      url,
      viewport as { width: number; height: number },
      box as { x: number; y: number; width: number; height: number },
    );
    res.json({ data: buf.toString("base64") });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Relais clic→source (#5) : le builder a capté un data-mango-src (fichier:ligne)
// via le clic en mode inspection ; il demande ici l'extrait de code pointé (pour
// l'afficher et, plus tard #6, alimenter l'édition chirurgicale via la Coque Rigide).
app.post("/api/inspect", (req, res) => {
  const { projectName, src } = req.body as { projectName?: string; src?: string };
  if (!projectName?.trim() || !src?.trim()) {
    res.status(400).json({ error: "projectName and src are required" });
    return;
  }
  if (!projectExists(projectName)) {
    res.status(404).json({ error: `Project "${projectName}" not found` });
    return;
  }
  const result = readSourceSnippet(projectDir(projectName), src);
  if ("error" in result) {
    res.status(404).json(result);
    return;
  }
  res.json(result);
});

// Liste des aperçus Vite vivants (surface « aperçus simultanés » #138-P2 :
// permet d'afficher plusieurs apps de la Suite côte à côte, chacune sur son port).
app.get("/api/preview", (_req, res) => {
  res.json({ previews: previewList() });
});

// Start (or reuse) the live preview of an existing project — lets the UI
// restore the preview on page load without sending a message first
app.post("/api/preview/:name", async (req, res) => {
  const name = req.params.name;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "Agent is working — preview follows the active project" });
    return;
  }
  try {
    const dir = projectDir(name);
    ensureErrorRelay(dir);
    const { url } = await startPreview(dir);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One-click deploy to a static host — Cloudflare/Vercel/Netlify (build + upload)
app.post("/api/deploy/:name", async (req, res) => {
  const name = req.params.name;
  const target = (req.body as { target?: unknown })?.target ?? "cloudflare";
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (!isDeployTarget(target)) {
    res.status(400).json({ error: `Cible de déploiement inconnue : ${String(target)}` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "L'agent travaille — attends la fin avant de publier" });
    return;
  }
  try {
    const { url } = await deployProject(projectDir(name), name, target);
    res.json({ url, target });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// One-click push to GitHub (creates the repo if needed, force-pushes history)
app.post("/api/github/:name", async (req, res) => {
  const name = req.params.name as string;
  const body = req.body as { private?: boolean; targetRepo?: string };
  const isPrivate = body?.private !== false;
  // targetRepo: optional custom repo name (e.g. "Projet-valid-"); persisted per project.
  const targetFile = path.join(projectDir(name), ".github-target");
  let targetRepo = body?.targetRepo?.trim() || undefined;
  if (targetRepo) {
    fs.writeFileSync(targetFile, targetRepo, "utf8");
  } else {
    try { targetRepo = fs.readFileSync(targetFile, "utf8").trim() || undefined; } catch { /* no target */ }
  }
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (isAgentBusy()) {
    res.status(409).json({ error: "L'agent travaille — attends la fin avant de publier sur GitHub" });
    return;
  }
  try {
    const { url } = await pushToGitHub(projectDir(name), name, isPrivate, targetRepo);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Learning-curve dashboard (idea 21): per-turn metrics for the UI to chart
app.get("/api/metrics", (_req, res) => {
  const rows = readMetrics();
  res.json({ rows, insights: computeInsights(rows, axiomStats(WORKSPACE_DIR)) });
});

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

app.post("/api/stop", async (_req, res) => {
  // Deux cerveaux, deux mécaniques d'arrêt :
  // - Claude (SDK) → interruptAgent() interrompt la query() en cours.
  // - Élève (GLM via runRelay/buildAgentic) → requestInterrupt() arme le drapeau
  //   coopératif que la boucle agentique lit en tête d'itération et sort proprement.
  // Avant, seul Claude s'arrêtait ; l'Élève (modèle par défaut) tournait jusqu'au
  // bout. On déclenche désormais les DEUX.
  requestInterrupt();
  const stopped = await interruptAgent();
  // Guaranteed escape hatch: free the slot even if a wedged turn's finally never
  // runs, so a hang can't keep the UI (and preview switching, which 409s while
  // "busy") frozen. Idempotent with the chat handler's own finally.
  releaseAgent();
  res.json({ stopped: stopped || true });
});

// État de l'agent (léger) — l'UI le sonde pour afficher un indicateur « réflexion »
// VISIBLE même quand l'agent est occupé par un AUTRE acteur (session automatique de
// Raf sur le même backend, run nocturne…) : avant, l'utilisateur envoyait une requête
// sans savoir que l'agent travaillait → 409 « Agent is already working » en rouge.
app.get("/api/agent-status", (_req, res) => {
  res.json({ busy: isAgentBusy() });
});

// #164 Phase 4 — Métrique de souveraineté : taux d'escalade Claude (resolvedBy
// "maitre") par projet + tendance, calculé sur `.metrics.jsonl` (rien à réinventer).
// L'objectif chiffré de Raf : ce taux doit BAISSER projet après projet.
app.get("/api/sovereignty", (_req, res) => {
  try {
    const rep = sovereigntyReport(readMetrics());
    res.json({ ...rep, line: formatSovereignty(rep) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Image Creator (Krea 2 via api.krea.ai) — galerie globale + envoi vers projet ──
// Galerie : workspace/.images (hors projets). Vers un projet : public/generated/
// (même dossier que genere_image → servi par Vite). Anti path-traversal strict.
const IMAGES_DIR = path.join(WORKSPACE_DIR, ".images");
const IMAGE_NAME_RE = /^[a-z0-9][a-z0-9._-]*\.png$/i;

app.post("/api/image/generate", async (req, res) => {
  const { prompt, aspectRatio, resolution, project } = (req.body ?? {}) as {
    prompt?: string; aspectRatio?: string; resolution?: string; project?: string;
  };
  const p = String(prompt ?? "").trim();
  if (!p) return res.status(400).json({ error: "prompt requis" });
  if (project && !projectExists(project)) return res.status(400).json({ error: "projet inconnu" });

  const r = await generateKreaImage({ prompt: p, aspectRatio, resolution });
  if (!r.ok) return res.status(r.status && r.status >= 400 ? r.status : 502).json({ error: r.error });

  const name = `${Date.now()}-${fluxSlugify(p)}.png`;
  if (project) {
    const abs = path.join(projectDir(project), "public", "generated", name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, r.bytes);
    return res.json({ name, project, url: `/generated/${name}`, ms: r.ms });
  }
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMAGES_DIR, name), r.bytes);
  res.json({ name, url: `/api/image/file/${name}`, ms: r.ms });
});

app.get("/api/image/list", (_req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) return res.json({ images: [] });
    const images = fs
      .readdirSync(IMAGES_DIR)
      .filter((f) => IMAGE_NAME_RE.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(IMAGES_DIR, f));
        return { name: f, size: st.size, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ images });
  } catch {
    res.json({ images: [] });
  }
});

app.get("/api/image/file/:name", (req, res) => {
  const name = String(req.params.name ?? "");
  if (!IMAGE_NAME_RE.test(name)) return res.status(400).json({ error: "nom invalide" });
  const abs = path.resolve(IMAGES_DIR, name);
  if (!abs.startsWith(path.resolve(IMAGES_DIR)) || !fs.existsSync(abs)) return res.status(404).json({ error: "introuvable" });
  res.sendFile(abs);
});

app.post("/api/image/send-to-project", (req, res) => {
  const { name, project } = (req.body ?? {}) as { name?: string; project?: string };
  if (!name || !IMAGE_NAME_RE.test(name)) return res.status(400).json({ error: "nom invalide" });
  if (!project || !projectExists(project)) return res.status(400).json({ error: "projet inconnu" });
  const src = path.resolve(IMAGES_DIR, name);
  if (!src.startsWith(path.resolve(IMAGES_DIR)) || !fs.existsSync(src)) return res.status(404).json({ error: "introuvable" });
  const dst = path.join(projectDir(project), "public", "generated", name);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  res.json({ project, url: `/generated/${name}` });
});

// (#172, Phase 4) Hooks — inspection lecture seule des hooks résolus d'un projet
// (onglet Réglages › Hooks). L'édition se fait dans <projet>/.hooks/hooks.json (V1).
// `enabled` = état du gate global ELEVE_HOOKS (les hooks ne s'exécutent que s'il est on).
app.get("/api/hooks", (req, res) => {
  try {
    const name = String(req.query.project ?? "").trim();
    if (!name || !projectExists(name)) return res.status(400).json({ error: "paramètre ?project= invalide" });
    const hooks = loadHooks(projectDir(name));
    return res.json({
      enabled: process.env.ELEVE_HOOKS === "on",
      count: hooks.length,
      hooks: hooks.map((h) => ({ event: h.event, matcher: h.matcher ?? "*", ref: h.id ?? null })),
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// #138 OS d'apps — Colonne de données partagée (la spine). CRUD REST sur le
// Blackboard, scope `shared:<collection>`. CORS est ouvert (app.use(cors())
// ci-dessus) → une app générée sur un autre port (5174…) lit/écrit ici
// directement, donc le partage est cross-framework. Garde-fous : collection/clé
// slugifiées, valeur JSON bornée (256 ko) pour ne pas gonfler le store.
const SHARED_MAX_BYTES = 256 * 1024;
// #138 Phase 2 — ACL de CONFORMANCE par app. Une app s'identifie via l'en-tête
// `X-MangoApp-Id` (= l'id de son manifest) ; si elle a déclaré la collection en
// `read`, une écriture est refusée (403). Sans en-tête (app non instrumentée /
// outil externe) ou app inconnue (peut être en cours de génération) → on laisse
// passer : c'est un garde-fou de cohérence, pas une frontière de sécurité
// (local-first). Renvoie un message de refus, ou null si l'écriture est permise.
function aclDenyWrite(req: express.Request, collection: string): string | null {
  const appId = String(req.header("x-mangoapp-id") ?? "").trim();
  if (!appId) return null;
  const manifest = findManifestById(listProjects().map((p) => projectDir(p)), appId);
  if (!manifest) return null;
  const decl = manifest.collections.find((c) => slug(c.name) === collection);
  if (accessAllowsWrite(decl?.access)) return null;
  return `L'app « ${manifest.name} » a déclaré « ${collection} » en ${decl?.access ?? "non déclarée"} — écriture refusée (ACL de conformance #138).`;
}
// #138 Phase 2 — Validation de SCHÉMA. Si une app déclare la forme d'une
// collection (`schema`), une écriture non conforme est refusée (422) → les apps
// sœurs lisent une donnée fiable. Aucun schéma déclaré → aucune contrainte.
function schemaRejectWrite(collection: string, value: unknown): string | null {
  const manifests = listProjects()
    .map((p) => loadManifest(projectDir(p)))
    .filter((m): m is MangoAppManifest => m !== null);
  const schema = findCollectionSchema(manifests, collection, slug);
  if (!schema) return null;
  const r = validateAgainstSchema(value, schema);
  return r.ok ? null : `Schéma de « ${collection} » non respecté : ${r.error} (validation de schéma #138-P2).`;
}
app.get("/api/shared/:collection", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  if (!collection) {
    res.status(400).json({ error: "Collection invalide" });
    return;
  }
  res.json({ collection, docs: listDocs(collection) });
});
// #138 Phase 2 — Sync TEMPS RÉEL (SSE) : une app sœur s'abonne et voit les
// mutations sans poller. Doit être déclarée AVANT `/:collection/:key` (sinon
// « stream » serait pris pour une clé). Snapshot initial puis push par mutation.
app.get("/api/shared/:collection/stream", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  if (!collection) {
    res.status(400).json({ error: "Collection invalide" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  // État courant d'abord (l'abonné démarre cohérent), puis le flux des changements.
  res.write(`event: snapshot\ndata: ${JSON.stringify({ collection, docs: listDocs(collection) })}\n\n`);
  const unsub = subscribe(collection, (change) => {
    res.write(`event: change\ndata: ${JSON.stringify(change)}\n\n`);
  });
  // Battement de cœur : garde la connexion ouverte à travers proxies/timeouts.
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsub();
  });
});
app.get("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const value = getDoc(collection, key);
  if (value === undefined) {
    res.status(404).json({ error: "Document introuvable" });
    return;
  }
  res.json({ collection, key, value });
});
app.put("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const { value } = req.body as { value?: unknown };
  if (value === undefined) {
    res.status(400).json({ error: "Champ 'value' requis" });
    return;
  }
  if (JSON.stringify(value).length > SHARED_MAX_BYTES) {
    res.status(413).json({ error: "Valeur trop volumineuse (max 256 ko)" });
    return;
  }
  const denied = aclDenyWrite(req, collection);
  if (denied) {
    res.status(403).json({ error: denied });
    return;
  }
  const schemaErr = schemaRejectWrite(collection, value);
  if (schemaErr) {
    res.status(422).json({ error: schemaErr });
    return;
  }
  const savedKey = putDoc(collection, key, value);
  res.json({ collection, key: savedKey, value });
});
app.delete("/api/shared/:collection/:key", (req, res) => {
  const collection = slug(req.params["collection"] as string);
  const key = slug(req.params["key"] as string);
  if (!collection || !key) {
    res.status(400).json({ error: "Collection ou clé invalide" });
    return;
  }
  const denied = aclDenyWrite(req, collection);
  if (denied) {
    res.status(403).json({ error: denied });
    return;
  }
  res.json({ ok: deleteDoc(collection, key) });
});
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
registerAgentFactoryRoutes(app);
// Agent PDF (#145, Chantier 3) — async (charge pdfjs-dist + Ollama paresseusement),
// best-effort : un échec d'init ne doit jamais empêcher le serveur de démarrer.
registerPdfRoutes(app).catch((err) =>
  console.error("[pdf] init routes échouée :", err instanceof Error ? err.message : err),
);

app.get("/api/onboarding/status", (_req, res) => {
  res.json({ hasProfile: hasProfile(WORKSPACE_DIR) });
});

app.post("/api/onboarding", (req, res) => {
  try {
    bootstrapProfile(req.body as OnboardingAnswers, WORKSPACE_DIR);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

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
    import("./kernel-blackboard-sqlite.js")
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
