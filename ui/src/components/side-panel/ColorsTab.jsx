import { PALETTES } from './constants.js'

export default function ColorsTab({ colorPrimary, setColorPrimary, colorBg, setColorBg, colorText, setColorText, applyPalette, resetColors }) {
  return (
    <>
      {[
        { label: 'Couleur principale', value: colorPrimary, onChange: setColorPrimary },
        { label: 'Arrière-plan', value: colorBg, onChange: setColorBg },
        { label: 'Texte', value: colorText, onChange: setColorText },
      ].map(({ label, value, onChange }) => (
        <div key={label} className="flex items-center justify-between">
          <label className="text-xs text-dim">{label}</label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-faint">{value}</span>
            <input
              type="color"
              value={value}
              onChange={e => onChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-edge bg-transparent"
            />
          </div>
        </div>
      ))}

      <div>
        <label className="text-xs text-dim block mb-2">Palettes</label>
        <div className="grid grid-cols-2 gap-1.5">
          {PALETTES.map(p => (
            <button
              key={p.label}
              onClick={() => applyPalette(p)}
              className="text-xs py-1.5 px-2 rounded-lg border border-edge hover:border-accent transition-colors text-dim hover:text-ink"
              style={{ borderLeftColor: p.primary, borderLeftWidth: 3 }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={resetColors}
        className="w-full text-xs py-1.5 rounded-lg border border-edge text-dim hover:text-ink hover:border-edge-soft transition-colors"
      >
        Réinitialiser
      </button>
    </>
  )
}
