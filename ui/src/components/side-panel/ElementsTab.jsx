export default function ElementsTab({ inspectActive, inspectError, recentElements, hoveredInfo, toggleInspect }) {
  return (
    <>
      <button
        onClick={toggleInspect}
        className={`w-full text-xs py-2 rounded-lg border font-medium transition-colors ${
          inspectActive
            ? 'border-orange-500 text-orange-400 bg-orange-500/10'
            : 'border-edge text-dim hover:text-ink'
        }`}
      >
        {inspectActive ? '🔍 Inspection active' : 'Activer l\'inspection'}
      </button>

      {inspectError && (
        <p className="text-xs text-err bg-err/10 border border-err/30 rounded-lg px-3 py-2 leading-relaxed">
          {inspectError}
        </p>
      )}

      {inspectActive && hoveredInfo && !inspectError && (
        <div className="text-xs bg-bg border border-edge rounded-lg px-3 py-2 font-mono text-accent">
          {hoveredInfo}
        </div>
      )}

      {recentElements.length > 0 && (
        <div>
          <label className="text-xs text-dim block mb-2">Éléments récents</label>
          <ul className="space-y-1">
            {recentElements.map((el, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-xs bg-accent/10 text-accent-soft font-mono px-2 py-0.5 rounded">
                  {el}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!inspectActive && recentElements.length === 0 && !inspectError && (
        <p className="text-xs text-faint text-center py-2">
          Activez l'inspection puis survolez l'aperçu
        </p>
      )}
    </>
  )
}
