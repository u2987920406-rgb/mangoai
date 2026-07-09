import { ChevronRight, FolderOpen, Loader2 } from "lucide-react";

// Graduation : passer cette discussion (+ fichiers + contexte) dans l'atelier. Toujours
// dispo via le bouton ; le panneau s'ouvre aussi quand Mango propose (suggestGraduate).
export default function GraduatePanel({ graduateOpen, setGraduateOpen, graduateName, setGraduateName, graduate, gradBusy }) {
  if (!graduateOpen) {
    return (
      <div className="mb-2 flex justify-end">
        <button onClick={() => setGraduateOpen(true)} title="Passer cette discussion dans l'atelier (construire/planifier)"
          className="flex items-center gap-1.5 rounded-lg border border-edge/60 bg-panel/50 px-2.5 py-1 text-xs text-dim hover:text-accent-soft hover:border-accent/40 transition-colors">
          <FolderOpen size={13} /> Ouvrir dans l'atelier
        </button>
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-xl border border-accent/30 bg-accent/[0.07] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-accent-soft">
        <FolderOpen size={15} className="shrink-0" />
        <span className="font-medium">On passe à l'atelier ?</span>
        <span className="text-xs text-dim">J'emporte nos fichiers et le contexte de la discussion.</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={graduateName}
          onChange={(e) => setGraduateName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") graduate(); }}
          placeholder="nom du projet"
          className="flex-1 rounded-lg border border-edge/70 bg-panel/60 px-3 py-1.5 text-sm text-ink placeholder:text-faint/50 focus:outline-none focus:border-accent/50"
          autoFocus
        />
        <button onClick={graduate} disabled={gradBusy} title="Créer le projet et ouvrir l'atelier"
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-60">
          {gradBusy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
          {gradBusy ? "Création…" : "Ouvrir l'atelier"}
        </button>
        <button onClick={() => setGraduateOpen(false)} className="rounded-lg px-2 py-1.5 text-xs text-dim hover:text-ink transition-colors">
          Plus tard
        </button>
      </div>
    </div>
  );
}
