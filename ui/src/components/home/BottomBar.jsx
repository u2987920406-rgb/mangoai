import { useRef } from "react";
import { Loader2, Mic, Paperclip, Send, X } from "lucide-react";
import ModelBadge from "./ModelBadge.jsx";

// Barre de saisie (mode chat) — extrait verbatim de Home.jsx.
export default function BottomBar({ input, setInput, onSubmit, thinking, model, onModel, mode, onMode, template, onTemplate, inputRef, attachments = [], onAddFiles = () => {}, onRemoveAttachment = () => {}, attachNote = "", onClearNote = () => {}, onOpenSettings, overrideLabel }) {
  const fileRef = useRef(null);
  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }
  return (
    <div
      className="rounded-2xl border border-accent/20 bg-panel/70 shadow-2xl shadow-accent/8 backdrop-blur-xl"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onAddFiles(e.dataTransfer.files); }}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {attachments.map((a, i) => (
            <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent-soft">
              <Paperclip size={11} className="shrink-0" />
              <span className="max-w-44 truncate font-mono">{a.name}</span>
              <button onClick={() => onRemoveAttachment(i)} title="Retirer" className="text-accent-soft/60 hover:text-err transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {attachNote && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
          <span className="flex-1">{attachNote}</span>
          <button onClick={onClearNote} title="OK" className="shrink-0 text-warn/60 hover:text-warn transition-colors">
            <X size={12} />
          </button>
        </div>
      )}
      {/* PAS de disabled={thinking} — un champ désactivé perd automatiquement le focus
          (forcé par le navigateur), ce qui cassait la fluidité (retour à <body>, il
          fallait re-cliquer pour continuer à taper pendant que l'agent répond). Le
          bouton Envoyer reste désactivé pendant thinking (anti double-envoi), ça suffit. */}
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onPaste={(e) => {
          const files = [...e.clipboardData.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
          if (files.length > 0) { e.preventDefault(); onAddFiles(files); }
        }}
        placeholder="Écrire un message… (ou glisse/joins un fichier 📎)"
        rows={2}
        className="w-full resize-none bg-transparent px-5 py-4 text-[16px] text-ink
                   placeholder:text-faint/50 focus:outline-none disabled:opacity-60 leading-relaxed"
        autoFocus
      />
      <div className="flex items-center justify-between border-t border-edge/50 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fileRef.current?.click()}
            title="Joindre un fichier (texte, code, .md…)"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge/70 bg-panel/60 text-dim hover:text-accent-soft transition-colors"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { onAddFiles(e.target.files); e.target.value = ""; }}
          />
          <ModelBadge model={model} onModel={onModel} openUp onOpenSettings={onOpenSettings} overrideLabel={overrideLabel} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <button
              title="Wispr Flow — dictée vocale"
              className="flex h-9 w-9 items-center justify-center rounded-l-xl
                         border border-r-0 border-edge/70 bg-panel/60 text-dim
                         hover:text-accent-soft transition-colors"
            >
              <Mic size={15} />
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onSubmit}
              disabled={(!input.trim() && attachments.length === 0) || thinking}
              className="flex h-9 w-9 items-center justify-center rounded-r-xl
                         bg-accent text-white shadow-md shadow-accent/30
                         hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {thinking ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
