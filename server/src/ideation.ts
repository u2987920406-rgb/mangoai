import fs from 'node:fs'
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import { resolveProvider } from './llm/llm-engine.js'
import { getBrain } from './kernel.js'
import { projectDir } from './projects.js'
import { atomicWriteFileSync } from './safe-io.js'

interface IdeationResult {
  wireframe: string      // ASCII art de la page principale (max 50 chars de large)
  palette: string[]      // 5 codes hex
  components: string[]   // Liste des composants UI clés
  pages: string[]        // Liste des écrans/pages
  summary: string        // Description en 2 phrases
  techStack: string[]    // Stack technique suggérée
}

// #196 — étape d'ideation devenue obligatoire avant le premier build d'un projet
// (demande de Raf, 2026-07-22 : « aucun projet ne doit être lancé sans plan
// d'ideation concret »). Marqueur persistant par projet, même patron que
// `.perfect-plan.json` (perfect-plan.ts::hasContract/loadContract).
const IDEATION_FILE = '.ideation.json'

export function hasIdeation(dir: string): boolean {
  return fs.existsSync(path.join(dir, IDEATION_FILE))
}

export function saveIdeation(dir: string, result: IdeationResult): void {
  fs.mkdirSync(dir, { recursive: true })
  atomicWriteFileSync(
    path.join(dir, IDEATION_FILE),
    JSON.stringify({ ...result, createdAt: new Date().toISOString() }, null, 2),
  )
}

const SYSTEM_PROMPT =
  "Tu es un expert UX/UI et architecte frontend. L'utilisateur décrit une application. Génère un dossier de conception complet. Réponds UNIQUEMENT avec un objet JSON valide (zéro markdown, zéro backtick) ayant exactement ces clés : wireframe (ASCII art simple de la vue principale, lignes de 48 chars max, utilise | - + # pour dessiner), palette (tableau de 5 codes hex), components (tableau des composants React clés), pages (tableau des écrans), summary (string de 2 phrases max), techStack (tableau : React, TypeScript, etc.)"

export function registerIdeationRoutes(app: Express): void {
  // POST /api/ideation/generate { description: string, type: string }
  app.post('/api/ideation/generate', async (req: Request, res: Response) => {
    const { description, type } = req.body as { description?: string; type?: string }

    if (!description || description.trim().length === 0) {
      res.status(400).json({ error: 'description is required' })
      return
    }

    const userMessage = `Description de l'application : ${description.trim()}${type && type !== '' ? `\nType d'application : ${type}` : ''}`

    try {
      // askLLM enforces its own 30s timeout (timeoutMs) for ollama/openai providers,
      // raising an AbortError caught below; claude (default) is bounded by maxTurns:1.
      const raw = await getBrain().complete(SYSTEM_PROMPT, userMessage, {
        provider: resolveProvider(process.env.IDEATION_PROVIDER),
        maxTokens: 1500,
        timeoutMs: 30_000,
      })

      let result: IdeationResult
      try {
        result = JSON.parse(raw) as IdeationResult
      } catch {
        // Attempt to extract JSON if model wrapped it despite instructions
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          result = JSON.parse(match[0]) as IdeationResult
        } else {
          res.status(502).json({ error: 'Invalid JSON from model', raw })
          return
        }
      }

      res.json(result)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        res.status(504).json({ error: 'Ideation timed out after 30s' })
      } else {
        const message = err instanceof Error ? err.message : String(err)
        res.status(500).json({ error: message })
      }
    }
  })

  // GET /api/ideation/status/:name — le gate côté chat interroge ceci avant le
  // premier tour Construire d'un projet neuf.
  app.get('/api/ideation/status/:name', (req: Request, res: Response) => {
    const name = req.params['name'] as string
    res.json({ done: hasIdeation(projectDir(name)) })
  })

  // POST /api/ideation/save/:name — appelé quand l'utilisateur valide un plan
  // (« Passer au code ») ; pose le marqueur qui lève le gate définitivement pour
  // ce projet.
  app.post('/api/ideation/save/:name', (req: Request, res: Response) => {
    const name = req.params['name'] as string
    saveIdeation(projectDir(name), req.body as IdeationResult)
    res.json({ ok: true })
  })
}
