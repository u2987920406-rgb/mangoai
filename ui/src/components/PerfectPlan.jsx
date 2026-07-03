import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from "lucide-react";

// Banque de 30 questions. Les 15 PREMIÈRES = « Perfect Plan » (app unique planifiée) ;
// les 30 = « Gros chantier » (15 + 15 questions d'architecture/scope). Le composant
// découpe via la prop `count` (15 ou 30). Miroir de PERFECT_PLAN_QUESTIONS (backend).
const QUESTIONS = [
  // ── 1-15 : Perfect Plan (essentiels d'une app soignée) ───────────────────
  {
    id: "type",
    text: "Quel type de projet ?",
    options: [
      { value: "webapp",    label: "App web",       example: "Notion, Vercel" },
      { value: "vitrine",   label: "Site vitrine",  example: "Apple, Airbnb" },
      { value: "jeu",       label: "Jeu",           example: "Vampire Survivors, Mario" },
      { value: "dashboard", label: "Dashboard",     example: "Linear, Figma" },
      { value: "fullstack", label: "Full-stack",    example: "Discord, Trello" },
    ],
  },
  {
    id: "objectif",
    text: "Objectif principal ?",
    options: [
      { value: "informer",  label: "Informer / présenter",  example: "vitrine, portfolio" },
      { value: "convertir", label: "Convertir / vendre",    example: "landing, boutique" },
      { value: "outil",     label: "Outil / productivité",  example: "app métier, gestion" },
      { value: "divertir",  label: "Divertir / jouer",      example: "jeu, expérience" },
    ],
  },
  {
    id: "audience",
    text: "Public cible ?",
    options: [
      { value: "grand-public", label: "Grand public",             example: "tout le monde" },
      { value: "pro",          label: "Professionnels / métier",  example: "usage expert" },
      { value: "interne",      label: "Interne / équipe",         example: "outil d'équipe" },
      { value: "perso",        label: "Pour moi",                 example: "usage personnel" },
    ],
  },
  {
    id: "style",
    text: "Style visuel ?",
    options: [
      { value: "epure",     label: "Épuré & minimaliste", example: "façon Apple" },
      { value: "vivant",    label: "Vivant & chaleureux",  example: "façon Airbnb" },
      { value: "corporate", label: "Strict & corporate",   example: "façon IBM" },
      { value: "colore",    label: "Coloré & joueur",      example: "façon Google, Duolingo" },
    ],
  },
  {
    id: "ambiance",
    text: "Ambiance générale ?",
    options: [
      { value: "tech",   label: "Moderne / tech",      example: "dark, glassmorphism" },
      { value: "humain", label: "Chaleureux / humain", example: "clair, organique" },
      { value: "pro",    label: "Classique / pro",     example: "neutre, corporate" },
      { value: "joyeux", label: "Joyeux / créatif",    example: "couleurs vives, décalé" },
    ],
  },
  {
    id: "couleur",
    text: "Dominante chromatique ?",
    options: [
      { value: "neutre",      label: "Neutre / monochrome",        example: "gris, noir & blanc" },
      { value: "accent",      label: "Une couleur d'accent forte", example: "sur base neutre" },
      { value: "multicolore", label: "Palette riche",              example: "vif, varié" },
      { value: "sombre-neon", label: "Sombre + néon",              example: "dark, glow" },
    ],
  },
  {
    id: "typo",
    text: "Personnalité typographique ?",
    options: [
      { value: "sans",    label: "Sans-serif neutre",  example: "Inter, Helvetica" },
      { value: "serif",   label: "Serif éditorial",    example: "élégant, magazine" },
      { value: "display", label: "Display expressif",  example: "titres à fort caractère" },
      { value: "mono",    label: "Mono / technique",   example: "code, terminal" },
    ],
  },
  {
    id: "densite",
    text: "Densité d'information ?",
    options: [
      { value: "aeree",      label: "Aérée / minimaliste", example: "beaucoup d'espace" },
      { value: "equilibree", label: "Équilibrée",          example: "ni vide ni chargé" },
      { value: "dense",      label: "Dense / data-rich",   example: "pro, tableaux" },
    ],
  },
  {
    id: "navigation",
    text: "Comment l'utilisateur navigue ?",
    options: [
      { value: "scroll",  label: "Scroll unique",             example: "landing page" },
      { value: "pages",   label: "Plusieurs pages",           example: "site multi-sections" },
      { value: "sidebar", label: "Sidebar + tableau de bord", example: "app métier" },
    ],
  },
  {
    id: "animation",
    text: "Niveau d'animation ?",
    options: [
      { value: "statique", label: "Statique / sobre",     example: "aucun effet" },
      { value: "micro",    label: "Micro-interactions",   example: "hover, transitions" },
      { value: "riches",   label: "Animations riches",    example: "au scroll, à l'entrée" },
      { value: "immersif", label: "Immersif / cinétique", example: "parallax, 3D" },
    ],
  },
  {
    id: "device",
    text: "Cible d'affichage principale ?",
    options: [
      { value: "desktop",    label: "Desktop d'abord",      example: "grand écran" },
      { value: "mobile",     label: "Mobile d'abord",       example: "smartphone" },
      { value: "responsive", label: "Responsive équilibré", example: "les deux" },
    ],
  },
  {
    id: "data",
    text: "Les données ?",
    options: [
      { value: "memory", label: "En mémoire",     example: "simple, pas de compte" },
      { value: "auth",   label: "Avec comptes",   example: "connexion" },
      { value: "static", label: "Fictives fixes", example: "démo, portfolio" },
      { value: "api",    label: "API externe",    example: "données live" },
    ],
  },
  {
    id: "contenu",
    text: "Source du contenu ?",
    options: [
      { value: "texte",  label: "Texte fictif réaliste",         example: "généré cohérent" },
      { value: "photos", label: "Vraies photos (stock)",         example: "Pexels" },
      { value: "genere", label: "Données d'exemple générées",    example: "faux jeux de données" },
      { value: "fourni", label: "Je fournirai",                  example: "mon contenu" },
    ],
  },
  {
    id: "ton",
    text: "Ton éditorial ?",
    options: [
      { value: "institutionnel", label: "Sérieux / institutionnel", example: "banque, corporate" },
      { value: "amical",         label: "Amical / direct",          example: "tu, chaleureux" },
      { value: "expert",         label: "Expert / technique",       example: "précis, pointu" },
      { value: "ludique",        label: "Ludique / décalé",         example: "fun, second degré" },
    ],
  },
  {
    id: "priorite",
    text: "Priorité n°1 ?",
    options: [
      { value: "rapidite",    label: "Rapidité",    example: "livrer vite" },
      { value: "esthetique",  label: "Esthétique",  example: "rendu léché" },
      { value: "robustesse",  label: "Robustesse",  example: "fonctionnel solide" },
      { value: "originalite", label: "Originalité", example: "effet wow" },
    ],
  },
  // ── 16-30 : Gros chantier (architecture & scope multi-pages) ─────────────
  {
    id: "pages",
    text: "Combien de pages / sections principales ?",
    options: [
      { value: "2-3",  label: "2-3",     example: "petit site" },
      { value: "4-6",  label: "4-6",     example: "site standard" },
      { value: "7-10", label: "7-10",    example: "app fournie" },
      { value: "10+",  label: "10 et +", example: "plateforme" },
    ],
  },
  {
    id: "auth_niveau",
    text: "Gestion des comptes ?",
    options: [
      { value: "aucune",      label: "Aucune",              example: "accès libre" },
      { value: "login",       label: "Login simple",        example: "email + mot de passe" },
      { value: "roles",       label: "Rôles & permissions", example: "admin / user" },
      { value: "multitenant", label: "Multi-organisations", example: "espaces séparés" },
    ],
  },
  {
    id: "backend",
    text: "Backend nécessaire ?",
    options: [
      { value: "aucun",      label: "Aucun (front seul)",     example: "tout côté client" },
      { value: "local",      label: "Stockage local",         example: "localStorage / IndexedDB" },
      { value: "api-db",     label: "API + base de données",  example: "serveur + BDD" },
      { value: "temps-reel", label: "Temps réel",             example: "websocket, live" },
    ],
  },
  {
    id: "paiement",
    text: "Monétisation / paiements ?",
    options: [
      { value: "aucun",       label: "Aucun",        example: "gratuit" },
      { value: "abonnement",  label: "Abonnement",   example: "SaaS mensuel" },
      { value: "achat",       label: "Achat unique", example: "produit / licence" },
      { value: "marketplace", label: "Marketplace",  example: "vendeurs multiples" },
    ],
  },
  {
    id: "cms",
    text: "Gestion de contenu ?",
    options: [
      { value: "statique", label: "Statique en dur",             example: "figé dans le code" },
      { value: "editable", label: "Éditable (mini-CMS)",         example: "admin modifie" },
      { value: "ugc",      label: "Généré par les utilisateurs", example: "posts, avis" },
      { value: "importe",  label: "Importé d'une API",           example: "flux externe" },
    ],
  },
  {
    id: "recherche",
    text: "Recherche & filtres ?",
    options: [
      { value: "aucun",    label: "Aucun",             example: "liste simple" },
      { value: "simple",   label: "Recherche simple",  example: "barre de recherche" },
      { value: "filtres",  label: "Filtres avancés",   example: "critères multiples" },
      { value: "facettes", label: "Tri + facettes",    example: "e-commerce" },
    ],
  },
  {
    id: "notifications",
    text: "Communication utilisateur ?",
    options: [
      { value: "aucune", label: "Aucune",         example: "rien" },
      { value: "toasts", label: "Toasts in-app",  example: "messages éphémères" },
      { value: "emails", label: "Emails",         example: "confirmations" },
      { value: "push",   label: "Push temps réel", example: "notifications live" },
    ],
  },
  {
    id: "i18n",
    text: "Multilingue ?",
    options: [
      { value: "une",      label: "Une langue",           example: "français seul" },
      { value: "bilingue", label: "Bilingue",             example: "FR + EN" },
      { value: "multi",    label: "Multilingue complet",  example: "3 langues et +" },
    ],
  },
  {
    id: "offline",
    text: "Hors-ligne / PWA ?",
    options: [
      { value: "non",   label: "Non requis",       example: "en ligne toujours" },
      { value: "cache", label: "Cache basique",    example: "lecture hors-ligne" },
      { value: "pwa",   label: "PWA installable",  example: "app installable" },
    ],
  },
  {
    id: "mesure",
    text: "Suivi & analytics ?",
    options: [
      { value: "aucun", label: "Aucun",                 example: "pas de tracking" },
      { value: "base",  label: "Analytics de base",     example: "visites, clics" },
      { value: "admin", label: "Tableau de bord admin", example: "stats internes" },
      { value: "ab",    label: "Expérimentation A/B",   example: "tests de variantes" },
    ],
  },
  {
    id: "accessibilite",
    text: "Exigence d'accessibilité ?",
    options: [
      { value: "standard", label: "Standard",     example: "bonnes pratiques" },
      { value: "aa",       label: "AA renforcé",  example: "WCAG AA" },
      { value: "aaa",      label: "AAA strict",   example: "contraste maximal" },
    ],
  },
  {
    id: "performance",
    text: "Contrainte de performance ?",
    options: [
      { value: "normale",   label: "Normale",              example: "usage courant" },
      { value: "optimisee", label: "Optimisée",            example: "léger & rapide" },
      { value: "critique",  label: "Temps réel critique",  example: "60 fps, faible latence" },
    ],
  },
  {
    id: "integrations",
    text: "Intégrations tierces ?",
    options: [
      { value: "aucune",      label: "Aucune",             example: "autonome" },
      { value: "une",         label: "Une",                example: "carte, calendrier, chat" },
      { value: "plusieurs",   label: "Plusieurs",          example: "combinaison de services" },
      { value: "ecosysteme",  label: "Écosystème complet", example: "nombreuses API" },
    ],
  },
  {
    id: "etat",
    text: "Complexité de l'état applicatif ?",
    options: [
      { value: "simple",       label: "Simple / local",           example: "par écran" },
      { value: "global",       label: "Partagé / global",         example: "état commun" },
      { value: "serveur",      label: "Synchronisé serveur",      example: "source de vérité distante" },
      { value: "collaboratif", label: "Collaboratif temps réel",  example: "multi-utilisateurs live" },
    ],
  },
  {
    id: "livraison",
    text: "Priorité de livraison ?",
    options: [
      { value: "mvp",       label: "MVP vite",                  example: "l'essentiel d'abord" },
      { value: "equilibre", label: "Équilibre qualité / délai", example: "raisonnable" },
      { value: "finition",  label: "Finition maximale",         example: "peaufiné" },
      { value: "evolutif",  label: "Évolutif long terme",       example: "architecture durable" },
    ],
  },
];

export default function PerfectPlan({ onClose, onLaunch, count = 15, title = "Perfect Plan", launchLabel = "Lancer avec ce plan" }) {
  // Perfect Plan = 15 questions · Gros chantier = 30. On découpe la banque commune.
  const active = QUESTIONS.slice(0, Math.min(count, QUESTIONS.length));
  const TOTAL = active.length + 1; // N questions + l'étape références

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [refs, setRefs] = useState([]);
  const [refKind, setRefKind] = useState("url");
  const [refValue, setRefValue] = useState("");
  const [refLabel, setRefLabel] = useState("");

  const q = step < active.length ? active[step] : null;
  const isRefsStep = step === active.length;
  const canNext = q ? answers[q.id] !== undefined : true;

  function pick(id, value, label) {
    setAnswers((prev) => ({ ...prev, [id]: { value, label } }));
  }

  function addRef() {
    if (!refValue.trim()) return;
    setRefs((prev) => [
      ...prev,
      { kind: refKind, value: refValue.trim(), ...(refLabel.trim() ? { label: refLabel.trim() } : {}) },
    ]);
    setRefValue("");
    setRefLabel("");
  }

  function launch() {
    const answersArr = active.map((q) => ({
      id: q.id,
      value: answers[q.id].value,
      label: answers[q.id].label,
    }));
    onLaunch({ answers: answersArr, refs });
  }

  const stepTitle = q ? q.text : "Références (optionnel)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-edge bg-panel p-7 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              ✨ {title} — étape {step + 1}/{TOTAL}
            </p>
            <h2 className="text-[17px] font-bold text-ink">{stepTitle}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Barre de progression */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i < step ? "bg-accent" : i === step ? "bg-accent/50" : "bg-edge"
              }`}
            />
          ))}
        </div>

        {/* Options */}
        {q && (
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const sel = answers[q.id]?.value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { pick(q.id, opt.value, opt.label); }}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                    sel
                      ? "border-accent bg-accent/10 text-ink"
                      : "border-edge bg-bg text-dim hover:border-faint hover:text-ink"
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    sel ? "border-accent bg-accent" : "border-edge"
                  }`}>
                    {sel && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight">{opt.label}</p>
                    <p className="text-[11px] text-faint">{opt.example}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Étape références */}
        {isRefsStep && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-dim leading-relaxed">
              Dépose des sites, une palette ou des contraintes. Mango les utilisera avant de coder — Sharingan scan automatique sur les URLs.
            </p>

            <div className="flex flex-col gap-2 rounded-xl border border-edge p-3">
              <div className="flex items-center gap-2">
                <select
                  value={refKind}
                  onChange={(e) => setRefKind(e.target.value)}
                  className="rounded-lg border border-edge bg-bg px-2 py-1.5 text-xs text-dim focus:border-accent focus:outline-none"
                >
                  <option value="url">URL</option>
                  <option value="palette">Palette</option>
                  <option value="note">Contrainte</option>
                </select>
                <input
                  type="text"
                  value={refValue}
                  onChange={(e) => setRefValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addRef(); }}
                  placeholder={
                    refKind === "url" ? "https://apple.com"
                    : refKind === "palette" ? "#1a1a2e, #e94560"
                    : "pas de serif, fond sombre obligatoire…"
                  }
                  className="flex-1 rounded-lg border border-edge bg-bg px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <button
                  onClick={addRef}
                  disabled={!refValue.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-edge text-dim hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>
              {refKind === "url" && (
                <input
                  type="text"
                  value={refLabel}
                  onChange={(e) => setRefLabel(e.target.value)}
                  placeholder="Description (optionnel)"
                  className="rounded-lg border border-edge bg-bg px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              )}
            </div>

            {refs.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {refs.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-edge bg-bg px-3 py-1.5">
                    <span className="min-w-[44px] text-[9px] font-semibold uppercase text-faint">{r.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.value}</span>
                    {r.label && <span className="max-w-[80px] truncate text-[10px] text-faint">{r.label}</span>}
                    <button onClick={() => setRefs((p) => p.filter((_, j) => j !== i))} className="text-dim hover:text-err transition-colors">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic text-faint">Aucune référence — Mango comblera librement.</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg border border-edge px-3 py-2 text-xs text-dim hover:border-faint hover:text-ink disabled:opacity-30 transition-colors"
          >
            <ArrowLeft size={13} />
            Précédent
          </button>

          {isRefsStep ? (
            <button
              onClick={launch}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-md shadow-accent/30 hover:opacity-90 transition"
            >
              {launchLabel}
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={() => canNext && setStep((s) => s + 1)}
              disabled={!canNext}
              className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-accent/30 hover:opacity-90 disabled:opacity-50 transition"
            >
              Suivant
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
