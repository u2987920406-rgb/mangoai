// #193 — Sélecteur de projets locaux externes (section Code, docs/plan-193-section-code.md).
// Calqué sur Coffres.jsx (même patron : picker natif Tauri si dispo, sinon champ texte de
// secours). Ne parle QU'aux routes /api/external-projects (external-projects-routes.ts) —
// aucune logique de chemin ici.
import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, FolderOpen, Code2, Trash2, Lock, Unlock, ExternalLink } from 'lucide-react'
import { Button, Input, Badge, EmptyState, cx, TEXT } from '../design'

function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__ && window.__TAURI__.core)
}

function ProjectRow({ project, onOpen, onRemove, busy }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-edge-soft p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={project.mode === 'rw' ? 'warn' : 'accent'}>
            {project.mode === 'rw' ? <Unlock size={11} /> : <Lock size={11} />}
            {project.mode === 'rw' ? 'Lecture + écriture' : 'Lecture seule'}
          </Badge>
          <span className="text-[13px] font-medium text-ink">{project.label}</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-faint" title={project.path}>{project.path}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="primary" size="sm" icon={<ExternalLink size={13} />} onClick={() => onOpen(project)}>
          Ouvrir
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 size={13} />}
          disabled={busy}
          onClick={() => onRemove(project.id)}
        >
          Retirer
        </Button>
      </div>
    </li>
  )
}

export default function ExternalProjectPicker({ onSelect }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingLabel, setPendingLabel] = useState('')
  const [pendingPath, setPendingPath] = useState('')
  const [mode, setMode] = useState('rw')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/external-projects')
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d.projects) ? d.projects : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pickFolder = useCallback(async () => {
    if (!isTauri()) return
    try {
      const picked = await window.__TAURI__.core.invoke('pick_folder')
      if (typeof picked === 'string' && picked) setPendingPath(picked)
    } catch (e) {
      setError(e?.message ?? String(e))
    }
  }, [])

  const add = useCallback(async () => {
    const p = pendingPath.trim()
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/external-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: pendingLabel.trim(), path: p, mode }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `échec de l'ajout (${r.status})`)
      setPendingLabel('')
      setPendingPath('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [pendingLabel, pendingPath, mode, load])

  const remove = useCallback(async (id) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/external-projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `échec du retrait (${r.status})`)
      }
      const d = await r.json()
      setProjects(Array.isArray(d.projects) ? d.projects : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <div className="rounded-lg border border-edge-soft p-3 space-y-3">
          <p className={cx(TEXT.base, 'font-medium text-ink')}>Ajouter un projet local</p>
          <Input
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            placeholder="Nom (optionnel — sinon le nom du dossier)"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {isTauri() ? (
              <Button variant="secondary" size="md" icon={<FolderOpen size={14} />} onClick={pickFolder}>
                Choisir un dossier…
              </Button>
            ) : null}
            <Input
              value={pendingPath}
              onChange={(e) => setPendingPath(e.target.value)}
              placeholder={isTauri() ? 'ou colle un chemin ici' : 'Chemin du dossier (ex : C:\\Users\\...\\mon-projet)'}
              className="flex-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-dim">Mode :</span>
            <Button variant={mode === 'ro' ? 'primary' : 'secondary'} size="sm" icon={<Lock size={12} />} onClick={() => setMode('ro')}>
              Lecture seule
            </Button>
            <Button variant={mode === 'rw' ? 'primary' : 'secondary'} size="sm" icon={<Unlock size={12} />} onClick={() => setMode('rw')}>
              Lecture + écriture
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<FolderPlus size={13} />}
              disabled={!pendingPath.trim() || busy}
              loading={busy}
              onClick={add}
              className="ml-auto"
            >
              Ajouter
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-err/40 bg-err/10 p-3 text-sm text-err">{error}</div>
        )}

        {!error && !loading && projects.length === 0 && (
          <EmptyState
            icon={<Code2 size={28} />}
            title="Aucun projet local ajouté"
            description="Ajoute un dossier ci-dessus pour déboguer/construire dessus avec un cerveau frontière — indépendant du workspace MangoOS."
          />
        )}

        {projects.length > 0 && (
          <ul className="space-y-2">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} onOpen={onSelect} onRemove={remove} busy={busy} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
