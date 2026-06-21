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
import { appendHistory, formatToolLine, type ChatEntry } from "./history.js";
import { createProject, deleteProject, listProjects, listTemplates, projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { axiomStats } from "./axioms.js";
import { computeInsights } from "./metrics-insights.js";
import { inferProjectType } from "./blueprints.js";
import { previewStatus, startPreview, stopPreview } from "./preview.js";
import { clearSession, getSession, saveSession } from "./sessions.js";
import { commitVersion, ensureRepo, changedFilesInLastCommit } from "./versions.js";
import { ensureErrorRelay, ensureInspectRelay } from "./relay.js";
import { ensureClickSourcePlugin, readSourceSnippet, buildVisualEditPrompt, type EditTarget } from "./clicksource.js";
import { deployProject, isDeployTarget } from "./deploy.js";
import { githubConfigured, pushToGitHub } from "./github.js";
import { spawnBackgroundReview } from "./review.js";
import { spawnPatrol } from "./patrol.js";
import { interruptCompaction, maybeCompactSession } from "./compaction.js";
import { saveUpload } from "./uploads.js";
import { setVisionContext, snapZone, visionStatus, getPreviewUrl } from "./vision.js";
import { shouldCaptureDiff, captureDiff } from "./vision-diff.js";
import { readMetrics, recordTurnMetrics } from "./metrics.js";
import { runRelay } from "./eleve.js";
import { getBus } from "./kernel-bus.js";
import { installMangoQaBridge } from "./kernel-mangoqa-bridge.js";
import { Blackboard, setBlackboard } from "./kernel-blackboard.js";
import { installTraceCollector, registerTraceRoutes } from "./trace-dashboard.js";
import { installArtifactStore, registerArtifactRoutes } from "./kernel-artifacts.js";
import { installReuseCollector, installReuseImpactCollector, registerReuseRoutes, detectArtifactReads, detectPaletteReuse, publishReuse } from "./kernel-reuse-metrics.js";
import { registerCurationEffectRoutes } from "./kernel-curation-effect.js";
import { startChatTurn, finishChatTurn } from "./kernel-chat-bridge.js";
import type { Span } from "./kernel-trace.js";
import { publishDesignReference, publishDesignProduced, buildProducedDesign, paletteFromContract } from "./kernel-design-events.js";
import { loadContract } from "./perfect-plan.js";
import { generateLexique } from "./lexique.js";
import { registerPromptLabRoutes } from "./promptlab.js";
import { registerTokenizerRoutes } from "./tokenizer.js";
import { registerIdeationRoutes } from "./ideation.js";
import { registerVeilleRoutes } from "./veille.js";
import { registerModelRouterRoutes } from "./model-router.js";
import { registerDocGeneratorRoutes } from "./docgenerator.js";
import { registerVersionGraphRoutes } from "./version-graph.js";
import { registerControleurRoutes } from "./qa-temporal.js";
import { emitPhaseComplete, spawnVerdictWatcher, isMangoQaActive } from "./mangoqa.js";
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
import { registerTutorialRoutes } from "./tutorial.js";
import { registerNocturnalRoutes } from "./nocturnal.js";
import { registerPromptEvolutionRoutes } from "./prompt-evolution.js";
import { registerRadarRoutes } from "./radar.js";
import { registerBuildReviewRoutes } from "./build-review-routes.js";
import { bootstrapProfile, hasProfile, type OnboardingAnswers } from "./onboarding.js";
import { registerPerfectPlanRoutes } from "./perfect-plan-routes.js";
import { registerAgentFactoryRoutes } from "./agent-routes.js";
import { restoreAgents } from "./agent-runtime.js";
// #138 OS d'apps — colonne de données partagée + surface Suite (la spine).
import { listDocs, getDoc, putDoc, deleteDoc, slug, subscribe } from "./shared-data.js";
import { registerSuiteRoutes } from "./suite-routes.js";
import { loadManifest, findManifestById, accessAllowsWrite } from "./mango-app-contract.js";

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
const app = express();
app.use(cors());
app.use(express.json());

let agentBusy = false;

app.get("/api/projects", (_req, res) => {
  res.json({
    projects: listProjects(),
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
    if (previewStatus().projectDir && path.resolve(previewStatus().projectDir!) === dir) {
      await stopPreview();
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

// ── Chat d'accueil — conversation directe avec MangoOS (sans projectName) ──
app.post("/api/home-chat", async (req, res) => {
  const { messages, model } = req.body as {
    messages?: Array<{ role: string; content: string }>;
    model?: string;
  };
  if (!messages?.length) {
    res.status(400).json({ error: "messages required" });
    return;
  }
  const MODEL_MAP: Record<string, string> = {
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
  const system = [
    "Tu es MangoOS, l'assistant IA personnel de Raf. Tu es chaleureux, direct et concis.",
    "Réponds en français sauf si on te parle en anglais.",
    history ? `\n— Historique —\n${history}` : "",
  ].filter(Boolean).join("\n");

  try {
    const { askLLM } = await import("./llm-engine.js");
    const text = await askLLM(system, last.content, { model: resolvedModel, maxTokens: 2048 });
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Body: { prompt: string, projectName: string, sessionId?: string }
// Streams AgentEvent objects as SSE. Creates the project on first message.
app.post("/api/chat", async (req, res) => {
  const { prompt, projectName, sessionId, model, mode, template, editTarget, tutorialId, clientMode, incrementId } = req.body as {
    prompt?: string;
    projectName?: string;
    sessionId?: string;
    model?: string;
    mode?: string;
    template?: string;
    editTarget?: EditTarget; // #6 : cible d'une édition visuelle (clic→source)
    tutorialId?: number; // #56 Chantier C : tour joué DANS le tutoriel (posture pédagogue)
    clientMode?: boolean; // Mode Client : désactive le goût personnel, ancre sur les fichiers du client
    incrementId?: string; // #139 Gros Projet : id de l'incrément Kanban construit ce tour (réconcilié après commit)
  };
  // Posture tutoriel injectée dans le system prompt quand on construit dans un tuto.
  const tutorial = typeof tutorialId === "number" && tutorialId >= 1 ? { id: tutorialId } : null;
  // Third brain option (Phase Ultime jalon D): "eleve" routes the turn to the
  // local student (Gemma via Ollama) through the relay loop instead of Claude.
  // Claude stays the escalation tier. Any other value = a normal Claude turn.
  const useEleve = model === "eleve";
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
  if (agentBusy) {
    res.status(409).json({ error: "Agent is already working, wait for it to finish" });
    return;
  }
  // From here on agentBusy is true; EVERYTHING that can throw must sit inside
  // the try below so the finally always clears it. A stuck agentBusy used to
  // freeze the whole UI — including preview switching, which 409s while a turn
  // "runs". Between here and the try there is only synchronous header setup.
  agentBusy = true;

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
    if (isMirror) {
      dir = MANGO_UI_DIR;
      send({ type: "status", text: "🪞 Mode Miroir — l'agent édite l'interface de Mango." });
    } else if (!projectExists(projectName)) {
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
      for await (const event of runAgent(agentPrompt, dir, session, chosenModel, chosenMode, tutorial, Boolean(clientMode))) {
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

    if (useEleve) {
      // Élève path (jalon D): the local student attempts the task at zero cost,
      // an objective build judges it, and only an objective failure escalates to
      // Claude. We stream the relay trace as status lines.
      send({ type: "status", text: "🎓 L'Élève local (Gemma) prend la main…" });
      const r = await runRelay(agentPrompt, dir, {
        onLog: (line) => {
          record("status", line);
          send({ type: "status", text: line });
        },
      });
      relayMeta.current = { resolvedBy: r.resolvedBy, attempts: r.attempts };
      lastResult.current = { costUsd: r.costUsd, numTurns: r.attempts };
      const verdict =
        r.resolvedBy === "eleve"
          ? `✅ Résolu par l'Élève (Gemma local) en ${r.attempts} tentative(s) — coût Claude $0.00.`
          : r.resolvedBy === "maitre"
            ? `👑 L'Élève a buté → escaladé au Maître (Claude), corrigé${r.axiom ? " + 1 axiome appris" : ""} — coût $${r.costUsd.toFixed(4)}.`
            : `❌ Échec : ni l'Élève ni le Maître n'ont fait passer le build (${r.inspection.signal}).`;
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
    agentBusy = false;
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
    // de palette (recouvrement de couleurs avec une palette en mémoire, #122).
    // Avant finishChatTurn pour que le tour soit compté au dénominateur du taux.
    publishReuse(projectName, [
      ...detectArtifactReads(turnToolReads),
      ...detectPaletteReuse(turnProducedColors, { exclude: projectName }),
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
  // Reusing the running preview is always safe; switching the preview to
  // another project while the agent works is not.
  if (agentBusy && previewStatus().projectDir !== dir) {
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

// Start (or reuse) the live preview of an existing project — lets the UI
// restore the preview on page load without sending a message first
app.post("/api/preview/:name", async (req, res) => {
  const name = req.params.name;
  if (!projectExists(name)) {
    res.status(404).json({ error: `Project "${name}" not found` });
    return;
  }
  if (agentBusy) {
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
  if (agentBusy) {
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
  if (agentBusy) {
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
registerProjectIORoutes(app, () => agentBusy);
registerFeedbackRoutes(app);

app.post("/api/stop", async (_req, res) => {
  const stopped = await interruptAgent();
  // Guaranteed escape hatch: free the slot even if a wedged turn's finally never
  // runs, so a hang can't keep the UI (and preview switching, which 409s while
  // "busy") frozen. Idempotent with the chat handler's own finally.
  agentBusy = false;
  res.json({ stopped });
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
registerBuildReviewRoutes(app);
registerPerfectPlanRoutes(app);
registerAgentFactoryRoutes(app);

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

const httpServer = app.listen(PORT, () => {
  console.log(`MangoOS backend → http://localhost:${PORT}`);
  restoreAgents().catch((e) => console.warn("[agent-factory] restoreAgents:", e));
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
