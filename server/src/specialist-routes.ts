// Routes de l'Atelier des agents forgés (slice 2a) — lister / forger / tester / réassigner
// le cerveau / supprimer. Branché dans index.ts via registerSpecialistRoutes(app).
//
//   GET    /api/specialists              → { agents }
//   POST   /api/specialists/forge        → SSE : progression de la forge (GLM), puis done
//   POST   /api/specialists/:id/invoke   → { ok, text } (teste l'agent sur une tâche)
//   PATCH  /api/specialists/:id/brain     → { agent } (réassigne provider/modèle/timeout)
//   DELETE /api/specialists/:id           → { ok }

import type { Express, Request, Response } from "express"
import {
  loadSpecialists, updateSpecialistBrain, removeSpecialist, runSpecialist,
} from "./specialist-agents.js"
import { forgeAgents } from "./agent-forge.js"

export function registerSpecialistRoutes(app: Express): void {
  app.get("/api/specialists", (_req: Request, res: Response) => {
    res.json({ agents: loadSpecialists() })
  })

  // Forge via GLM — SSE car chaque agent prend quelques secondes (un par un).
  app.post("/api/specialists/forge", async (req: Request, res: Response) => {
    const n = Math.max(1, Math.min(10, Math.floor(Number((req.body as { n?: unknown })?.n)) || 3))
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    res.flushHeaders?.()
    const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`)
    try {
      send({ type: "start", n })
      const r = await forgeAgents(n, { onProgress: (msg) => send({ type: "progress", msg }) })
      send({ type: "done", created: r.created.length, failures: r.failures, agents: loadSpecialists() })
    } catch (err) {
      send({ type: "error", error: err instanceof Error ? err.message : String(err) })
    } finally {
      res.end()
    }
  })

  app.post("/api/specialists/:id/invoke", async (req: Request, res: Response) => {
    const task = String((req.body as { task?: unknown })?.task ?? "").trim()
    if (!task) { res.status(400).json({ error: "task requis" }); return }
    const r = await runSpecialist(req.params["id"] as string, task)
    res.json({ ok: r.ok, text: r.text, agent: r.agent ? { name: r.agent.name, provider: r.agent.provider, model: r.agent.model } : null })
  })

  app.patch("/api/specialists/:id/brain", (req: Request, res: Response) => {
    const b = (req.body ?? {}) as { provider?: string; model?: string; timeoutMs?: number }
    const updated = updateSpecialistBrain(req.params["id"] as string, b)
    if (!updated) { res.status(404).json({ error: "agent introuvable" }); return }
    res.json({ agent: updated })
  })

  app.delete("/api/specialists/:id", (req: Request, res: Response) => {
    const ok = removeSpecialist(req.params["id"] as string)
    if (!ok) { res.status(404).json({ error: "agent introuvable" }); return }
    res.json({ ok: true })
  })
}
