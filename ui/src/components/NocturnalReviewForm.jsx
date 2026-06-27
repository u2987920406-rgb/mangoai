import { useState } from "react";
import { Check, ClipboardCheck } from "lucide-react";

// Questionnaire de review d'un projet → axiomes (#58/#59, refondu en QCM 2026-06-27).
// Demande de Raf : un QCM GRADUÉ (plusieurs niveaux par dimension) au lieu de cases
// oui/non, pour juger vite et finement TOUTES les facettes (code, interface, icônes,
// typo, couleurs, UX, animations, images…) + un commentaire libre dessous.
//
// Source UNIQUE des questions + de l'échelle + du rendu (ReviewQuestions), réutilisée
// par le formulaire du Chat ET la galerie nocturne. Le backend (reviewToAxioms) lit
// `answers` (clé → niveau) tel quel → ajouter/retirer une dimension ne touche pas le serveur.

// Échelle gradué (QCM) : un clic suffit. Re-cliquer désélectionne (réponse optionnelle).
export const REVIEW_SCALE = [
  { value: "adore", emoji: "❤️", label: "Adoré" },
  { value: "bien", emoji: "👍", label: "Bien" },
  { value: "moyen", emoji: "😐", label: "Moyen" },
  { value: "rate", emoji: "👎", label: "Raté" },
];

// Les dimensions jugées. Couvre le code ET tout le visuel/UX cité par Raf.
export const REVIEW_QUESTIONS = [
  { key: "code", label: "Code (propreté, structure)" },
  { key: "interface", label: "Interface & mise en page" },
  { key: "iconographie", label: "Iconographie (icônes, pictos)" },
  { key: "typographie", label: "Typographie (polices, hiérarchie)" },
  { key: "couleurs", label: "Palette de couleurs" },
  { key: "ergonomie", label: "Ergonomie & navigation (UX)" },
  { key: "animations", label: "Micro-interactions & animations" },
  { key: "images", label: "Images & visuels (vraies images)" },
  { key: "fonctionnel", label: "Fonctionnel & complet" },
  { key: "originalite", label: "Originalité" },
  { key: "coherence", label: "Fidèle à mon goût" },
];

function pillClass(value, active) {
  if (!active) return "border-edge/60 text-faint hover:text-dim hover:border-edge";
  return value === "adore" ? "border-ok/50 bg-ok/15 text-ok"
    : value === "bien" ? "border-accent/50 bg-accent/15 text-accent-soft"
    : value === "moyen" ? "border-warn/50 bg-warn/15 text-warn"
    : "border-err/50 bg-err/15 text-err";
}

/** QCM partagé : pour chaque dimension, 4 niveaux cliquables (toggle). PURE présentation. */
export function ReviewQuestions({ answers = {}, onChange = () => {} }) {
  return (
    <div className="flex flex-col gap-1">
      {REVIEW_QUESTIONS.map((q) => (
        <div key={q.key} className="flex items-center justify-between gap-2">
          <span className="flex-1 text-xs text-dim">{q.label}</span>
          <div className="flex shrink-0 gap-0.5">
            {REVIEW_SCALE.map((s) => {
              const active = answers[q.key] === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  title={s.label}
                  onClick={() => onChange(q.key, active ? undefined : s.value)}
                  className={`rounded-md border px-1.5 py-0.5 text-xs leading-none transition-colors ${pillClass(s.value, active)}`}
                >
                  {s.emoji}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Met à jour une réponse (undefined = désélection → on retire la clé). */
export function setAnswer(answers, key, value) {
  const next = { ...answers };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export default function NocturnalReviewForm({ id, onReviewed = () => {}, onToast = () => {} }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ answers: {}, comment: "" });

  async function submit() {
    if (sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/nocturnal/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDone(true);
      onReviewed();
      onToast("success", "Review enregistrée → MangoOS apprend");
    } catch {
      onToast("error", "Échec de l'enregistrement de la review");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="self-start flex items-center gap-1.5 rounded-lg border border-ok/40 bg-ok/10 px-2.5 py-1 text-xs text-ok">
        <Check size={12} /> Reviewé → MangoOS a appris
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/[0.06] px-2.5 py-1 text-xs text-accent-soft hover:bg-accent/[0.12] transition-colors"
      >
        <ClipboardCheck size={12} /> Reviewer ce projet
      </button>
    );
  }

  return (
    <div className="self-stretch flex flex-col gap-2 rounded-xl border border-accent/20 bg-accent/[0.04] p-3">
      <p className="text-xs font-semibold text-accent-soft">Review → axiomes · ❤️ adoré · 👍 bien · 😐 moyen · 👎 raté</p>
      <ReviewQuestions
        answers={form.answers}
        onChange={(key, value) => setForm((f) => ({ ...f, answers: setAnswer(f.answers, key, value) }))}
      />
      <textarea
        value={form.comment}
        onChange={(ev) => setForm((f) => ({ ...f, comment: ev.target.value }))}
        placeholder="Un commentaire (optionnel) — détails sur ce que tu as aimé / pas aimé…"
        rows={2}
        className="resize-none rounded-md border border-edge bg-bg px-2 py-1 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <button
        onClick={submit}
        disabled={sending}
        className="self-start flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-soft disabled:opacity-50 transition-colors"
      >
        <Check size={13} /> {sending ? "…" : "Valider → MangoOS apprend"}
      </button>
    </div>
  );
}
