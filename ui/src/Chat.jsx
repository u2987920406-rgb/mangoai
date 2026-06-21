import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowUp, Bookmark, BrainCircuit, FileCode, FolderOpen, Mic, MicOff, Paperclip, Scan, Sparkles, Square, X } from "lucide-react";
import ToolGroup from "./components/ToolGroup.jsx";
import NocturnalReviewForm from "./components/NocturnalReviewForm.jsx";
import DiffSlider from "./components/DiffSlider.jsx";

let nextId = 1;
const uid = () => nextId++;

const CHAT_MODES = [
  { id: "construire", label: "Construire", model: "sonnet", mode: "elite" },
  { id: "planifier",  label: "Planifier",  model: "opus",   mode: "elite" },
  { id: "discuter",   label: "Discuter",   model: "haiku",  mode: "discuss" },
];

export default function Chat({
  projectName,
  model,
  mode,
  template,
  onPreviewUrl,
  onCost,
  onContext,
  onAgentDone,
  autoPrompt,
  onAutoPromptConsumed,
  seedInput,
  onSeedConsumed,
  editTarget,
  onEditTargetConsumed,
  onChatMode = () => {},
  onToast = () => {},
  showThinking = true,
  tutorialId = null,
  clientMode = false,
  seedHistory = null,
  nocturnalEntry = null,
  onReviewed = () => {},
  buildRequest = null,
  onBuildConsumed = () => {},
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState([]); // File[] — images/PDF joints
  const sessionRef = useRef(null); // Agent SDK session_id, kept across turns
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  // Live mirrors of the current project + busy state, read by the post-turn
  // history poll (#73): a setTimeout closure captures stale values otherwise.
  const projectNameRef = useRef(projectName);
  const busyRef = useRef(busy);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [contextFile, setContextFile] = useState(null);   // string | null
  const [filePicker, setFilePicker] = useState(false);    // popover ouvert ?
  const [awaitingPlanConfirm, setAwaitingPlanConfirm] = useState(false);
  const [fileList, setFileList] = useState([]);            // fichiers du projet
  const [fileSearch, setFileSearch] = useState("");
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!filePicker) return;
    fetch(`/api/files/${encodeURIComponent(projectName)}`)
      .then((r) => r.ok ? r.json() : { files: [] })
      .then((d) => setFileList(d.files ?? []))
      .catch(() => {});
  }, [filePicker, projectName]);

  useEffect(() => {
    if (!filePicker) return;
    function onOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setFilePicker(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [filePicker]);

  const ACCEPTED = /\.(png|jpe?g|webp|gif|pdf)$/i;
  const addFiles = (files) => {
    const valid = [...files].filter((f) => f && ACCEPTED.test(f.name || ".png"));
    if (valid.length === 0) return;
    setAttachments((prev) => [...prev, ...valid].slice(0, 6));
  };

  // Snap mode: the user draws a rectangle over the preview; the backend
  // re-renders the preview at the iframe's exact size and crops that zone.
  const [snapMode, setSnapMode] = useState(false);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapRect, setSnapRect] = useState(null); // {x, y, w, h} viewport coords
  const snapStart = useRef(null);

  useEffect(() => {
    if (!snapMode) return;
    const onKey = (e) => e.key === "Escape" && cancelSnap();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snapMode]);

  const cancelSnap = () => {
    setSnapMode(false);
    setSnapRect(null);
    snapStart.current = null;
  };

  async function finishSnap() {
    const rect = snapRect;
    cancelSnap();
    if (!rect || rect.w < 8 || rect.h < 8) return;
    const iframe = document.querySelector("iframe");
    if (!iframe) {
      push({ role: "status", text: "Aucun aperçu à capturer — lance d'abord l'app." });
      return;
    }
    // Intersect the drawn rectangle with the preview iframe
    const r = iframe.getBoundingClientRect();
    const x1 = Math.max(rect.x, r.left);
    const y1 = Math.max(rect.y, r.top);
    const x2 = Math.min(rect.x + rect.w, r.right);
    const y2 = Math.min(rect.y + rect.h, r.bottom);
    if (x2 - x1 < 8 || y2 - y1 < 8) {
      push({ role: "status", text: "La zone capturée doit recouvrir l'aperçu (panneau de droite)." });
      return;
    }
    setSnapBusy(true);
    try {
      const res = await fetch("/api/snap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          viewport: { width: Math.round(r.width), height: Math.round(r.height) },
          box: {
            x: Math.round(x1 - r.left),
            y: Math.round(y1 - r.top),
            width: Math.round(x2 - x1),
            height: Math.round(y2 - y1),
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Erreur HTTP ${res.status}`);
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      addFiles([new File([bytes], "capture-zone.png", { type: "image/png" })]);
    } catch (err) {
      push({ role: "error", text: `Capture impossible : ${err.message ?? err}` });
    } finally {
      setSnapBusy(false);
    }
  }

  // Switching projects = different conversation; the backend will resume
  // the project's stored session on the next message. The persisted chat
  // history of the project replaces whatever is on screen.
  useEffect(() => {
    sessionRef.current = null;
    setAwaitingPlanConfirm(false);
    let cancelled = false;
    if (!projectName.trim()) {
      setMessages([]);
      return;
    }
    fetch(`/api/history/${encodeURIComponent(projectName)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (cancelled) return;
        const loaded = (d.messages ?? []).map((m) => ({ id: uid(), role: m.role, text: m.text }));
        // Repli : un projet sans historique (ex. généré la nuit avant le fix
        // backend) affiche au moins sa tâche initiale au lieu d'un écran vide.
        if (loaded.length === 0 && seedHistory) {
          setMessages([{ id: uid(), role: "user", text: seedHistory }]);
        } else {
          setMessages(loaded);
        }
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectName, seedHistory]);

  const push = (msg) => {
    setMessages((prev) => [...prev, { id: uid(), ...msg }]);
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  // Callback STABLE (useCallback) : indispensable pour que <Message> mémoïsé ne
  // re-rende pas à chaque frappe dans la chatbox. Sans ça, une prop onFeedback
  // recréée à chaque render casserait la mémoïsation et tout l'historique
  // (ReactMarkdown) re-rendrait à chaque touche → lag sur les longues sessions.
  const handleFeedback = useCallback((rating, text) => {
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName, rating, text }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.escalate) {
          setMessages((prev) => [...prev, { id: uid(), role: "escalation", projectName }]);
        }
      })
      .catch(() => {});
  }, [projectName]);

  // Groupes stables tant que `messages` ne change pas : sans ça, groupMessages
  // recrée des objets à chaque frappe et casse la mémoïsation de ToolGroup.
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // Keep the refs in sync so the post-turn poll sees current values.
  useEffect(() => { projectNameRef.current = projectName; }, [projectName]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  // After a turn, background agents (review 🧠, patrol 🛡️ — idea #73) append
  // status lines to the persisted history AFTER the SSE stream has closed, so
  // they aren't in our in-memory messages. Re-fetch the history a couple of
  // times to surface them. Guards: only if still on the same project and idle
  // (a new turn in flight owns the messages); never wipe to empty on a hiccup.
  const refetchHistory = (pName) => {
    if (pName !== projectNameRef.current || busyRef.current) return;
    fetch(`/api/history/${encodeURIComponent(pName)}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => {
        if (pName !== projectNameRef.current || busyRef.current) return;
        const loaded = (d.messages ?? []).map((m) => ({ id: uid(), role: m.role, text: m.text }));
        if (loaded.length > 0) setMessages(loaded);
      })
      .catch(() => {});
  };

  // Sends the auto-prompt (fix request or Home's initial idea) once idle
  useEffect(() => {
    if (!autoPrompt || busy) return;
    onAutoPromptConsumed?.();
    send(autoPrompt);
  }, [autoPrompt, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Précharge le composer depuis la sélection clic→source (#5) — SANS envoyer :
  // l'utilisateur complète par le changement voulu, puis envoie lui-même.
  useEffect(() => {
    if (!seedInput) return;
    onSeedConsumed?.();
    setInput(seedInput);
    const el = inputRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [seedInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // #139 Gros Projet — un clic « Construire » sur le Kanban envoie un tour borné
  // (mode projet + id d'incrément). On attend que le chat soit libre avant de
  // consommer la requête (sinon send() avorterait sur busy et on la perdrait).
  useEffect(() => {
    if (!buildRequest || busy) return;
    onBuildConsumed?.();
    send(buildRequest.prompt, { incrementId: buildRequest.incrementId, modeOverride: "projet" });
  }, [buildRequest, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(textArg, opts) {
    const typed = (typeof textArg === "string" ? textArg : input).trim();
    // Auto-prompts (fix requests) never carry attachments
    const files = typeof textArg === "string" ? [] : attachments;
    if ((!typed && files.length === 0) || busy) return;
    // #139 Gros Projet : un build d'incrément force mode "projet" et joint l'id
    // de l'incrément (réconcilié côté serveur après commit).
    const turnMode = opts?.modeOverride ?? mode;
    const turnIncrementId = opts?.incrementId;
    // Planifier mode : détecter dès l'appel (var locale — safe à travers l'async)
    const isPlanner = model === "opus" && mode === "elite";
    const wasPlanPhase = isPlanner && !awaitingPlanConfirm;
    if (awaitingPlanConfirm) setAwaitingPlanConfirm(false);
    // Cible d'édition visuelle (#6) : seulement pour un envoi utilisateur (pas un
    // auto-prompt), capturée puis consommée pour ce message.
    const useEdit = typeof textArg !== "string" ? editTarget : null;
    if (typeof textArg !== "string") {
      setInput("");
      setAttachments([]);
      if (inputRef.current) inputRef.current.style.height = "auto";
      if (useEdit) onEditTargetConsumed?.();
    }
    setBusy(true);

    try {
      // Upload attachments first; their paths are prepended to the prompt so
      // the agent Reads them (Read handles PNG/JPEG/PDF natively).
      let prompt = typed || "Analyse les fichiers joints et dis-moi ce que tu en comprends.";
      if (contextFile) {
        prompt = `[Contexte fichier : ${contextFile}]\n\n${prompt}`;
        setContextFile(null);
      }
      if (files.length > 0) {
        const paths = [];
        for (const f of files) {
          const r = await fetch(
            `/api/upload/${encodeURIComponent(projectName)}?filename=${encodeURIComponent(f.name || "collage.png")}`,
            { method: "POST", body: f },
          );
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.error ?? `Échec de l'envoi de ${f.name}`);
          paths.push(d.path);
        }
        prompt = `[Fichiers joints : ${paths.join(", ")}]\n\n${prompt}`;
      }
      push({ role: "user", text: prompt });
      const apiPrompt = wasPlanPhase
        ? `${prompt}\n\n---\n**MODE PLANIFICATION** : Ne génère pas de code maintenant. Présente uniquement le plan d'implémentation : architecture des composants, pages/routes, étapes de build, choix techniques clés. J'enverrai une confirmation avant que tu commences à coder.`
        : prompt;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: apiPrompt,
          projectName,
          model,
          mode: turnMode,
          template: template || undefined,
          sessionId: sessionRef.current ?? undefined,
          editTarget: useEdit ?? undefined,
          tutorialId: tutorialId ?? undefined,
          clientMode: clientMode || undefined,
          incrementId: turnIncrementId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        push({ role: "error", text: err.error ?? `Erreur HTTP ${res.status}` });
        return;
      }

      // Parse the SSE stream manually
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          handleEvent(JSON.parse(line.slice(6)));
        }
      }
    } catch (err) {
      push({ role: "error", text: String(err) });
    } finally {
      setBusy(false);
      if (wasPlanPhase) setAwaitingPlanConfirm(true);
      onAgentDone();
      // Surface the background agents' status lines (review + patrol #73 +
      // Mango QA verdict) once they've had time to finish, without keeping the
      // stream open. The later delays cover slow QA audits (~143s on big
      // projects) that the 6s/14s window would miss. refetchHistory is guarded
      // (same project + idle), so the late re-fetches are no-ops if irrelevant.
      const pName = projectName;
      [6000, 14000, 30000, 60000, 90000, 130000, 180000, 240000].forEach((d) =>
        setTimeout(() => refetchHistory(pName), d),
      );
    }
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case "status":
        push({ role: "status", text: ev.text });
        break;
      case "diff":
        push({ role: "diff", before: ev.before, after: ev.after });
        break;
      case "preview":
        onPreviewUrl(ev.url);
        break;
      case "text":
        push({ role: "agent", text: ev.text });
        break;
      case "thinking":
        push({ role: "thinking", text: ev.text });
        break;
      case "tool":
        push({ role: "tool", name: ev.name, detail: ev.detail });
        break;
      case "version":
        push({ role: "version", text: `Version sauvegardée (${ev.hash})` });
        break;
      case "result":
        sessionRef.current = ev.sessionId;
        onCost(ev.costUsd);
        if (ev.contextTokens && ev.contextWindow) {
          onContext?.({ tokens: ev.contextTokens, window: ev.contextWindow });
        }
        if (!ev.ok) push({ role: "error", text: `L'agent s'est arrêté : ${ev.error}` });
        break;
      case "error":
        push({ role: "error", text: ev.message });
        break;
      default:
        break;
    }
  }

  function autoGrow(e) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function toggleMic() {
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onToast("error", "Micro indisponible — autorisation refusée ou aucun micro détecté.");
      return;
    }
    audioChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setTranscribing(true);
      try {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "record.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          onToast("error", err.error ? `Transcription échouée : ${err.error}` : `Transcription échouée (HTTP ${res.status}).`);
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.text?.trim()) setInput((prev) => (prev ? prev + " " + data.text : data.text));
          else onToast("error", "Rien n'a été transcrit — réessaie en parlant plus distinctement.");
        }
      } catch {
        onToast("error", "Transcription échouée — serveur injoignable ?");
      }
      setTranscribing(false);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setListening(true);
  }

  return (
    <section className="flex w-2/5 min-w-[360px] flex-col border-r border-edge bg-panel">
      {snapMode && (
        <div
          className="fixed inset-0 z-50 cursor-crosshair bg-black/30"
          onMouseDown={(e) => {
            snapStart.current = { x: e.clientX, y: e.clientY };
            setSnapRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
          }}
          onMouseMove={(e) => {
            const s = snapStart.current;
            if (!s) return;
            setSnapRect({
              x: Math.min(s.x, e.clientX),
              y: Math.min(s.y, e.clientY),
              w: Math.abs(e.clientX - s.x),
              h: Math.abs(e.clientY - s.y),
            });
          }}
          onMouseUp={finishSnap}
        >
          <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-xl border border-edge bg-panel px-4 py-2 text-sm text-dim shadow-lg">
            Glisse pour capturer une zone de l'aperçu — Échap pour annuler
          </div>
          {snapRect && snapRect.w > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-accent bg-accent/10"
              style={{ left: snapRect.x, top: snapRect.y, width: snapRect.w, height: snapRect.h }}
            />
          )}
        </div>
      )}
      <div ref={listRef} className="nice-scroll flex flex-1 flex-col gap-2.5 overflow-y-auto p-4">
        {messages.length === 0 && !busy && (
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
              onFeedback={handleFeedback}
            />
          ),
        )}
        {/* Projet généré la nuit : reviewer directement sous le prompt (#58/#59). */}
        {nocturnalEntry && !nocturnalEntry.reviewed && !busy && (
          <NocturnalReviewForm id={nocturnalEntry.id} onToast={onToast} onReviewed={onReviewed} />
        )}
        {awaitingPlanConfirm && !busy && (
          <div className="flex justify-center py-3">
            <button
              onClick={() => {
                setAwaitingPlanConfirm(false);
                const cm = CHAT_MODES.find((c) => c.id === "construire");
                onChatMode({ model: cm.model, mode: cm.mode });
                setInput("Confirmé — construis maintenant selon ce plan.");
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-accent/90"
            >
              <Sparkles size={14} />
              Confirmer et construire
            </button>
          </div>
        )}
        {busy && (
          <div className="shimmer-text self-start px-1 py-0.5 text-[13px] font-medium">
            MangoOS travaille…
          </div>
        )}
      </div>

      <div className="border-t border-edge p-3">
        <div
          className="rounded-2xl border border-edge bg-bg p-2 focus-within:border-accent/60 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          {contextFile && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
                <FileCode size={10} className="shrink-0" />
                <span className="max-w-52 truncate font-mono">{contextFile}</span>
                <button onClick={() => setContextFile(null)} className="text-accent/60 hover:text-accent transition-colors">
                  <X size={11} />
                </button>
              </span>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1.5 pb-2">
              {attachments.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel px-2 py-1 text-xs text-dim"
                >
                  <AttachmentThumb file={f} />
                  <span className="max-w-40 truncate">{f.name}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-faint hover:text-err transition-colors"
                    title="Retirer"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1 px-1.5 pb-2">
            {CHAT_MODES.map((cm) => {
              const active = cm.model === model && cm.mode === mode;
              return (
                <button
                  key={cm.id}
                  onClick={() => onChatMode({ model: cm.model, mode: cm.mode })}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent/15 text-accent"
                      : "text-faint hover:text-dim hover:bg-edge-soft"
                  }`}
                >
                  {cm.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end gap-1.5 pl-1.5">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-faint hover:text-ink disabled:opacity-30 transition-colors"
                title="Joindre une image ou un PDF (ou colle/glisse-le ici)"
              >
                <Paperclip size={16} />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.gif,.pdf"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => setSnapMode(true)}
                disabled={busy || snapBusy}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  snapBusy ? "animate-pulse text-accent" : "text-faint hover:text-ink"
                }`}
                title="Snap : capturer une zone de l'aperçu"
              >
                <Scan size={16} />
              </button>
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => { setFilePicker((v) => !v); setFileSearch(""); }}
                  disabled={busy}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                    contextFile ? "text-accent" : "text-faint hover:text-ink"
                  }`}
                  title="Cibler un fichier du projet comme contexte"
                >
                  <FolderOpen size={16} />
                </button>
                {filePicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-edge bg-panel shadow-xl shadow-black/30 z-50">
                    <div className="p-2 border-b border-edge">
                      <input
                        autoFocus
                        value={fileSearch}
                        onChange={(e) => setFileSearch(e.target.value)}
                        placeholder="Rechercher un fichier…"
                        className="w-full rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
                      />
                    </div>
                    <ul className="nice-scroll max-h-52 overflow-y-auto p-1">
                      {fileList
                        .filter((f) => !fileSearch || f.toLowerCase().includes(fileSearch.toLowerCase()))
                        .map((f) => (
                          <li key={f}>
                            <button
                              onClick={() => { setContextFile(f); setFilePicker(false); }}
                              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                contextFile === f
                                  ? "bg-accent/15 text-accent"
                                  : "text-dim hover:bg-edge-soft hover:text-ink"
                              }`}
                            >
                              <FileCode size={12} className="shrink-0 text-faint" />
                              <span className="truncate font-mono">{f}</span>
                            </button>
                          </li>
                        ))}
                      {fileList.length === 0 && (
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
                    addFiles(pasted);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Décris ton app ou demande une modification…"
                rows={1}
                className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed placeholder:text-faint focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-end gap-1.5 pr-1.5">
              <button
                onClick={toggleMic}
                disabled={busy || transcribing}
                data-tour="mic"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  listening ? "animate-pulse text-err" : transcribing ? "animate-pulse text-accent" : "text-faint hover:text-ink"
                }`}
                title={listening ? "Arrêter l'enregistrement" : transcribing ? "Transcription Whisper…" : "Dicter (Whisper local)"}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              {busy ? (
                <button
                  onClick={() => fetch("/api/stop", { method: "POST" }).catch(() => {})}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-err/90 text-white hover:bg-err transition-colors"
                  title="Arrêter l'agent"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim() && attachments.length === 0}
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
    </section>
  );
}

// Image attachments get a live thumbnail in their chip; other files (PDF)
// keep the paperclip icon. The object URL is revoked on unmount.
function AttachmentThumb({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file.type?.startsWith("image/")) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <Paperclip size={10} className="shrink-0 text-accent-soft" />;
  return <img src={url} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />;
}

// Collapse consecutive tool messages into one expandable group
function groupMessages(messages) {
  const out = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (m.role === "tool") {
      if (prev?.kind === "tools") prev.items.push(m);
      else out.push({ kind: "tools", key: `g${m.id}`, items: [m] });
    } else {
      out.push({ kind: "msg", key: m.id, message: m });
    }
  }
  out.forEach((g, i) => {
    g.isLast = i === out.length - 1;
  });
  return out;
}

function EscalationCard({ projectName }) {
  const [ref, setRef] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!ref.trim() || sending || sent) return;
    setSending(true);
    try {
      await fetch("/api/escalation-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, referenceText: ref.trim() }),
      });
      setSent(true);
    } catch {}
    setSending(false);
  }

  return (
    <div className="animate-fade-up max-w-[95%] self-start">
      <div className="rounded-2xl rounded-tl-md border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3 text-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-500">
          <span>⚠</span>
          <span>MangoOS bloque sur le visuel</span>
        </div>
        {sent ? (
          <p className="text-xs text-ok">
            ✓ Référence reçue — axiome de goût enregistré. Redécris maintenant ce que tu veux changer.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-dim leading-relaxed">
              Je tourne en rond. Montre-moi une référence visuelle pour recadrer ma direction — une URL, un mot-clé, une description de style.
            </p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Ex: minimaliste noir, style Linear, site raycast.com…"
                className="flex-1 rounded-lg border border-edge bg-bg px-2.5 py-1.5 text-xs text-ink placeholder:text-faint focus:border-amber-500/60 focus:outline-none transition-colors"
                disabled={sending}
              />
              <button
                onClick={submit}
                disabled={!ref.trim() || sending}
                className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/30 disabled:opacity-40 transition-colors"
              >
                {sending ? "…" : "Ancrer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// memo() : un message ne re-rend que si ses propres props changent. Couplé au
// callback onFeedback stable (useCallback côté Chat) et à des objets `m`
// référentiellement stables, taper dans la chatbox ne re-rend plus l'historique
// — c'est ce qui rendait l'édition et le micro laggy sur les longues sessions.
const Message = memo(function Message({ m, showThinking = true, onFeedback }) {
  const [voted, setVoted] = useState(null); // "like" | "dislike" | null

  function handleVote(rating) {
    if (voted) return;
    setVoted(rating);
    onFeedback?.(rating, m.text);
  }

  switch (m.role) {
    case "user":
      return (
        <div className="animate-fade-up max-w-[85%] self-end rounded-2xl rounded-br-md bg-bubble px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {m.text}
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
            <ReactMarkdown>{m.text}</ReactMarkdown>
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
    case "status":
    default:
      return (
        <div className="animate-fade-up self-start px-1 font-mono text-xs text-faint">
          {m.text}
        </div>
      );
  }
});
