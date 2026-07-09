import { ArrowLeft, Wrench, Plus } from "lucide-react";

export default function Header({ onBack, onAdd }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-dim transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Accueil
      </button>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Wrench size={16} className="text-accent-soft" /> Atelier des cerveaux · un modèle par agent
      </span>
      {onAdd && (
        <button onClick={onAdd} className="ml-auto flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/25">
          <Plus size={15} /> Ajouter un modèle
        </button>
      )}
    </div>
  );
}
