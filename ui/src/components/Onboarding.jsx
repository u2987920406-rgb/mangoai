import { useState } from "react";

const STEPS = [
  {
    id: "domain",
    question: "Quel est ton domaine principal ?",
    options: [
      { value: "vitrine", label: "Sites vitrines", desc: "Landing pages, portfolios, blogs" },
      { value: "webapp", label: "Web apps", desc: "SaaS, CRUD, outils internes" },
      { value: "dashboard", label: "Dashboards", desc: "Visualisations, analytics, data" },
      { value: "jeu", label: "Jeux", desc: "Canvas 2D, Phaser, Three.js" },
      { value: "autre", label: "Varié", desc: "Je touche à tout" },
    ],
  },
  {
    id: "stack",
    question: "Ta stack préférée ?",
    options: [
      { value: "react", label: "React + Vite", desc: "Tailwind — stack par défaut de Mango" },
      { value: "vue", label: "Vue 3", desc: "Composition API, Pinia" },
      { value: "svelte", label: "SvelteKit", desc: "Réactif, léger, élégant" },
      { value: "vanilla", label: "Vanilla JS", desc: "HTML / CSS / JS pur" },
      { value: "indifferent", label: "Peu importe", desc: "Mango choisira selon le projet" },
    ],
  },
  {
    id: "style",
    question: "Ton style visuel préféré ?",
    options: [
      { value: "minimal", label: "Minimaliste", desc: "Blanc, espace, typographie fine" },
      { value: "bold", label: "Modern & Impact", desc: "Couleurs fortes, contrastes élevés" },
      { value: "corporate", label: "Professionnel", desc: "Sobre, structuré, institutionnel" },
      { value: "creative", label: "Créatif", desc: "Animations, textures, profondeur" },
    ],
  },
  {
    id: "usage",
    question: "Comment tu vas utiliser Mango ?",
    options: [
      { value: "clients", label: "Clients / Freelance", desc: "Livrables pour des tiers" },
      { value: "perso", label: "Projets perso", desc: "Expérimentations, side projects" },
      { value: "formation", label: "Formation", desc: "Apprendre le dev avec l'IA" },
      { value: "proto", label: "Prototypage", desc: "Tester des idées rapidement" },
    ],
  },
  {
    id: "level",
    question: "Ton niveau en développement ?",
    options: [
      { value: "debutant", label: "Débutant", desc: "Je découvre le dev web avec l'IA" },
      { value: "intermediaire", label: "Intermédiaire", desc: "Je connais les bases" },
      { value: "expert", label: "Expert", desc: "Mango est mon accélérateur" },
    ],
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step];
  const selected = answers[current.id];
  const isLast = step === STEPS.length - 1;

  function select(value) {
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function next() {
    if (!selected) return;
    if (isLast) submit();
    else setStep((s) => s + 1);
  }

  function back() {
    setStep((s) => s - 1);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!response.ok) throw new Error("Impossible d’enregistrer tes préférences. Réessaie.");
      onDone();
    } catch (e) {
      setError(e.message || "Mango est indisponible. Réessaie.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg">
      {/* Hero glow */}
      <div className="pointer-events-none absolute inset-0 hero-glow" />

      <div className="animate-pop relative w-full max-w-lg px-4">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-edge bg-raised px-3 py-1 text-xs text-dim">
            Configuration initiale · {step + 1} / {STEPS.length}
          </div>
          <h1 className="text-2xl font-bold text-ink">
            Bienvenue dans <span className="text-accent">Mango</span>
          </h1>
          <p className="mt-1 text-sm text-dim">{STEPS.length} questions pour que Mango apprenne à te connaître</p>
        </div>

        {/* Progress dots */}
        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i < step
                  ? "w-6 bg-accent"
                  : i === step
                  ? "w-8 bg-accent"
                  : "w-4 bg-edge"
              }`}
            />
          ))}
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-edge bg-raised p-6 shadow-2xl shadow-black/50">
          <h2 className="mb-4 text-base font-semibold text-ink">{current.question}</h2>
          <div className="flex flex-col gap-2">
            {current.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => select(opt.value)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-150 ${
                  selected === opt.value
                    ? "border-accent bg-accent/10 text-ink shadow-sm shadow-accent/20"
                    : "border-edge bg-panel text-dim hover:border-faint hover:text-ink"
                }`}
              >
                <div
                  className={`h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                    selected === opt.value ? "border-accent bg-accent" : "border-faint"
                  }`}
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-faint">{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {/* Navigation */}
        <div className="mt-4 flex justify-between">
          {step > 0 ? (
            <button
              onClick={back}
              className="rounded-lg border border-edge px-4 py-2 text-sm text-dim hover:text-ink transition-colors"
            >
              ← Précédent
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={next}
            disabled={!selected || submitting}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Démarrage…" : isLast ? "Démarrer avec Mango →" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
