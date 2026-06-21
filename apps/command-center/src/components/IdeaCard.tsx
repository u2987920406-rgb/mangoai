import { useState } from 'react'
import type { Idea, Status } from '../types'
import { MODEL_META } from '../types'
import { relativeDate } from '../lib'

interface Props {
  idea: Idea
  highlight: 'none' | 'self' | 'dep' | 'unlocks' | 'dim'
  canMoveLeft: boolean
  canMoveRight: boolean
  onEdit: (idea: Idea) => void
  onMove: (id: number, dir: -1 | 1) => void
  onDelete: (id: number) => void
  onHover: (id: number | null) => void
  onTagClick: (tag: string) => void
  onDepClick: (id: number) => void
  onDragStart: (id: number) => void
  onDragEnd: () => void
}

const STATUS_ORDER: Status[] = ['idea', 'doing', 'blocked', 'done']

export default function IdeaCard({
  idea,
  highlight,
  canMoveLeft,
  canMoveRight,
  onEdit,
  onMove,
  onDelete,
  onHover,
  onTagClick,
  onDepClick,
  onDragStart,
  onDragEnd,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const model = MODEL_META[idea.model]
  const notes = idea.notes.trim()
  const truncated = notes.length > 140 ? notes.slice(0, 140).trimEnd() + '…' : notes

  return (
    <article
      className={`card hl-${highlight} effort-${idea.effort}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(idea.id))
        onDragStart(idea.id)
      }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover(idea.id)}
      onMouseLeave={() => onHover(null)}
    >
      <header className="card-head">
        <span className="badge-id">#{idea.id}</span>
        <span className={`badge-model model-${idea.model}`} title={model.label}>
          <span aria-hidden>{model.emoji}</span> {model.short}
        </span>
        {idea.effort !== 'none' && (
          <span className={`chip-effort effort-chip-${idea.effort}`} title="Effort estime">
            {idea.effort}
          </span>
        )}
      </header>

      <h3 className="card-title">{idea.title}</h3>

      {truncated && <p className="card-notes">{truncated}</p>}

      {(idea.tags.length > 0 || idea.deps.length > 0) && (
        <div className="card-meta">
          {idea.tags.map((t) => (
            <button key={t} className="tag" onClick={() => onTagClick(t)} title={`Filtrer sur #${t}`}>
              {t}
            </button>
          ))}
          {idea.deps.map((d) => (
            <button
              key={d}
              className="dep-chip"
              onClick={() => onDepClick(d)}
              title={`Depend de #${d}`}
            >
              ↳ #{d}
            </button>
          ))}
        </div>
      )}

      <footer className="card-foot">
        <span className="card-date" title={new Date(idea.updatedAt).toLocaleString('fr-FR')}>
          {relativeDate(idea.updatedAt)}
        </span>
        <div className="card-actions">
          <button
            className="icon-btn"
            disabled={!canMoveLeft}
            onClick={() => onMove(idea.id, -1)}
            title="Deplacer a gauche"
            aria-label="Deplacer a gauche"
          >
            ←
          </button>
          <button
            className="icon-btn"
            disabled={!canMoveRight}
            onClick={() => onMove(idea.id, 1)}
            title="Deplacer a droite"
            aria-label="Deplacer a droite"
          >
            →
          </button>
          <button className="icon-btn" onClick={() => onEdit(idea)} title="Editer" aria-label="Editer">
            ✎
          </button>
          {confirming ? (
            <span className="confirm-inline">
              <button className="icon-btn danger" onClick={() => onDelete(idea.id)} title="Confirmer">
                oui
              </button>
              <button className="icon-btn" onClick={() => setConfirming(false)} title="Annuler">
                non
              </button>
            </span>
          ) : (
            <button
              className="icon-btn"
              onClick={() => setConfirming(true)}
              title="Supprimer"
              aria-label="Supprimer"
            >
              🗑
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}

export { STATUS_ORDER }
