import fs from 'node:fs'
import { atomicWriteFileSync } from './safe-io.js'
import path from 'node:path'
import type { Express } from 'express'
import { resolveProvider } from './llm/llm-engine.js'
import { getBrain } from './kernel.js'
import { runRelay, defaultRelayDeps } from './eleve.js'
import { runAsActor } from './perimeter-context.js'
import { projectDir } from './projects.js'
import { cronBreakerConfig, canRunCron, recordCronRun, newCronBreakerState, computeNextRunHint, extractTouchedFiles, type CronBreakerState } from './cron-breaker.js'

interface CronTask {
  id: string
  name: string
  projectName: string
  prompt: string
  schedule: 'hourly' | 'daily' | 'weekly'
  enabled: boolean
  lastRun?: string
  lastResult?: string
  nextRunHint?: number // #173 Phase 2 — délai (ms) proposé par Mango au dernier run ; prime sur `schedule`
  createdAt: string
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'cron-tasks.json')

// #173 — état in-process du disjoncteur cron (fenêtre glissante d'une heure). Le scheduler
// vit longtemps ; un état en mémoire suffit (pas de persistance disque nécessaire).
let cronBreakerState: CronBreakerState = newCronBreakerState()

function loadTasks(): CronTask[] {
  if (!fs.existsSync(DATA_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as CronTask[]
  } catch {
    return []
  }
}

function saveTasks(tasks: CronTask[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  atomicWriteFileSync(DATA_FILE, JSON.stringify(tasks, null, 2))
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function shouldRun(task: CronTask): boolean {
  if (!task.lastRun) return true
  const last = new Date(task.lastRun).getTime()
  const now = Date.now()
  const elapsed = now - last
  // #173 Phase 2 — rythme ADAPTATIF : si Mango a proposé un délai au dernier run (nextRunHint),
  // il prime sur le schedule fixe (plus court s'il reste du travail, plus long sinon).
  if (typeof task.nextRunHint === 'number' && task.nextRunHint > 0) return elapsed >= task.nextRunHint
  if (task.schedule === 'hourly') return elapsed >= 60 * 60 * 1000
  if (task.schedule === 'daily') return elapsed >= 24 * 60 * 60 * 1000
  if (task.schedule === 'weekly') return elapsed >= 7 * 24 * 60 * 60 * 1000
  return false
}

// Repli HISTORIQUE (gate off) : une complétion texte SEULE, sans outils. Inchangé.
async function legacyExecuteTask(task: CronTask): Promise<string> {
  const systemPrompt = `Tu es MangoOS, un agent autonome. Le projet cible est "${task.projectName}". Exécute la tâche demandée de façon concise et utile.`
  const result = await getBrain().complete(systemPrompt, task.prompt, {
    provider: resolveProvider(process.env.CRON_PROVIDER),
    maxTokens: 500,
  })
  return result || '(résultat vide)'
}

// Résumé d'un run agentique pour le journal du cron (concis, diff-friendly). L'UI (Phase 3)
// affichera le détail ; ici on donne l'essentiel : qui a résolu, coût, complétude.
function summarizeForCronLog(result: Awaited<ReturnType<typeof runRelay>>, logs: string[]): string {
  const ok = result?.success ? '✓' : '✗'
  const by = result?.resolvedBy ?? '?'
  const cost = Number(result?.costUsd ?? 0).toFixed(3)
  const inc = result?.incomplete ? ' (INCOMPLET)' : ''
  // Diff-friendly : liste les fichiers réellement écrits/édités par le run.
  const files = extractTouchedFiles(logs)
  const filesLine = files.length ? `\nFichiers touchés (${files.length}) : ${files.join(', ')}` : '\nAucun fichier modifié.'
  return `${ok} run agentique — résolu par ${by}, coût $${cost}${inc}${filesLine}`
}

// #173 — le cron accède à la VRAIE boucle agentique (runRelay) : il peut écrire du code, seul.
// Condition non négociable (A) : jamais sans le disjoncteur, et gaté CRON_AGENTIC=off → repli
// texte inchangé (zéro régression). Le disjoncteur est une condition D'ENTRÉE (refus AVANT run).
async function executeTask(task: CronTask): Promise<{ summary: string; nextRunHint?: number }> {
  const cfg = cronBreakerConfig()
  if (!cfg.enabled) return { summary: await legacyExecuteTask(task) }

  const now = Date.now()
  const decision = canRunCron(cfg, cronBreakerState, now)
  if (!decision.allow) return { summary: `(disjoncteur cron : ${decision.reason})` }

  const logs: string[] = []
  // (#180 É2) Le cron s'exécute sans Raf → acteur AUTONOME (périmètre restreint,
  // propagé jusqu'à executeContract via AsyncLocalStorage).
  const result = await runAsActor("autonomous", () => runRelay(
    task.prompt,
    projectDir(task.projectName),
    { maitreModel: 'sonnet', onLog: (line: string) => { logs.push(line) } },
    defaultRelayDeps,
  ))
  // Comptabilise le RÉEL (coût renvoyé par runRelay) dans la fenêtre glissante.
  cronBreakerState = recordCronRun(cronBreakerState, now, result?.costUsd ?? 0)
  return { summary: summarizeForCronLog(result, logs), nextRunHint: computeNextRunHint(result) }
}

async function startScheduler(): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const tick = async () => {
    const tasks = loadTasks()
    const updated: CronTask[] = []
    for (const task of tasks) {
      if (task.enabled && shouldRun(task)) {
        try {
          const { summary, nextRunHint } = await executeTask(task)
          updated.push({ ...task, lastRun: new Date().toISOString(), lastResult: summary, nextRunHint })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          updated.push({ ...task, lastRun: new Date().toISOString(), lastResult: `Erreur: ${msg}` })
        }
      } else {
        updated.push(task)
      }
    }
    saveTasks(updated)
  }

  setInterval(() => {
    tick().catch(console.error)
  }, 5 * 60 * 1000)
}

export function registerCronRoutes(app: Express): void {
  // GET /api/cron/tasks
  app.get('/api/cron/tasks', (_req, res) => {
    const tasks = loadTasks()
    res.json(tasks)
  })

  // POST /api/cron/tasks
  app.post('/api/cron/tasks', (req, res) => {
    const { name, projectName, prompt, schedule } = req.body as {
      name: string
      projectName: string
      prompt: string
      schedule: 'hourly' | 'daily' | 'weekly'
    }
    if (!name || !projectName || !prompt || !schedule) {
      res.status(400).json({ error: 'Champs manquants: name, projectName, prompt, schedule' })
      return
    }
    const tasks = loadTasks()
    const task: CronTask = {
      id: generateId(),
      name,
      projectName,
      prompt,
      schedule,
      enabled: true,
      createdAt: new Date().toISOString()
    }
    tasks.push(task)
    saveTasks(tasks)
    res.json({ task })
  })

  // PATCH /api/cron/tasks/:id
  app.patch('/api/cron/tasks/:id', (req, res) => {
    const { id } = req.params
    const { enabled } = req.body as { enabled: boolean }
    const tasks = loadTasks()
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) {
      res.status(404).json({ error: 'Tâche introuvable' })
      return
    }
    tasks[idx] = { ...tasks[idx], enabled }
    saveTasks(tasks)
    res.json({ task: tasks[idx] })
  })

  // DELETE /api/cron/tasks/:id
  app.delete('/api/cron/tasks/:id', (req, res) => {
    const { id } = req.params
    const tasks = loadTasks()
    const filtered = tasks.filter(t => t.id !== id)
    if (filtered.length === tasks.length) {
      res.status(404).json({ error: 'Tâche introuvable' })
      return
    }
    saveTasks(filtered)
    res.json({ ok: true })
  })

  // POST /api/cron/tasks/:id/run
  app.post('/api/cron/tasks/:id/run', async (req, res) => {
    const { id } = req.params
    const tasks = loadTasks()
    const idx = tasks.findIndex(t => t.id === id)
    if (idx === -1) {
      res.status(404).json({ error: 'Tâche introuvable' })
      return
    }
    try {
      const { summary, nextRunHint } = await executeTask(tasks[idx])
      tasks[idx] = { ...tasks[idx], lastRun: new Date().toISOString(), lastResult: summary, nextRunHint }
      saveTasks(tasks)
      res.json({ result: summary, task: tasks[idx] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: msg })
    }
  })

  // Démarrer le scheduler en arrière-plan
  startScheduler().catch(console.error)
}
