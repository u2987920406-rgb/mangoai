import { useState } from 'react'
import type { Idea, Status } from '../types'
import { STATUS_META, STATUSES } from '../types'
import { effortSum } from '../lib'
import IdeaCard from './IdeaCard'

interface Props {
  status: Status
  ideas: Idea[]
  hoveredId: number | null
  highlightFor: (idea: Idea) => 'none' | 'self' | 'dep' | 'unlocks' | 'dim'
  onEdit: (idea: Idea) => void
  onMove: (id: number, dir: -1 | 1) => void
  onDelete: (id: number) => void
  onHover: (id: number | null) => void
  onTagClick: (tag: string) => void
  onDepClick: (id: number) => void
  onDropCard: (id: number, status: Status) => void
}

export default function Column({
  status,
  ideas,
  highlightFor,
  onEdit,
  onMove,
  onDelete,
  onHover,
  onTagClick,
  onDepClick,
  onDropCard,
}: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [dragId, setDragId] = useState<number | null>(null)
  const meta = STATUS_META[status]
  const idx = STATUSES.indexOf(status)
  const sum = effortSum(ideas)

  return (
    <section
      className={`column col-${status} ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={(e) => {
        // n'efface l'etat que si on quitte vraiment la colonne (pas un enfant).
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = Number(e.dataTransfer.getData('text/plain'))
        if (!Number.isNaN(id)) onDropCard(id, status)
      }}
    >
      <header className="col-head">
        <span className="col-title">
          <span className="col-emoji" aria-hidden>
            {meta.emoji}
          </span>
          {meta.label}
        </span>
        <span className="col-counts">
          <span className="col-count" title="Nombre de cartes">
            {ideas.length}
          </span>
          {sum > 0 && (
            <span className="col-effort" title="Somme d'effort (XS=1 … XL=5)">
              Σ{sum}
            </span>
          )}
        </span>
      </header>

      <div className="col-body">
        {ideas.length === 0 ? (
          <div className="col-empty">{meta.empty}</div>
        ) : (
          ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              highlight={highlightFor(idea)}
              canMoveLeft={idx > 0}
              canMoveRight={idx < STATUSES.length - 1}
              onEdit={onEdit}
              onMove={onMove}
              onDelete={onDelete}
              onHover={onHover}
              onTagClick={onTagClick}
              onDepClick={onDepClick}
              onDragStart={setDragId}
              onDragEnd={() => setDragId(null)}
            />
          ))
        )}
        {dragOver && dragId !== null && <div className="drop-hint">Deposer ici → {meta.label}</div>}
      </div>
    </section>
  )
}
