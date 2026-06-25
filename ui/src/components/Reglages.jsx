import { lazy, Suspense, useState } from "react";
import {
  ArrowLeft, Activity, BarChart2, BarChart3, Brain, Clock, CreditCard,
  Hash, Moon, Rss, Satellite, Scissors, Settings, Wrench,
} from "lucide-react";
import { NEUTRAL } from "../neutral.js";

// Composants système existants — réutilisés tels quels (code-split)
const Brains           = lazy(() => import("./Brains.jsx"));
const AtelierCerveaux  = lazy(() => import("./AtelierCerveaux.jsx"));
const Billing          = lazy(() => import("./Billing.jsx"));
const CronManager      = lazy(() => import("./CronManager.jsx"));
const NocturnalReview  = lazy(() => import("./NocturnalReview.jsx"));
const Metrics          = lazy(() => import("./Metrics.jsx"));
const Traces           = lazy(() => import("./Traces.jsx"));
const MetricsDashboard = lazy(() => import("./MetricsDashboard.jsx"));
const AutoAblation     = lazy(() => import("./AutoAblation.jsx"));
const Radar            = lazy(() => import("./Radar.jsx"));
const Veille           = lazy(() => import("./Veille.jsx"));
const Tokenizer        = lazy(() => import("./Tokenizer.jsx"));

// Catégories de la sous-navigation (groupées). NEUTRAL masque les diagnostics Kernel.
function buildGroups() {
  return [
    {
      title: "Intelligence",
      items: [
        { id: "atelier", label: "Atelier des cerveaux", icon: Wrench },
        { id: "brains", label: "Cerveaux", icon: Brain },
      ],
    },
    {
      title: "Compte",
      items: [{ id: "billing", label: "Facturation", icon: CreditCard }],
    },
    {
      title: "Automatisation",
      items: [
        { id: "cron", label: "Tâches planifiées", icon: Clock },
        { id: "nocturnal", label: "Review nocturne", icon: Moon },
      ],
    },
    ...(NEUTRAL ? [] : [{
      title: "Diagnostics Kernel",
      items: [
        { id: "metrics", label: "Métriques", icon: Activity },
        { id: "traces", label: "Traces", icon: BarChart3 },
        { id: "dashboard", label: "Dashboard d'évolution", icon: BarChart2 },
        { id: "ablation", label: "Auto-Ablation", icon: Scissors },
      ],
    }]),
    {
      title: "Veille & outils",
      items: [
        { id: "radar", label: "Radar IA", icon: Satellite },
        { id: "veille", label: "Veille IA", icon: Rss },
        { id: "tokenizer", label: "Tokeniseur", icon: Hash },
      ],
    },
  ];
}

// En-tête léger pour les composants sans bouton retour propre (Metrics, Traces)
function PaneHeader({ title, onBack }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-edge px-6 py-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-dim hover:text-ink transition-colors"
      >
        <ArrowLeft size={16} /> Accueil
      </button>
      <span className="text-sm font-semibold text-ink">{title}</span>
    </div>
  );
}

function PaneLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted">
      Chargement…
    </div>
  );
}

export default function Reglages({ onBack, onOpenProject }) {
  const groups = buildGroups();
  const firstId = groups[0].items[0].id;
  const [section, setSection] = useState(firstId);

  function renderSection() {
    switch (section) {
      case "atelier":   return <AtelierCerveaux onBack={onBack} />;
      case "brains":    return <Brains onBack={onBack} />;
      case "billing":   return <Billing onBack={onBack} />;
      case "cron":      return <CronManager onBack={onBack} />;
      case "nocturnal": return <NocturnalReview onBack={onBack} onOpenProject={onOpenProject} />;
      case "dashboard": return <MetricsDashboard onBack={onBack} />;
      case "ablation":  return <AutoAblation onBack={onBack} />;
      case "radar":     return <Radar onBack={onBack} />;
      case "veille":    return <Veille onBack={onBack} />;
      case "tokenizer": return <Tokenizer onBack={onBack} />;
      case "metrics":
        return (
          <div className="flex h-full flex-col">
            <PaneHeader title="Métriques · Kernel" onBack={onBack} />
            <div className="min-h-0 flex-1 overflow-y-auto nice-scroll"><Metrics /></div>
          </div>
        );
      case "traces":
        return (
          <div className="flex h-full flex-col">
            <PaneHeader title="Traces · Kernel" onBack={onBack} />
            <div className="min-h-0 flex-1 overflow-y-auto nice-scroll"><Traces /></div>
          </div>
        );
      default: return null;
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-bg">
      {/* Sous-navigation gauche */}
      <nav className="flex w-60 shrink-0 flex-col border-r border-edge bg-panel/60">
        <div className="flex items-center gap-2.5 border-b border-edge px-5 py-4">
          <Settings size={18} className="text-accent-soft" />
          <span className="text-sm font-semibold tracking-wide text-ink">Réglages</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto nice-scroll px-2.5 py-3">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
                {g.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {g.items.map(({ id, label, icon: Icon }) => {
                  const active = section === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSection(id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                        active ? "bg-accent/12 text-accent" : "text-dim hover:bg-edge-soft hover:text-ink"
                      }`}
                    >
                      <Icon size={15} className={`shrink-0 ${active ? "text-accent" : "text-faint"}`} />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Détail */}
      <div className="min-w-0 flex-1 overflow-y-auto nice-scroll">
        <Suspense fallback={<PaneLoader />}>{renderSection()}</Suspense>
      </div>
    </div>
  );
}
