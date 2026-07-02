// Accueil 2.0 — CHAT CONVERSATIONNEL (fidèle à la Home 1.0, #136) : on discute avec
// MangoOS via /api/home-chat ($0, Élève souverain) SANS créer de projet. Si la
// discussion mène à une création, Mango le propose (suggestGraduate) — ou le bouton
// « Passer à l'atelier » — et /api/home/graduate promeut la conversation en vrai
// projet workspace, ouvert dans l'App Builder.
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, ChevronDown, Hammer, Mic, Paperclip, Sparkles, X } from "lucide-react";
import { useAppState } from "../state/AppState";
import { BrandMark, Button, Chip, Input, cx, TEXT } from "../design";

// Cerveaux sélectionnables à l'Accueil. `id` = alias envoyé à /api/home-chat (MODEL_MAP côté
// backend). GLM 5.2 (eleve) = Élève souverain agentique ($0) ; les autres passent par askLLM.
const MODELS = [
  { id: "eleve",  label: "GLM 5.2",   hint: "souverain · $0" },
  { id: "fable",  label: "Fable 5",   hint: "le plus capable" },
  { id: "opus",   label: "Opus 4.8",  hint: "puissant" },
  { id: "sonnet", label: "Sonnet 4.6", hint: "équilibré" },
  { id: "haiku",  label: "Haiku 4.5", hint: "rapide" },
  { id: "qwen",   label: "Qwen",      hint: "local · souverain" },
];

export default function AccueilPane() {
  const { openProject, pushToast, homeConvSeed, consumeHomeConvSeed } = useAppState();
  // Reprise d'une conversation PASSÉE (depuis l'écran « Conversation ») : on adopte son
  // convId pour continuer AU MÊME endroit ; sinon une conversation neuve.
  const [convId] = useState(() => homeConvSeed || `v2-${crypto.randomUUID?.() ?? Date.now()}`);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [graduateName, setGraduateName] = useState("");
  const [gradBusy, setGradBusy] = useState(false);
  const [model, setModel] = useState("eleve"); // cerveau choisi (défaut = Élève souverain)
  const [modelMenu, setModelMenu] = useState(false);
  const activeModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const hasChat = messages.length > 0;

  useEffect(() => {
    if (hasChat) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, hasChat]);

  // Reprise : si on arrive avec une graine (clic sur une conversation passée), charge ses
  // messages une seule fois au montage. Le convId a déjà été adopté (voir useState ci-dessus).
  useEffect(() => {
    if (!homeConvSeed) return;
    consumeHomeConvSeed();
    fetch(`/api/home/conversations/${encodeURIComponent(homeConvSeed)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.messages)) setMessages(d.messages); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save « façon ChatGPT » : à chaque tour terminé, on persiste la conversation
  // (best-effort, ne bloque rien) → elle réapparaît dans l'écran « Conversation ».
  function persist(conv) {
    fetch(`/api/home/conversations/${encodeURIComponent(convId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conv }),
    }).catch(() => {});
  }

  // Un tour : envoie l'historique à l'Élève et ajoute sa réponse (mécanique 1.0).
  async function runTurn(history) {
    setThinking(true);
    try {
      const res = await fetch("/api/home-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, model, convId }),
      });
      if (!res.ok) throw new Error(`erreur serveur (HTTP ${res.status})`);
      const data = await res.json();
      const full = [...history, { role: "assistant", content: data.text ?? "Erreur de réponse." }];
      setMessages(full);
      persist(full); // auto-save → revenable depuis l'écran « Conversation »
      // Mango a détecté une intention de CONSTRUIRE → propose de passer à l'atelier.
      if (data.suggestGraduate) setGraduateOpen(true);
    } catch (e) {
      setMessages([...history, { role: "assistant", content: `⚠️ Échec — ${e?.message ?? "serveur injoignable"}. Réessaie.` }]);
    } finally {
      setThinking(false);
    }
  }

  const send = () => {
    const val = input.trim();
    if (!val || thinking) return;
    const withUser = [...messages, { role: "user", content: val }];
    setMessages(withUser);
    setInput("");
    runTurn(withUser);
  };

  // GRADUATION : promeut la conversation en vrai projet workspace, puis ouvre l'atelier.
  async function graduate() {
    if (gradBusy) return;
    setGradBusy(true);
    try {
      const r = await fetch("/api/home/graduate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convId, name: graduateName.trim() || "Projet Mango", messages }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.name) throw new Error(d.error ?? `HTTP ${r.status}`);
      setGraduateOpen(false);
      openProject(d.name); // le projet est déjà semé par la graduation — pas d'autoPrompt
    } catch (e) {
      pushToast("error", `Passage à l'atelier impossible : ${e?.message ?? "erreur"}`);
    } finally {
      setGradBusy(false);
    }
  }

  const fillSuggestion = (s) => {
    setInput(`${s} — `);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    });
  };

  /* Le composer (partagé entre l'état accueil et l'état conversation). */
  const composer = (
    <div className="rounded-2xl border border-edge bg-raised p-3 shadow-lg transition-colors duration-150 focus-within:border-faint">
      <textarea
        ref={inputRef}
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
        }}
        placeholder={thinking ? "Mango réfléchit…" : "Discute avec Mango — idées, questions, projets…"}
        className="w-full resize-none bg-transparent px-1.5 pt-1 text-[14px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <div className="flex items-center gap-1.5 pt-1.5">
        <Button variant="ghost" iconOnly icon={<Paperclip size={16} />} title="Joindre un fichier" aria-label="Joindre un fichier" />
        {/* Sélecteur de cerveau — menu déroulant scrollable (Fable 5, Haiku, Sonnet, Opus, GLM 5.2, Qwen). */}
        <div className="relative ml-1">
          <button
            type="button"
            onClick={() => setModelMenu((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11px] text-dim transition-colors hover:border-faint hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            title="Choisir le cerveau"
          >
            {activeModel.label}
            <span className="text-faint">· {activeModel.hint}</span>
            <ChevronDown size={12} className="text-faint" />
          </button>
          {modelMenu && (
            <>
              <div className="fixed inset-0 z-40" onMouseDown={() => setModelMenu(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-1.5 max-h-64 w-56 overflow-y-auto rounded-xl border border-edge bg-panel p-1 shadow-xl shadow-black/30">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setModel(m.id); setModelMenu(false); }}
                    className={cx(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                      m.id === model ? "bg-accent/12 font-medium text-ink" : "text-dim hover:bg-raised hover:text-ink",
                    )}
                  >
                    <span>{m.label}</span>
                    <span className="text-[10.5px] text-faint">{m.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {hasChat && !graduateOpen && (
          <Button variant="secondary" size="sm" icon={<Hammer size={13} />} onClick={() => setGraduateOpen(true)} className="ml-2"
            title="Passer cette discussion dans l'atelier (construire)">
            Passer à l'atelier
          </Button>
        )}
        <Button variant="ghost" iconOnly icon={<Mic size={16} />} className="ml-auto" title="Entrée vocale" aria-label="Entrée vocale" />
        <Button
          variant="primary" iconOnly icon={<ArrowUp size={16} strokeWidth={2.2} />} className="rounded-xl"
          title="Envoyer (Entrée)" aria-label="Envoyer" disabled={!input.trim() || thinking} onClick={send}
        />
      </div>
    </div>
  );

  /* Bannière de graduation : Mango propose (ou bouton manuel) → nom + go atelier. */
  const graduateBanner = graduateOpen && (
    <div className="animate-fade-up mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/[0.07] px-3 py-2.5">
      <Sparkles size={14} className="shrink-0 text-accent-soft" />
      <span className={cx(TEXT.base, "text-ink")}>On la construit ? Je crée le projet depuis notre discussion.</span>
      <div className="ml-auto flex items-center gap-1.5">
        <Input
          value={graduateName}
          onChange={(e) => setGraduateName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") graduate(); }}
          placeholder="Nom du projet…"
          className="h-7 w-44"
        />
        <Button variant="primary" size="sm" loading={gradBusy} onClick={graduate} title="Créer le projet et ouvrir l'atelier">
          Ouvrir l'atelier
        </Button>
        <Button variant="ghost" size="sm" iconOnly icon={<X size={13} />} onClick={() => setGraduateOpen(false)} aria-label="Fermer" />
      </div>
    </div>
  );

  /* État accueil (aucun message) : hero centré, comme avant. */
  if (!hasChat) {
    return (
      <div className="hero-glow flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-[640px] animate-fade-up">
          <div className="mb-2 text-center">
            <BrandMark size={26} />
          </div>
          <p className="mb-7 text-center text-[14px] text-dim">Discutons — et si ça devient une app, l'atelier est à un clic.</p>
          {composer}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["Une idée d'app à explorer", "Aide-moi à choisir une stack", "Landing page animée", "Jeu 2D"].map((s) => (
              <Chip key={s} onClick={() => fillSuggestion(s)}>{s}</Chip>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* État conversation : bulles + composer fixe en bas (type claude.ai). */
  return (
    <div className="flex h-full flex-col">
      <div className="nice-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-6 py-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-bubble px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {m.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] self-start">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-soft">
                  <Sparkles size={12} /> MangoOS
                </div>
                <div className="md rounded-2xl rounded-tl-md border border-accent/15 bg-accent/[0.06] px-3.5 py-2.5 text-sm leading-relaxed break-words">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ),
          )}
          {thinking && (
            <div className="flex items-center gap-2 self-start px-1">
              <span className="shimmer-text text-[13px] font-semibold">Mango réfléchit…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="shrink-0 border-t border-edge-soft px-6 py-3">
        <div className="mx-auto w-full max-w-[720px]">
          {graduateBanner}
          <div className={graduateOpen ? "mt-2" : ""}>{composer}</div>
        </div>
      </div>
    </div>
  );
}
