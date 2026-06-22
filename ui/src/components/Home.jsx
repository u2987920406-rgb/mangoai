import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Download, FolderOpen, GitBranch, Image as ImageIcon, LayoutGrid, Loader2, Menu, MessageSquare, Mic, Music2, Paperclip, Plus, RefreshCw, Send, Settings, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ConfirmDelete from "./ConfirmDelete.jsx";
import { WINDOWS } from "../nav.js";

/* ── Pièces jointes du chat d'accueil ────────────────────────────────────────
   Le chat d'accueil n'a PAS d'accès disque : pour qu'il "lise" un fichier, on
   lit son contenu côté client (texte) et on l'injecte dans le message, entre
   des balises [[FILE:nom]]…[[/FILE]] — envoyées à GLM, masquées à l'affichage
   (la bulle montre juste une puce 📎 nom + le texte tapé). */
const FILE_BLOCK_RE = /\[\[FILE:([^\]]+)\]\]\n([\s\S]*?)\n\[\[\/FILE\]\]\n?/g;
const buildFileBlock = (name, content) => `[[FILE:${name}]]\n${content}\n[[/FILE]]\n`;
function splitFileBlocks(content = "") {
  const files = [];
  const clean = content.replace(FILE_BLOCK_RE, (_, name) => { files.push(name.trim()); return ""; }).trim();
  return { files, clean };
}
const readFileText = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });

/* ── Sélecteur de modèle ─────────────────────────────────────────────────── */
const MODELS = [
  { id: "sonnet", label: "Claude Sonnet 4.6" },
  { id: "opus",   label: "Claude Opus 4.8"   },
  { id: "haiku",  label: "Claude Haiku 4.5"  },
  { id: "eleve",  label: "Élève · GLM-5.2"   },
];

function ModelBadge({ model, onModel, openUp = false }) {
  const [open, setOpen] = useState(false);
  const current = MODELS.find((m) => m.id === model) ?? MODELS[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-ok/30 bg-ok/10
                   px-2.5 py-0.5 text-[11px] font-semibold text-ok hover:bg-ok/20 transition-colors"
      >
        {current.label}
        <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-50 w-52 overflow-hidden rounded-xl border border-edge bg-panel shadow-2xl
                        ${openUp ? "bottom-full right-0 mb-1.5" : "top-full left-0 mt-1.5"}`}
          >
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => { onModel?.(m.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px]
                            hover:bg-edge-soft transition-colors
                            ${m.id === model ? "text-accent font-medium" : "text-dim"}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${m.id === model ? "bg-accent" : "bg-transparent border border-edge"}`} />
                {m.label}
              </button>
            ))}
            <div className="border-t border-edge">
              <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left
                                 text-[12px] text-faint hover:bg-edge-soft transition-colors">
                <Plus size={12} />
                Connecter un autre modèle…
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Dropdown mode ───────────────────────────────────────────────────────── */
const MODES = [
  { id: "mvp",        label: "⚡ MVP",        desc: "Rapide"    },
  { id: "elite",      label: "💎 Élite",       desc: "Premium"   },
  { id: "finition",   label: "✨ Finition",    desc: "Polissage" },
  { id: "esthetique", label: "🎨 Esthétique",  desc: "Design"    },
];

function ModeDropdown({ mode, onMode }) {
  const [open, setOpen] = useState(false);
  const cur = MODES.find((m) => m.id === mode) ?? MODES[1];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-edge/60 bg-panel/60
                   px-2.5 py-1 text-[11px] text-dim hover:border-edge hover:text-ink transition-colors"
      >
        {cur.label} <ChevronDown size={9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden
                          rounded-xl border border-edge bg-panel shadow-2xl">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { onMode(m.id); setOpen(false); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-[12px]
                            hover:bg-edge-soft transition-colors
                            ${m.id === mode ? "text-accent" : "text-dim"}`}
              >
                <span>{m.label}</span>
                <span className="text-faint text-[10px]">{m.desc}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Dropdown template ───────────────────────────────────────────────────── */
const TEMPLATES = [
  { id: "vite",     label: "React + Vite"          },
  { id: "shadcn",   label: "shadcn/ui"              },
  { id: "phaser",   label: "Jeu 2D (Phaser)"        },
  { id: "threejs",  label: "3D (Three.js)"           },
  { id: "supabase", label: "Full-stack (Supabase)"  },
];

function TemplateDropdown({ template, onTemplate }) {
  const [open, setOpen] = useState(false);
  const cur = template ? TEMPLATES.find((t) => t.id === template) : null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-edge/60 bg-panel/60
                   px-2.5 py-1 text-[11px] text-dim hover:border-edge hover:text-ink transition-colors"
      >
        {cur ? cur.label : "Template"} <ChevronDown size={9} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1.5 w-48 overflow-hidden
                          rounded-xl border border-edge bg-panel shadow-2xl">
            <button
              onClick={() => { onTemplate(null); setOpen(false); }}
              className="flex w-full px-3 py-2 text-[12px] text-faint hover:bg-edge-soft transition-colors"
            >
              Automatique (défaut)
            </button>
            <div className="border-t border-edge" />
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => { onTemplate(t.id); setOpen(false); }}
                className={`flex w-full px-3 py-2 text-[12px] hover:bg-edge-soft transition-colors
                            ${t.id === template ? "text-accent" : "text-dim"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Menu hamburger ──────────────────────────────────────────────────────── */
function HamburgerMenu({ onOpenWindow, onOpenAppBuilder, onOpenLauncher, inputRef, conversations = [], onLoadConversation, onDeleteConversation }) {
  const [open, setOpen] = useState(false);
  const recent = conversations.slice(0, 10);

  // Applications proposées dans la cascade « Nouveau projet »
  const apps = [
    {
      icon: FolderOpen,
      label: "App Builder",
      run: () => (onOpenAppBuilder
        ? onOpenAppBuilder()
        : onOpenWindow?.({ type: WINDOWS.PROJECTS, title: "Mango App Builder", width: 820, height: 580 })),
    },
    {
      icon: ImageIcon,
      label: "Image Creator",
      run: () => onOpenWindow?.({ type: WINDOWS.IMAGE_CREATOR, title: "Image Creator", width: 900, height: 640 }),
    },
    {
      icon: Music2,
      label: "Music Creator",
      run: () => onOpenWindow?.({ type: WINDOWS.MUSIC_CREATOR, title: "Music Creator", width: 900, height: 640 }),
    },
    {
      icon: LayoutGrid,
      label: "Toutes les apps",
      run: () => onOpenLauncher?.(),
    },
  ];

  return (
    <div className="absolute left-4 top-4 z-20">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge/60
                   bg-panel/80 text-dim backdrop-blur hover:border-accent/40 hover:text-ink transition-colors"
      >
        <Menu size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl
                          border border-edge bg-panel shadow-2xl">
            <p className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Actions rapides
            </p>
            <div className="border-t border-edge" />

            {/* Nouveau projet — cascade vers les applications */}
            <div className="group/sub relative">
              <button
                className="flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-[13px]
                           text-dim hover:bg-edge-soft transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Plus size={14} className="shrink-0 text-faint" />
                  Nouveau projet
                </span>
                <ChevronRight size={13} className="shrink-0 text-faint" />
              </button>
              {/* Sous-menu en cascade (apparaît à droite au survol) */}
              <div
                className="invisible absolute left-full top-0 z-50 ml-1 w-52 rounded-xl border border-edge
                           bg-panel p-1 opacity-0 shadow-2xl transition-opacity
                           group-hover/sub:visible group-hover/sub:opacity-100"
              >
                {apps.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => { a.run(); setOpen(false); }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px]
                               text-dim hover:bg-edge-soft hover:text-ink transition-colors"
                  >
                    <a.icon size={14} className="shrink-0 text-faint" />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { (onOpenAppBuilder ?? (() => onOpenWindow?.({ type: WINDOWS.PROJECTS, title: "Mango App Builder", width: 820, height: 580 })))(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[13px] text-dim hover:bg-edge-soft transition-colors"
            >
              <FolderOpen size={14} className="shrink-0 text-faint" />
              Mes projets
            </button>

            {/* Historique des 10 dernières conversations */}
            {recent.length > 0 && (
              <>
                <div className="border-t border-edge" />
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
                  Conversations récentes
                </p>
                <div>
                  {recent.map((c) => (
                    <div key={c.id} className="group/conv flex items-center pr-1">
                      <button
                        onClick={() => { onLoadConversation?.(c.id); setOpen(false); }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[13px] text-dim hover:bg-edge-soft hover:text-ink transition-colors"
                      >
                        <MessageSquare size={13} className="shrink-0 text-faint" />
                        <span className="truncate">{c.title}</span>
                      </button>
                      <ConfirmDelete
                        onConfirm={() => onDeleteConversation?.(c.id)}
                        message="Supprimer cette conversation ?"
                        align="right"
                        triggerTitle="Supprimer la conversation"
                        triggerClassName="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint opacity-0 hover:text-red-400 group-hover/conv:opacity-100 transition-all"
                      >
                        <Trash2 size={12} />
                      </ConfirmDelete>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="border-t border-edge" />
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-faint">
              Bientôt
            </p>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <GitBranch size={14} className="shrink-0" />
              Exporter sur GitHub
            </button>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <Download size={14} className="shrink-0" />
              Télécharger un projet
            </button>
            <button disabled className="flex w-full cursor-not-allowed items-center gap-2.5 px-3 py-2.5 text-[13px] text-faint/50">
              <Settings size={14} className="shrink-0" />
              Paramètres
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Bulle utilisateur ───────────────────────────────────────────────────── */
function UserBubble({ content }) {
  const { files, clean } = splitFileBlocks(content);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-raised px-5 py-3 text-[17px] text-ink-soft leading-7">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent-soft">
                <Paperclip size={11} /> {f}
              </span>
            ))}
          </div>
        )}
        {clean}
      </div>
    </div>
  );
}

/* ── Bulle assistant ─────────────────────────────────────────────────────── */
function AssistantBubble({ content }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="md md-chat text-[17px] text-ink-soft leading-8 break-words">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={copy} title="Copier" className="flex items-center gap-1 text-[11px] text-faint hover:text-dim transition-colors">
          <Copy size={12} /> {copied ? "Copié !" : "Copier"}
        </button>
      </div>
    </div>
  );
}

/* ── Indicateur de réflexion ─────────────────────────────────────────────── */
function ThinkingIndicator({ label = "MangoOS" }) {
  return (
    <div className="flex items-center gap-2 self-start rounded-xl border border-accent/25 bg-accent/[0.07] px-3.5 py-2 text-[13px] font-medium text-accent-soft shadow-sm">
      <Loader2 size={15} className="animate-spin" />
      <span>{label} réfléchit<span className="animate-pulse">…</span></span>
    </div>
  );
}

/* ── Barre de saisie (mode chat) ─────────────────────────────────────────── */
function BottomBar({ input, setInput, onSubmit, thinking, model, onModel, mode, onMode, template, onTemplate, inputRef, attachments = [], onAddFiles = () => {}, onRemoveAttachment = () => {} }) {
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
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onPaste={(e) => {
          const files = [...e.clipboardData.items].filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter(Boolean);
          if (files.length > 0) { e.preventDefault(); onAddFiles(files); }
        }}
        disabled={thinking}
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
          <ModelBadge model={model} onModel={onModel} openUp />
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

/* ── Page d'accueil ──────────────────────────────────────────────────────── */
export default function Home({ onOpen, onOpenWindow, onOpenAppBuilder, onOpenLauncher, model = "sonnet", onModel }) {
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
  const [attachments, setAttachments] = useState([]); // [{ name, content, size }]
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const welcomeFileRef = useRef(null);
  const hasChat = messages.length > 0;
  const modelLabel = MODELS.find((m) => m.id === model)?.label ?? "MangoOS";

  // Lecture côté client du CONTENU des fichiers joints (texte/code/.md…). Garde-fous :
  // 5 fichiers max, ≤ 300 ko chacun (le contenu part dans le prompt → on borne).
  async function addFiles(fileList) {
    const picked = [...(fileList ?? [])].slice(0, 5);
    const loaded = [];
    for (const f of picked) {
      if (f.size > 300_000) continue;
      const content = await readFileText(f);
      if (content) loaded.push({ name: f.name, content, size: f.size });
    }
    if (loaded.length) setAttachments((prev) => [...prev, ...loaded].slice(0, 5));
  }
  function removeAttachment(i) {
    setAttachments((prev) => prev.filter((_, j) => j !== i));
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
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      try { localStorage.setItem("mangoos.conversations", JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
    if (id === currentId) { setMessages([]); setCurrentId(null); setInput(""); }
  }

  async function sendMessage() {
    const val = input.trim();
    if ((!val && attachments.length === 0) || thinking) return;
    // Le contenu des fichiers joints est embarqué dans le message (balises FILE),
    // pour que GLM le lise — masqué à l'affichage par UserBubble.
    const fileBlocks = attachments.map((a) => buildFileBlock(a.name, a.content)).join("");
    const content = fileBlocks + (val || "Analyse le(s) fichier(s) joint(s) et dis-moi ce que tu en comprends.");
    const userMsg = { role: "user", content };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setAttachments([]);
    setThinking(true);

    // Identifie (ou crée) la conversation courante et la sauvegarde aussitôt
    let id = currentId;
    if (!id) { id = `c${Date.now()}`; setCurrentId(id); }
    upsertConversation(id, withUser);

    try {
      const res = await fetch("/api/home-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: withUser, model }),
      });
      const data = await res.json();
      const withAnswer = [...withUser, { role: "assistant", content: data.text ?? "Erreur de réponse." }];
      setMessages(withAnswer);
      upsertConversation(id, withAnswer);
    } catch {
      const withErr = [...withUser, { role: "assistant", content: "Impossible de joindre le serveur." }];
      setMessages(withErr);
      upsertConversation(id, withErr);
    } finally {
      setThinking(false);
    }
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
                <ModelBadge model={model} onModel={onModel} openUp />
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
                <UserBubble key={i} content={m.content} />
              ) : (
                <AssistantBubble key={i} content={m.content} />
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
          <BottomBar
            input={input}
            setInput={setInput}
            onSubmit={sendMessage}
            thinking={thinking}
            model={model}
            onModel={onModel}
            mode={mode}
            onMode={setMode}
            template={template}
            onTemplate={setTemplate}
            inputRef={inputRef}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
          />
        </div>
      </div>
    </div>
  );
}
