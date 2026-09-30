// Routes système/divers : métriques d'apprentissage, arrêt (stop), état agent,
// souveraineté, inspection des hooks, onboarding — extraites verbatim de index.ts
// (comportement inchangé). Aucune dépendance du scope d'index.ts capturée.
import express from "express";
import { readMetrics } from "../metrics.js";
import { computeInsights } from "../metrics-insights.js";
import { axiomStats } from "../axioms.js";
import { WORKSPACE_DIR, projectExists, projectDir } from "../projects.js";
import { requestInterrupt } from "../interrupt.js";
import { interruptAgent } from "../agent/agent.js";
import { isAgentBusy, releaseAgent } from "../agent/agent-lock.js";
import { sovereigntyReport, formatSovereignty } from "../sovereignty-metrics.js";
import { loadHooks } from "../mango-hooks-config.js";
import { getLLMRun, listLLMRuns } from "../llm/llm-usage.js";
import { gatesReport } from "../gates-status.js";
import { hasProfile, bootstrapProfile, type OnboardingAnswers } from "../onboarding.js";

export function registerSystemRoutes(app: express.Express): void {

// Mesure D1 (audit 2026-09-28, B4) — consommer le compteur, pas seulement l'alimenter.
// `runLlm` : le run qui a DÉJÀ été mesuré (celui du Maître, chemin SDK Claude, que
// `agent.ts` comptait séparément) — on l'ajoute au rapport pour que le chiffre du
// build couvre les DEUX chemins en un seul endroit lisible.
// État de TOUS les interrupteurs (armés / OFF) + plafonds $ effectifs — gates-status.ts (audit dormant).
app.get("/api/gates", (_req, res) => {
  res.json(gatesReport());
});

app.get("/api/llm-usage", (_req, res) => {
  const courant = getLLMRun();
  res.json({
    courant,
    runs: listLLMRuns().slice(-10),
    // Le comptage n'est pas gaté (addition pure) ; seul le JOURNAL l'est.
    journal: (process.env.LLM_USAGE_LOG ?? "").trim().toLowerCase() === "on",
  });
});

// Learning-curve dashboard (idea 21): per-turn metrics for the UI to chart
app.get("/api/metrics", (_req, res) => {
  const rows = readMetrics();
  res.json({ rows, insights: computeInsights(rows, axiomStats(WORKSPACE_DIR)) });
});

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

}
