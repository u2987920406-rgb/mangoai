// Fourche visuelle multi-wireframes (2026-07-13) — grille de 3 structures RENDUES
// en vraies images, adaptée du patron de carte cliquable de TasteGallery.jsx. Un
// clic = choix immédiat (pas d'étape de confirmation séparée, contrairement à la
// galerie de goût — ici il n'y a pas de note libre à saisir).
//
// #196 (2026-07-23, fusion Ideation+fourche) — chaque variante peut porter une
// palette (5 hex) : affichée en swatches sous la carte, pour que le choix soit une
// VRAIE direction (structure ET couleur), pas juste un agencement de boîtes.
import { Layout } from "lucide-react";

function Swatches({ palette }) {
  if (!palette?.length) return null;
  return (
    <div className="flex gap-1 px-3 pb-2.5">
      {palette.map((hex, i) => (
        <span key={i} className="h-3.5 w-3.5 rounded-full border border-edge-soft" style={{ backgroundColor: hex }} title={hex} />
      ))}
    </div>
  );
}

export default function WireframeForkPicker({ variants, onChoose }) {
  if (!variants?.length) return null;
  return (
    <div className="animate-fade-up w-full max-w-[95%] self-start rounded-2xl border border-accent/25 bg-accent/[0.04] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide text-accent-soft">
        <Layout size={12} />
        CHOISIS UNE DIRECTION
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {variants.map((v) => (
          <button
            key={v.id}
            onClick={() => onChoose(v)}
            className="group flex flex-col overflow-hidden rounded-xl border border-edge bg-bg text-left transition-colors hover:border-accent/50 hover:bg-accent/[0.07]"
          >
            <div className="aspect-[8/5] w-full bg-white">
              <img
                src={`data:image/jpeg;base64,${v.imageBase64}`}
                alt={v.angle}
                className="h-full w-full object-cover object-top"
              />
            </div>
            <div className="flex flex-col gap-0.5 px-3 py-2">
              <span className="text-sm font-medium text-ink">{v.angle}</span>
              {v.rationale && <span className="text-xs leading-snug text-faint">{v.rationale}</span>}
            </div>
            <Swatches palette={v.palette} />
          </button>
        ))}
      </div>
    </div>
  );
}
