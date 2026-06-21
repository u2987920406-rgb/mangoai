import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry, Idea, Status } from './types'
import { STATUSES } from './types'
import {
  exportJson,
  importJson,
  load,
  loadHistory,
  resetToSeed,
  save,
  saveHistory,
} from './storage'
import {
  emptyIdea,
  nextId,
  readyToStart,
  sortIdeas,
} from './lib'
import Board from './components/Board'
import Toolbar, { type Filters } from './components/Toolbar'
import Stats from './components/Stats'
import ReadyPanel from './components/ReadyPanel'
import HistoryPanel from './components/HistoryPanel'
import EditModal from './components/EditModal'

const DEFAULT_FILTERS: Filters = {
  search: '',
  model: 'all',
  effort: 'all',
  tag: 'all',
  sort: 'id',
}

interface EditingState {
  idea: Idea
  isNew: boolean
}

export default function App() {
  const [ideas, setIdeas] = useState<Idea[]>(() => load())
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  // --- Persistance ---
  useEffect(() => {
    save(ideas)
  }, [ideas])
  useEffect(() => {
    saveHistory(history)
  }, [history])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  // --- Mutations ---
  // On garde les effets (journal) HORS des updaters setState : un updater doit
  // rester pur (StrictMode l'invoque deux fois). On lit l'etat courant via la
  // closure, puis on dispatche deux updaters purs.
  const recordMove = useCallback((id: number, from: Status, to: Status) => {
    setHistory((h) => [...h, { id, from, to, ts: Date.now() }])
  }, [])

  const upsert = useCallback(
    (idea: Idea, isNew: boolean) => {
      if (isNew) {
        setIdeas((prev) => [...prev, idea])
        return
      }
      const before = ideas.find((i) => i.id === idea.id)
      if (before && before.status !== idea.status) recordMove(idea.id, before.status, idea.status)
      setIdeas((prev) => prev.map((i) => (i.id === idea.id ? idea : i)))
    },
    [ideas, recordMove],
  )

  const moveTo = useCallback(
    (id: number, to: Status) => {
      const cur = ideas.find((i) => i.id === id)
      if (!cur || cur.status === to) return
      recordMove(id, cur.status, to)
      setIdeas((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: to, updatedAt: Date.now() } : i)),
      )
    },
    [ideas, recordMove],
  )

  const moveBy = useCallback(
    (id: number, dir: -1 | 1) => {
      const cur = ideas.find((i) => i.id === id)
      if (!cur) return
      const next = STATUSES[STATUSES.indexOf(cur.status) + dir]
      if (!next) return
      recordMove(id, cur.status, next)
      setIdeas((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: next, updatedAt: Date.now() } : i)),
      )
    },
    [ideas, recordMove],
  )

  const remove = useCallback((id: number) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id))
    flash(`#${id} supprimee`)
  }, [flash])

  // --- Filtres + tri ---
  const allTags = useMemo(
    () => Array.from(new Set(ideas.flatMap((i) => i.tags))).sort((a, b) => a.localeCompare(b)),
    [ideas],
  )

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const filtered = ideas.filter((i) => {
      if (filters.model !== 'all' && i.model !== filters.model) return false
      if (filters.effort !== 'all' && i.effort !== filters.effort) return false
      if (filters.tag !== 'all' && !i.tags.includes(filters.tag)) return false
      if (q) {
        const hay = `${i.id} ${i.title} ${i.notes} ${i.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return sortIdeas(filtered, filters.sort)
  }, [ideas, filters])

  const ready = useMemo(() => readyToStart(ideas), [ideas])

  // --- Mise en evidence des dependances au survol ---
  const hovered = useMemo(
    () => (hoveredId == null ? null : ideas.find((i) => i.id === hoveredId) ?? null),
    [hoveredId, ideas],
  )
  const highlightFor = useCallback(
    (idea: Idea): 'none' | 'self' | 'dep' | 'unlocks' | 'dim' => {
      if (!hovered) return 'none'
      if (idea.id === hovered.id) return 'self'
      if (hovered.deps.includes(idea.id)) return 'dep'
      if (idea.deps.includes(hovered.id)) return 'unlocks'
      return 'dim'
    },
    [hovered],
  )

  // --- Filtres helpers ---
  const patchFilters = useCallback((patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })), [])
  const resetFilters = useCallback(
    () => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort })),
    [],
  )

  // --- Edition ---
  const openNew = useCallback(() => setEditing({ idea: emptyIdea(nextId(ideas)), isNew: true }), [ideas])
  const openEdit = useCallback((idea: Idea) => setEditing({ idea, isNew: false }), [])

  // --- Export / Import / Reset ---
  const doExport = useCallback(() => {
    const blob = new Blob([exportJson(ideas, history)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `mango-command-center-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('Export telecharge')
  }, [ideas, history, flash])

  const doImport = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const res = importJson(String(reader.result))
        if (!res.ok || !res.ideas) {
          flash(res.error ?? 'Import echoue')
          return
        }
        setIdeas(res.ideas)
        if (res.history) setHistory(res.history)
        flash(`Import : ${res.ideas.length} cartes`)
      }
      reader.onerror = () => flash('Lecture du fichier impossible')
      reader.readAsText(file)
    },
    [flash],
  )

  const doResetSeed = useCallback(() => {
    if (!window.confirm('Revenir au seed d\'origine ? Tes modifications locales seront perdues.')) return
    setIdeas(resetToSeed())
    setHistory([])
    setFilters(DEFAULT_FILTERS)
    flash('Seed restaure')
  }, [flash])

  // --- Raccourcis clavier ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (editing) return
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if ((e.key === 'n' || e.key === 'N') && !typing) {
        e.preventDefault()
        openNew()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, openNew])

  const titleOf = useCallback(
    (id: number) => ideas.find((i) => i.id === id)?.title ?? `#${id} (supprimee)`,
    [ideas],
  )

  return (
    <div className="app">
      <div className="bg-orb orb-1" aria-hidden />
      <div className="bg-orb orb-2" aria-hidden />
      <div className="bg-orb orb-3" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            🥭
          </span>
          <div className="brand-text">
            <h1>Mango Command Center</h1>
            <p>Le poste de pilotage des idees et chantiers de MangoOS</p>
          </div>
        </div>
      </header>

      <Stats ideas={ideas} />

      <Toolbar
        filters={filters}
        allTags={allTags}
        searchRef={searchRef}
        onChange={patchFilters}
        onReset={resetFilters}
        onNew={openNew}
        onExport={doExport}
        onImportFile={doImport}
        onResetSeed={doResetSeed}
      />

      <main className="layout">
        <div className="layout-board">
          {visible.length === 0 ? (
            <div className="no-results glass">
              Aucune carte ne correspond a ces filtres.
              <button className="btn-ghost" onClick={resetFilters}>
                ↺ Reinitialiser
              </button>
            </div>
          ) : (
            <Board
              ideas={visible}
              hoveredId={hoveredId}
              highlightFor={highlightFor}
              onEdit={openEdit}
              onMove={moveBy}
              onDelete={remove}
              onHover={setHoveredId}
              onTagClick={(tag) => patchFilters({ tag })}
              onDepClick={(id) => patchFilters({ search: `#${id} `, tag: 'all', model: 'all', effort: 'all' })}
              onDropCard={moveTo}
            />
          )}
        </div>

        <aside className="layout-side">
          <ReadyPanel all={ideas} ready={ready} onOpen={openEdit} onHover={setHoveredId} />
          <HistoryPanel history={history} titleOf={titleOf} />
        </aside>
      </main>

      {editing && (
        <EditModal
          idea={editing.idea}
          isNew={editing.isNew}
          onSave={(idea) => {
            upsert(idea, editing.isNew)
            setEditing(null)
            flash(editing.isNew ? `#${idea.id} creee` : `#${idea.id} enregistree`)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
