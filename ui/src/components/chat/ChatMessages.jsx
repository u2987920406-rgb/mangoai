// Liste des messages du chat + boxes de décision — extraite de Chat.jsx (Phase C2).
// Présentationnel : tout l'état reste dans Chat.jsx (orchestrateur), qui passe des callbacks.
import { BrainCircuit, Sparkles } from "lucide-react";
import ToolGroup from "../ToolGroup.jsx";
import NocturnalReviewForm from "../NocturnalReviewForm.jsx";
import { Message } from "./Message.jsx";
import WireframeForkPicker from "./WireframeForkPicker.jsx";

export default function ChatMessages({
  listRef,
  grouped,
  empty,
  busy,
  working,
  showThinking,
  onFeedback,
  onReuse,
  nocturnalEntry,
  onToast,
  onReviewed,
  question,
  onAnswer,
  awaitingPlanConfirm,
  onConfirmPlan,
  awaitingApply,
  onApplyFix,
  wireframeFork,
  onChooseWireframe,
}) {
  return (
    <div ref={listRef} className="nice-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
      {empty && (
        <div className="m-auto flex flex-col items-center gap-3 text-center text-dim">
          <Sparkles size={28} className="text-accent-soft" />
          <p className="leading-relaxed">
            Décris ce que tu veux construire,
            <br />
            MangoOS s'occupe du code.
          </p>
        </div>
      )}
      {grouped.map((g) =>
        g.kind === "tools" ? (
          <ToolGroup key={g.key} items={g.items} busy={busy && g.isLast} />
        ) : (
          <Message
            key={g.key}
            m={g.message}
            showThinking={showThinking}
            onFeedback={onFeedback}
            onReuse={onReuse}
          />
        ),
      )}
      {/* Projet généré la nuit : reviewer directement sous le prompt (#58/#59). */}
      {nocturnalEntry && !nocturnalEntry.reviewed && !busy && (
        <NocturnalReviewForm id={nocturnalEntry.id} onToast={onToast} onReviewed={onReviewed} />
      )}
      {/* Réponse guidée émise par l'agent : Oui/Non ([OUI/NON]) ou box de choix ([[OPTIONS]]). */}
      {question.kind === "yesno" && (
        <div className="flex items-center justify-center gap-2 py-3">
          <span className="text-xs text-faint">Ta réponse&nbsp;:</span>
          <button
            onClick={() => onAnswer("Oui")}
            className="flex items-center gap-1.5 rounded-xl bg-ok/90 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-ok"
          >
            ✓ Oui
            <kbd className="ml-0.5 rounded bg-white/20 px-1 text-[10px] font-bold">Y</kbd>
          </button>
          <button
            onClick={() => onAnswer("Non")}
            className="flex items-center gap-1.5 rounded-xl bg-err/90 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-err"
          >
            ✕ Non
            <kbd className="ml-0.5 rounded bg-white/20 px-1 text-[10px] font-bold">N</kbd>
          </button>
        </div>
      )}
      {question.kind === "options" && (
        <div className="animate-fade-up w-full max-w-[95%] self-start rounded-2xl border border-accent/25 bg-accent/[0.04] p-2.5">
          <div className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-accent-soft">
            CHOISIS UNE RÉPONSE
          </div>
          <div className="flex flex-col gap-1.5">
            {question.options.map((o, i) => (
              <button
                key={i}
                onClick={() => onAnswer(o.label)}
                className="group flex items-start gap-2.5 rounded-xl border border-edge bg-bg px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent/[0.07]"
              >
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-edge-soft text-[11px] font-bold text-faint transition-colors group-hover:bg-accent/20 group-hover:text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{o.label}</span>
                  {o.description && <span className="mt-0.5 block text-xs leading-snug text-faint">{o.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {wireframeFork && !busy && (
        <WireframeForkPicker variants={wireframeFork.variants} onChoose={onChooseWireframe} />
      )}
      {awaitingPlanConfirm && !busy && (
        <div className="flex justify-center py-3">
          <button
            onClick={onConfirmPlan}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-accent/90"
          >
            <Sparkles size={14} />
            Confirmer et construire
          </button>
        </div>
      )}
      {awaitingApply && !busy && (
        <div className="flex justify-center py-3">
          <button
            onClick={onApplyFix}
            className="flex items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-5 py-2.5 text-sm font-semibold text-accent shadow-sm transition-colors hover:bg-accent/20"
            title="Bascule en mode Construire et fait appliquer le correctif diagnostiqué"
          >
            <Sparkles size={14} />
            🛠 Appliquer ce correctif (Construire)
          </button>
        </div>
      )}
      {working && (
        <div className="animate-fade-up flex items-center gap-2 self-start rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-1.5">
          <BrainCircuit size={15} className="animate-pulse text-accent-soft" />
          <span className="shimmer-text text-[13px] font-semibold">
            {busy ? "MangoOS réfléchit…" : "L'agent travaille (occupé) — patiente avant d'envoyer"}
          </span>
        </div>
      )}
    </div>
  );
}
