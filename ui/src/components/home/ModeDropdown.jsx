import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Dropdown de mode (MVP / Élite / Finition / Esthétique) — extrait verbatim de Home.jsx.
const MODES = [
  { id: "mvp",        label: "⚡ MVP",        desc: "Rapide"    },
  { id: "elite",      label: "💎 Élite",       desc: "Premium"   },
  { id: "finition",   label: "✨ Finition",    desc: "Polissage" },
  { id: "esthetique", label: "🎨 Esthétique",  desc: "Design"    },
];

export default function ModeDropdown({ mode, onMode }) {
  const [open, setOpen] = useState(false);
  const cur = MODES.find((m) => m.id === mode) ?? MODES[1];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-edge/60 bg-panel/60
                   px-2.5 py-1 text-[11px] text-dim hover:border-edge hover:text-ink transition-colors"
      >
        {cur.label} <ChevronDown size={9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden
                          rounded-xl border border-edge bg-panel shadow-2xl">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { onMode(m.id); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-[12px]
                            hover:bg-edge-soft transition-colors
                            ${m.id === mode ? "text-accent" : "text-dim"}`}
              >
                <span>{m.label}</span>
                <span className="text-faint text-[10px]">{m.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
