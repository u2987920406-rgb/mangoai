import { FONT_FAMILIES } from './constants.js'

export default function TypoTab({ fontSize, setFontSize, fontFamily, setFontFamily, resetTypo }) {
  return (
    <>
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs text-dim">Taille de police</label>
          <span className="text-xs text-accent font-mono">{fontSize}px</span>
        </div>
        <input
          type="range"
          min={12}
          max={24}
          step={1}
          value={fontSize}
          onChange={e => setFontSize(Number(e.target.value))}
          className="w-full accent-[var(--color-accent,#6c47ff)]"
        />
      </div>

      <div>
        <label className="text-xs text-dim block mb-1">Famille</label>
        <select
          value={fontFamily}
          onChange={e => setFontFamily(e.target.value)}
          className="w-full text-xs bg-bg border border-edge rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:border-accent"
        >
          {FONT_FAMILIES.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={resetTypo}
        className="w-full text-xs py-1.5 rounded-lg border border-edge text-dim hover:text-ink hover:border-edge-soft transition-colors"
      >
        Réinitialiser
      </button>
    </>
  )
}
