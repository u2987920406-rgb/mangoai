// Phase E (#135) — Routes API du registre de cerveaux (option 3 : sélecteur UI).
//
// Expose le registre `brains.ts` à l'écran Réglages › Cerveaux :
//   GET    /api/brains            → fiches + routage + avertissements (state complet)
//   POST   /api/brains/scan       → lance l'examen #148 sur un modèle, persiste la fiche
//   POST   /api/brains/routing    → affecte une intention à un cerveau
//   DELETE /api/brains/:id        → retire un cerveau (+ ses affectations)
//
// ⚠ Périmètre E1b : le SCAN tourne via le transport Élève ACTIF (defaultScanDeps →
// endpoint ELEVE_*). On scanne donc les modèles atteignables par cet endpoint (GLM
// cloud, Ollama local selon ELEVE_PROVIDER) ; le `provider` du body sert à
// ENREGISTRER quel provider ce cerveau emploiera au runtime. Généraliser le
// transport de scan par provider (function-calling multi-provider) = Phase E2.

import type { Express, Request, Response } from "express";
import {
  loadRegistry, upsertBrain, removeBrain, setRouting, cardFromScan,
  routingWarnings, intentionFit, getBrain,
  INTENTIONS, INTENTION_LABELS, type Intention,
} from "./brains.js";
import { resolveProvider, type LLMProvider } from "./llm-engine.js";
import { normalizeEleveProvider } from "./eleve.js";
import { scanModel } from "./model-scan.js";

function isIntention(v: unknown): v is Intention {
  return typeof v === "string" && (INTENTIONS as string[]).includes(v);
}

/** Provider par défaut = celui de l'Élève courant (ollama|openai), sinon body. */
function defaultProvider(): LLMProvider {
  return normalizeEleveProvider(process.env.ELEVE_PROVIDER);
}

/** État complet pour l'UI : fiches + routage + intentions + avertissements. */
function fullState() {
  const reg = loadRegistry();
  return {
    brains: reg.brains,
    routing: reg.routing,
    intentions: INTENTIONS.map((id) => ({ id, label: INTENTION_LABELS[id] })),
    warnings: routingWarnings(reg),
  };
}

export function registerBrainRoutes(app: Express): void {
  // État complet du registre.
  app.get("/api/brains", (_req: Request, res: Response) => {
    res.json(fullState());
  });

  // Lance l'examen d'entrée #148 sur un modèle et persiste la fiche mesurée.
  app.post("/api/brains/scan", async (req: Request, res: Response) => {
    const body = req.body as { model?: unknown; provider?: unknown; label?: unknown };
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!model) {
      res.status(400).json({ error: "Champ « model » requis." });
      return;
    }
    const provider = typeof body.provider === "string" ? resolveProvider(body.provider, defaultProvider()) : defaultProvider();
    const label = typeof body.label === "string" ? body.label : undefined;
    try {
      // Transport réel = endpoint Élève actif (cf. en-tête de fichier).
      const { defaultScanDeps } = await import("./model-scan.js");
      const deps = await defaultScanDeps(model);
      const report = await scanModel(model, deps);
      const card = cardFromScan(report, provider, { label, scannedAt: new Date().toISOString() });
      upsertBrain(card);
      // On renvoie aussi l'adéquation de la fiche à CHAQUE intention (info UI).
      const fits = Object.fromEntries(INTENTIONS.map((i) => [i, intentionFit(i, card)]));
      res.json({ card, summary: report.summary, fits, state: fullState() });
    } catch (e) {
      res.status(502).json({ error: `Examen impossible : ${(e as Error).message}` });
    }
  });

  // Affecte (ou désaffecte si brainId vide/null) une intention à un cerveau.
  app.post("/api/brains/routing", (req: Request, res: Response) => {
    const body = req.body as { intention?: unknown; brainId?: unknown };
    if (!isIntention(body.intention)) {
      res.status(400).json({ error: "Champ « intention » invalide (construire|planifier|discuter)." });
      return;
    }
    const brainId = typeof body.brainId === "string" && body.brainId.trim() ? body.brainId.trim() : null;
    try {
      setRouting(body.intention, brainId);
      res.json(fullState());
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // Retire un cerveau du registre (+ nettoie ses affectations).
  app.delete("/api/brains/:id", (req: Request, res: Response) => {
    const id = String(req.params["id"] ?? "").trim();
    if (!id || !getBrain(id)) {
      res.status(404).json({ error: "Cerveau inconnu." });
      return;
    }
    removeBrain(id);
    res.json(fullState());
  });
}
