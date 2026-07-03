// Message du chat (tous rôles) — extrait de Chat.jsx (Phase C2).
// memo() : un message ne re-rend que si ses propres props changent. Couplé au
// callback onFeedback stable (useCallback côté Chat) et à des objets `m`
// référentiellement stables, taper dans la chatbox ne re-rend plus l'historique
// — c'est ce qui rendait l'édition et le micro laggy sur les longues sessions.
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bookmark, BrainCircuit, RotateCcw, Sparkles } from "lucide-react";
import { stripQuestionMarkers } from "./helpers.js";
import EscalationCard from "./EscalationCard.jsx";
import DiffSlider from "../DiffSlider.jsx";

export const Message = memo(function Message({ m, showThinking = true, onFeedback, onReuse }) {
  const [voted, setVoted] = useState(null); // "like" | "dislike" | null

  function handleVote(rating) {
    if (voted) return;
    setVoted(rating);
    onFeedback?.(rating, m.text);
  }

  switch (m.role) {
    case "user":
      return (
        <div className="animate-fade-up group flex max-w-[85%] flex-col items-end gap-1 self-end">
          <div className="rounded-2xl rounded-br-md bg-bubble px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
            {m.text}
          </div>
          {onReuse && m.text?.trim() && (
            <button
              onClick={() => onReuse(m.text)}
              className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] text-faint transition-colors hover:bg-edge-soft hover:text-ink"
              title="Recopier ce message dans la barre de saisie pour le modifier et le renvoyer (sans envoi automatique)"
            >
              <RotateCcw size={11} />
              Relancer
            </button>
          )}
        </div>
      );
    case "agent":
      return (
        <div className="animate-fade-up max-w-[95%] self-start">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-soft">
            <Sparkles size={12} />
            MangoOS
          </div>
          <div className="md rounded-2xl rounded-tl-md border border-accent/15 bg-accent/[0.06] px-3.5 py-2.5 text-sm leading-relaxed break-words">
            <ReactMarkdown>{stripQuestionMarkers(m.text)}</ReactMarkdown>
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <button
              onClick={() => handleVote("like")}
              disabled={!!voted}
              className={`rounded-lg px-2 py-0.5 text-xs transition-colors disabled:cursor-default ${
                voted === "like"
                  ? "bg-green-500/20 text-green-500"
                  : voted
                  ? "text-faint opacity-30"
                  : "text-faint hover:text-green-500 hover:bg-green-500/10"
              }`}
              title="J'aime — enregistre ce pattern"
            >
              👍
            </button>
            <button
              onClick={() => handleVote("dislike")}
              disabled={!!voted}
              className={`rounded-lg px-2 py-0.5 text-xs transition-colors disabled:cursor-default ${
                voted === "dislike"
                  ? "bg-err/20 text-err"
                  : voted
                  ? "text-faint opacity-30"
                  : "text-faint hover:text-err hover:bg-err/10"
              }`}
              title="Je n'aime pas — éviter ce pattern"
            >
              👎
            </button>
            {voted && (
              <span className="text-[10px] text-faint">
                {voted === "like" ? "Pattern enregistré ✓" : "Pattern évité ✓"}
              </span>
            )}
          </div>
        </div>
      );
    case "escalation":
      return <EscalationCard projectName={m.projectName} />;
    case "thinking":
      if (!showThinking) return null;
      return (
        <details className="animate-fade-up max-w-[95%] self-start">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 text-xs font-medium text-faint transition-colors hover:text-dim">
            <BrainCircuit size={12} />
            Réflexion
          </summary>
          <div className="mt-1 rounded-xl border border-edge-soft bg-panel px-3.5 py-2.5 text-xs leading-relaxed text-dim whitespace-pre-wrap break-words">
            {m.text}
          </div>
        </details>
      );
    case "version":
      return (
        <div className="animate-fade-up flex items-center gap-1.5 self-start px-1 font-mono text-xs text-ok/80">
          <Bookmark size={11} />
          {m.text}
        </div>
      );
    case "diff":
      return <DiffSlider before={m.before} after={m.after} />;
    case "error":
      return (
        <div className="animate-fade-up self-stretch rounded-xl border border-err/50 bg-err/10 px-3.5 py-2.5 text-sm text-err whitespace-pre-wrap break-words">
          {m.text}
        </div>
      );
    case "critique": {
      const c = m.critique || {};
      const lenses = c.lenses || [];
      const tone = (s) => (s >= 85 ? "text-sys-green" : s >= 70 ? "text-accent-soft" : "text-sys-red");
      return (
        <div className="animate-fade-up self-stretch rounded-xl border border-edge bg-panel/70 px-3.5 py-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-ink">👁 {m.round === 0 ? "Critique initiale" : `Après le tour ${m.round}`}</span>
            <span className={`ml-auto text-lg font-bold ${tone(c.overall)}`}>{c.overall}<span className="text-xs text-faint">/100</span></span>
          </div>
          <div className="flex flex-col gap-1">
            {lenses.map((l, i) => (
              <div key={i} className="flex items-baseline gap-2 text-[11.5px]">
                <span className={`w-7 shrink-0 text-right font-semibold ${tone(l.score)}`}>{l.score}</span>
                <span className="w-32 shrink-0 truncate text-dim">{l.name}</span>
                <span className="truncate text-faint" title={`${l.issue}${l.fix ? " → " + l.fix : ""}`}>{l.issue}{l.fix ? ` → ${l.fix}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "coach-done": {
      const delta = (m.after ?? 0) - (m.before ?? 0);
      return (
        <div className="animate-fade-up self-stretch rounded-xl border border-accent/40 bg-accent/[0.07] px-3.5 py-2.5 text-sm">
          <span className="font-semibold text-ink">Coach design terminé</span>{" "}
          <span className="text-dim">— {m.before} → <span className="font-bold text-sys-green">{m.after}</span>/100{delta > 0 ? ` (+${delta})` : ""} en {m.rounds} tour{m.rounds > 1 ? "s" : ""} · {m.reason}</span>
        </div>
      );
    }
    case "status":
    default:
      return (
        <div className="animate-fade-up self-start px-1 font-mono text-xs text-faint">
          {m.text}
        </div>
      );
  }
});
