// Brain-Dispatch #150 — Routes API du registre des cerveaux par agent.
//   GET  /api/brain-registry          → le registre complet (10 agents)
//   PUT  /api/brain-registry          → valide + sauvegarde (atomique)
//   POST /api/brain-dispatch/estimate → { agents, tokens } → { usd, warning }
//
// Distinct de /api/brains (Phase E #135, registre de fiches MESURÉES par intention) :
// ici on configure QUEL cerveau pilote CHAQUE agent nommé (orchestrateur, codeur…).

import type { Express, Request, Response } from "express";
import {
  loadBrainRegistry, saveBrainRegistry, AGENT_IDS, DEFAULT_REGISTRY,
  type AgentId, type BrainConfig,
} from "./brain-registry.js";
import { estimatePipelineCost } from "./agent-contract.js";

function isAgentId(v: unknown): v is AgentId {
  return typeof v === "string" && (AGENT_IDS as string[]).includes(v);
}

export function registerBrainDispatchRoutes(app: Express): void {
  // Le registre complet + les défauts (pour le bouton « Réinitialiser »).
  app.get("/api/brain-registry", (_req: Request, res: Response) => {
    res.json({ registry: loadBrainRegistry(), defaults: DEFAULT_REGISTRY, agents: AGENT_IDS });
  });

  // Sauvegarde un registre. saveBrainRegistry valide/normalise champ par champ
  // (provider invalide, timeout négatif… → repli sur le défaut de l'agent).
  app.put("/api/brain-registry", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Corps attendu : un objet { agentId: BrainConfig }." });
      return;
    }
    try {
      saveBrainRegistry(body as Record<AgentId, BrainConfig>);
      res.json({ registry: loadBrainRegistry() });
    } catch (e) {
      res.status(500).json({ error: `Sauvegarde impossible : ${(e as Error).message}` });
    }
  });

  // Estimation de coût d'un pipeline avant exécution (garde-fou anti-dérive).
  app.post("/api/brain-dispatch/estimate", (req: Request, res: Response) => {
    const body = req.body as { agents?: unknown; tokens?: unknown };
    const agents = Array.isArray(body.agents) ? body.agents.filter(isAgentId) : [];
    const tokens = typeof body.tokens === "number" && Number.isFinite(body.tokens) ? body.tokens : 0;
    if (agents.length === 0) {
      res.status(400).json({ error: "Champ « agents » requis (liste d'AgentId valides)." });
      return;
    }
    res.json(estimatePipelineCost(agents, tokens));
  });
}
