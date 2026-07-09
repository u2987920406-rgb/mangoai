// Idée #103 — Mango Agent Factory. Routes REST de l'Agent Factory.
import type { Express } from "express";
import { resolveProvider } from "../llm/llm-engine.js";
import { getBrain } from "../kernel.js";
import {
  loadAgentRegistry, loadAgentDef, saveAgentDef, deleteAgent,
  generateAgentId, scaffoldAgent, generateAgentCode, agentDir,
} from "./agent-factory.js";
import {
  startAgent, stopAgent, restartAgent, readAgentState,
  writeAgentState, readAgentLogs, runtimeStatus,
} from "./agent-runtime.js";
import {
  sendMessage, readInbox, markRead, purgeExpiredMessages, AGENTS_DIR,
} from "./agent-bus.js";
import { atomicWriteFileSync } from "../safe-io.js";
import path from "node:path";
import type { AgentDef } from "./agent-types.js";
import { planMission, executeMission } from "./agent-coordinator.js";

// Purge horaire des messages expirés
setInterval(() => { purgeExpiredMessages(); }, 3_600_000);

export function registerAgentFactoryRoutes(app: Express): void {

  // ── GET /api/agents — liste defs + états ────────────────────────────────────
  app.get("/api/agents", (_req, res) => {
    const agents = loadAgentRegistry();
    const states: Record<string, ReturnType<typeof readAgentState>> = {};
    for (const a of agents) states[a.id] = readAgentState(a.id);
    res.json({ agents, states, runtime: runtimeStatus() });
  });

  // ── POST /api/agents — crée + scaffold + génère code ────────────────────────
  app.post("/api/agents", async (req, res) => {
    const body = req.body as {
      name?: string; category?: string; description?: string;
      intervalMs?: number; envVars?: Record<string, string>;
      subordinates?: string[];
    };
    if (!body?.name || !body?.category || !body?.description) {
      res.status(400).json({ error: "name, category et description requis" });
      return;
    }
    const validCategories = ["collecteur", "processeur", "acteur", "coordinateur"];
    if (!validCategories.includes(body.category)) {
      res.status(400).json({ error: `category doit être parmi : ${validCategories.join(", ")}` });
      return;
    }

    // SSE streaming de la génération
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type: string, data: unknown) =>
      res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);

    send("status", { text: "Génération du code agent en cours…" });

    const now = new Date().toISOString();
    const def: AgentDef = {
      id:           generateAgentId(body.name, body.category as AgentDef["category"]),
      name:         body.name,
      category:     body.category as AgentDef["category"],
      description:  body.description,
      createdAt:    now,
      updatedAt:    now,
      intervalMs:   body.intervalMs ?? 60_000,
      envVars:      body.envVars ?? {},
      subordinates: body.subordinates,
      generatedBy:  "claude",
    };

    try {
      const { ok, dir, error } = await scaffoldAgent(def);
      if (error) send("status", { text: `⚠ Génération partielle : ${error}` });
      send("result", { ok, agentId: def.id, dir, agent: def });
    } catch (err) {
      send("error", { message: (err as Error).message });
    }
    res.end();
  });

  // ── GET /api/agents/:id — détail def + état + logs ───────────────────────────
  app.get("/api/agents/:id", (req, res) => {
    const id = req.params["id"]!;
    const def = loadAgentDef(id);
    if (!def) { res.status(404).json({ error: "Agent introuvable" }); return; }
    res.json({
      agent: def,
      state: readAgentState(id),
      logs:  readAgentLogs(id, 100),
    });
  });

  // ── PUT /api/agents/:id — mise à jour partielle ──────────────────────────────
  app.put("/api/agents/:id", (req, res) => {
    const id = req.params["id"]!;
    const def = loadAgentDef(id);
    if (!def) { res.status(404).json({ error: "Agent introuvable" }); return; }
    const updated: AgentDef = { ...def, ...(req.body as Partial<AgentDef>), id, updatedAt: new Date().toISOString() };
    saveAgentDef(updated);
    res.json({ ok: true, agent: updated });
  });

  // ── DELETE /api/agents/:id — stop + suppression ──────────────────────────────
  app.delete("/api/agents/:id", async (req, res) => {
    const id = req.params["id"]!;
    await stopAgent(id).catch(() => { /* déjà arrêté */ });
    deleteAgent(id);
    res.json({ ok: true });
  });

  // ── POST /api/agents/:id/start ───────────────────────────────────────────────
  app.post("/api/agents/:id/start", async (req, res) => {
    const id = req.params["id"]!;
    const result = await startAgent(id);
    res.json(result);
  });

  // ── POST /api/agents/:id/stop ────────────────────────────────────────────────
  app.post("/api/agents/:id/stop", async (req, res) => {
    const id = req.params["id"]!;
    const result = await stopAgent(id);
    writeAgentState(id, { status: "stopped", stoppedAt: new Date().toISOString() });
    res.json(result);
  });

  // ── POST /api/agents/:id/restart ─────────────────────────────────────────────
  app.post("/api/agents/:id/restart", async (req, res) => {
    const id = req.params["id"]!;
    const result = await restartAgent(id);
    res.json(result);
  });

  // ── GET /api/agents/:id/status ───────────────────────────────────────────────
  app.get("/api/agents/:id/status", (req, res) => {
    const id = req.params["id"]!;
    res.json(readAgentState(id) ?? { id, status: "unknown" });
  });

  // ── GET /api/agents/:id/logs ─────────────────────────────────────────────────
  app.get("/api/agents/:id/logs", (req, res) => {
    const id    = req.params["id"]!;
    const lines = Number(req.query["lines"] ?? 50);
    res.json({ lines: readAgentLogs(id, lines), date: new Date().toISOString().slice(0, 10) });
  });

  // ── GET /api/agents/:id/inbox ─────────────────────────────────────────────────
  app.get("/api/agents/:id/inbox", (req, res) => {
    const id       = req.params["id"]!;
    const messages = readInbox(id);
    // Mark-read automatique
    for (const m of messages) markRead(id, m.id);
    res.json({ messages });
  });

  // ── POST /api/agents/messages — envoie un message à un agent ──────────────────
  app.post("/api/agents/messages", (req, res) => {
    const body = req.body as {
      from?: string; to?: string; type?: string; payload?: unknown; ttlMs?: number;
    };
    if (!body?.to || !body?.type) {
      res.status(400).json({ error: "to et type requis" });
      return;
    }
    const msg = sendMessage({
      from:    body.from ?? "__mango__",
      to:      body.to,
      type:    body.type as AgentDef["category"] extends string ? "task" : never,
      payload: body.payload ?? null,
      ttlMs:   body.ttlMs ?? 3_600_000,
    });
    res.json({ ok: true, msgId: msg.id });
  });

  // ── POST /api/agents/llm — proxy LLM pour agent.js ($0, abonnement) ──────────
  app.post("/api/agents/llm", async (req, res) => {
    const body = req.body as { agentId?: string; system?: string; user?: string; maxTokens?: number };
    if (!body?.system || !body?.user) {
      res.status(400).json({ error: "system et user requis" });
      return;
    }
    try {
      const text = await getBrain().complete(body.system, body.user, {
        provider:  resolveProvider(process.env["AGENT_LLM_PROVIDER"]),
        maxTokens: body.maxTokens ?? 800,
      });
      res.json({ text });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── POST /api/agents/:id/generate — re-génère agent.js (SSE) ─────────────────
  app.post("/api/agents/:id/generate", async (req, res) => {
    const id  = req.params["id"]!;
    const def = loadAgentDef(id);
    if (!def) { res.status(404).json({ error: "Agent introuvable" }); return; }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type: string, data: unknown) =>
      res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);

    send("status", { text: "Re-génération en cours…" });
    try {
      const { code, error } = await generateAgentCode(def);
      const agentJsPath = path.join(agentDir(id), "agent.js");
      atomicWriteFileSync(agentJsPath, code);
      if (error) send("status", { text: `⚠ ${error}` });
      send("result", { ok: true, preview: code.slice(0, 500) });
    } catch (err) {
      send("error", { message: (err as Error).message });
    }
    res.end();
  });

  // ── POST /api/agents/:id/mission — coordinateur : délègue une mission ─────────
  app.post("/api/agents/:id/mission", async (req, res) => {
    const coordinatorId = req.params["id"]!;
    const def = loadAgentDef(coordinatorId);
    if (!def) { res.status(404).json({ error: "Agent coordinateur introuvable" }); return; }
    if (def.category !== "coordinateur") {
      res.status(400).json({ error: "Seul un agent de catégorie 'coordinateur' peut lancer une mission" });
      return;
    }
    const { goal } = req.body as { goal?: string };
    if (!goal?.trim()) { res.status(400).json({ error: "goal requis" }); return; }

    const allAgents = loadAgentRegistry();
    // Les subordonnés déclarés, ou tous les agents non-coordinateurs par défaut
    const candidates = def.subordinates?.length
      ? allAgents.filter((a) => def.subordinates!.includes(a.id))
      : allAgents.filter((a) => a.id !== coordinatorId && a.category !== "coordinateur");

    try {
      const plan = await planMission(goal, candidates);
      const { ok, results, summary } = await executeMission(coordinatorId, plan);
      res.json({ ok, missionId: plan.missionId, plan, results, summary });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── GET /api/agents/:id/mission/:missionId — suivi de mission ─────────────────
  app.get("/api/agents/:id/mission/:missionId", (req, res) => {
    const { id, missionId } = req.params as { id: string; missionId: string };
    // L'inbox du coordinateur contient les résultats d'étape
    const messages = readInbox(id).filter(
      (m) => (m.payload as { missionId?: string } | null)?.missionId === missionId,
    );
    res.json({ missionId, messages });
  });
}
