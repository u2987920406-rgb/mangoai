// Composer du chat (saisie, pièces jointes, actions, micro, envoi/stop) —
// extrait de Chat.jsx (Phase C2). Présentationnel : l'état vit dans Chat.jsx ;
// les props sont regroupées par domaine pour garder une signature lisible.
import { ArrowUp, BrainCircuit, Eye, FileCode, FolderOpen, Mic, MicOff, Paperclip, Scan, Square, X } from "lucide-react";
import AttachmentThumb from "./AttachmentThumb.jsx";
import SkillAutocomplete from "./SkillAutocomplete.jsx";
import ChatActions from "./ChatActions.jsx";

export default function ChatComposer({
  // saisie
  input, setInput, inputRef, autoGrow, placeholder,
  // envoi / arrêt
  busy, working, externalBusy, canSend, onSend, onStop,
  // skills « /slug » (#174)
  skill, // { menuOpen, suggestions, activeIndex, setActiveIndex, complete, dismiss }
  // pièces jointes + fichier de contexte
  files, // { attachments, removeAttachment, addFiles, fileRef, contextFile, clearContextFile, picker, setPicker, pickerRef, list, search, setSearch, pickContextFile }
  // actions Construire/Planifier/Discuter + modèle par action
  actions, // { activeAction, actionModels, modelMenuFor, pickAction, setModelMenuFor, setActionModel }
  // extras : snap (capture de zone) · coach design · micro Whisper
  snap, // { start, busy }
  onCoach, coachDisabled,
  mic, // { toggle, listening, transcribing }
}) {
  return (
    <div className="border-t border-edge p-3">
      <div
        className="relative rounded-2xl border border-edge bg-bg p-2 focus-within:border-accent/60 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          files.addFiles(e.dataTransfer.files);
        }}
      >
        {/* #174 — Autocomplete des skills : s'ouvre tant qu'un /slug est en cours de frappe. */}
        {skill.menuOpen && (
          <SkillAutocomplete
            suggestions={skill.suggestions}
            activeIndex={skill.activeIndex}
            onHover={skill.setActiveIndex}
            onPick={skill.complete}
          />
        )}
        {files.contextFile && (
          <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
              <FileCode size={10} className="shrink-0" />
              <span className="max-w-52 truncate font-mono">{files.contextFile}</span>
              <button onClick={files.clearContextFile} className="text-accent/60 hover:text-accent transition-colors">
                <X size={11} />
              </button>
            </span>
          </div>
        )}
        {files.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
            {files.attachments.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2 py-1 text-xs text-dim"
              >
                <AttachmentThumb file={f} />
                <span className="max-w-40 truncate">{f.name}</span>
                <button
                  onClick={() => files.removeAttachment(i)}
                  className="text-faint hover:text-err transition-colors"
                  title="Retirer"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <ChatActions
          activeAction={actions.activeAction}
          actionModels={actions.actionModels}
          modelMenuFor={actions.modelMenuFor}
          onPickAction={actions.pickAction}
          onToggleModelMenu={actions.setModelMenuFor}
          onSetModel={actions.setActionModel}
          eleveLabel={actions.eleveLabel}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-end gap-1.5 pl-1.5">
            <button
              onClick={() => files.fileRef.current?.click()}
              disabled={busy}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-faint hover:text-ink disabled:opacity-30 transition-colors"
              title="Joindre une image ou un PDF (ou colle/glisse-le ici)"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={files.fileRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.zip,.rar"
              className="hidden"
              onChange={(e) => {
                files.addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              onClick={snap.start}
              disabled={busy || snap.busy}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                snap.busy ? "animate-pulse text-accent" : "text-faint hover:text-ink"
              }`}
              title="Snap : capturer une zone de l'aperçu"
            >
              <Scan size={16} />
            </button>
            <button
              onClick={onCoach}
              disabled={busy || coachDisabled}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-faint transition-colors hover:text-accent-soft disabled:opacity-30"
              title="Coach design — l'œil critique le rendu et fait corriger jusqu'au seuil de qualité"
            >
              <Eye size={16} />
            </button>
            <div className="relative" ref={files.pickerRef}>
              <button
                onClick={() => { files.setPicker((v) => !v); files.setSearch(""); }}
                disabled={busy}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  files.contextFile ? "text-accent" : "text-faint hover:text-ink"
                }`}
                title="Cibler un fichier du projet comme contexte"
              >
                <FolderOpen size={16} />
              </button>
              {files.picker && (
                <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-edge bg-panel shadow-xl shadow-black/30 z-50">
                  <div className="p-2 border-b border-edge">
                    <input
                      autoFocus
                      value={files.search}
                      onChange={(e) => files.setSearch(e.target.value)}
                      placeholder="Rechercher un fichier…"
                      className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <ul className="nice-scroll max-h-52 overflow-y-auto p-1">
                    {files.list
                      .filter((f) => !files.search || f.toLowerCase().includes(files.search.toLowerCase()))
                      .map((f) => (
                        <li key={f}>
                          <button
                            onClick={() => files.pickContextFile(f)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                              files.contextFile === f
                                ? "bg-accent/15 text-accent"
                                : "text-dim hover:bg-edge-soft hover:text-ink"
                            }`}
                          >
                            <FileCode size={12} className="shrink-0 text-faint" />
                            <span className="truncate font-mono">{f}</span>
                          </button>
                        </li>
                      ))}
                    {files.list.length === 0 && (
                      <li className="px-2.5 py-3 text-center text-xs text-faint">Aucun fichier trouvé</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <textarea
              ref={inputRef}
              data-tour="composer"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={autoGrow}
              onPaste={(e) => {
                const pasted = [...e.clipboardData.items]
                  .filter((it) => it.kind === "file")
                  .map((it) => it.getAsFile())
                  .filter(Boolean);
                if (pasted.length > 0) {
                  e.preventDefault();
                  files.addFiles(pasted);
                }
              }}
              onKeyDown={(e) => {
                // #174 — Navigation de l'autocomplete /slug (prioritaire sur l'envoi).
                if (skill.menuOpen) {
                  if (e.key === "ArrowDown") { e.preventDefault(); skill.setActiveIndex((i) => (i + 1) % skill.suggestions.length); return; }
                  if (e.key === "ArrowUp")   { e.preventDefault(); skill.setActiveIndex((i) => (i - 1 + skill.suggestions.length) % skill.suggestions.length); return; }
                  if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); skill.complete(skill.suggestions[skill.activeIndex]); return; }
                  if (e.key === "Escape")    { e.preventDefault(); skill.dismiss(); return; }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={placeholder}
              rows={1}
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed placeholder:text-faint focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-1.5 pr-1.5">
            <button
              onClick={mic.toggle}
              disabled={busy || mic.transcribing}
              data-tour="mic"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                mic.listening ? "animate-pulse text-err" : mic.transcribing ? "animate-pulse text-accent" : "text-faint hover:text-ink"
              }`}
              title={mic.listening ? "Arrêter l'enregistrement" : mic.transcribing ? "Transcription Whisper…" : "Dicter (Whisper local)"}
            >
              {mic.listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            {busy ? (
              <button
                onClick={onStop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-err/90 text-white hover:bg-err transition-colors"
                title="Arrêter l'agent (le travail déjà fait est conservé)"
              >
                <Square size={14} fill="currentColor" />
              </button>
            ) : externalBusy ? (
              // Agent occupé AILLEURS (pas notre tour) : on signale clairement
              // l'attente plutôt qu'un envoi voué au 409. Cliquable quand même
              // (le 409 est désormais doux + le texte est conservé).
              <button
                onClick={onSend}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-accent-soft transition-colors"
                title="L'agent travaille (occupé) — patiente la fin avant d'envoyer"
              >
                <BrainCircuit size={16} className="animate-pulse" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-soft disabled:opacity-30 transition"
                title="Envoyer (Entrée)"
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
