// #174 — Menu d'autocomplétion des skills « /slug » du composer — extrait de Chat.jsx (Phase C).
// Présentationnel pur : la logique (suggestions, clavier) reste dans le composer.
export default function SkillAutocomplete({ suggestions, activeIndex, onHover, onPick }) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl shadow-black/30">
      <div className="border-b border-edge px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
        Skills — ↑↓ choisir · Tab/Entrée insérer · Échap fermer
      </div>
      <ul className="nice-scroll max-h-56 overflow-y-auto p-1">
        {suggestions.map((s, i) => (
          <li key={s.slug}>
            <button
              type="button"
              onMouseEnter={() => onHover(i)}
              onClick={() => onPick(s)}
              className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                i === activeIndex ? "bg-accent/15" : "hover:bg-edge-soft"
              }`}
            >
              <span className="flex items-center gap-1.5 font-mono text-xs text-accent">
                /{s.slug}
                {s.disableModelInvocation && (
                  <span
                    className="rounded bg-edge-soft px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-faint"
                    title="Invocation manuelle uniquement (l'agent ne la déclenche pas seul)"
                  >
                    manuel
                  </span>
                )}
              </span>
              {s.description && <span className="w-full truncate text-[11px] text-faint">{s.description}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
