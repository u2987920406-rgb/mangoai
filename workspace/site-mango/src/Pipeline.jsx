import { useEffect, useRef, useState } from "react";

/*
  La console d'atelier — élément signature du hero.
  Rejoue en boucle une session réelle du pipeline MangoOS :
  idée → l'Élève code → le Gardien juge (avec un ÉCHEC puis une relance) → app livrée.
  Les verdicts affichés reprennent la mécanique réelle du Gardien #161
  (intention · goût · QA WCAG · teste_parcours, relances bornées).
*/

const BRIEF = "Une maison d'architecte en pierre noire. Lumière rasante, silence, retenue.";

const CODE_LINES = [
  { t: "tool", s: "planifier — 4 étapes posées (plan-ancre)" },
  { t: "tool", s: "chercher_image → Pexels : « black stone architecture dusk »" },
  { t: "code", s: "const ROOMS = [" },
  { t: "code", s: "  { name: “Le seuil”, light: “rasante”, stone: “basalte” }," },
  { t: "code", s: "  { name: “La faille”, light: “zénithale”, stone: “onyx” }," },
  { t: "code", s: "];" },
  { t: "code", s: "<section className=“seuil” style={{ background: onyx }}>" },
  { t: "tool", s: "write_file src/App.jsx ✓" },
  { t: "tool", s: "check_build → vite build ✓ vert" },
];

const STEP_META = [
  { label: "L’idée", sub: "un brief, en français" },
  { label: "L’Élève code", sub: "GLM, boucle agentique" },
  { label: "Le Gardien juge", sub: "intention · goût · QA" },
  { label: "Livrée", sub: "app finie, port 5174" },
];

const DURATIONS = [3200, 4600, 6200, 3600];
const TICK = 80;

function Gauge({ label, value, max = 100, ok, show, detail }) {
  return (
    <div className={`pl-gauge ${show ? "on" : ""}`}>
      <div className="pl-gauge-head">
        <span>{label}</span>
        <span className={ok ? "pl-ok" : "pl-ko"}>
          {value}/{max} {ok ? "✓" : "✗"}
        </span>
      </div>
      <div className="pl-gauge-track">
        <div
          className={`pl-gauge-fill ${ok ? "" : "ko"}`}
          style={{ width: show ? `${(value / max) * 100}%` : "0%" }}
        />
      </div>
      {detail && <p className="pl-gauge-detail">{detail}</p>}
    </div>
  );
}

export default function Pipeline() {
  const [step, setStep] = useState(0);
  const [t, setT] = useState(0); // progression 0..1 dans l'étape
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const raf = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setStep(3);
      setT(1);
      setPlaying(false);
    }
  }, []);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = setInterval(() => {
      setT((prev) => {
        const next = prev + TICK / DURATIONS[step];
        if (next >= 1) {
          setStep((s) => (s + 1) % 4);
          return 0;
        }
        return next;
      });
    }, TICK);
    raf.current = id;
    return () => clearInterval(id);
  }, [playing, step, reduced]);

  const goTo = (i) => {
    setStep(i);
    setT(reduced ? 1 : 0);
  };

  // Étape 0 — brief tapé au clavier
  const briefChars = step === 0 ? Math.floor(t * (BRIEF.length + 8)) : step > 0 || reduced ? BRIEF.length : 0;

  // Étape 1 — lignes de code qui tombent
  const visibleLines =
    step === 1 ? Math.ceil(t * CODE_LINES.length) : step > 1 || reduced ? CODE_LINES.length : 0;

  // Étape 2 — le Gardien : 1er verdict (goût 64 ✗) → relance → 87 ✓
  const g = step === 2 ? t : step > 2 || reduced ? 1 : 0;
  const phase1 = g > 0.12; // intention
  const phase2 = g > 0.28; // goût — ÉCHEC
  const phaseRelance = g > 0.5;
  const phase3 = g > 0.72; // goût corrigé
  const phase4 = g > 0.86; // QA + parcours
  const gout = phase3 ? 87 : 64;
  const goutOk = phase3;

  return (
    <div className="pipeline" role="group" aria-label="Démo du pipeline MangoOS">
      <div className="pl-chrome">
        <span className="pl-dot" />
        <span className="pl-dot" />
        <span className="pl-dot" />
        <span className="pl-title">atelier — session live</span>
        <button
          className="pl-ctl"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Mettre la démo en pause" : "Relancer la démo"}
        >
          {playing ? "‖ pause" : "▶ rejouer"}
        </button>
      </div>

      <div className="pl-body">
        <ol className="pl-steps">
          {STEP_META.map((m, i) => (
            <li key={m.label}>
              <button
                className={`pl-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="pl-step-n">{i + 1}</span>
                <span className="pl-step-txt">
                  <strong>{m.label}</strong>
                  <em>{m.sub}</em>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <div className="pl-stage">
          {step === 0 && (
            <div className="pl-scene pl-scene-brief">
              <p className="pl-prompt-label">toi, dans le chat :</p>
              <p className="pl-brief">
                {BRIEF.slice(0, briefChars)}
                <span className="pl-caret" aria-hidden="true" />
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="pl-scene pl-scene-code">
              <p className="pl-file">src/App.jsx — l’Élève (GLM) écrit, lit, vérifie</p>
              <pre className="pl-code">
                {CODE_LINES.slice(0, visibleLines).map((l, i) => (
                  <span key={i} className={`pl-line ${l.t}`}>
                    {l.t === "tool" ? "▸ " : ""}
                    {l.s}
                    {"\n"}
                  </span>
                ))}
              </pre>
            </div>
          )}

          {step === 2 && (
            <div className="pl-scene pl-scene-gate">
              <p className="pl-file">Gardien de clôture — personne ne « finit » sans passer là</p>
              <Gauge label="Intention — la bonne tâche ?" value={100} ok show={phase1} />
              <Gauge
                label="Goût — 7 lentilles, ancré sur le goût appris"
                value={gout}
                ok={goutOk}
                show={phase2}
                detail={
                  phaseRelance && !phase3
                    ? "↻ relance 1/3 — correctifs appliqués sur 2 fichiers…"
                    : undefined
                }
              />
              {phase4 && (
                <div className="pl-checks">
                  <span className="pl-ok">✓ QA WCAG — 0 écart mesuré</span>
                  <span className="pl-ok">✓ teste_parcours — 0 erreur console</span>
                  <span className="pl-ok">✓ vraies images — 0 placeholder</span>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="pl-scene pl-scene-app">
              <div className="pl-mini-window">
                <div className="pl-mini-chrome">
                  <span className="pl-mini-url">localhost:5174 — maison-onyx</span>
                </div>
                <img
                  src="/assets/onyx-viewport.png"
                  alt="Capture réelle de l’app maison-onyx générée par MangoOS"
                  loading="lazy"
                />
              </div>
              <p className="pl-delivered">
                Livrée. Notée <strong>5/5</strong> en revue — vraie app, vraie capture.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="pl-progress" aria-hidden="true">
        <div
          className="pl-progress-fill"
          style={{ width: `${((step + t) / 4) * 100}%` }}
        />
      </div>
    </div>
  );
}
