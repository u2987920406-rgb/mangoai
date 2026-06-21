import type { Idea } from '../types'
import { MODEL_META } from '../types'
import { sortIdeas, unlocks } from '../lib'

interface Props {
  all: Idea[]
  ready: Idea[]
  onOpen: (idea: Idea) => void
  onHover: (id: number | null) => void
}

// Le coeur de l'aide a la decision : ce que Raf peut attaquer MAINTENANT
// (idees dont toutes les dependances sont faites), trie par effort croissant
// (quick wins d'abord).
export default function ReadyPanel({ all, ready, onOpen, onHover }: Props) {
  const ordered = sortIdeas(ready, 'effort').reverse() // effort croissant
  return (
    <section className="ready glass">
      <header className="panel-head">
        <h2>
          <span aria-hidden>🚀</span> Pret a demarrer
        </h2>
        <span className="panel-count">{ready.length}</span>
      </header>

      {ordered.length === 0 ? (
        <p className="panel-empty">
          Aucune idee debloquee pour l'instant — termine une dependance pour en liberer.
        </p>
      ) : (
        <ul className="ready-list">
          {ordered.map((i) => {
            const opens = unlocks(all, i.id)
            return (
              <li key={i.id}>
                <button
                  className="ready-item"
                  onClick={() => onOpen(i)}
                  onMouseEnter={() => onHover(i.id)}
                  onMouseLeave={() => onHover(null)}
                >
                  <span className="ready-id">#{i.id}</span>
                  <span className="ready-title">{i.title}</span>
                  <span className="ready-tail">
                    <span className={`badge-model model-${i.model}`} title={MODEL_META[i.model].label}>
                      {MODEL_META[i.model].emoji}
                    </span>
                    {i.effort !== 'none' && (
                      <span className={`chip-effort effort-chip-${i.effort}`}>{i.effort}</span>
                    )}
                    {opens.length > 0 && (
                      <span className="ready-unlocks" title={`Debloque ${opens.length} idee(s)`}>
                        ⛓ {opens.length}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
