import { useCallback, useEffect, useState } from "react";
import { Cpu, Loader2, Sparkles } from "lucide-react";
import { Modal } from "../design";

// #182 D3/É5 suite — popup rapide de l'Accueil : choisir n'importe quel cerveau
// pour piloter /api/home-chat, SANS naviguer dans Réglages › Atelier des cerveaux.
// Réutilise le registre existant (GET/PUT /api/brain-registry, #150) — le rôle
// `accueil` en est la SOURCE (voir brain-registry.ts + flags.ts:HOME_QUICK_MODEL).
//
// CRITIQUE (cf. plan) : PUT /api/brain-registry attend le registre COMPLET.
// N'envoyer JAMAIS un objet partiel {accueil: ...} — ça écraserait silencieusement
// les 13 autres rôles à leurs défauts (coerceConfig retombe sur le défaut pour
// toute clé absente). On charge donc TOUJOURS le registre courant avant de merger,
// exactement le patron de `save()` dans AtelierCerveaux.jsx.

const CLAUDE_TIERS = [
  { model: "sonnet", label: "Claude Sonnet 4.6" },
  { model: "opus", label: "Claude Opus 4.8" },
  { model: "haiku", label: "Claude Haiku 4.5" },
];

export default function QuickModelPicker({ open, onClose, onPicked }) {
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaOk, setOllamaOk] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [applying, setApplying] = useState(null); // clé du choix en cours d'application
  const [error, setError] = useState("");

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const r = await fetch("/api/ollama/models");
      const d = await r.json();
      setOllamaOk(!!d.ok);
      setOllamaModels(Array.isArray(d.models) ? d.models : []);
    } catch {
      setOllamaOk(false);
      setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError("");
      loadModels();
    }
  }, [open, loadModels]);

  async function pick(provider, model, label) {
    const key = `${provider}:${model}`;
    setApplying(key);
    setError("");
    try {
      // 1) Charge le registre COMPLET (jamais un PUT partiel).
      const r1 = await fetch("/api/brain-registry");
      if (!r1.ok) throw new Error("registre indisponible");
      const d1 = await r1.json();
      const merged = { ...d1.registry, accueil: { provider, model } };
      // 2) Sauvegarde le registre COMPLET avec juste `accueil` changé.
      const r2 = await fetch("/api/brain-registry", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!r2.ok) throw new Error("sauvegarde refusée");
      onPicked?.({ provider, model, label });
      onClose?.();
    } catch (e) {
      setError(e?.message ?? "échec de la sélection");
    } finally {
      setApplying(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Choisir un cerveau pour l'Accueil">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-dim">
          Ce choix ne pilote QUE cette conversation d'accueil (l'Atelier garde son propre sélecteur).
        </p>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Sparkles size={11} /> Claude
          </div>
          <div className="flex flex-col gap-1">
            {CLAUDE_TIERS.map((t) => {
              const key = `claude:${t.model}`;
              return (
                <button
                  key={key}
                  onClick={() => pick("claude", t.model, t.label)}
                  disabled={applying !== null}
                  className="flex items-center justify-between rounded-lg border border-edge bg-raised px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-accent/50 disabled:opacity-50"
                >
                  {t.label}
                  {applying === key ? <Loader2 size={14} className="animate-spin" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
            <Cpu size={11} /> Ollama (installés sur cette machine)
          </div>
          {loadingModels ? (
            <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-dim">
              <Loader2 size={13} className="animate-spin" /> Recherche des modèles…
            </div>
          ) : !ollamaOk ? (
            <p className="px-1 py-2 text-[12px] text-err">Ollama injoignable — vérifie qu'il tourne.</p>
          ) : ollamaModels.length === 0 ? (
            <p className="px-1 py-2 text-[12px] text-dim">Aucun modèle Ollama installé.</p>
          ) : (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {ollamaModels.map((m) => {
                const name = m.name ?? m;
                const key = `ollama:${name}`;
                return (
                  <button
                    key={key}
                    onClick={() => pick("ollama", name, name)}
                    disabled={applying !== null}
                    className="flex items-center justify-between rounded-lg border border-edge bg-raised px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-accent/50 disabled:opacity-50"
                  >
                    {name}
                    {applying === key ? <Loader2 size={14} className="animate-spin" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-err">{error}</p>}
      </div>
    </Modal>
  );
}
