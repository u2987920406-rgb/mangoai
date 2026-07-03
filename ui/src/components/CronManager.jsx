import { useState, useEffect, useCallback } from 'react'

const SCHEDULE_LABELS = {
  hourly: 'Toutes les heures',
  daily: 'Tous les jours',
  weekly: 'Toutes les semaines'
}

function timeAgo(isoString) {
  if (!isoString) return 'jamais'
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

// #173 Phase 2 — prochain run selon le rythme ADAPTATIF proposé par Mango (nextRunHint), s'il existe.
function nextRunLabel(task) {
  if (typeof task.nextRunHint !== 'number' || !task.lastRun) return null
  const diff = new Date(task.lastRun).getTime() + task.nextRunHint - Date.now()
  if (diff <= 0) return 'prochain run imminent'
  const min = Math.round(diff / 60000)
  return min < 60 ? `prochain ~${min} min` : `prochain ~${Math.round(min / 60)}h`
}

export default function CronManager({ onBack }) {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [expandedResult, setExpandedResult] = useState(null)
  const [running, setRunning] = useState(null)
  // (Un, 2026-07-03) U9 — garde anti double-soumission : deux clics rapides sur
  // « Créer la tâche » créaient DEUX crons identiques (exécutions dupliquées = coût réel).
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    projectName: '',
    prompt: '',
    schedule: 'daily'
  })

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/cron/tasks')
      if (res.ok) setTasks(await res.json())
    } catch {}
  }, [])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(Array.isArray(data) ? data : data.projects || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchProjects()
    const interval = setInterval(fetchTasks, 30000)
    return () => clearInterval(interval)
  }, [fetchTasks, fetchProjects])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (creating) return // (Un, 2026-07-03) U9 — une création à la fois
    if (!form.name.trim() || !form.projectName || !form.prompt.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/cron/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      if (res.ok) {
        setForm({ name: '', projectName: '', prompt: '', schedule: 'daily' })
        setShowForm(false)
        fetchTasks()
      }
    } catch {}
    setCreating(false)
  }

  const handleToggle = async (task) => {
    try {
      const res = await fetch(`/api/cron/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !task.enabled })
      })
      if (res.ok) fetchTasks()
    } catch {}
  }

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/cron/tasks/${id}`, { method: 'DELETE' })
      if (res.ok) fetchTasks()
    } catch {}
  }

  const handleRunNow = async (id) => {
    setRunning(id)
    try {
      const res = await fetch(`/api/cron/tasks/${id}/run`, { method: 'POST' })
      if (res.ok) {
        setExpandedResult(id)
        fetchTasks()
      }
    } catch {}
    setRunning(null)
  }

  return (
    <div className="flex flex-col h-full bg-bg text-ink">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-edge-soft">
        <button
          onClick={onBack}
          className="text-dim hover:text-accent transition-colors text-sm"
        >
          ← Retour
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-accent">Agents Autonomes</h1>
          <p className="text-xs text-dim mt-0.5">
            Tâches automatiques exécutées par MangoOS en arrière-plan
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 text-sm bg-accent text-bg rounded-md hover:opacity-90 transition-opacity"
        >
          {showForm ? 'Annuler' : '+ Nouvelle tâche'}
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="border-b border-edge-soft bg-panel px-6 py-4 flex flex-col gap-3"
        >
          <h2 className="text-sm font-medium text-accent-soft">Créer une tâche automatique</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dim">Nom de la tâche</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Rapport qualité quotidien"
                className="bg-bg border border-edge rounded px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dim">Projet cible</label>
              <select
                value={form.projectName}
                onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))}
                className="bg-bg border border-edge rounded px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                required
              >
                <option value="">-- Sélectionner un projet --</option>
                {projects.map(p => (
                  <option key={typeof p === 'string' ? p : p.name} value={typeof p === 'string' ? p : p.name}>
                    {typeof p === 'string' ? p : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-dim">Prompt</label>
            <textarea
              value={form.prompt}
              onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
              placeholder="Ex: Vérifie la qualité du code et donne un rapport concis"
              rows={3}
              className="bg-bg border border-edge rounded px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent resize-none"
              required
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dim">Fréquence</label>
              <select
                value={form.schedule}
                onChange={e => setForm(f => ({ ...f, schedule: e.target.value }))}
                className="bg-bg border border-edge rounded px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
              >
                <option value="hourly">Toutes les heures</option>
                <option value="daily">Tous les jours</option>
                <option value="weekly">Toutes les semaines</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="mt-5 px-4 py-2 bg-accent text-bg text-sm font-medium rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {creating ? 'Création…' : 'Créer la tâche'}
            </button>
          </div>
        </form>
      )}

      {/* Liste des tâches */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <span className="text-3xl opacity-30">⏱</span>
            <p className="text-dim text-sm">Aucun agent planifié</p>
            <p className="text-faint text-xs">Crée ta première tâche automatique</p>
          </div>
        ) : (
          tasks.map(task => (
            <div
              key={task.id}
              className="bg-panel border border-edge-soft rounded-lg px-4 py-3 flex flex-col gap-2"
            >
              {/* Ligne principale */}
              <div className="flex items-start gap-3">
                {/* Toggle switch */}
                <button
                  onClick={() => handleToggle(task)}
                  className="mt-0.5 shrink-0"
                  title={task.enabled ? 'Désactiver' : 'Activer'}
                >
                  <span
                    className={[
                      'relative inline-flex h-5 w-9 rounded-full transition-colors duration-200',
                      task.enabled ? 'bg-accent' : 'bg-edge'
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-bg shadow transition-transform duration-200',
                        task.enabled ? 'translate-x-4' : 'translate-x-0'
                      ].join(' ')}
                    />
                  </span>
                </button>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-ink">{task.name}</span>
                    <span className="text-xs text-faint bg-bg border border-edge rounded px-1.5 py-0.5">
                      {task.projectName}
                    </span>
                    <span className="text-xs text-dim">
                      {SCHEDULE_LABELS[task.schedule] || task.schedule}
                    </span>
                  </div>
                  <p className="text-xs text-dim mt-0.5">
                    Dernière exécution : {timeAgo(task.lastRun)}
                    {nextRunLabel(task) && <span className="text-faint"> · {nextRunLabel(task)}</span>}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRunNow(task.id)}
                    disabled={running === task.id}
                    className="text-xs px-2 py-1 border border-edge rounded hover:border-accent hover:text-accent transition-colors disabled:opacity-40"
                  >
                    {running === task.id ? '...' : 'Exécuter'}
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="text-err hover:opacity-70 transition-opacity text-sm leading-none"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Résultat repliable */}
              {task.lastResult && (
                <div>
                  <button
                    onClick={() => setExpandedResult(v => v === task.id ? null : task.id)}
                    className="text-xs text-dim hover:text-accent-soft transition-colors"
                  >
                    {expandedResult === task.id ? '▲ Masquer le résultat' : '▼ Voir le résultat'}
                  </button>
                  {expandedResult === task.id && (
                    <pre className="mt-2 text-xs font-mono text-ink bg-bg border border-edge rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {task.lastResult}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
