import fs from 'fs'
import path from 'path'
import type { Express, Request, Response } from 'express'

import { WORKSPACE_DIR } from "./projects.js"
const METRICS_FILE = path.join(WORKSPACE_DIR, '.metrics.jsonl')

interface MetricEntry {
  ts: string
  project: string
  model: string
  mode?: string
  costUsd: number
  numTurns: number
  contextTokens?: number
  snapshots?: number
  durationMs: number
  error: boolean
  resolvedBy?: string
  attempts?: number
}

function readMetrics(): MetricEntry[] {
  if (!fs.existsSync(METRICS_FILE)) return []
  return fs
    .readFileSync(METRICS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l) as MetricEntry } catch { return null }
    })
    .filter(Boolean) as MetricEntry[]
}

function isoDay(ts: string): string {
  return ts.slice(0, 10) // YYYY-MM-DD
}

export function registerMetricsDashboardRoutes(app: Express): void {
  app.get('/api/metrics/summary', (_req: Request, res: Response) => {
    const entries = readMetrics()
    if (!entries.length) { res.json({ empty: true }); return }

    const totalCost = entries.reduce((s, e) => s + (e.costUsd || 0), 0)
    const totalRuns = entries.length
    const errors = entries.filter((e) => e.error).length
    const errorRate = totalRuns ? errors / totalRuns : 0
    const avgDurationMs = entries.reduce((s, e) => s + (e.durationMs || 0), 0) / totalRuns
    const avgTurns = entries.reduce((s, e) => s + (e.numTurns || 0), 0) / totalRuns

    // Résolution élève vs maître
    const eleveRuns = entries.filter((e) => e.resolvedBy === 'eleve').length
    const maitrRuns = entries.filter((e) => e.resolvedBy === 'maitre').length

    // Par modèle
    const byModel: Record<string, { runs: number; cost: number }> = {}
    for (const e of entries) {
      const m = e.model || 'unknown'
      if (!byModel[m]) byModel[m] = { runs: 0, cost: 0 }
      byModel[m].runs++
      byModel[m].cost += e.costUsd || 0
    }

    // Par jour (last 21 days)
    const today = new Date()
    const days: { day: string; cost: number; runs: number }[] = []
    for (let i = 20; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      days.push({ day: d.toISOString().slice(0, 10), cost: 0, runs: 0 })
    }
    const dayMap = Object.fromEntries(days.map((d) => [d.day, d]))
    for (const e of entries) {
      const d = isoDay(e.ts)
      if (dayMap[d]) { dayMap[d].cost += e.costUsd || 0; dayMap[d].runs++ }
    }

    // Top 10 projets
    const byProject: Record<string, { runs: number; cost: number }> = {}
    for (const e of entries) {
      if (!byProject[e.project]) byProject[e.project] = { runs: 0, cost: 0 }
      byProject[e.project].runs++
      byProject[e.project].cost += e.costUsd || 0
    }
    const topProjects = Object.entries(byProject)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)

    // Par mode (mvp vs elite)
    const byMode: Record<string, number> = {}
    for (const e of entries) {
      const m = e.mode || 'unknown'
      byMode[m] = (byMode[m] || 0) + 1
    }

    res.json({
      totalCost,
      totalRuns,
      errorRate,
      avgDurationMs,
      avgTurns,
      eleveRuns,
      maitrRuns,
      byModel: Object.entries(byModel)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.cost - a.cost),
      byDay: days,
      topProjects,
      byMode,
    })
  })
}
