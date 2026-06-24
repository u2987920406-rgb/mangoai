// Idée #2 — Design Pair-Programming
// Analyse les fichiers source d'un projet et retourne des recommandations UX/UI structurées.
import { askLLM, resolveProvider } from './llm-engine.js'
import { getBrain } from './kernel.js'
import { capturePreview, getPreviewUrl } from './vision.js'
import type { Express, Request, Response } from 'express'
import path from 'node:path'
import fs from 'node:fs'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const REVIEWS_FILE = path.join(DATA_DIR, 'design-reviews.jsonl')

interface DesignReviewRecord {
  project: string
  date: string
  score: number
  summary: string
  palette: {
    issues: string[]
    suggestions: Array<{ color: string; usage: string }>
  }
  typography: {
    issues: string[]
    suggestions: string[]
  }
  layout: {
    issues: string[]
    suggestions: string[]
  }
  components: Array<{ name: string; issue: string; fix: string }>
  quickWins: string[]
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function appendReview(record: DesignReviewRecord): void {
  ensureDataDir()
  fs.appendFileSync(REVIEWS_FILE, JSON.stringify(record) + '\n', 'utf8')
}

function loadReviews(project: string): DesignReviewRecord[] {
  if (!fs.existsSync(REVIEWS_FILE)) return []
  const lines = fs.readFileSync(REVIEWS_FILE, 'utf8').split('\n').filter(Boolean)
  const records: DesignReviewRecord[] = []
  for (const line of lines) {
    try {
      const r = JSON.parse(line) as DesignReviewRecord
      if (!project || r.project === project) records.push(r)
    } catch {
      // ligne corrompue — ignorer
    }
  }
  // 5 dernières
  return records.slice(-5)
}

const SOURCE_EXTENSIONS = new Set(['.jsx', '.tsx', '.js', '.ts', '.css', '.scss', '.html'])
const SOURCE_NAMES = new Set(['index.html'])
const MAX_FILES = 10
const MAX_CONTEXT_CHARS = 4000

/** Collecte jusqu'à MAX_FILES fichiers source pertinents dans le répertoire du projet. */
function collectSourceFiles(projectPath: string): string[] {
  const srcDir = path.join(projectPath, 'src')
  const candidates: string[] = []

  function walk(dir: string): void {
    if (candidates.length >= MAX_FILES * 3) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else {
        const ext = path.extname(e.name).toLowerCase()
        if (SOURCE_EXTENSIONS.has(ext) || SOURCE_NAMES.has(e.name)) {
          candidates.push(full)
        }
      }
    }
  }

  // Priorité : src/ d'abord
  if (fs.existsSync(srcDir)) walk(srcDir)

  // index.html à la racine
  const rootHtml = path.join(projectPath, 'index.html')
  if (fs.existsSync(rootHtml) && !candidates.includes(rootHtml)) {
    candidates.unshift(rootHtml)
  }

  return candidates.slice(0, MAX_FILES)
}

/** Construit le contexte résumé pour Claude (max MAX_CONTEXT_CHARS). */
function buildContext(files: string[]): string {
  const parts: string[] = []
  let total = 0

  for (const f of files) {
    let content: string
    try {
      content = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const relPath = f.replace(/\\/g, '/')
    const header = `\n--- ${relPath} ---\n`
    const remaining = MAX_CONTEXT_CHARS - total - header.length - 4
    if (remaining <= 0) break
    const snippet = content.slice(0, remaining)
    parts.push(header + snippet)
    total += header.length + snippet.length
    if (total >= MAX_CONTEXT_CHARS) break
  }

  return parts.join('')
}

const SYSTEM_PROMPT_BASE = `Tu es un expert UX/UI senior avec 15 ans d'expérience en design de produits numériques.
Analyse le code source fourni et identifie les problèmes de design concrets.
Réponds UNIQUEMENT avec un objet JSON valide (zéro markdown, zéro backtick, zéro commentaire) ayant exactement ces clés :
{
  "score": number entre 0 et 100 (qualité design globale),
  "summary": "string — résumé de l'état design en 2-3 phrases",
  "palette": {
    "issues": ["problème détecté..."],
    "suggestions": [{"color": "#hexcode", "usage": "pour quoi utiliser cette couleur"}]
  },
  "typography": {
    "issues": ["problème détecté..."],
    "suggestions": ["suggestion concrète..."]
  },
  "layout": {
    "issues": ["problème détecté..."],
    "suggestions": ["suggestion concrète..."]
  },
  "components": [{"name": "NomComposant", "issue": "problème précis", "fix": "correction concrète"}],
  "quickWins": ["action rapide 1", "action rapide 2", "action rapide 3"]
}`

const SYSTEM_PROMPT_VISION = `Tu es un expert UX/UI senior avec 15 ans d'expérience en design de produits numériques.
Tu vois le RENDU VISUEL RÉEL de l'app (screenshot joint) ET son code source.
Base ton analyse sur ce que tu VOIS réellement : couleurs rendues, typographie affichée, espacement, hiérarchie visuelle, cohérence — pas sur ce que le CSS suggère.
Réponds UNIQUEMENT avec un objet JSON valide (zéro markdown, zéro backtick, zéro commentaire) ayant exactement ces clés :
{
  "score": number entre 0 et 100 (qualité design globale — basé sur le rendu visible),
  "summary": "string — résumé de l'état design en 2-3 phrases, décris ce que tu vois",
  "palette": {
    "issues": ["problème visible dans le rendu..."],
    "suggestions": [{"color": "#hexcode", "usage": "pour quoi utiliser cette couleur"}]
  },
  "typography": {
    "issues": ["problème visible dans le rendu..."],
    "suggestions": ["suggestion concrète..."]
  },
  "layout": {
    "issues": ["problème visible dans le rendu..."],
    "suggestions": ["suggestion concrète..."]
  },
  "components": [{"name": "NomComposant", "issue": "problème visible précis", "fix": "correction concrète"}],
  "quickWins": ["action rapide 1", "action rapide 2", "action rapide 3"]
}`

export function registerDesignReviewRoutes(app: Express): void {
  // POST /api/design-review { projectName: string }
  app.post('/api/design-review', async (req: Request, res: Response) => {
    const { projectName } = req.body as { projectName?: string }

    if (!projectName?.trim()) {
      res.status(400).json({ error: 'projectName est requis' })
      return
    }

    const ROOT = path.resolve(import.meta.dirname, '..', '..')
    const WORKSPACE_DIR = path.join(ROOT, 'workspace')
    const projectPath = path.join(WORKSPACE_DIR, projectName.trim())

    if (!fs.existsSync(projectPath)) {
      res.status(404).json({ error: `Projet "${projectName}" introuvable dans le workspace` })
      return
    }

    const files = collectSourceFiles(projectPath)
    if (files.length === 0) {
      res.status(422).json({ error: 'Aucun fichier source trouvé dans ce projet' })
      return
    }

    const context = buildContext(files)

    // Tentative de capture du rendu visuel — best-effort, jamais bloquant.
    let imageBase64: string | undefined
    try {
      const url = getPreviewUrl()
      if (url) {
        const buf = await capturePreview(url)
        imageBase64 = buf.toString('base64')
      }
    } catch {
      // preview absent ou Playwright indispo — analyse sur code uniquement
    }

    const hasVision = !!imageBase64
    const systemPrompt = hasVision ? SYSTEM_PROMPT_VISION : SYSTEM_PROMPT_BASE
    const visualIntro = hasVision
      ? 'Voici le rendu visuel de l\'app (screenshot). Analyse d\'abord ce que tu vois, PUIS complète avec le code.\n\n'
      : ''
    const provider = resolveProvider(process.env.DESIGNREVIEW_PROVIDER, 'claude')

    let rawJson: string
    try {
      rawJson = hasVision
        ? await askLLM(
            systemPrompt,
            `${visualIntro}Voici le code source du projet "${projectName}" (${files.length} fichiers analysés) :\n${context}\n\nRetourne le JSON de recommandations design.`,
            { provider, maxTokens: 2048, imageBase64, imageMimeType: 'image/jpeg' },
          )
        : await getBrain().complete(
            systemPrompt,
            `Voici le code source du projet "${projectName}" (${files.length} fichiers analysés) :\n${context}\n\nRetourne le JSON de recommandations design.`,
            { provider, maxTokens: 2048 },
          )
    } catch (err) {
      res.status(502).json({ error: `Erreur LLM : ${err instanceof Error ? err.message : String(err)}` })
      return
    }

    let result: DesignReviewRecord
    try {
      // Parfois Claude entoure le JSON de backticks malgré le prompt
      const cleaned = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned) as Omit<DesignReviewRecord, 'project' | 'date'>
      result = {
        project: projectName.trim(),
        date: new Date().toISOString(),
        score: Number(parsed.score) || 0,
        summary: parsed.summary ?? '',
        palette: parsed.palette ?? { issues: [], suggestions: [] },
        typography: parsed.typography ?? { issues: [], suggestions: [] },
        layout: parsed.layout ?? { issues: [], suggestions: [] },
        components: parsed.components ?? [],
        quickWins: parsed.quickWins ?? [],
      }
    } catch {
      res.status(500).json({ error: 'Impossible de parser la réponse JSON de Claude', raw: rawJson })
      return
    }

    appendReview(result)
    res.json(result)
  })

  // GET /api/design-review/history?project=X
  app.get('/api/design-review/history', (req: Request, res: Response) => {
    const project = (req.query.project as string | undefined) ?? ''
    const reviews = loadReviews(project)
    res.json({ reviews })
  })
}
