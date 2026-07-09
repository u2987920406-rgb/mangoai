import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, FolderOpen, Loader2, Mic, Paperclip, Send, X } from "lucide-react";
import QuickModelPicker from "./QuickModelPicker.jsx";
import { MODELS } from "./home/helpers.js";
import ModelBadge from "./home/ModelBadge.jsx";
import HamburgerMenu from "./home/HamburgerMenu.jsx";
import UserBubble from "./home/UserBubble.jsx";
import AssistantBubble from "./home/AssistantBubble.jsx";
import ThinkingIndicator from "./home/ThinkingIndicator.jsx";
import BottomBar from "./home/BottomBar.jsx";

/* ── Page d'accueil ──────────────────────────────────────────────────────── */
export default function Home({ onOpen, onOpenWindow, onOpenAppBuilder, onOpenLauncher, onOpenSettings, model = "sonnet", onModel }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState(
    () => localStorage.getItem("mangoos.mode") ?? "elite"
  );
  const [template, setTemplate] = useState(null);
  const [conversations, setConversations] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mangoos.conversations") ?? "[]"); }
    catch { return []; }
  });
  const [currentId, setCurrentId] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{ name, path }] — uploadées au brouillon disque
  const [attachNote, setAttachNote] = useState(""); // hint (pièce refusée)
  const [graduateOpen, setGraduateOpen] = useState(false); // proposition/formulaire « ouvrir dans l'atelier »
  const [graduateName, setGraduateName] = useState("");
  const [gradBusy, setGradBusy] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const welcomeFileRef = useRef(null);
  const hasChat = messages.length > 0;
  // #182 D3/É5 suite — sélection rapide d'un cerveau (registre `accueil`, popup
  // QuickModelPicker) STRICTEMENT locale à l'Accueil : jamais écrite dans `model`/
  // `onModel` (partagé avec App.jsx → fuiterait dans l'Atelier, non demandé).
  const [quickBrain, setQuickBrain] = useState(null); // { provider, model, label } | null
  // Priorité au choix rapide pour TOUS les affichages du modèle actif (badge ET
  // indicateur "… réfléchit") — sinon l'indicateur retombe sur l'ancien `model`
  // figé pendant qu'une réponse d'un autre cerveau (ex. Ollama local) est en cours.
  const modelLabel = quickBrain?.label ?? MODELS.find((m) => m.id === model)?.label ?? "MangoOS";
  const [quickModelGateOn, setQuickModelGateOn] = useState(false);
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);

  useEffect(() => {
    fetch("/api/flags/home-quick-model")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setQuickModelGateOn(!!d.enabled))
      .catch(() => setQuickModelGateOn(false)); // fail-open → ancien comportement (bouton Réglages)
  }, []);

  // Choisir un des 4 modèles figés du dropdown existant repasse en mode historique.
  function handleFixedModel(id) {
    setQuickBrain(null);
    onModel?.(id);
  }

  // Bouton « + Connecter un autre modèle… » : ouvre la popup si le gate est actif,
  // sinon comportement d'avant (Réglages).
  function handleOpenModelExtra() {
    if (quickModelGateOn) setQuickPickerOpen(true);
    else onOpenSettings?.();
  }

  // Un id de conversation existe AVANT le 1er upload (le brouillon disque en a besoin).
  function ensureConvId() {
    let id = currentId;
    if (!id) { id = `c${Date.now()}`; setCurrentId(id); }
    return id;
  }

  // Pièces jointes : UPLOADÉES dans le brouillon disque de la conversation (.home/<convId>/.assets)
  // → l'Élève agentique peut les LIRE/extraire (lire_archive, lire_document, Read). Plus d'inlining
  // texte : la home « peut tout faire dès le départ ». Formats/limites = ceux du backend (uploads.ts).
  async function addFiles(fileList) {
    const picked = [...(fileList ?? [])].slice(0, 6);
    if (picked.length === 0) return;
    const id = ensureConvId();
    const loaded = [];
    const rejected = [];
    for (const f of picked) {
      const name = f.name || "fichier";
      try {
        const r = await fetch(
          `/api/home/upload/${encodeURIComponent(id)}?filename=${encodeURIComponent(name)}`,
          { method: "POST", body: f },
        );
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { rejected.push(`${name} — ${d.error ?? `HTTP ${r.status}`}`); continue; }
        loaded.push({ name, path: d.path });
      } catch (e) {
        rejected.push(`${name} — ${e?.message ?? "échec"}`);
      }
    }
    if (loaded.length) { setAttachments((prev) => [...prev, ...loaded].slice(0, 6)); setAttachNote(""); }
    if (rejected.length) {
      setAttachNote(`Pièce(s) refusée(s) : ${rejected.join(" · ")}. (acceptés : images, PDF, Word/Excel/PowerPoint, texte, .zip/.rar — 50 Mo max)`);
    }
  }
  function removeAttachment(i) {
    setAttachments((prev) => prev.filter((_, j) => j !== i));
  }

  // GRADUATION : promeut le brouillon (fichiers + contexte) en vrai projet workspace, puis ouvre
  // l'atelier dessus. Déclenchée par le bouton OU l'acceptation d'une proposition de Mango.
  async function graduate() {
    const id = currentId;
    if (!id || gradBusy) return;
    setGradBusy(true);
    try {
      const r = await fetch("/api/home/graduate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convId: id, name: graduateName.trim() || "Projet Mango", messages }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.name) throw new Error(d.error ?? `HTTP ${r.status}`);
      setGraduateOpen(false);
      onOpen(d.name); // ouvre le workspace sur le projet fraîchement créé
    } catch (e) {
      setAttachNote(`Passage à l'atelier impossible : ${e?.message ?? "erreur"}.`);
    } finally {
      setGradBusy(false);
    }
  }

  useEffect(() => {
    if (hasChat) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking, hasChat]);

  // Enregistre / met à jour une conversation dans le localStorage (max 30 gardées)
  function upsertConversation(id, msgs) {
    const title = (msgs.find((m) => m.role === "user")?.content ?? "Conversation").slice(0, 48);
    setConversations((prev) => {
      const others = prev.filter((c) => c.id !== id);
      const next = [{ id, title, messages: msgs, updatedAt: Date.now() }, ...others].slice(0, 30);
      try { localStorage.setItem("mangoos.conversations", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }

  function loadConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setMessages(conv.messages ?? []);
    setCurrentId(id);
    setInput("");
  }

  function deleteConversation(id) {
    // Nettoie aussi le brouillon disque (fichiers joints) de cette conversation.
    fetch(`/api/home/scratch/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try { localStorage.setItem("mangoos.conversations", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    if (id === currentId) { setMessages([]); setCurrentId(null); setInput(""); setGraduateOpen(false); }
  }

  // Un tour : envoie l'historique à GLM et ajoute sa réponse. Partagé par l'envoi
  // d'un nouveau message ET le « Relancer » (régénération). `history` se termine
  // par le message utilisateur auquel répondre.
  async function runTurn(history, id) {
    setThinking(true);
    try {
      const res = await fetch("/api/home-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model: quickBrain ? "accueil" : model, convId: id }),
      });
      if (!res.ok) {
        const why = res.status === 413 ? "pièce(s) jointe(s) trop volumineuse(s)" : `erreur serveur (HTTP ${res.status})`;
        throw new Error(why);
      }
      const data = await res.json();
      const withAnswer = [...history, { role: "assistant", content: data.text ?? "Erreur de réponse." }];
      setMessages(withAnswer);
      upsertConversation(id, withAnswer);
      // Mango a détecté une intention de CONSTRUIRE → propose de passer à l'atelier (Raf valide).
      if (data.suggestGraduate) setGraduateOpen(true);
    } catch (e) {
      const reason = e?.message ?? "serveur injoignable";
      const withErr = [...history, { role: "assistant", content: `⚠️ Échec — ${reason}. Réessaie, ou réduis/retire les pièces jointes.` }];
      setMessages(withErr);
      upsertConversation(id, withErr);
    } finally {
      setThinking(false);
    }
  }

  async function sendMessage() {
    const val = input.trim();
    if ((!val && attachments.length === 0) || thinking) return;
    const id = ensureConvId();
    // Les fichiers sont déjà uploadés dans le brouillon : on passe leurs CHEMINS, l'Élève
    // agentique les ouvre lui-même (lire_archive / lire_document / Read).
    const fileLine = attachments.length
      ? `[Fichiers joints : ${attachments.map((a) => a.path).join(", ")}]\n\n`
      : "";
    const content = fileLine + (val || "Analyse le(s) fichier(s) joint(s) et dis-moi ce que tu en comprends.");
    const withUser = [...messages, { role: "user", content }];
    setMessages(withUser);
    setInput("");
    setAttachments([]);
    setAttachNote("");
    upsertConversation(id, withUser);
    runTurn(withUser, id);
  }

  // « Relancer » sous un message utilisateur : on coupe la conversation juste
  // après ce message (on jette l'ancienne réponse + la suite) et on régénère.
  function regenerateFrom(i) {
    if (thinking) return;
    const upTo = messages.slice(0, i + 1);
    setMessages(upTo);
    const id = currentId ?? `c${Date.now()}`;
    if (!currentId) setCurrentId(id);
    upsertConversation(id, upTo);
    runTurn(upTo, id);
  }

  // 👍/👎 sous une réponse : enregistre un vrai axiome RLHF (#41) côté serveur.
  // Le chat d'accueil n'a pas de projet → bucket sentinelle « __home__ ». On passe
  // `model` : en mode GLM, le serveur fait extraire l'axiome PAR GLM (souveraineté
  // — le pouce appartient à GLM/Mango, jamais à Claude).
  function homeFeedback(rating, text) {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "__home__", rating, text, model }),
    }).catch(() => {});
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function goIdle() {
    setMessages([]);
    setInput("");
    setCurrentId(null);
  }

  /* ── Mode idle — layout centré ── */
  if (!hasChat) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-bg">
        <HamburgerMenu
        onOpenWindow={onOpenWindow}
        onOpenAppBuilder={onOpenAppBuilder}
        onOpenLauncher={onOpenLauncher}
        inputRef={inputRef}
        conversations={conversations}
        onLoadConversation={loadConversation}
        onDeleteConversation={deleteConversation}
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
                <button onClick={() => setAttachNote("")} title="OK" className="shrink-0 text-warn/60 hover:text-warn transition-colors">
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Textarea principale */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              onPaste={(e) => {
                const files = [...e.clipboardData.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
                if (files.length > 0) { e.preventDefault(); addFiles(files); }
              }}
              disabled={thinking}
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

  /* ── Mode chat — conversation ── */
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <HamburgerMenu
        onOpenWindow={onOpenWindow}
        onOpenAppBuilder={onOpenAppBuilder}
        onOpenLauncher={onOpenLauncher}
        inputRef={inputRef}
        conversations={conversations}
        onLoadConversation={loadConversation}
        onDeleteConversation={deleteConversation}
      />

      {/* Flèche de retour à l'accueil */}
      <button
        onClick={goIdle}
        title="Retour à l'accueil"
        className="absolute left-16 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl
                   border border-edge/60 bg-panel/80 text-dim backdrop-blur
                   hover:border-accent/40 hover:text-ink transition-colors"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Fil de messages */}
      <div className="flex-1 overflow-y-auto nice-scroll px-6 py-10">
        <div className="mx-auto max-w-3xl">
          {/* Voile gris-violet très léger qui encadre la conversation et
              adoucit le contraste entre le texte et le fond */}
          <div
            className="flex flex-col gap-10 rounded-3xl border border-accent/10 px-7 py-9 shadow-xl shadow-black/20"
            style={{ backgroundColor: "rgba(124, 92, 255, 0.045)" }}
          >
            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} content={m.content} thinking={thinking} onRegenerate={() => regenerateFrom(i)} />
              ) : (
                <AssistantBubble key={i} content={m.content} onFeedback={homeFeedback} />
              )
            )}
            {thinking && <ThinkingIndicator label={modelLabel} />}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Barre fixe en bas */}
      <div className="shrink-0 border-t border-edge/30 bg-bg/95 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {/* Graduation : passer cette discussion (+ fichiers + contexte) dans l'atelier. Toujours
              dispo via le bouton ; le panneau s'ouvre aussi quand Mango propose (suggestGraduate). */}
          {hasChat && (graduateOpen ? (
            <div className="mb-2 rounded-xl border border-accent/30 bg-accent/[0.07] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-accent-soft">
                <FolderOpen size={15} className="shrink-0" />
                <span className="font-medium">On passe à l'atelier ?</span>
                <span className="text-xs text-dim">J'emporte nos fichiers et le contexte de la discussion.</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={graduateName}
                  onChange={(e) => setGraduateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") graduate(); }}
                  placeholder="nom du projet"
                  className="flex-1 rounded-lg border border-edge/70 bg-panel/60 px-3 py-1.5 text-sm text-ink placeholder:text-faint/50 focus:outline-none focus:border-accent/50"
                  autoFocus
                />
                <button onClick={graduate} disabled={gradBusy} title="Créer le projet et ouvrir l'atelier"
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-60">
                  {gradBusy ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {gradBusy ? "Création…" : "Ouvrir l'atelier"}
                </button>
                <button onClick={() => setGraduateOpen(false)} className="rounded-lg px-2 py-1.5 text-xs text-dim hover:text-ink transition-colors">
                  Plus tard
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex justify-end">
              <button onClick={() => setGraduateOpen(true)} title="Passer cette discussion dans l'atelier (construire/planifier)"
                className="flex items-center gap-1.5 rounded-lg border border-edge/60 bg-panel/50 px-2.5 py-1 text-xs text-dim hover:text-accent-soft hover:border-accent/40 transition-colors">
                <FolderOpen size={13} /> Ouvrir dans l'atelier
              </button>
            </div>
          ))}
          <BottomBar
            input={input}
            setInput={setInput}
            onSubmit={sendMessage}
            thinking={thinking}
            model={model}
            onModel={handleFixedModel}
            mode={mode}
            onMode={setMode}
            template={template}
            onTemplate={setTemplate}
            inputRef={inputRef}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            attachNote={attachNote}
            onClearNote={() => setAttachNote("")}
            onOpenSettings={handleOpenModelExtra}
            overrideLabel={quickBrain?.label}
          />
          <QuickModelPicker
            open={quickPickerOpen}
            onClose={() => setQuickPickerOpen(false)}
            onPicked={setQuickBrain}
          />
        </div>
      </div>
    </div>
  );
}
