import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";

const APP_TYPES = [
  { value: "", label: "Vierge" },
  { value: "vitrine", label: "Vitrine" },
  { value: "saas", label: "SaaS" },
  { value: "dashboard", label: "Dashboard" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "mobile", label: "Application mobile" },
];

function DotsLoader() {
  return (
    <span className="inline-flex gap-0.5 items-end h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1 h-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function Swatch({ hex }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-12 h-12 rounded-full border border-edge-soft shadow-md"
        style={{ backgroundColor: hex }}
        title={hex}
      />
      <span className="text-xs text-dim font-mono">{hex}</span>
    </div>
  );
}

// #196 — `initialDescription`/`onValidated` : usage additif pour le gate
// obligatoire (Chat.jsx, avant le 1er tour Construire d'un projet neuf). La
// fenêtre autonome (HamburgerMenu → onBack/onStartCoding) reste inchangée.
export default function Ideation({ onBack, onStartCoding, initialDescription = "", onValidated }) {
  const [description, setDescription] = useState(initialDescription);
  const [appType, setAppType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ideation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), type: appType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erreur ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message ?? "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  // Gate obligatoire : la description arrive déjà tapée (le message Construire
  // de l'utilisateur) → on génère tout de suite, pas la peine de re-cliquer.
  useEffect(() => {
    if (initialDescription.trim()) handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStartCoding() {
    if (onValidated) {
      onValidated(result);
    } else if (onStartCoding) {
      onStartCoding(description);
    } else {
      navigator.clipboard.writeText(description).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="h-full bg-bg text-ink flex flex-col">
      {/* Header */}
      <div className="border-b border-edge bg-panel px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-dim hover:text-accent transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Retour
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-ink">Mode Idéation</h1>
          <p className="text-xs text-dim mt-0.5">
            Conçois avant de coder — MangoOS génère ton dossier de design
          </p>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-8 max-w-4xl mx-auto w-full">
        {/* Form */}
        <div className="bg-panel border border-edge rounded-xl p-6 mb-8">
          <label className="block text-sm font-medium text-accent-soft mb-2">
            Décris ton application
          </label>
          <textarea
            className="w-full bg-bg border border-edge-soft rounded-lg p-3 text-ink text-sm placeholder:text-faint resize-none focus:outline-none focus:border-accent transition-colors"
            rows={5}
            placeholder="Une app de gestion de projets pour freelances avec suivi du temps…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex flex-col sm:flex-row gap-4 mt-4 items-start sm:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-dim font-medium">Type d'application</label>
              <select
                className="bg-bg border border-edge-soft rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-accent transition-colors"
                value={appType}
                onChange={(e) => setAppType(e.target.value)}
              >
                {APP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="flex items-center gap-2 bg-accent text-bg font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              onClick={handleGenerate}
              disabled={loading || !description.trim()}
            >
              {loading ? (
                <>
                  MangoOS conçoit <DotsLoader />
                </>
              ) : (
                <>
                  Générer la conception
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-err bg-err/10 border border-err/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Results */}
        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* 1. Wireframe */}
              <div className="bg-panel border border-edge rounded-xl p-5">
                <h2 className="text-sm font-semibold text-accent mb-3">Maquette</h2>
                <pre className="font-mono text-xs text-accent-soft bg-bg border border-edge rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre">
                  {result.wireframe}
                </pre>
              </div>

              {/* 2. Palette */}
              <div className="bg-panel border border-edge rounded-xl p-5">
                <h2 className="text-sm font-semibold text-accent mb-3">Palette de couleurs</h2>
                <div className="flex flex-wrap gap-4 justify-center">
                  {Array.isArray(result.palette) &&
                    result.palette.map((hex, i) => <Swatch key={i} hex={hex} />)}
                </div>
              </div>

              {/* 3. Composants */}
              <div className="bg-panel border border-edge rounded-xl p-5">
                <h2 className="text-sm font-semibold text-accent mb-3">Composants UI</h2>
                <ul className="space-y-1.5">
                  {Array.isArray(result.components) &&
                    result.components.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-ink">
                        <Package size={13} className="text-accent-soft shrink-0" />
                        {c}
                      </li>
                    ))}
                </ul>
                {result.summary && (
                  <p className="mt-4 text-xs text-dim leading-relaxed border-t border-edge-soft pt-3">
                    {result.summary}
                  </p>
                )}
              </div>

              {/* 4. Pages & Stack */}
              <div className="bg-panel border border-edge rounded-xl p-5">
                <h2 className="text-sm font-semibold text-accent mb-3">Pages & Stack</h2>
                <div className="mb-3">
                  <p className="text-xs font-medium text-dim mb-1.5">Écrans</p>
                  <ul className="space-y-1">
                    {Array.isArray(result.pages) &&
                      result.pages.map((page, i) => (
                        <li key={i} className="text-sm text-ink flex items-center gap-2">
                          <span className="text-faint text-xs">{i === 0 ? "└─" : i === result.pages.length - 1 ? "└─" : "├─"}</span>
                          {page}
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-medium text-dim mb-1.5">Stack technique</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.isArray(result.techStack) &&
                      result.techStack.map((tech, i) => (
                        <span
                          key={i}
                          className="text-xs bg-accent/10 text-accent-soft border border-accent/20 rounded px-2 py-0.5"
                        >
                          {tech}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center">
              <button
                onClick={handleStartCoding}
                className="flex items-center gap-2 bg-accent text-bg font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm shadow-lg"
              >
                {copied ? "Description copiée ✓" : (
                  <>
                    {onValidated ? "Valider et construire" : "Passer au code"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
