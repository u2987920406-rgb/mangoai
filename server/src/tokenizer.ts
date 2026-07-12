import type { Express, Request, Response } from 'express'

interface TokenSegment { type: 'code' | 'text' | 'punct' | 'number'; text: string; tokens: number }
interface TokenResult { count: number; segments: TokenSegment[] }
interface CostBreakdown { model: string; inputCost: number; outputCostEstimate: number; inputCostPer1k: number }

const CHARS_PER_TOKEN = 3.5

// Fenêtre de contexte de référence pour le pourcentage (200k = Sonnet/Opus).
// Overridable via env pour s'aligner sur un modèle spécifique si besoin.
const DEFAULT_CONTEXT_WINDOW = 200_000

function countTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateTokens(text: string): TokenResult {
  const segments: TokenSegment[] = []

  // Regex order matters: code patterns first, then numbers, punct, text
  const tokenRegex = /(`[^`]*`|(?:[a-zA-Z_][a-zA-Z0-9_]*(?:[A-Z][a-z]+)+)|(?:[a-z]+(?:_[a-z]+)+))|(\d+(?:\.\d+)?)|([^\w\s])|([^\s]+|\s+)/g

  let match: RegExpExecArray | null
  while ((match = tokenRegex.exec(text)) !== null) {
    const [full, code, number, punct] = match
    const seg = full

    if (code) {
      segments.push({ type: 'code', text: seg, tokens: countTokens(seg) })
    } else if (number) {
      segments.push({ type: 'number', text: seg, tokens: countTokens(seg) })
    } else if (punct) {
      segments.push({ type: 'punct', text: seg, tokens: countTokens(seg) })
    } else {
      segments.push({ type: 'text', text: seg, tokens: countTokens(seg) })
    }
  }

  const count = segments.reduce((sum, s) => sum + s.tokens, 0)
  return { count, segments }
}

/**
 * Fenêtre de contexte à utiliser pour la jauge, selon le provider (2026-07-13).
 * Ollama local : fenêtre PHYSIQUE réelle (num_ctx, 16384 par défaut,
 * llm-transport.ts) — un cerveau $0 a quand même un plafond dur, pas économique.
 * Autre (cloud/openai-compat) : fenêtre large par défaut (pas de risque pratique
 * connu ici, même logique que DEFAULT_CONTEXT_WINDOW ci-dessus).
 */
export function resolveContextWindow(provider: string | undefined): number {
  if (provider === "ollama") {
    const n = Number(process.env.OLLAMA_NUM_CTX)
    return Number.isFinite(n) && n > 0 ? n : 16384
  }
  return DEFAULT_CONTEXT_WINDOW
}

export function estimateCosts(tokenCount: number): CostBreakdown[] {
  // Tarifs en USD / 1K tokens (valeurs Anthropic publiques, juin 2026).
  // inputCostPer1k = prix d'entrée ; outputCostPer1k = prix de sortie.
  // L'estimation de sortie suppose un volume output ≈ input (conservatoire).
  const models = [
    { model: 'Haiku 4.5', inputCostPer1k: 0.0008, outputCostPer1k: 0.004 },
    { model: 'Sonnet 4.6', inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
    { model: 'Opus 4.8', inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
  ]

  return models.map(({ model, inputCostPer1k, outputCostPer1k }) => {
    const inputCost = (tokenCount / 1000) * inputCostPer1k
    const outputCostEstimate = (tokenCount / 1000) * outputCostPer1k
    return { model, inputCost, outputCostEstimate, inputCostPer1k }
  })
}

export function registerTokenizerRoutes(app: Express): void {
  app.post('/api/tokenize', (req: Request, res: Response) => {
    const { text } = req.body as { text?: string }

    if (typeof text !== 'string') {
      res.status(400).json({ error: 'text must be a string' })
      return
    }

    const { count, segments } = estimateTokens(text)
    const costs = estimateCosts(count)
    const contextWindow = Number(process.env.CONTEXT_WINDOW) || DEFAULT_CONTEXT_WINDOW
    const contextPercent = (count / contextWindow) * 100

    res.json({ count, segments, costs, contextPercent })
  })
}
