// Route de la Fabrique (#181 É3) — POST /api/formation { sujet }.
//
// Fire-and-forget (patron `stratege-routes.ts` pour la forme de route additive, verrou
// `agent-lock.ts` comme `/api/chat`) : la réponse HTTP part IMMÉDIATEMENT (202), le run
// (potentiellement long — plusieurs modules, GLM cloud) continue en arrière-plan. Le
// manifest `formation.json` du projet fait foi de la progression — pas de polling dédié
// ici (D6 : le manifest EST déjà l'état observable, cf. run-formation.ts resumable).
import type { Express, Request, Response } from "express";
import { isAgentBusy, tryAcquireAgent, releaseAgent } from "./agent-lock.js";
import { runFormationFabrique, realFabriqueDeps, slugForSujet } from "./formation-fabrique.js";
import { projectDir } from "./projects.js";

if (!process.env.ELEVE_CLOSURE_GATE) process.env.ELEVE_CLOSURE_GATE = "on"; // règle absolue : jamais désactivé

export function registerFormationRoutes(app: Express): void {
  app.post("/api/formation", (req: Request, res: Response) => {
    const sujet = String((req.body as { sujet?: unknown })?.sujet ?? "").trim();
    if (!sujet) {
      res.status(400).json({ error: "`sujet` requis (string non vide)" });
      return;
    }
    if (!tryAcquireAgent()) {
      res.status(409).json({ error: "Un agent travaille déjà — réessaie une fois qu'il a terminé." });
      return;
    }
    const slug = slugForSujet(sujet);
    const dir = projectDir(slug);
    res.status(202).json({
      ok: true,
      message: `Fabrique lancée pour « ${sujet} ».`,
      projectDir: dir,
      manifest: `${dir}/formation.json`,
    });
    // Fire-and-forget : la réponse HTTP est déjà partie, le run continue derrière.
    // Le verrou global protège le run de collision avec un tour de chat/nocturne
    // (même verrou que /api/chat, agent-lock.ts).
    void runFormationFabrique(sujet, {}, realFabriqueDeps((line) => console.log(`[formation] ${line}`)))
      .catch((e) => console.error("[formation] échec inattendu :", e))
      .finally(() => releaseAgent());
  });

  // Statut minimal — utile pour vérifier qu'aucun agent (formation comprise) ne tourne.
  app.get("/api/formation/status", (_req: Request, res: Response) => {
    res.json({ busy: isAgentBusy() });
  });
}
