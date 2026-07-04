// Stratège global (#176-global, É5) — le CERVEAU agrégateur cross-projet/
// cross-session (à distinguer de l'Observateur-Conseil, une sonde QA seule).
// Affiche le dernier briefing persisté (data/strategist-state.json) et ferme
// la boucle « Mango propose, Raf décide » (D7) : Accepter / Rejeter / Reporter
// mutent le statut de l'item et persistent côté serveur.
import { useCallback, useEffect, useState } from 'react'
import { Compass, RefreshCw, Check, X, Clock } from 'lucide-react'
import { Badge, EmptyState, cx, TEXT } from '../design'

const KIND_LABEL = {
  suggestion: 'Proposition',
  alerte: 'Alerte',
  'question-demande': 'Question',
}

const KIND_TONE = {
  suggestion: 'accent',
  alerte: 'err',
  'question-demande': 'warn',
}

function ItemRow({ item, onAction, busy }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-edge-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[item.kind] ?? 'neutral'}>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
        <span className={cx(TEXT.base, 'font-medium text-ink')}>{item.titre}</span>
        {item.hits > 1 && (
          <span className="ml-auto text-[11px] text-dim">{item.hits} observations</span>
        )}
      </div>
      {item.corps && <p className="text-[12.5px] text-dim">{item.corps}</p>}
      {item.kind === 'question-demande' && item.demande && (
        <p className="text-[11.5px] italic text-dim">Demande : {item.demande}</p>
      )}
      {Array.isArray(item.sources) && item.sources.length > 0 && (
        <p className="text-[10.5px] text-faint">Sources : {item.sources.join(', ')}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onAction(item.id, 'accepte')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-edge-soft px-2 py-1 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
        >
          <Check size={12} /> Accepter
        </button>
        <button
          onClick={() => onAction(item.id, 'rejette')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-edge-soft px-2 py-1 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
        >
          <X size={12} /> Rejeter
        </button>
        <button
          onClick={() => onAction(item.id, 'reporte')}
          disabled={busy}
          className="flex items-center gap-1 rounded-md border border-edge-soft px-2 py-1 text-[11.5px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
        >
          <Clock size={12} /> Reporter
        </button>
      </div>
    </li>
  )
}

export default function StrategeGlobal() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/stratege/briefing')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (id, verb) => {
    setBusyId(id)
    try {
      const r = await fetch(`/api/stratege/${encodeURIComponent(id)}/${verb}`, { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        setData(d)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }, [])

  const items = data ? (data.items ?? []).filter((i) => i.status === 'pending') : []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-edge-soft shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-ink">Stratège</h1>
          <p className="text-xs text-dim">Cerveau agrégateur cross-projets/cross-sessions — propose, alerte, questionne</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
          title="Rafraîchir"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Rafraîchir
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-err/40 bg-err/10 p-3 text-sm text-err">{error}</div>
        )}

        {!error && !loading && items.length === 0 && (
          <EmptyState
            icon={<Compass size={28} />}
            title="Rien de saillant"
            description="Le Stratège n'a rien à proposer pour l'instant (gate STRATEGE_GLOBAL, ou pas assez de signaux)."
          />
        )}

        {!error && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} onAction={act} busy={busyId === item.id} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
