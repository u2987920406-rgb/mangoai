import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Express, Request, Response } from 'express'
import { subscriptionEnv } from './llm/llm-engine.js'

// The Lab runs a raw prompt against several models side by side. It goes
// through the Agent SDK (which reuses the local Claude Code login) rather than
// the direct Anthropic SDK, so it needs NO ANTHROPIC_API_KEY / pay-as-you-go
// credits — consistent with the rest of the app's subscription posture.
const ALLOWED_MODELS = new Set(['haiku', 'sonnet', 'opus'])

export function registerPromptLabRoutes(app: Express): void {
  // POST /api/promptlab/run
  // Body: { prompt: string, models: ('haiku'|'sonnet'|'opus')[] }
  // Stream SSE : un event par chunk de chaque modèle
  // Format SSE : data: {"type":"chunk","model":"haiku","text":"..."}
  // Puis : data: {"type":"done","model":"haiku","totalChars":123}
  // Lance les modèles en parallèle (Promise.all) mais stream au fur et à mesure
  app.post('/api/promptlab/run', async (req: Request, res: Response) => {
    const { prompt, models } = req.body as { prompt: string; models: string[] }

    if (!prompt || !Array.isArray(models) || models.length === 0) {
      res.status(400).json({ error: 'prompt and models[] are required' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const runModel = async (modelKey: string) => {
      if (!ALLOWED_MODELS.has(modelKey)) {
        sendEvent({ type: 'error', model: modelKey, message: `Unknown model: ${modelKey}` })
        return
      }

      let totalChars = 0

      try {
        // A direct chat answer so the comparison reflects the raw model and
        // nothing else. The Agent SDK is an agentic harness: `allowedTools: []`
        // only gates permission — the built-in tools stay in the model's
        // context, so it adopts an agent posture ("let me read the files…"),
        // attempts a tool step and trips error_max_turns. `tools: []` actually
        // REMOVES every built-in tool, so the model just answers. The system
        // prompt pins it to one self-contained reply in the user's language;
        // includePartialMessages → token-by-token streaming, matching the
        // previous direct-SDK behaviour.
        const q = query({
          prompt,
          options: {
            model: modelKey,
            maxTurns: 2,
            tools: [],
            includePartialMessages: true,
            // Abonnement Claude Code uniquement (jamais les crédits API).
            env: subscriptionEnv(),
            systemPrompt:
              "You are a helpful AI assistant. Answer the user's request directly and completely in a single message, in the user's language. You have no tools — answer from your own knowledge; never say you will read files, search, or take any action.",
          },
        })

        for await (const message of q) {
          if (message.type === 'stream_event') {
            const ev = message.event
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              const text = ev.delta.text
              totalChars += text.length
              sendEvent({ type: 'chunk', model: modelKey, text })
            }
          }
        }

        sendEvent({ type: 'done', model: modelKey, totalChars })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        sendEvent({ type: 'error', model: modelKey, message })
      }
    }

    try {
      await Promise.all(models.map((m) => runModel(m)))
    } finally {
      res.end()
    }
  })
}
