import { Loader2, Mic, Paperclip, Send, X } from "lucide-react";
import QuickModelPicker from "../QuickModelPicker.jsx";
import ModelBadge from "./ModelBadge.jsx";
import HamburgerMenu from "./HamburgerMenu.jsx";

// Mode idle — layout centré (logo + fenêtre de chat de départ). Extrait de
// Home.jsx sans changement de comportement (Phase C, découpage du monolithe).
export default function IdleScreen({
  onOpenWindow,
  onOpenAppBuilder,
  onOpenLauncher,
  inputRef,
  conversations,
  onLoadConversation,
  onDeleteConversation,
  attachments,
  removeAttachment,
  attachNote,
  onClearNote,
  input,
  setInput,
  handleKey,
  addFiles,
  thinking,
  welcomeFileRef,
  model,
  handleFixedModel,
  handleOpenModelExtra,
  quickBrain,
  sendMessage,
  quickPickerOpen,
  setQuickPickerOpen,
  setQuickBrain,
}) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-bg">
      <HamburgerMenu
        onOpenWindow={onOpenWindow}
        onOpenAppBuilder={onOpenAppBuilder}
        onOpenLauncher={onOpenLauncher}
        inputRef={inputRef}
        conversations={conversations}
        onLoadConversation={onLoadConversation}
        onDeleteConversation={onDeleteConversation}
      />

      {/* Dégradé radial central */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65% 65% at 50% 45%, rgba(124,92,255,0.13) 0%, rgba(11,13,18,0) 72%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-8 px-6">

        {/* ── Logo MangoOS ── */}
        <div className="flex flex-col items-center">
          <img
            src="/mango-logo.png"
            alt="MangoOS"
            className="h-24 w-auto select-none object-contain"
            style={{ filter: "drop-shadow(0 4px 24px rgba(124,92,255,0.25))" }}
          />
        </div>

        {/* ── Fenêtre de chat ── */}
        <div
          className="w-full overflow-hidden rounded-2xl border border-accent/20 bg-panel/70
                     shadow-2xl shadow-accent/8 backdrop-blur-xl"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        >
          {/* Pièces jointes */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-3">
              {attachments.map((a, i) => (
                <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent-soft">
                  <Paperclip size={11} className="shrink-0" />
                  <span className="max-w-44 truncate font-mono">{a.name}</span>
                  <button onClick={() => removeAttachment(i)} title="Retirer" className="text-accent-soft/60 hover:text-err transition-colors">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Hint honnête : un binaire/archive a été refusé ici → diriger vers un projet */}
          {attachNote && (
            <div className="mx-4 mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <span className="flex-1">{attachNote}</span>
              <button onClick={onClearNote} title="OK" className="shrink-0 text-warn/60 hover:text-warn transition-colors">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Textarea principale — PAS de disabled={thinking} : un champ désactivé perd
              automatiquement le focus (forcé par le navigateur), ce qui cassait la
              fluidité (retour à <body>, il fallait re-cliquer pour continuer à taper).
              Le bouton Envoyer reste lui bien désactivé pendant thinking (anti double-envoi). */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onPaste={(e) => {
              const files = [...e.clipboardData.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
              if (files.length > 0) { e.preventDefault(); addFiles(files); }
            }}
            placeholder="Comment vas-tu ? Ça fait plaisir de te revoir…"
            rows={5}
            className="w-full resize-none bg-transparent px-5 py-5 text-[16px] text-ink
                       placeholder:text-faint/50 focus:outline-none disabled:opacity-60
                       leading-relaxed"
            autoFocus
          />

          {/* Barre du bas : trombone + modèle à gauche, micro + envoi à droite */}
          <div className="flex items-center justify-between border-t border-edge/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => welcomeFileRef.current?.click()}
                title="Joindre un fichier (texte, code, .md…)"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge/70 bg-panel/60 text-dim hover:text-accent-soft transition-colors"
              >
                <Paperclip size={15} />
              </button>
              <input
                ref={welcomeFileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
              <span className="h-2 w-2 animate-pulse rounded-full bg-ok" />
              <ModelBadge
                model={model}
                onModel={handleFixedModel}
                openUp
                onOpenSettings={handleOpenModelExtra}
                overrideLabel={quickBrain?.label}
              />
            </div>
            <div className="flex items-center">
              <button
                title="Wispr Flow — dictée vocale (activer Wispr Flow dans Windows Terminal)"
                className="flex h-9 w-9 items-center justify-center rounded-l-xl
                           border border-r-0 border-edge/70 bg-panel/60 text-dim
                           hover:text-accent-soft transition-colors"
              >
                <Mic size={15} />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={sendMessage}
                disabled={(!input.trim() && attachments.length === 0) || thinking}
                className="flex h-9 w-9 items-center justify-center rounded-r-xl
                           bg-accent text-white shadow-md shadow-accent/30
                           hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {thinking ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-faint">
          Entrée pour envoyer · <span className="opacity-60">Shift+Entrée pour sauter une ligne</span>
        </p>
      </div>
      <QuickModelPicker
        open={quickPickerOpen}
        onClose={() => setQuickPickerOpen(false)}
        onPicked={setQuickBrain}
      />
    </div>
  );
}
