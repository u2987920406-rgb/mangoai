import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Dropdown de template de projet — extrait verbatim de Home.jsx.
const TEMPLATES = [
  { id: "vite",     label: "React + Vite"          },
  { id: "shadcn",   label: "shadcn/ui"              },
  { id: "phaser",   label: "Jeu 2D (Phaser)"        },
  { id: "threejs",  label: "3D (Three.js)"           },
  { id: "supabase", label: "Full-stack (Supabase)"  },
];

export default function TemplateDropdown({ template, onTemplate }) {
  const [open, setOpen] = useState(false);
  const cur = template ? TEMPLATES.find((t) => t.id === template) : null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-edge/60 bg-panel/60
                   px-2.5 py-1 text-[11px] text-dim hover:border-edge hover:text-ink transition-colors"
      >
        {cur ? cur.label : "Template"} <ChevronDown size={9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 w-48 overflow-hidden
                          rounded-xl border border-edge bg-panel shadow-2xl">
            <button
              onClick={() => { onTemplate(null); setOpen(false); }}
              className="flex w-full px-3 py-2 text-[12px] text-faint hover:bg-edge-soft transition-colors"
            >
              Automatique (défaut)
            </button>
            <div className="border-t border-edge" />
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => { onTemplate(t.id); setOpen(false); }}
                className={`flex w-full px-3 py-2 text-[12px] hover:bg-edge-soft transition-colors
                            ${t.id === template ? "text-accent" : "text-dim"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
