// Shell 2.0 — MAQUETTE B1→B2 (audit-mango-2.0 §5, paradigme hybride sidebar + panneau).
// Accessible via http://localhost:5173/?v2 — n'affecte pas l'UI actuelle.
// Depuis B2 : premier consommateur du design system (../design) + client API (../api)
// + état global léger (../state/AppState). Catalogue rationalisé validé par Raf.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen, Boxes, Image as ImageIcon, Music2, Bot, Dna, Brain,
  BookOpen, Lightbulb, FileText, Palette, Settings, Sun, Moon, Search,
  Sparkles, Home as HomeIcon, Mic, Command,
  Activity, Ghost, SwatchBook, Inbox, X, ArrowLeft,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { getTheme, toggleTheme } from "../theme.js";
import { BrandMark, Button, Chip, Badge, Input, Textarea, Modal, EmptyState, TEXT, SECTION_LABEL, cx } from "../design";
import { api, onApiError } from "../api";
import { AppStateProvider, useAppState } from "../state/AppState";

// C3 — l'App Builder RÉEL (Chat + Preview de la 1.0) monté dans le panneau du shell.
const BuilderPane = lazy(() => import("./BuilderPane.jsx"));
// Accueil conversationnel (home-chat 1.0 + graduation vers l'atelier).
const AccueilPane = lazy(() => import("./AccueilPane.jsx"));
// Toutes les autres sections : vraies apps 1.0 fusionnées (onglets) + vrai Réglages.
const AppsPane = lazy(() => import("./AppsPane.jsx"));
const ReglagesReel = lazy(() => import("../components/Reglages.jsx"));

/* ── Catalogue 2.0 (fusions validées) ─────────────────────────────── */
const SECTIONS = [
  {
    id: "creer", label: "Créer",
    items: [
      { id: "accueil",  label: "Accueil",      icon: HomeIcon,   desc: "Discute avec Mango — et si ça devient une app, l'atelier est à un clic." },
      { id: "builder",  label: "App Builder",  icon: FolderOpen, desc: "Générer et itérer une app web complète, aperçu live à côté." },
      { id: "projets",  label: "Projets",      icon: Boxes,      desc: "Gros projets (Kanban incrémental) et suites d'apps — ex Multi-Projet + OS d'apps." },
      { id: "image",    label: "Image",        icon: ImageIcon,  desc: "Création d'images." },
      { id: "music",    label: "Music",        icon: Music2,     desc: "Création musicale." },
    ],
  },
  {
    id: "agents", label: "Agents",
    items: [
      { id: "agents",   label: "Agents",        icon: Bot,   desc: "Forger et piloter les agents spécialistes — ex Agent Factory + Super Agent." },
      { id: "evolution",label: "Auto-évolution",icon: Dna,   desc: "Lacunes détectées → agents forgés. — ex Atelier de Mango + Lacunes." },
      { id: "cerveaux", label: "Cerveaux",      icon: Brain, desc: "Un cerveau par agent, modèles locaux et cloud — ex Atelier des cerveaux + Cerveaux." },
    ],
  },
  {
    id: "savoir", label: "Savoir",
    items: [
      { id: "notes",  label: "Notes & RAG",    icon: BookOpen,  desc: "Notes, PDF, mémoire interrogeable." },
      { id: "idees",  label: "Studio d'idées", icon: Lightbulb, desc: "Idéation et laboratoire de prompts — ex Ideation + Prompt Lab." },
      { id: "doc",    label: "Doc",            icon: FileText,  desc: "Génération de documents. (à évaluer : fusion dans Notes & RAG)" },
    ],
  },
  {
    id: "design", label: "Design",
    items: [
      { id: "studio",     label: "Design Studio", icon: Palette,    desc: "Revue design, variantes de goût, éditeur visuel — ex Design Review + Goût + Éditeur." },
      { id: "composants", label: "Composants",    icon: SwatchBook, desc: "Vitrine du design system 2.0 — la cohérence en un coup d'œil." },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((s) => s.items.map((it) => ({ ...it, section: s.label })));

/* ── Briques locales de la maquette ───────────────────────────────── */

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent ${
        active ? "bg-accent/12 font-medium text-ink" : "text-dim hover:bg-raised hover:text-ink"
      }`}
    >
      <Icon size={16} strokeWidth={1.8} className={active ? "text-accent" : "text-faint group-hover:text-dim"} />
      {item.label}
    </button>
  );
}

/* Palette de commandes ⌘K — navigation instantanée (pattern Cursor). */
function CommandPalette({ open, onClose, onGo }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ALL_ITEMS;
    return ALL_ITEMS.filter((it) => (it.label + " " + it.section).toLowerCase().includes(needle));
  }, [q]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[18vh]" onMouseDown={onClose}>
      <div
        className="w-[560px] max-w-[90vw] animate-pop overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-edge-soft px-4 py-3">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results[0]) { onGo(results[0].id); onClose(); }
            }}
            placeholder="Aller à…"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-faint">Échap</kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1.5">
          {results.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => { onGo(it.id); onClose(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-raised"
              >
                <Icon size={15} className="text-dim" />
                {it.label}
                <span className="ml-auto text-[11px] text-faint">{it.section}</span>
              </button>
            );
          })}
          {results.length === 0 && (
            <EmptyState icon={<Inbox size={28} />} title="Aucun résultat" description="Essaie un autre terme." />
          )}
        </div>
      </div>
    </div>
  );
}

// Accueil conversationnel (home-chat + graduation vers l'atelier) — v2/AccueilPane.jsx.

/* Vitrine du design system — tous les composants d'un coup d'œil (preuve B2). */
function VitrinePane() {
  const { pushToast } = useAppState();
  const [modalOpen, setModalOpen] = useState(false);
  const [chipOn, setChipOn] = useState(true);

  return (
    <div className="mx-auto w-full max-w-[860px] animate-fade-up px-8 py-10">
      <h1 className={TEXT.xl}>Composants</h1>
      <p className={cx(TEXT.base, "mt-1.5 text-dim")}>
        Le design system 2.0 (`ui/src/design/`) — chaque écran migré en Phase C consommera ces briques.
      </p>

      <div className="mt-8 space-y-8">
        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>Boutons</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Créer</Button>
            <Button variant="secondary">Annuler</Button>
            <Button variant="ghost">Détails</Button>
            <Button variant="danger">Supprimer</Button>
            <Button variant="primary" loading>Build…</Button>
            <Button variant="secondary" size="sm">Petit</Button>
            <Button variant="secondary" size="lg">Grand</Button>
            <Button variant="ghost" iconOnly icon={<Mic size={15} />} title="Micro" aria-label="Micro" />
          </div>
        </section>

        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>Champs</div>
          <div className="grid max-w-[420px] gap-2">
            <Input placeholder="Nom du projet…" />
            <Input placeholder="Champ invalide" invalid defaultValue="valeur refusée" />
            <Textarea placeholder="Description multiligne…" />
          </div>
        </section>

        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>Badges & chips</div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">build vert</Badge>
            <Badge tone="warn">en attente</Badge>
            <Badge tone="err">échec</Badge>
            <Badge tone="accent">souverain</Badge>
            <Badge>neutre</Badge>
            <Chip selected={chipOn} onClick={() => setChipOn(!chipOn)}>filtre {chipOn ? "actif" : "inactif"}</Chip>
            <Chip>suggestion</Chip>
          </div>
        </section>

        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>Modale, toasts & API</div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Ouvrir la modale</Button>
            <Button variant="secondary" onClick={() => pushToast("ok", "Tout va bien 🥭")}>Toast ok</Button>
            <Button
              variant="secondary"
              onClick={() => api("/api/route-inexistante").catch(() => {})}
            >
              Erreur API → toast
            </Button>
          </div>
        </section>

        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>État vide</div>
          <div className="rounded-xl border border-edge-soft bg-panel">
            <EmptyState
              icon={<Inbox size={30} />}
              title="Aucun projet pour l'instant"
              description="Décris ce que tu veux créer sur l'Accueil et Mango s'occupe du reste."
              action={<Button variant="primary">Créer un projet</Button>}
            />
          </div>
        </section>

        <section>
          <div className={cx(SECTION_LABEL, "mb-2 px-0")}>Marque</div>
          <div className="flex items-end gap-6">
            <BrandMark size={15} />
            <BrandMark size={22} />
            <BrandMark size={30} />
          </div>
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modale accessible"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={() => { setModalOpen(false); pushToast("ok", "Confirmé"); }}>Confirmer</Button>
          </>
        }
      >
        Focus piégé (Tab boucle ici), Échap ferme, le focus revient au bouton d'origine.
        Une seule implémentation accessible = toutes les modales de la 2.0 le sont.
      </Modal>
    </div>
  );
}

// Les placeholders et la façade Réglages ont disparu : toutes les sections montent
// désormais les vraies apps 1.0 (AppsPane) et le vrai Reglages.jsx.

/* Toasts branchés sur l'état global (pont visuel minimal de la maquette). */
function ToastStack() {
  const { toasts, dismissToast } = useAppState();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex animate-pop items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg ${
            t.kind === "error" ? "border-err/40 bg-panel text-err" : "border-ok/40 bg-panel text-ink"
          }`}
        >
          {t.text}
          <button onClick={() => dismissToast(t.id)} aria-label="Fermer" className="text-faint hover:text-ink">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Shell ─────────────────────────────────────────────────────────── */
function ShellV2Inner() {
  const { active, go, back, canBack, pushToast, openProject } = useAppState();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [, setThemeTick] = useState(0);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  // Le client API remonte ses erreurs dans les toasts — câblé UNE fois ici.
  useEffect(() => onApiError((e) => pushToast("error", e.userMessage)), [pushToast]);

  const activeItem = ALL_ITEMS.find((it) => it.id === active);
  const isReglages = active === "reglages";

  return (
    <div className="flex h-screen bg-bg text-ink">
      {/* Sidebar */}
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-edge-soft bg-panel">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <BrandMark size={15} />
          <span className="rounded-full border border-edge px-1.5 py-px text-[9.5px] font-medium text-faint">2.0</span>
        </div>

        <div className="px-2.5 pt-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-edge bg-bg px-2.5 py-[7px] text-[12.5px] text-faint transition-colors duration-150 hover:border-faint hover:text-dim"
          >
            <Search size={14} />
            Rechercher…
            <span className="ml-auto flex items-center gap-0.5 text-[10px]"><Command size={10} />K</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
          {SECTIONS.map((s) => (
            <div key={s.id}>
              <div className={cx(SECTION_LABEL, "px-2.5 pb-1 pt-4")}>{s.label}</div>
              <div className="space-y-0.5">
                {s.items.map((it) => (
                  <NavItem key={it.id} item={it} active={active === it.id} onClick={() => go(it.id)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Pied : souveraineté + réglages + thème */}
        <div className="border-t border-edge-soft p-2.5">
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-bg px-2.5 py-2">
            <Activity size={13} className="text-ok" />
            <span className="text-[11px] text-dim">Souverain · GLM 5.2</span>
            <span className="ml-auto text-[11px] font-medium text-ok">95 %</span>
          </div>
          <div className="flex items-center gap-0.5">
            <NavItem
              item={{ id: "reglages", label: "Réglages", icon: Settings }}
              active={isReglages}
              onClick={() => go("reglages")}
            />
            <Button
              variant="ghost"
              iconOnly
              icon={getTheme() === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              onClick={() => { toggleTheme(); setThemeTick((t) => t + 1); }}
              title="Basculer le thème"
              aria-label="Basculer le thème"
            />
          </div>
        </div>
      </aside>

      {/* Panneau principal */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[46px] shrink-0 items-center gap-2.5 border-b border-edge-soft px-5">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<ArrowLeft size={15} />}
            disabled={!canBack}
            onClick={back}
            className="-ml-2"
            title="Retour (Alt+←)"
            aria-label="Retour"
          />
          <span className="text-[13px] font-medium">{isReglages ? "Réglages" : activeItem?.label}</span>
          {!isReglages && activeItem && activeItem.id !== "accueil" && (
            <span className="text-[12px] text-faint">· {activeItem.section}</span>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-faint" title="MangoQA audite en fantôme — jamais bloquant">
              <Ghost size={12} className="text-dim" /> QA fantôme
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            </span>
            <Button variant="ghost" size="sm" iconOnly icon={<Sparkles size={15} />} title="Artefacts (fenêtre)" aria-label="Artefacts" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-[13px] text-faint">Chargement…</div>}>
            {isReglages ? <ReglagesReel onBack={back} onOpenProject={(name) => openProject(name)} />
              : active === "accueil" ? <AccueilPane />
              : active === "composants" ? <VitrinePane />
              : active === "builder" ? <BuilderPane />
              : <AppsPane sectionId={active} />}
          </Suspense>
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onGo={go} />
      <ToastStack />
    </div>
  );
}

export default function ShellV2() {
  return (
    <AppStateProvider>
      <ShellV2Inner />
    </AppStateProvider>
  );
}
