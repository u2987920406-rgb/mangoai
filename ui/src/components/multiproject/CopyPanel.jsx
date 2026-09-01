import { useState } from "react";
import { Copy } from "lucide-react";

// Panneau de copie de fichier vers un autre projet, avec gestion du conflit 409
// (écrasement) — extrait verbatim de MultiProject.jsx.
export default function CopyPanel({ projects, sourceProject, sourceFile, onClose }) {
  const [targetProject, setTargetProject] = useState("");
  const [targetFile, setTargetFile] = useState(() => {
    const parts = sourceFile.split("/");
    return parts[parts.length - 1] ?? sourceFile;
  });
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const availableTargets = projects.filter((p) => p.name !== sourceProject);

  async function doCopy(overwrite = false) {
    setCopying(true);
    setError("");
    setConfirmOverwrite(false);
    try {
      const resp = await fetch("/api/multi-project/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceProject,
          sourceFile,
          targetProject,
          targetFile: `src/components/${targetFile.trim()}`,
          overwrite,
        }),
      });
      const data = await resp.json();
      if (resp.status === 409 && data.exists) {
        // Fichier cible déjà présent — demander confirmation
        setConfirmOverwrite(true);
        return;
      }
      if (!resp.ok) throw new Error(data.error ?? "Erreur inconnue");
      onClose(true, `Copié dans ${targetProject}/src/components/${targetFile.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopying(false);
    }
  }

  async function handleCopy() {
    if (!targetProject || !targetFile.trim()) {
      setError("Sélectionne un projet cible et un nom de fichier.");
      return;
    }
    await doCopy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-edge bg-bg p-4 space-y-3">
      <p className="text-xs text-dim font-medium uppercase tracking-wide">Copier vers...</p>

      <div className="space-y-2">
        <label className="block text-xs text-dim">Projet cible</label>
        <select
          value={targetProject}
          onChange={(e) => { setTargetProject(e.target.value); setConfirmOverwrite(false); }}
          className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-soft"
        >
          <option value="">-- Choisir un projet --</option>
          {availableTargets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-dim">Nom du fichier (dans src/components/)</label>
        <input
          type="text"
          value={targetFile}
          onChange={(e) => { setTargetFile(e.target.value); setConfirmOverwrite(false); }}
          placeholder="MonComposant.jsx"
          className="w-full rounded-lg border border-edge bg-panel px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:border-accent-soft"
        />
      </div>

      {/* Bandeau de confirmation écrasement (409) */}
      {confirmOverwrite && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 space-y-2">
          <p className="text-xs text-yellow-300 font-medium">
            Le fichier <code className="font-mono">{targetFile.trim()}</code> existe déjà dans {targetProject}/src/components/. Écraser ?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => doCopy(true)}
              disabled={copying}
              className="rounded-md bg-yellow-500/20 border border-yellow-500/40 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
            >
              {copying ? "Copie…" : "Oui, écraser"}
            </button>
            <button
              onClick={() => setConfirmOverwrite(false)}
              className="rounded-md border border-edge px-3 py-1 text-xs text-dim hover:text-ink transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {!confirmOverwrite && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={copying}
            className="flex items-center gap-2 rounded-lg bg-accent-soft px-4 py-2 text-sm font-medium text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "#ff9500", color: "#ffffff" }}
          >
            {copying ? (
              <span className="animate-spin inline-block w-3 h-3 border border-current border-t-transparent rounded-full" />
            ) : (
              <Copy size={13} />
            )}
            {copying ? "Copie…" : "Copier"}
          </button>
          <button
            onClick={() => onClose(false)}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-dim hover:text-ink transition-colors"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
