import { useState } from 'react'
import { Sparkles, Loader2, Copy, Check, Trash2, Tag, Wrench, MessageSquare, ChevronDown, ChevronUp, FileDown, Pencil } from 'lucide-react'

export default function AgentCard({ agent, onCopy, expandedPrompt, setExpandedPrompt, onDelete, deletingId, onExport, exportingId, onEdited, highlight = false, isMatched = false, projectName }) {
  const [copiedExample, setCopiedExample] = useState(null)
  const isExpanded = expandedPrompt === agent.id

  // ── Mode édition inline ──────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(agent.name)
  const [editDomain, setEditDomain] = useState(agent.domain)
  const [editSystemPrompt, setEditSystemPrompt] = useState(agent.systemPrompt)
  const [editTags, setEditTags] = useState((agent.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  const handleEditOpen = () => {
    setEditName(agent.name)
    setEditDomain(agent.domain)
    setEditSystemPrompt(agent.systemPrompt)
    setEditTags((agent.tags ?? []).join(', '))
    setIsEditing(true)
  }

  const handleEditCancel = () => {
    setIsEditing(false)
  }

  const handleEditSave = async () => {
    setSaving(true)
    try {
      const tagsArray = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const r = await fetch(`/api/super-agent/${agent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          domain: editDomain,
          systemPrompt: editSystemPrompt,
          tags: tagsArray,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Erreur serveur')
      setIsEditing(false)
      if (onEdited) onEdited(data.agent)
    } catch (e) {
      // Affiche l'erreur dans la console — l'utilisateur voit le bouton se dé-spinner
      console.error('Erreur édition agent :', e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyExample = async (text, idx) => {
    await onCopy(text, 'Prompt copié !')
    setCopiedExample(idx)
    setTimeout(() => setCopiedExample(null), 1800)
  }

  // ── Rendu mode édition ───────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className={`bg-panel border rounded-xl overflow-hidden transition-all ${highlight || isMatched ? 'border-accent-soft shadow-lg shadow-accent-soft/10' : 'border-edge'}`}>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Pencil size={14} className="text-accent-soft" />
            <span className="text-xs font-semibold text-accent-soft uppercase tracking-wider">Édition de l'agent</span>
          </div>

          <div>
            <label className="block text-xs text-dim mb-1.5">Nom</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-dim mb-1.5">Domaine / expertise</label>
            <input
              type="text"
              value={editDomain}
              onChange={(e) => setEditDomain(e.target.value)}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-dim mb-1.5">System Prompt</label>
            <textarea
              value={editSystemPrompt}
              onChange={(e) => setEditSystemPrompt(e.target.value)}
              rows={8}
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-dim mb-1.5">Tags <span className="text-faint">(séparés par des virgules)</span></label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="ex: droit, contrat, entreprise"
              className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleEditSave}
              disabled={saving || !editName.trim() || !editDomain.trim() || !editSystemPrompt.trim()}
              className="flex items-center gap-2 bg-accent-soft text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              onClick={handleEditCancel}
              disabled={saving}
              className="flex items-center gap-2 bg-bg border border-edge text-dim text-sm px-4 py-2 rounded-lg hover:text-ink hover:border-ink transition-colors disabled:opacity-40"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-panel border rounded-xl overflow-hidden transition-all ${highlight || isMatched ? 'border-accent-soft shadow-lg shadow-accent-soft/10' : 'border-edge'}`}>
      {/* En-tête de la card */}
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-ink">{agent.name}</h3>
            {highlight && <span className="text-xs bg-accent-soft/20 text-accent-soft px-2 py-0.5 rounded-full">Nouveau</span>}
            {isMatched && (
              <span className="inline-flex items-center gap-1 text-xs bg-accent-soft/20 text-accent-soft px-2 py-0.5 rounded-full font-medium">
                <Sparkles size={9} />
                Actif sur {projectName}
              </span>
            )}
          </div>
          <p className="text-xs text-faint mt-0.5">{agent.domain}</p>
          {agent.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {agent.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs bg-bg border border-edge text-dim px-2 py-0.5 rounded-full">
                  <Tag size={9} />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={handleEditOpen}
            className="p-1.5 text-faint hover:text-accent-soft transition-colors"
            title="Éditer"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onExport(agent.id)}
            disabled={exportingId === agent.id}
            className="p-1.5 text-faint hover:text-accent-soft transition-colors disabled:opacity-40"
            title="Exporter en skill"
          >
            {exportingId === agent.id
              ? <Loader2 size={14} className="animate-spin" />
              : <FileDown size={14} />
            }
          </button>
          <button
            onClick={() => onDelete(agent.id)}
            disabled={deletingId === agent.id}
            className="p-1.5 text-faint hover:text-red-400 transition-colors disabled:opacity-40"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* System Prompt */}
      <div className="px-5 pb-4">
        <div className="bg-bg border border-edge rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-panel/50 transition-colors"
            onClick={() => setExpandedPrompt(isExpanded ? null : agent.id)}
          >
            <span className="text-xs font-medium text-dim flex items-center gap-1.5">
              <MessageSquare size={11} />
              System Prompt
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onCopy(agent.systemPrompt, 'System prompt copié !') }}
                className="p-1 text-faint hover:text-accent-soft transition-colors"
                title="Copier le system prompt"
              >
                <Copy size={12} />
              </button>
              {isExpanded ? <ChevronUp size={13} className="text-faint" /> : <ChevronDown size={13} className="text-faint" />}
            </div>
          </div>

          {isExpanded && (
            <div className="px-3 pb-3 border-t border-edge">
              <p className="text-xs text-dim leading-relaxed mt-2 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {agent.systemPrompt}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Outils */}
      {agent.tools?.length > 0 && (
        <div className="px-5 pb-4">
          <p className="text-xs font-medium text-dim flex items-center gap-1.5 mb-2">
            <Wrench size={11} />
            Outils recommandés
          </p>
          <div className="flex flex-wrap gap-2">
            {agent.tools.map((tool) => (
              <div
                key={tool.name}
                title={tool.desc}
                className="inline-flex items-center gap-1 text-xs bg-bg border border-edge text-ink px-2.5 py-1 rounded-lg cursor-help"
              >
                <Wrench size={10} className="text-accent-soft" />
                {tool.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exemples de prompts */}
      {agent.examples?.length > 0 && (
        <div className="px-5 pb-5">
          <p className="text-xs font-medium text-dim flex items-center gap-1.5 mb-2">
            <Copy size={11} />
            Prompts types — cliquez pour copier
          </p>
          <div className="space-y-2">
            {agent.examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => handleCopyExample(ex, i)}
                className="w-full text-left flex items-start gap-2.5 bg-bg border border-edge hover:border-accent-soft rounded-lg px-3 py-2.5 transition-all group"
              >
                <span className="flex-shrink-0 mt-0.5">
                  {copiedExample === i
                    ? <Check size={13} className="text-accent-soft" />
                    : <Copy size={13} className="text-faint group-hover:text-accent-soft transition-colors" />
                  }
                </span>
                <span className="text-xs text-dim group-hover:text-ink transition-colors leading-relaxed">
                  {ex}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
