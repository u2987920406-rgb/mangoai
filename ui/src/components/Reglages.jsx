import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft, Activity, BarChart2, BarChart3, Brain, CreditCard,
  Hash, Rss, Satellite, Scissors, Settings, Wrench, Wand2, Dna,
  FolderLock,
} from "lucide-react";
import { NEUTRAL } from "../neutral.js";

// Composants système existants — réutilisés tels quels (code-split)
const Brains           = lazy(() => import("./Brains.jsx"));
const AtelierCerveaux  = lazy(() => import("./AtelierCerveaux.jsx"));
const Billing          = lazy(() => import("./Billing.jsx"));
const Metrics          = lazy(() => import("./Metrics.jsx"));
const Traces           = lazy(() => import("./Traces.jsx"));
const MetricsDashboard = lazy(() => import("./MetricsDashboard.jsx"));
const AutoAblation     = lazy(() => import("./AutoAblation.jsx"));
const Radar            = lazy(() => import("./Radar.jsx"));
const Veille           = lazy(() => import("./Veille.jsx"));
const Tokenizer        = lazy(() => import("./Tokenizer.jsx"));
const AtelierMango     = lazy(() => import("./AtelierMango.jsx"));
const AutoEvolution    = lazy(() => import("./AutoEvolution.jsx"));
const Coffres          = lazy(() => import("./Coffres.jsx"));

// Catégories de la sous-navigation (groupées). NEUTRAL masque les diagnostics Kernel.
function buildGroups() {
  return [
    {
      title: "Intelligence",
      items: [
        { id: "atelier", label: "Atelier des cerveaux", icon: Wrench },
        { id: "brains", label: "Cerveaux", icon: Brain },
        { id: "self", label: "Atelier de Mango", icon: Wand2 },
        { id: "gaps", label: "Lacunes à combler", icon: Dna },
      ],
    },
    {
      title: "Compte",
      items: [{ id: "billing", label: "Facturation", icon: CreditCard }],
    },
    {
      title: "Sécurité",
      items: [{ id: "coffres", label: "Coffres", icon: FolderLock }],
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

export default function Reglages({ onBack }) {
  const groups = buildGroups();
  const firstId = groups[0].items[0].id;
  const [section, setSection] = useState(firstId);

  // (2026-07-14, #168 suite) Même badge que le dock (Sidebar.jsx) sur l'item de
  // nav "Lacunes à combler" — visible dès l'ouverture de Réglages, pas besoin de
  // cliquer dedans pour savoir qu'il y a quelque chose en attente.
  const [pendingGaps, setPendingGaps] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/gaps")
      .then((r) => (r.ok ? r.json() : { gaps: [] }))
      .then((d) => {
        if (cancelled) return;
        const n = Array.isArray(d.gaps) ? d.gaps.filter((g) => g.status === "proposed").length : 0;
        setPendingGaps(n);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function renderSection() {
    switch (section) {
      case "atelier":   return <AtelierCerveaux onBack={onBack} />;
      case "brains":    return <Brains onBack={onBack} />;
      case "self":      return <AtelierMango onBack={onBack} />;
      case "gaps":      return <AutoEvolution onBack={onBack} />;
      case "billing":   return <Billing onBack={onBack} />;
      case "coffres":   return <Coffres />;
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
                  const badge = id === "gaps" ? pendingGaps : 0;
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
                      {badge > 0 && (
                        <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
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
