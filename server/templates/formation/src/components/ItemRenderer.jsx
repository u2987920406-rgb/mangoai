// Starter `formation` (#181 É2) — ItemRenderer EXTENSIBLE (registre, pas un
// switch fermé). Un futur run agentique (É3, PAS le scope d'É2) peut AJOUTER
// un type d'item spécifique à un domaine (ex. "code-exec" pour TypeScript,
// "audio-repeat" pour une langue) en appelant `registerItemRenderer` — sans
// toucher à ce fichier ni casser les 5 types universels déjà câblés.
import { useState } from "react";

// registre : type d'item -> composant React qui reçoit { item, onAnswer, now }
const registry = new Map();

/** Enregistre (ou remplace) le renderer d'un type d'item. */
export function registerItemRenderer(type, Component) {
  registry.set(type, Component);
}

/** Composant enregistré pour un type, ou undefined si aucun. */
export function getItemRenderer(type) {
  return registry.get(type);
}

/**
 * Rend un `Item` selon son type. `onAnswer(correct: boolean)` est appelé une
 * fois la réponse de l'apprenant connue (correct/incorrect, ou "vu" pour une
 * leçon — cf. LeconRenderer). `now` (Date) est injecté par l'appelant, jamais
 * lu ici (pattern deps-injectées du moteur, cf. lib/engine.ts).
 */
export default function ItemRenderer({ item, onAnswer, now }) {
  const Component = getItemRenderer(item.type);
  if (!Component) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-800">
        Type d'item inconnu : <code>{item.type}</code>. Aucun renderer enregistré
        pour ce type — un run agentique peut en ajouter un via
        <code> registerItemRenderer</code>.
      </div>
    );
  }
  return <Component item={item} onAnswer={onAnswer} now={now} />;
}

// ---------------------------------------------------------------------------
// QCM
// ---------------------------------------------------------------------------
function QcmRenderer({ item, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const answered = selected !== null;

  function choose(i) {
    if (answered) return;
    setSelected(i);
    onAnswer(i === item.reponse);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xl font-semibold">{item.question}</p>
      <div className="grid gap-2">
        {item.choix.map((c, i) => {
          const isCorrect = answered && i === item.reponse;
          const isWrongPick = answered && i === selected && i !== item.reponse;
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answered}
              className={
                "rounded-xl border px-4 py-3 text-left transition " +
                (isCorrect
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                  : isWrongPick
                    ? "border-rose-400 bg-rose-50 text-rose-800"
                    : "border-slate-200 hover:border-slate-400")
              }
            >
              {c}
            </button>
          );
        })}
      </div>
      {answered && <p className="text-sm text-slate-600">{item.explication}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flashcard
// ---------------------------------------------------------------------------
function FlashcardRenderer({ item, onAnswer }) {
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() => setFlipped((f) => !f)}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center text-lg shadow-sm"
      >
        {flipped ? item.verso : item.recto}
      </button>
      {!done && (
        <div className="flex gap-3">
          <button
            className="rounded-xl bg-rose-100 px-4 py-2 text-rose-700"
            onClick={() => {
              setDone(true);
              onAnswer(false);
            }}
          >
            À revoir
          </button>
          <button
            className="rounded-xl bg-emerald-100 px-4 py-2 text-emerald-700"
            onClick={() => {
              setDone(true);
              onAnswer(true);
            }}
          >
            Je savais
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texte à trous
// ---------------------------------------------------------------------------
function TexteATrousRenderer({ item, onAnswer }) {
  const parts = item.texte.split("___");
  const [values, setValues] = useState(() => item.reponses.map(() => ""));
  const [checked, setChecked] = useState(false);

  function check() {
    setChecked(true);
    const ok = values.every((v, i) => v.trim().toLowerCase() === (item.reponses[i] ?? "").trim().toLowerCase());
    onAnswer(ok);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg leading-relaxed">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && (
              <input
                className="mx-1 w-28 border-b-2 border-slate-400 bg-transparent px-1 text-center focus:border-amber-500 focus:outline-none"
                value={values[i] ?? ""}
                disabled={checked}
                onChange={(e) => setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              />
            )}
          </span>
        ))}
      </p>
      {!checked && (
        <button className="self-start rounded-xl bg-amber-500 px-4 py-2 text-white" onClick={check}>
          Valider
        </button>
      )}
      {checked && (
        <p className="text-sm text-slate-600">Réponses attendues : {item.reponses.join(", ")}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appariement
// ---------------------------------------------------------------------------
function AppariementRenderer({ item, onAnswer }) {
  const [pickedLeft, setPickedLeft] = useState(null);
  const [matched, setMatched] = useState({}); // gauche -> droite choisie
  const [done, setDone] = useState(false);
  const droites = [...item.paires.map((p) => p.droite)];

  function pickRight(droite) {
    if (pickedLeft === null || done) return;
    const next = { ...matched, [pickedLeft]: droite };
    setMatched(next);
    setPickedLeft(null);
    if (Object.keys(next).length === item.paires.length) {
      setDone(true);
      const allCorrect = item.paires.every((p) => next[p.gauche] === p.droite);
      onAnswer(allCorrect);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="flex flex-col gap-2">
        {item.paires.map((p) => (
          <button
            key={p.gauche}
            disabled={done || matched[p.gauche] !== undefined}
            onClick={() => setPickedLeft(p.gauche)}
            className={
              "rounded-xl border px-3 py-2 text-left " +
              (pickedLeft === p.gauche ? "border-amber-500 bg-amber-50" : "border-slate-200") +
              (matched[p.gauche] ? " opacity-50" : "")
            }
          >
            {p.gauche} {matched[p.gauche] ? `→ ${matched[p.gauche]}` : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {droites.map((d) => (
          <button
            key={d}
            disabled={done || Object.values(matched).includes(d)}
            onClick={() => pickRight(d)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-left disabled:opacity-50"
          >
            {d}
          </button>
        ))}
      </div>
      {done && (
        <p className="col-span-2 text-sm text-slate-600">
          {item.paires.every((p) => matched[p.gauche] === p.droite)
            ? "Toutes les paires sont correctes."
            : "Certaines paires sont incorrectes — revois-les en révision."}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leçon — décision D5 : l'apprenant VOIT les sources.
// ---------------------------------------------------------------------------
function LeconRenderer({ item, onAnswer }) {
  const [lu, setLu] = useState(false);
  return (
    <article className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">{item.titre}</h2>
      <div className="whitespace-pre-line text-base leading-relaxed text-slate-700">{item.contenu}</div>
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        <p className="mb-1 font-semibold text-slate-600">Sources</p>
        <ul className="list-inside list-disc">
          {item.sources.map((s, i) => (
            <li key={i}>
              <a href={s} target="_blank" rel="noopener noreferrer" className="underline">
                {s}
              </a>
            </li>
          ))}
        </ul>
      </div>
      {!lu && (
        <button
          className="self-start rounded-xl bg-amber-500 px-4 py-2 text-white"
          onClick={() => {
            setLu(true);
            onAnswer(true);
          }}
        >
          J'ai lu, continuer
        </button>
      )}
    </article>
  );
}

registerItemRenderer("qcm", QcmRenderer);
registerItemRenderer("flashcard", FlashcardRenderer);
registerItemRenderer("texte-a-trous", TexteATrousRenderer);
registerItemRenderer("appariement", AppariementRenderer);
registerItemRenderer("lecon", LeconRenderer);
