import fs from 'node:fs'
import { atomicWriteFileSync } from "./safe-io.js";
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import { WORKSPACE_DIR } from './projects.js'
import { resolveProvider } from './llm/llm-engine.js'
import { getBrain } from './kernel.js'

interface ControleurResult {
  projectName: string
  timestamp: string
  score: number
  issues: ControleurIssue[]
  suggestions: string[]
  strengths: string[]
}

interface ControleurIssue {
  severity: 'critical' | 'warning' | 'info'
  file: string
  description: string
}

const RELEVANT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.json']
const MAX_FILE_SIZE = 50_000
const MAX_TOTAL_SIZE = 200_000
const CONTROLEUR_HISTORY_MAX = 10

function collectProjectFiles(projectDir: string): string {
  const lines: string[] = []
  let totalSize = 0

  function walk(dir: string) {
    if (totalSize >= MAX_TOTAL_SIZE) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (!RELEVANT_EXTENSIONS.includes(ext)) continue
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size > MAX_FILE_SIZE) continue
          const content = fs.readFileSync(fullPath, 'utf8')
          const relative = path.relative(projectDir, fullPath)
          lines.push(`\n--- ${relative} ---\n${content}`)
          totalSize += content.length
          if (totalSize >= MAX_TOTAL_SIZE) break
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(projectDir)
  return lines.join('\n')
}

function controleurHistoryPath(projectName: string): string {
  const safe = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  return path.join(WORKSPACE_DIR, safe, '.mango', 'controleur-history.json')
}

function loadControleurHistory(projectName: string): ControleurResult[] {
  const histPath = controleurHistoryPath(projectName)
  if (!fs.existsSync(histPath)) return []
  try {
    const raw = fs.readFileSync(histPath, 'utf8')
    return JSON.parse(raw) as ControleurResult[]
  } catch {
    return []
  }
}

function saveControleurHistory(projectName: string, result: ControleurResult): void {
  const histPath = controleurHistoryPath(projectName)
  const dir = path.dirname(histPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const history = loadControleurHistory(projectName)
  history.unshift(result)
  const trimmed = history.slice(0, CONTROLEUR_HISTORY_MAX)
  atomicWriteFileSync(histPath, JSON.stringify(trimmed, null, 2))
}

async function runControleurAnalysis(projectName: string): Promise<ControleurResult> {
  const safe = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  const projDir = path.join(WORKSPACE_DIR, safe)

  if (!fs.existsSync(projDir)) {
    throw new Error(`Project "${projectName}" not found`)
  }

  const filesContent = collectProjectFiles(projDir)
  if (!filesContent.trim()) {
    throw new Error(`No analyzable files found in project "${projectName}"`)
  }

  const system =
    'Tu es un expert Contrôleur senior. Analyse le code fourni et retourne UNIQUEMENT un JSON valide (sans markdown) avec : score (0-100), issues (tableau de {severity: critical|warning|info, file, description}), suggestions (tableau de strings), strengths (tableau de strings). Sois concis et précis.'

  const raw = await getBrain().complete(system, `Analyse ce projet :\n${filesContent}`, {
    provider: resolveProvider(process.env.CONTROLEUR_PROVIDER),
    maxTokens: 2000,
  })

  let parsed: { score: number; issues: ControleurIssue[]; suggestions: string[]; strengths: string[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Try to extract JSON from the response in case of extra text
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Claude did not return valid JSON for Contrôleur analysis')
    parsed = JSON.parse(match[0])
  }

  const result: ControleurResult = {
    projectName,
    timestamp: new Date().toISOString(),
    score: typeof parsed.score === 'number' ? Math.max(0, Math.min(100, parsed.score)) : 0,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
  }

  saveControleurHistory(projectName, result)
  return result
}

export function registerControleurRoutes(app: Express): void {
  // POST /api/controleur/run { projectName: string }
  app.post('/api/controleur/run', async (req: Request, res: Response) => {
    const { projectName } = req.body as { projectName?: string }
    if (!projectName || typeof projectName !== 'string') {
      res.status(400).json({ error: 'projectName is required' })
      return
    }
    try {
      const result = await runControleurAnalysis(projectName)
      res.json(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: message })
    }
  })

  // GET /api/controleur/history/:projectName → ControleurResult[] (du plus récent au plus ancien, max 10)
  app.get('/api/controleur/history/:projectName', (req: Request, res: Response) => {
    const projectName = Array.isArray(req.params.projectName)
      ? req.params.projectName[0]
      : req.params.projectName
    if (!projectName) {
      res.status(400).json({ error: 'projectName is required' })
      return
    }
    try {
      const history = loadControleurHistory(projectName)
      res.json(history)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: message })
    }
  })
}
