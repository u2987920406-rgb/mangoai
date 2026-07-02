// Chat conversationnel avec l'Esthète — agent système qui voit la preview live
// (vois_ecran) et retouche le projet à la demande. Composant DÉDIÉ, léger,
// volontairement séparé de Chat.jsx (883 lignes, couplé en dur à /api/chat et à
// tout un appareil non pertinent ici : editTarget/tutorialId/clientMode/upload).
// Reprend uniquement le sous-ensemble utile : parsing SSE, historique, stop.
import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Square, Sparkles, Wrench } from "lucide-react";
import { api } from "../api";
import { Button, Textarea, EmptyState, cx, TEXT } from "../design";

let nextId = 1;
const uid = () => nextId++;

function Bubble({ entry }) {
  if (entry.role === "user") {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent/15 px-3.5 py-2 text-[13px] text-ink">
        {entry.text}
      </div>
    );
  }
  if (entry.role === "tool") {
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] text-faint">
        <Wrench size={11} /> {entry.name}
      </div>
    );
  }
  if (entry.role === "status") {
    return <div className="text-[11.5px] italic text-faint">{entry.text}</div>;
  }
  if (entry.role === "error") {
    return <div className="rounded-xl border border-err/30 bg-err/10 px-3 py-2 text-[12.5px] text-err">{entry.text}</div>;
  }
  return (
    <div className="mr-auto max-w-[85%] rounded-2xl rounded-bl-md border border-edge bg-panel px-3.5 py-2 text-[13px] leading-relaxed text-ink">
      {entry.text}
    </div>
  );
}

export default function EstheteChat({ projectName, onPreviewTouched }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!projectName) { setLoaded(true); return; }
    let cancelled = false;
    api(`/api/esthete/${encodeURIComponent(projectName)}/history`)
      .then((d) => {
        if (cancelled) return;
        setMessages((d.entries ?? []).map((e) => ({ id: uid(), role: e.role, text: e.text })));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => { cancelled = true; };
  }, [projectName]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const push = (entry) => setMessages((m) => [...m, { id: uid(), ...entry }]);

  async function send() {
    const text = input.trim();
    if (!text || busy || !projectName) return;
    setInput("");
    push({ role: "user", text });
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`/api/esthete/${encodeURIComponent(projectName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        push({ role: "error", text: err.error ?? `Erreur HTTP ${res.status}` });
        return;
      }
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
          const ev = JSON.parse(line.slice(6));
          if (ev.type === "text") push({ role: "agent", text: ev.text });
          else if (ev.type === "tool") push({ role: "tool", name: ev.name });
          else if (ev.type === "status") push({ role: "status", text: ev.text });
          else if (ev.type === "error") push({ role: "error", text: ev.message });
          else if (ev.type === "result" && ev.ok) onPreviewTouched?.();
        }
      }
    } catch (err) {
      if (err?.name === "AbortError") push({ role: "status", text: "⏹ Arrêté." });
      else push({ role: "error", text: String(err) });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  if (loaded && !projectName) {
    return (
      <EmptyState
        icon={<Sparkles size={30} />}
        title="Aucun projet ouvert"
        description="Ouvre ou crée un projet dans l'App Builder avant de discuter avec l'Esthète."
      />
    );
  }

  return (
    <div className="flex h-[560px] max-h-[70vh] flex-col">
      <div ref={listRef} className="nice-scroll flex-1 space-y-2.5 overflow-y-auto px-1 py-2">
        {messages.length === 0 && loaded && (
          <p className={cx(TEXT.base, "py-8 text-center text-faint")}>
            Demande une retouche visuelle précise — l'Esthète regarde le rendu réel avant de conclure.
          </p>
        )}
        {messages.map((m) => <Bubble key={m.id} entry={m} />)}
        {busy && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <Loader2 size={12} className="animate-spin" /> L'Esthète réfléchit…
          </div>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2 border-t border-edge-soft pt-2.5">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Rends le bouton principal plus arrondi…"
          rows={2}
          disabled={!projectName}
          className="flex-1"
        />
        {busy ? (
          <Button variant="secondary" size="sm" icon={<Square size={13} />} onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" size="sm" icon={<Send size={13} />} disabled={!input.trim() || !projectName} onClick={send}>
            Envoyer
          </Button>
        )}
      </div>
    </div>
  );
}
