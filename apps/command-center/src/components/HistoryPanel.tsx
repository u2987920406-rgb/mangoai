import type { HistoryEntry } from '../types'
import { STATUS_META } from '../types'
import { relativeDate } from '../lib'

interface Props {
  history: HistoryEntry[]
  titleOf: (id: number) => string
}

// La donnee qui compounde : chaque mouvement de carte, le plus recent en haut.
export default function HistoryPanel({ history, titleOf }: Props) {
  const recent = [...history].reverse().slice(0, 12)
  return (
    <section className="history glass">
      <header className="panel-head">
        <h2>
          <span aria-hidden>🕑</span> Activite recente
        </h2>
        <span className="panel-count">{history.length}</span>
      </header>

      {recent.length === 0 ? (
        <p className="panel-empty">Aucun mouvement encore. Deplace une carte pour amorcer le journal.</p>
      ) : (
        <ul className="history-list">
          {recent.map((e, idx) => (
            <li key={`${e.id}-${e.ts}-${idx}`} className="history-item">
              <span className="history-id">#{e.id}</span>
              <span className="history-flow">
                <span className={`pill pill-${e.from}`}>{STATUS_META[e.from].emoji}</span>
                <span className="history-arrow">→</span>
                <span className={`pill pill-${e.to}`}>{STATUS_META[e.to].emoji}</span>
              </span>
              <span className="history-title" title={titleOf(e.id)}>
                {titleOf(e.id)}
              </span>
              <span className="history-date">{relativeDate(e.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
