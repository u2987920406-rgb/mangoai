import { useEffect, useRef, useState } from 'react'
import type { Idea, Effort, ModelTier, Status } from '../types'
import { EFFORTS, EFFORT_LABEL, MODEL_META, STATUSES, STATUS_META } from '../types'
import { parseCsv, parseDeps } from '../lib'

interface Props {
  idea: Idea
  isNew: boolean
  onSave: (idea: Idea) => void
  onClose: () => void
}

const MODELS: ModelTier[] = ['haiku', 'sonnet', 'opus', 'none']

export default function EditModal({ idea, isNew, onSave, onClose }: Props) {
  const [title, setTitle] = useState(idea.title)
  const [status, setStatus] = useState<Status>(idea.status)
  const [model, setModel] = useState<ModelTier>(idea.model)
  const [effort, setEffort] = useState<Effort>(idea.effort)
  const [tags, setTags] = useState(idea.tags.join(', '))
  const [deps, setDeps] = useState(idea.deps.join(', '))
  const [notes, setNotes] = useState(idea.notes)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Echap pour fermer (capturee meme depuis un champ).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function submit() {
    const t = title.trim()
    if (!t) {
      setError('Le titre est obligatoire.')
      titleRef.current?.focus()
      return
    }
    onSave({
      ...idea,
      title: t,
      status,
      model,
      effort,
      tags: parseCsv(tags),
      deps: parseDeps(deps),
      notes: notes.trim(),
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? 'Nouvelle idee' : `Editer #${idea.id}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>
            {isNew ? '✨ Nouvelle idee' : '✎ Editer'} <span className="modal-id">#{idea.id}</span>
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Titre</span>
            <input
              ref={titleRef}
              value={title}
              maxLength={120}
              placeholder="Un titre court au concept…"
              onChange={(e) => {
                setTitle(e.target.value)
                if (error) setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Statut</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].emoji} {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Modele optimal</span>
              <select value={model} onChange={(e) => setModel(e.target.value as ModelTier)}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_META[m].emoji} {MODEL_META[m].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Effort</span>
              <select value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
                {EFFORTS.map((ef) => (
                  <option key={ef} value={ef}>
                    {EFFORT_LABEL[ef]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Tags (separes par des virgules)</span>
              <input
                value={tags}
                placeholder="kernel, vision, concept"
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Dependances (# separes par des virgules)</span>
              <input value={deps} placeholder="108, 137" onChange={(e) => setDeps(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              value={notes}
              rows={5}
              placeholder="Contexte, decisions, pieges…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <span className="modal-hint">Echap pour fermer · Ctrl/Cmd+Entree pour valider</span>
          <div className="modal-buttons">
            <button className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button className="btn-accent" onClick={submit}>
              {isNew ? 'Creer' : 'Enregistrer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
