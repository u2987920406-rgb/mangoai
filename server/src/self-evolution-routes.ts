// #168 — Routes de la boucle d'auto-évolution (semi-auto). Mango inscrit les lacunes ;
// Raf les voit, en VALIDE une → le forgeron crée l'agent ciblé ; ou la rejette.
// Branché dans index.ts via registerSelfEvolutionRoutes(app).
//
//   GET    /api/gaps              → { gaps }            (lacunes ouvertes, +fréquentes d'abord)
//   POST   /api/gaps/:id/forge    → { agent }           (VALIDATION : forge l'agent ciblé)
//   POST   /api/gaps/:id/dismiss  → { ok }              (rejette la lacune)

import type { Express, Request, Response } from "express"
import { listOpenGaps, getGap, markGap } from "./self-evolution.js"
import { forgeForGap } from "./agent-forge.js"

export function registerSelfEvolutionRoutes(app: Express): void {
  app.get("/api/gaps", (_req: Request, res: Response) => {
    res.json({ gaps: listOpenGaps() })
  })

  // VALIDATION humaine : Raf accepte de combler la lacune → le forgeron (Opus) crée l'agent.
  app.post("/api/gaps/:id/forge", async (req: Request, res: Response) => {
    const id = req.params["id"] as string
    const gap = getGap(id)
    if (!gap) { res.status(404).json({ error: "lacune introuvable" }); return }
    if (gap.status === "forged") { res.status(409).json({ error: "lacune déjà comblée" }); return }
    markGap(id, "forging")
    const r = await forgeForGap(gap)
    if (!r.agent) {
      markGap(id, "proposed") // échec → on remet la lacune à traiter
      res.status(502).json({ error: r.error ?? "échec de la forge" })
      return
    }
    markGap(id, "forged", { agentId: r.agent.id })
    res.json({
      agent: { id: r.agent.id, name: r.agent.name, lacune: r.agent.lacune, provider: r.agent.provider, model: r.agent.model },
    })
  })

  app.post("/api/gaps/:id/dismiss", (req: Request, res: Response) => {
    const updated = markGap(req.params["id"] as string, "dismissed")
    if (!updated) { res.status(404).json({ error: "lacune introuvable" }); return }
    res.json({ ok: true })
  })
}
