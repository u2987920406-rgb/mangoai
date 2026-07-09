import type { Express, Request, Response } from 'express'
import { resolveProvider } from './llm/llm-engine.js'
import { getBrain } from './kernel.js'

interface IdeationResult {
  wireframe: string      // ASCII art de la page principale (max 50 chars de large)
  palette: string[]      // 5 codes hex
  components: string[]   // Liste des composants UI clés
  pages: string[]        // Liste des écrans/pages
  summary: string        // Description en 2 phrases
  techStack: string[]    // Stack technique suggérée
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
}
