import { useRef } from 'react'
import type { Effort, ModelTier, SortKey } from '../types'
import { EFFORTS, MODEL_META, SORT_META } from '../types'

export interface Filters {
  search: string
  model: ModelTier | 'all'
  effort: Effort | 'all'
  tag: string | 'all'
  sort: SortKey
}

interface Props {
  filters: Filters
  allTags: string[]
  searchRef: React.RefObject<HTMLInputElement | null>
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  onNew: () => void
  onExport: () => void
  onImportFile: (file: File) => void
  onResetSeed: () => void
}

const MODELS: ModelTier[] = ['haiku', 'sonnet', 'opus', 'none']
const SORTS: SortKey[] = ['id', 'effort', 'model', 'updated']

export default function Toolbar({
  filters,
  allTags,
  searchRef,
  onChange,
  onReset,
  onNew,
  onExport,
  onImportFile,
  onResetSeed,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const active =
    filters.search !== '' ||
    filters.model !== 'all' ||
    filters.effort !== 'all' ||
    filters.tag !== 'all'

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="search-wrap">
          <span className="search-icon" aria-hidden>
            ⌕
          </span>
          <input
            ref={searchRef}
            className="search"
            value={filters.search}
            placeholder="Rechercher (titre, notes, tags)…  ·  touche /"
            onChange={(e) => onChange({ search: e.target.value })}
          />
          {filters.search && (
            <button className="search-clear" onClick={() => onChange({ search: '' })} aria-label="Effacer">
              ✕
            </button>
          )}
        </div>

        <button className="btn-accent btn-new" onClick={onNew} title="Nouvelle idee (N)">
          ＋ Nouvelle idee
        </button>
      </div>

      <div className="toolbar-row toolbar-filters">
        <label className="select-wrap">
          <span className="select-label">Modele</span>
          <select
            value={filters.model}
            onChange={(e) => onChange({ model: e.target.value as ModelTier | 'all' })}
          >
            <option value="all">Tous</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_META[m].emoji} {MODEL_META[m].short}
              </option>
            ))}
          </select>
        </label>

        <label className="select-wrap">
          <span className="select-label">Effort</span>
          <select
            value={filters.effort}
            onChange={(e) => onChange({ effort: e.target.value as Effort | 'all' })}
          >
            <option value="all">Tous</option>
            {EFFORTS.filter((e) => e !== 'none').map((ef) => (
              <option key={ef} value={ef}>
                {ef}
              </option>
            ))}
            <option value="none">—</option>
          </select>
        </label>

        <label className="select-wrap">
          <span className="select-label">Tag</span>
          <select value={filters.tag} onChange={(e) => onChange({ tag: e.target.value })}>
            <option value="all">Tous</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="select-wrap">
          <span className="select-label">Tri</span>
          <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_META[s]}
              </option>
            ))}
          </select>
        </label>

        {active && (
          <button className="btn-ghost btn-reset" onClick={onReset} title="Reinitialiser les filtres">
            ↺ Filtres
          </button>
        )}

        <div className="toolbar-spacer" />

        <button className="btn-ghost" onClick={onExport} title="Exporter en JSON (backup)">
          ⤓ Export
        </button>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()} title="Importer un JSON">
          ⤒ Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportFile(f)
            e.target.value = ''
          }}
        />
        <button className="btn-ghost btn-danger-ghost" onClick={onResetSeed} title="Revenir au seed d'origine">
          ⟲ Seed
        </button>
      </div>
    </div>
  )
}
