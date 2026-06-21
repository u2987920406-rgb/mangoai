import type { Idea, Status } from '../types'
import { STATUSES } from '../types'
import { byStatus } from '../lib'
import Column from './Column'

interface Props {
  ideas: Idea[] // deja filtrees + triees
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

export default function Board(props: Props) {
  return (
    <div className="board">
      {STATUSES.map((status) => (
        <Column
          key={status}
          status={status}
          ideas={byStatus(props.ideas, status)}
          hoveredId={props.hoveredId}
          highlightFor={props.highlightFor}
          onEdit={props.onEdit}
          onMove={props.onMove}
          onDelete={props.onDelete}
          onHover={props.onHover}
          onTagClick={props.onTagClick}
          onDepClick={props.onDepClick}
          onDropCard={props.onDropCard}
        />
      ))}
    </div>
  )
}
