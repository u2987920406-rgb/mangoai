import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Sparkles, Loader2, Check, Bot } from 'lucide-react'
import AgentCard from './super-agent-builder/AgentCard.jsx'

export default function SuperAgentBuilder({ onBack, projectName }) {
  const [domain, setDomain] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(null) // 'search' | 'generate'
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [agents, setAgents] = useState([])
  const [toast, setToast] = useState(null)
  const [expandedPrompt, setExpandedPrompt] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [exportingId, setExportingId] = useState(null)
  // Idée #40 Phase 3 — id de l'agent métier matché au projet courant (badge "Actif").
  const [matchedAgentId, setMatchedAgentId] = useState(null)

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const copyToClipboard = useCallback(async (text, label = 'Copié') => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Erreur copie')
    }
  }, [showToast])

  const fetchAgents = useCallback(async () => {
    try {
      const r = await fetch('/api/super-agent/list')
      const data = await r.json()
      setAgents(data.agents ?? [])
    } catch {
      // silencieux
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // Au montage (si un projet est ouvert) : quel expert métier correspond à ce
  // projet ? Le badge "Actif sur <projet>" est posé sur sa carte.
  useEffect(() => {
    if (!projectName?.trim()) {
      setMatchedAgentId(null)
      return
    }
    let cancelled = false
    fetch(`/api/super-agent/match?project=${encodeURIComponent(projectName)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMatchedAgentId(data.match?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setMatchedAgentId(null)
      })
    return () => {
      cancelled = true
    }
  }, [projectName])

  const handleBuild = async () => {
    if (!domain.trim()) return
    setLoading(true)
    setLoadingStep('search')
    setError(null)
    setResult(null)

    // Séquençage temporel : afficher « Recherche… » ~3 s puis basculer sur « Génération… »
    // Le backend fait les 2 appels en un seul POST — on ne peut pas suivre la vraie progression.
    const stepTimer = setTimeout(() => setLoadingStep('generate'), 3500)

    try {
      const r = await fetch('/api/super-agent/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), description: description.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Erreur serveur')
      setResult(data.agent)
      await fetchAgents()
    } catch (e) {
      setError(e.message)
    } finally {
      clearTimeout(stepTimer)
      setLoading(false)
      setLoadingStep(null)
    }
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await fetch(`/api/super-agent/${id}`, { method: 'DELETE' })
      await fetchAgents()
      if (result?.id === id) setResult(null)
      showToast('Agent supprimé')
    } catch {
      showToast('Erreur suppression')
    } finally {
      setDeletingId(null)
    }
  }

  const handleExport = async (id) => {
    setExportingId(id)
    try {
      const r = await fetch(`/api/super-agent/${id}/export`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'Erreur export')
      showToast(`Skill exporté → .skills/${data.slug}/`)
    } catch (e) {
      showToast(`Erreur export : ${e.message}`)
    } finally {
      setExportingId(null)
    }
  }

  const handleEdited = useCallback(async (updatedAgent) => {
    await fetchAgents()
    // Si l'agent édité est aussi le résultat affiché en haut, on le met à jour.
    if (result?.id === updatedAgent.id) setResult(updatedAgent)
    showToast('Agent mis à jour')
  }, [fetchAgents, result, showToast])

  return (
    <div className="h-full overflow-y-auto bg-bg text-ink font-mono">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-accent-soft text-bg px-4 py-2 rounded-lg shadow-lg text-sm animate-fade-in flex items-center gap-2">
          <Check size={14} />
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-panel border-b border-edge px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-dim hover:text-ink transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Retour
        </button>
        <div className="w-px h-4 bg-edge" />
        <Bot size={18} className="text-accent-soft" />
        <h1 className="text-sm font-semibold text-ink">Super-agent spécialisé</h1>
        <span className="ml-auto text-xs text-faint">#40</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">

        {/* ── Section Créer ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-accent-soft" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Créer un agent</h2>
          </div>

          <div className="bg-panel border border-edge rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-xs text-dim mb-1.5">Domaine / expertise</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleBuild()}
                placeholder="ex: avocat spécialisé en droit du travail"
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-dim mb-1.5">Description optionnelle</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexte, contraintes, style souhaité…"
                rows={3}
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2.5 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft transition-colors resize-none"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              onClick={handleBuild}
              disabled={loading || !domain.trim()}
              className="w-full flex items-center justify-center gap-2 bg-accent-soft text-bg font-semibold text-sm py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {loadingStep === 'search' ? 'Recherche du domaine…' : 'Génération de l\'agent…'}
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Générer l'agent
                </>
              )}
            </button>
          </div>
        </section>

        {/* ── Résultat ──────────────────────────────────────────────────────── */}
        {result && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bot size={16} className="text-accent-soft" />
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Agent généré</h2>
            </div>
            <AgentCard agent={result} onCopy={copyToClipboard} expandedPrompt={expandedPrompt} setExpandedPrompt={setExpandedPrompt} onDelete={handleDelete} deletingId={deletingId} onExport={handleExport} exportingId={exportingId} onEdited={handleEdited} highlight />
          </section>
        )}

        {/* ── Mes agents ────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bot size={16} className="text-dim" />
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Mes agents</h2>
            <span className="ml-auto text-xs text-faint">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
          </div>

          {agents.length === 0 ? (
            <div className="bg-panel border border-edge rounded-xl p-8 text-center text-faint text-sm">
              Aucun agent sauvegardé. Générez votre premier agent ci-dessus.
            </div>
          ) : (
            <div className="space-y-4">
              {[...agents].reverse().map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onCopy={copyToClipboard}
                  expandedPrompt={expandedPrompt}
                  setExpandedPrompt={setExpandedPrompt}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  onExport={handleExport}
                  exportingId={exportingId}
                  onEdited={handleEdited}
                  isMatched={agent.id === matchedAgentId}
                  projectName={projectName}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
