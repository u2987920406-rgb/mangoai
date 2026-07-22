import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import QuickModelPicker from "./QuickModelPicker.jsx";
import { MODELS } from "./home/helpers.js";
import HamburgerMenu from "./home/HamburgerMenu.jsx";
import BottomBar from "./home/BottomBar.jsx";
import IdleScreen from "./home/IdleScreen.jsx";
import GraduatePanel from "./home/GraduatePanel.jsx";
import ConversationThread from "./home/ConversationThread.jsx";
import ContextGauge from "./ContextGauge.jsx";

/* ── Page d'accueil ──────────────────────────────────────────────────────── */
export default function Home({ onOpen, onOpenWindow, onOpenAppBuilder, onOpenApp, onOpenSidePanel, onOpenSettings, model = "sonnet", onModel }) {
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
  // (2026-07-13) Jauge de contexte — l'Accueil n'a pas de Header comme l'Atelier ;
  // le fetch JSON de /api/home-chat porte contextTokens/contextWindow (voir
  // home-routes.ts). { tokens, window } | null.
  const [context, setContext] = useState(null);
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
      if (data.contextTokens && data.contextWindow) {
        setContext({ tokens: data.contextTokens, window: data.contextWindow });
      }
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
    // Le clic sur Envoyer déplace le focus dessus — le rendre à la zone de
    // saisie pour pouvoir continuer à écrire sans re-cliquer.
    requestAnimationFrame(() => inputRef.current?.focus());
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
      <IdleScreen
        onOpenWindow={onOpenWindow}
        onOpenAppBuilder={onOpenAppBuilder}
        onOpenApp={onOpenApp}
        onOpenSidePanel={onOpenSidePanel}
        onOpenSettings={onOpenSettings}
        inputRef={inputRef}
        conversations={conversations}
        onLoadConversation={loadConversation}
        onDeleteConversation={deleteConversation}
        attachments={attachments}
        removeAttachment={removeAttachment}
        attachNote={attachNote}
        onClearNote={() => setAttachNote("")}
        input={input}
        setInput={setInput}
        handleKey={handleKey}
        addFiles={addFiles}
        thinking={thinking}
        welcomeFileRef={welcomeFileRef}
        model={model}
        handleFixedModel={handleFixedModel}
        handleOpenModelExtra={handleOpenModelExtra}
        quickBrain={quickBrain}
        sendMessage={sendMessage}
        quickPickerOpen={quickPickerOpen}
        setQuickPickerOpen={setQuickPickerOpen}
        setQuickBrain={setQuickBrain}
      />
    );
  }

  /* ── Mode chat — conversation ── */
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-bg">
      <HamburgerMenu
        onOpenWindow={onOpenWindow}
        onOpenAppBuilder={onOpenAppBuilder}
        onOpenApp={onOpenApp}
        onOpenSidePanel={onOpenSidePanel}
        onOpenSettings={onOpenSettings}
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

      {/* Jauge de contexte — fenêtre PHYSIQUE du cerveau actif, pas économique (même à $0) */}
      {context && (
        <div
          className="absolute right-4 top-4 z-20 flex h-9 items-center rounded-xl
                     border border-edge/60 bg-panel/80 px-3 backdrop-blur"
        >
          <ContextGauge tokens={context.tokens} window={context.window} />
        </div>
      )}

      {/* Fil de messages */}
      <ConversationThread
        messages={messages}
        thinking={thinking}
        modelLabel={modelLabel}
        onRegenerate={regenerateFrom}
        onFeedback={homeFeedback}
        bottomRef={bottomRef}
      />

      {/* Barre fixe en bas */}
      <div className="shrink-0 border-t border-edge/30 bg-bg/95 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl">
          {/* Graduation : passer cette discussion (+ fichiers + contexte) dans l'atelier. Toujours
              dispo via le bouton ; le panneau s'ouvre aussi quand Mango propose (suggestGraduate). */}
          {hasChat && (
            <GraduatePanel
              graduateOpen={graduateOpen}
              setGraduateOpen={setGraduateOpen}
              graduateName={graduateName}
              setGraduateName={setGraduateName}
              graduate={graduate}
              gradBusy={gradBusy}
            />
          )}
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
