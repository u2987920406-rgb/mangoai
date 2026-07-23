// #196 (2026-07-23) — Gate design fusionné (Ideation + fourche multi-wireframes).
// Remplace l'ancien gate mono-résultat (Ideation.jsx, wireframe ASCII + palette
// texte, jamais de choix) par la fourche visuelle existante (déjà interactive,
// déjà de vraies images) étendue pour porter la palette — 3 VRAIES directions à
// choisir, structure ET couleur, avant tout code. Tous modes (pas juste Élite),
// posé par Chat.jsx à la place de l'ancien <Ideation initialDescription=.../>.
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import WireframeForkPicker from "./WireframeForkPicker.jsx";

export default function DesignGate({ description, projectName, onCancel, onValidated }) {
  const [variants, setVariants] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/wireframe-fork/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intention: description }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erreur ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        if (!d.variants?.length) { setError("Aucune direction générée."); return; }
        setVariants(d.variants);
      })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Erreur inconnue"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(variant) {
    setSaving(true);
    const spec = { angle: variant.angle, rationale: variant.rationale, regions: variant.regions, palette: variant.palette, components: variant.components };
    try {
      await fetch(`/api/wireframe-fork/${encodeURIComponent(projectName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });
      // Marque aussi le gate Ideation comme fait (deux marqueurs, un seul geste
      // utilisateur) — même patron de payload que ideation.ts::IdeationResult.
      await fetch(`/api/ideation/save/${encodeURIComponent(projectName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wireframe: variant.regions?.map((r) => `${r.label} (${r.x}%,${r.y}%,${r.w}x${r.h})`).join("\n") ?? "",
          palette: variant.palette ?? [],
          components: variant.components ?? [],
          pages: [],
          summary: `${variant.angle} — ${variant.rationale}`,
          techStack: [],
        }),
      });
    } catch {
      /* best-effort — les marqueurs sont secondaires, ne bloque pas la suite */
    } finally {
      setSaving(false);
    }
    onValidated(description);
  }

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <div className="border-b border-edge bg-panel px-6 py-4 flex items-center gap-4">
        <button onClick={onCancel} className="text-dim hover:text-accent transition-colors text-sm">
          Retour
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-ink">Direction du design</h1>
          <p className="text-xs text-dim mt-0.5">Choisis une direction avant que MangoOS ne code — structure et couleur</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
        <div className="bg-panel border border-edge rounded-xl p-4 mb-6">
          <p className="text-sm text-dim">{description}</p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 justify-center py-16 text-sm text-dim">
            <Loader2 size={16} className="animate-spin" />
            MangoOS conçoit 3 directions…
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-err">{error}</p>
            <button
              onClick={() => onValidated(description)}
              className="flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm text-dim hover:text-ink transition-colors"
            >
              <Sparkles size={14} />
              Continuer sans direction visuelle
            </button>
          </div>
        )}

        {variants && (
          <div className="flex flex-col items-center gap-4">
            <WireframeForkPicker variants={variants} onChoose={choose} />
            {saving && <p className="text-xs text-dim flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Enregistrement…</p>}
          </div>
        )}
      </div>
    </div>
  );
}
