// Coffres (#180 É5) — panneau de consentement du périmètre d'action élargi
// (D3/D4, docs/plan-180-interface-autonome.md). Un COFFRE = un dossier hors du
// workspace explicitement granté par Raf (picker natif Tauri si la coque
// desktop est présente, sinon un champ texte de secours en navigateur).
// Ne fait QUE parler aux routes /api/perimeter/* (perimeter-routes.ts), qui
// elles-mêmes ne font que lire/écrire via perimeter.ts (É1) — aucune logique
// de chemin ici.
import { useCallback, useEffect, useState } from 'react'
import { FolderPlus, FolderOpen, ShieldAlert, Trash2, Lock, Unlock } from 'lucide-react'
import { Button, Input, Badge, EmptyState, cx, TEXT } from '../design'

/** Vrai si l'app tourne dans la coque Tauri (picker natif disponible). Le
 *  desktop expose `window.__TAURI__.core.invoke` globalement (withGlobalTauri:
 *  true, cf. desktop/src-tauri/tauri.conf.json) — pas de dépendance npm ajoutée
 *  ici pour rester utilisable aussi en navigateur normal (fallback web). */
function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__ && window.__TAURI__.core)
}

function formatDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function GrantRow({ grant, onRevoke, busy }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-edge-soft p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={grant.mode === 'rw' ? 'warn' : 'accent'}>
            {grant.mode === 'rw' ? <Unlock size={11} /> : <Lock size={11} />}
            {grant.mode === 'rw' ? 'Lecture + écriture' : 'Lecture seule'}
          </Badge>
          <span className="truncate text-[12.5px] font-medium text-ink" title={grant.path}>{grant.path}</span>
        </div>
        <p className="mt-1 text-[11px] text-faint">Accordé le {formatDate(grant.ts)}</p>
      </div>
      <Button
        variant="danger"
        size="sm"
        icon={<Trash2 size={13} />}
        disabled={busy}
        onClick={() => onRevoke(grant.path)}
        className="shrink-0"
      >
        Révoquer
      </Button>
    </li>
  )
}

export default function Coffres() {
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pendingPath, setPendingPath] = useState('')
  const [mode, setMode] = useState('ro')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/perimeter/grants')
      .then((r) => r.json())
      .then((d) => setGrants(Array.isArray(d.grants) ? d.grants : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pickFolder = useCallback(async () => {
    if (!isTauri()) return // fallback web : l'input texte ci-dessous fait le travail
    try {
      const picked = await window.__TAURI__.core.invoke('pick_folder')
      if (typeof picked === 'string' && picked) setPendingPath(picked)
    } catch (e) {
      setError(e?.message ?? String(e))
    }
  }, [])

  const grant = useCallback(async () => {
    const p = pendingPath.trim()
    if (!p) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/perimeter/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p, mode }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `échec de l'octroi (${r.status})`)
      }
      const d = await r.json()
      setGrants(Array.isArray(d.grants) ? d.grants : [])
      setPendingPath('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [pendingPath, mode])

  const revoke = useCallback(async (p) => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/perimeter/grant?path=${encodeURIComponent(p)}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `échec de la révocation (${r.status})`)
      }
      const d = await r.json()
      setGrants(Array.isArray(d.grants) ? d.grants : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-edge px-6 py-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-ink">Coffres</h1>
          <p className="text-xs text-dim">Périmètre d'action élargi et contrôlé — accès hors-workspace, dossier par dossier, consenti par toi.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn/10 p-3">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
          <p className={cx(TEXT.base, 'text-ink')}>
            <strong>Ce dossier devient accessible à Mango.</strong> Un coffre en lecture+écriture peut être modifié
            par les outils de Mango à l'intérieur de ce dossier ; en lecture seule, il peut seulement être lu.
            Le workspace reste toujours accessible par défaut — un coffre n'ajoute qu'UN dossier précis, jamais le disque entier.
          </p>
        </div>

        <div className="rounded-lg border border-edge-soft p-3 space-y-3">
          <p className={cx(TEXT.base, 'font-medium text-ink')}>Ajouter un coffre</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isTauri() ? (
              <Button variant="secondary" size="md" icon={<FolderOpen size={14} />} onClick={pickFolder}>
                Choisir un dossier…
              </Button>
            ) : null}
            <Input
              value={pendingPath}
              onChange={(e) => setPendingPath(e.target.value)}
              placeholder={isTauri() ? 'ou colle un chemin ici' : 'Chemin du dossier (ex : C:\\Users\\...\\Documents)'}
              className="flex-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-dim">Mode :</span>
            <Button
              variant={mode === 'ro' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Lock size={12} />}
              onClick={() => setMode('ro')}
            >
              Lecture seule
            </Button>
            <Button
              variant={mode === 'rw' ? 'primary' : 'secondary'}
              size="sm"
              icon={<Unlock size={12} />}
              onClick={() => setMode('rw')}
            >
              Lecture + écriture
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<FolderPlus size={13} />}
              disabled={!pendingPath.trim() || busy}
              loading={busy}
              onClick={grant}
              className="ml-auto"
            >
              Accorder
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-err/40 bg-err/10 p-3 text-sm text-err">{error}</div>
        )}

        {!error && !loading && grants.length === 0 && (
          <EmptyState
            icon={<FolderOpen size={28} />}
            title="Aucun coffre accordé"
            description="Le périmètre de Mango se limite au workspace. Ajoute un coffre ci-dessus pour lui donner accès à un dossier précis."
          />
        )}

        {grants.length > 0 && (
          <ul className="space-y-2">
            {grants.map((g) => (
              <GrantRow key={g.path} grant={g} onRevoke={revoke} busy={busy} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
