// Fourche visuelle multi-wireframes (2026-07-13) — grille de 3 structures RENDUES
// en vraies images, adaptée du patron de carte cliquable de TasteGallery.jsx. Un
// clic = choix immédiat (pas d'étape de confirmation séparée, contrairement à la
// galerie de goût — ici il n'y a pas de note libre à saisir).
import { Layout } from "lucide-react";

export default function WireframeForkPicker({ variants, onChoose }) {
  if (!variants?.length) return null;
  return (
    <div className="animate-fade-up w-full max-w-[95%] self-start rounded-2xl border border-accent/25 bg-accent/[0.04] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-wide text-accent-soft">
        <Layout size={12} />
        CHOISIS UNE STRUCTURE
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
          </button>
        ))}
      </div>
    </div>
  );
}
