// Observateur-Conseil (D2b) — Visage 2 de MangoQA. Rapport global cross-projets,
// écrit par le fantôme MangoQA dans <workspace>/.mangoqa/observer-report.json
// (gate QA_OBSERVER, côté MangoQA — repo séparé). SEULE LECTURE ici, fail-open :
// le rapport peut être absent, on l'assume honnêtement plutôt que d'inventer.
import { useCallback, useEffect, useState } from 'react'
import { Compass, RefreshCw } from 'lucide-react'
import { Badge, EmptyState, cx, TEXT } from '../design'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  return `il y a ${days} jour${days > 1 ? 's' : ''}`
}

const KIND_LABEL = {
  'branche-recurrente': 'Branche récurrente',
  'regle-recurrente': 'Règle récurrente',
  'projet-recurrent': 'Projet récurrent',
}

function PatternRow({ pattern }) {
  const pct = Math.round((pattern.share ?? 0) * 100)
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-edge-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{KIND_LABEL[pattern.kind] ?? pattern.kind}</Badge>
        <span className={cx(TEXT.base, 'font-medium text-ink')}>{pattern.subject}</span>
        <span className="ml-auto text-[11px] text-dim">
          {pattern.count} occurrence{pattern.count > 1 ? 's' : ''} · {pct}%
        </span>
      </div>
      {Array.isArray(pattern.examples) && pattern.examples.length > 0 && (
        <ul className="ml-1 space-y-0.5">
          {pattern.examples.slice(0, 3).map((ex, i) => (
            <li key={i} className="text-[11.5px] text-dim">· {ex}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function ObserverConseil() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/mangoqa/observer')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-edge-soft shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-ink">Observateur-Conseil</h1>
          <p className="text-xs text-dim">MangoQA — rapport global cross-projets (patterns récurrents)</p>
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

        {!error && !loading && data && data.available === false && (
          <EmptyState
            icon={<Compass size={28} />}
            title="Aucun rapport"
            description="L'Observateur MangoQA n'a pas encore parlé (gate QA_OBSERVER)."
          />
        )}

        {!error && data && data.available === true && (
          <>
            <div className="flex items-center justify-between">
              <p className={cx(TEXT.base, 'text-ink')}>{data.report.summary}</p>
              <span className="shrink-0 pl-3 text-[11px] text-faint">{timeAgo(data.generatedAt)}</span>
            </div>

            <div className="text-[11px] text-dim">
              {data.windowEvents} événement{data.windowEvents > 1 ? 's' : ''} observé{data.windowEvents > 1 ? 's' : ''}
            </div>

            {data.report.patterns && data.report.patterns.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Motifs récurrents</h3>
                <ul className="space-y-2">
                  {data.report.patterns.map((p, i) => (
                    <PatternRow key={i} pattern={p} />
                  ))}
                </ul>
              </div>
            )}

            {data.report.suggestions && data.report.suggestions.length > 0 && (
              <div className="space-y-2 rounded-lg border border-edge-soft p-3">
                <h3 className="text-sm font-semibold text-ink">Suggestions</h3>
                <ul className="space-y-1">
                  {data.report.suggestions.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-dim">
                      <span className="shrink-0 text-accent">→</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
