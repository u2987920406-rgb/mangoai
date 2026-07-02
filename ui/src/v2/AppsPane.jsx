// Sections du shell 2.0 — montent les VRAIES apps 1.0, fusionnées selon la table
// validée par Raf (audit-mango-2.0 §4.3) : chaque section = onglets de composants
// réels, réutilisés tels quels (pattern Phase C : remonter, pas réécrire).
import { lazy, Suspense, useState } from "react";
import { Music2 } from "lucide-react";
import { slugify } from "../slugify.js";
import { useAppState } from "../state/AppState";
import { cx, TEXT } from "../design";

const MultiProject      = lazy(() => import("../components/MultiProject.jsx"));
const SuiteWindow       = lazy(() => import("../components/SuiteWindow.jsx"));
const AgentFactory      = lazy(() => import("../components/AgentFactory.jsx"));
const SuperAgentBuilder = lazy(() => import("../components/SuperAgentBuilder.jsx"));
const AutoEvolution     = lazy(() => import("../components/AutoEvolution.jsx"));
const AtelierMango      = lazy(() => import("../components/AtelierMango.jsx"));
const AtelierCerveaux   = lazy(() => import("../components/AtelierCerveaux.jsx"));
const Brains            = lazy(() => import("../components/Brains.jsx"));
const NotesRAG          = lazy(() => import("../components/NotesRAG.jsx"));
const Ideation          = lazy(() => import("../components/Ideation.jsx"));
const PromptLab         = lazy(() => import("../components/PromptLab.jsx"));
const DocGenerator      = lazy(() => import("../components/DocGenerator.jsx"));
const DesignReview      = lazy(() => import("../components/DesignReview.jsx"));
const TasteGallery      = lazy(() => import("../components/TasteGallery.jsx"));
const ImageCreatorPane  = lazy(() => import("./ImageCreatorPane.jsx"));

const lastProject = () => localStorage.getItem("mangoos.v2.project") || "";

function Loader() {
  return <div className={cx(TEXT.base, "flex h-full items-center justify-center text-faint")}>Chargement…</div>;
}

/* Onglets de fusion — segmented control discret sous la top bar du shell. */
function Tabs({ tabs }) {
  const [active, setActive] = useState(0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-edge-soft px-4 py-1.5">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={cx(
              "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent",
              i === active ? "bg-accent/12 font-medium text-ink" : "text-dim hover:bg-raised hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<Loader />}>{tabs[active].render()}</Suspense>
      </div>
    </div>
  );
}

/* Image / Music : à venir aussi en 1.0 (ComingSoon) — on l'assume honnêtement. */
function ComingSoon({ icon: Icon, title, subtitle, envKey }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
        <Icon size={32} className="text-accent/60" />
      </div>
      <div>
        <p className="text-lg font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm text-dim">{subtitle}</p>
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-faint">
        Comme en 1.0 : fonctionnalité à venir — configure{" "}
        <code className="rounded bg-edge-soft px-1 font-mono text-accent">{envKey}</code> dans{" "}
        <code className="rounded bg-edge-soft px-1 font-mono text-accent">server/.env</code> pour l'activer.
      </p>
    </div>
  );
}

export default function AppsPane({ sectionId }) {
  const { back, openProject, pushToast } = useAppState();

  switch (sectionId) {
    case "projets":
      return (
        <Tabs
          tabs={[
            { label: "Gros projet (Kanban)", render: () => <MultiProject onBack={back} /> },
            { label: "Suite d'apps", render: () => <SuiteWindow win={{ props: { onOpen: (name) => openProject(name) } }} onClose={() => {}} /> },
          ]}
        />
      );
    case "agents":
      return (
        <Tabs
          tabs={[
            { label: "Forge d'agents", render: () => <AgentFactory onBack={back} /> },
            { label: "Super Agent", render: () => <SuperAgentBuilder onBack={back} projectName={lastProject()} /> },
          ]}
        />
      );
    case "evolution":
      return (
        <Tabs
          tabs={[
            { label: "Lacunes à combler", render: () => <AutoEvolution onBack={back} /> },
            { label: "Atelier de Mango", render: () => <AtelierMango onBack={back} /> },
          ]}
        />
      );
    case "cerveaux":
      return (
        <Tabs
          tabs={[
            { label: "Atelier des cerveaux", render: () => <AtelierCerveaux onBack={back} /> },
            { label: "Registre", render: () => <Brains onBack={back} /> },
          ]}
        />
      );
    case "notes":
      return (
        <Suspense fallback={<Loader />}>
          <NotesRAG onBack={back} onToast={pushToast} />
        </Suspense>
      );
    case "idees":
      return (
        <Tabs
          tabs={[
            {
              label: "Ideation",
              // Entrée « depuis une idée » ASSUMÉE (comme la 1.0) : description → projet + build.
              render: () => <Ideation onBack={back} onStartCoding={(desc) => openProject(slugify(desc), desc)} />,
            },
            { label: "Prompt Lab", render: () => <PromptLab onBack={back} /> },
          ]}
        />
      );
    case "doc":
      return (
        <Suspense fallback={<Loader />}>
          <DocGenerator onBack={back} />
        </Suspense>
      );
    case "studio":
      return (
        <Tabs
          tabs={[
            { label: "Design Review", render: () => <DesignReview onBack={back} projectName={lastProject()} /> },
            { label: "Variantes de goût", render: () => <TasteGallery win={{ props: { projectName: lastProject() } }} /> },
          ]}
        />
      );
    case "image":
      return (
        <Suspense fallback={<Loader />}>
          <ImageCreatorPane />
        </Suspense>
      );
    case "music":
      return <ComingSoon icon={Music2} title="Music Creator" subtitle="Génération musicale via AudioCraft / MusicGen" envKey="REPLICATE_API_TOKEN" />;
    default:
      return <Loader />;
  }
}
