import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Search, Send, Tag, Mic, MicOff, Pencil, X, Check, FolderOpen } from "lucide-react";

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export default function NotesRAG({ onBack, onToast = () => {} }) {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [projects, setProjects] = useState([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [loadingAdd, setLoadingAdd] = useState(false);

  // Mic state for add-note textarea
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Edit state: noteId → { content, tagsInput, project }
  const [editing, setEditing] = useState(null); // null or { id, content, tagsInput, project }

  // Load projects list once
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data.projects) ? data.projects : []))
      .catch(() => {});
  }, []);

  const fetchNotes = useCallback(async (q = "", project = "") => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (project) params.set("project", project);
    const url = params.toString() ? `/api/notes?${params.toString()}` : "/api/notes";
    const res = await fetch(url);
    if (res.ok) setNotes(await res.json());
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    const id = setTimeout(() => fetchNotes(search, projectFilter), 250);
    return () => clearTimeout(id);
  }, [search, projectFilter, fetchNotes]);

  // ── Mic (same pattern as Chat.jsx) ──────────────────────────────────────
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
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
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
          if (data.text?.trim()) setContent((prev) => (prev ? prev + " " + data.text : data.text));
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

  // ── Add note ─────────────────────────────────────────────────────────────
  async function addNote() {
    if (!content.trim()) return;
    setLoadingAdd(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        tags,
        ...(selectedProject ? { project: selectedProject } : {}),
      }),
    });
    setContent("");
    setTagsInput("");
    setSelectedProject("");
    await fetchNotes(search, projectFilter);
    setLoadingAdd(false);
  }

  // ── Delete note ───────────────────────────────────────────────────────────
  async function deleteNote(id) {
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  // ── Edit note ─────────────────────────────────────────────────────────────
  function startEdit(note) {
    setEditing({
      id: note.id,
      content: note.content,
      tagsInput: note.tags.join(", "),
      project: note.project || "",
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const tags = editing.tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    await fetch(`/api/notes/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: editing.content,
        tags,
        project: editing.project || "",
      }),
    });
    setEditing(null);
    await fetchNotes(search, projectFilter);
  }

  // ── Ask ───────────────────────────────────────────────────────────────────
  async function ask() {
    if (!question.trim()) return;
    setLoadingAsk(true);
    setAnswer(null);
    const res = await fetch("/api/notes/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (res.ok) {
      const data = await res.json();
      setAnswer(data.answer);
    }
    setLoadingAsk(false);
  }

  // ── Mic button style ──────────────────────────────────────────────────────
  const micClass = listening
    ? "text-red-400 animate-pulse"
    : transcribing
    ? "text-accent-soft animate-pulse"
    : "text-faint hover:text-ink";

  return (
    <div className="h-full overflow-y-auto bg-bg text-ink p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-dim hover:text-ink transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            Retour
          </button>
          <h1 className="text-xl font-semibold text-ink">Notes & RAG personnel</h1>
        </div>

        {/* Search + project filter bar */}
        <div className="flex gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les notes..."
              className="w-full bg-panel border border-edge rounded-lg pl-9 pr-4 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft"
            />
          </div>
          {projects.length > 0 && (
            <div className="relative">
              <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="bg-panel border border-edge rounded-lg pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-soft appearance-none cursor-pointer"
              >
                <option value="">Tous les projets</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Notes list */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wide">Mes notes</h2>
            {notes.length === 0 && (
              <p className="text-faint text-sm">Aucune note{search ? " correspondant à la recherche" : ""}.</p>
            )}
            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {notes.map((note) =>
                editing?.id === note.id ? (
                  // ── Inline edit mode ──────────────────────────────────────
                  <div
                    key={note.id}
                    className="bg-panel border border-accent-soft rounded-lg p-3 flex flex-col gap-2"
                  >
                    <textarea
                      value={editing.content}
                      onChange={(e) => setEditing((prev) => ({ ...prev, content: e.target.value }))}
                      rows={4}
                      className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft resize-none"
                    />
                    <input
                      type="text"
                      value={editing.tagsInput}
                      onChange={(e) => setEditing((prev) => ({ ...prev, tagsInput: e.target.value }))}
                      placeholder="Tags séparés par des virgules"
                      className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft"
                    />
                    {projects.length > 0 && (
                      <select
                        value={editing.project}
                        onChange={(e) => setEditing((prev) => ({ ...prev, project: e.target.value }))}
                        className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-soft appearance-none cursor-pointer"
                      >
                        <option value="">— aucun projet —</option>
                        {projects.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 text-xs text-faint hover:text-ink transition-colors px-2 py-1 rounded"
                      >
                        <X size={12} />
                        Annuler
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={!editing.content.trim()}
                        className="flex items-center gap-1 text-xs bg-accent-soft text-bg font-semibold rounded px-3 py-1 hover:opacity-90 transition-opacity disabled:opacity-40"
                      >
                        <Check size={12} />
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── Normal view mode ──────────────────────────────────────
                  <div
                    key={note.id}
                    className="bg-panel border border-edge rounded-lg p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-ink leading-relaxed flex-1 whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button
                          onClick={() => startEdit(note)}
                          className="text-faint hover:text-accent-soft transition-colors"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-faint hover:text-red-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {note.project && (
                        <span className="inline-flex items-center gap-1 text-xs bg-bg border border-accent-soft/40 rounded px-2 py-0.5 text-accent-soft">
                          <FolderOpen size={10} />
                          {note.project}
                        </span>
                      )}
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-xs bg-bg border border-edge rounded px-2 py-0.5 text-accent-soft"
                        >
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                      <span className="text-xs text-faint ml-auto">{relativeDate(note.ts)}</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right panel: add note + ask */}
          <div className="flex flex-col gap-5">
            <div className="bg-panel border border-edge rounded-lg p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-accent uppercase tracking-wide">Ajouter une note</h2>

              {/* Textarea + mic button */}
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Contenu de la note..."
                  rows={4}
                  className="w-full bg-bg border border-edge rounded-lg px-3 py-2 pr-9 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft resize-none"
                />
                <button
                  onClick={toggleMic}
                  disabled={transcribing}
                  className={`absolute right-2 top-2 transition-colors ${micClass}`}
                  title={listening ? "Arrêter l'enregistrement" : "Dicter une note"}
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>
              {transcribing && (
                <p className="text-xs text-faint animate-pulse -mt-1">Transcription en cours…</p>
              )}

              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Tags séparés par des virgules — ou laissez vide (auto)"
                className="w-full bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft"
              />

              {projects.length > 0 && (
                <div className="relative">
                  <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full bg-bg border border-edge rounded-lg pl-8 pr-3 py-2 text-sm text-ink focus:outline-none focus:border-accent-soft appearance-none cursor-pointer"
                  >
                    <option value="">— aucun projet —</option>
                    {projects.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={addNote}
                disabled={loadingAdd || !content.trim()}
                className="flex items-center justify-center gap-2 bg-accent-soft text-bg font-semibold text-sm rounded-lg px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Plus size={15} />
                {loadingAdd ? "Ajout…" : "Ajouter"}
              </button>
            </div>

            <div className="bg-panel border border-edge rounded-lg p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-accent uppercase tracking-wide">Poser une question</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask()}
                  placeholder="Que disent mes notes sur…"
                  className="flex-1 bg-bg border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent-soft"
                />
                <button
                  onClick={ask}
                  disabled={loadingAsk || !question.trim()}
                  className="flex items-center gap-1 bg-accent-soft text-bg font-semibold text-sm rounded-lg px-3 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
                >
                  <Send size={14} />
                  {loadingAsk ? "…" : "Envoyer"}
                </button>
              </div>
              {loadingAsk && (
                <p className="text-xs text-faint animate-pulse">Analyse des notes en cours…</p>
              )}
              {answer && (
                <div className="bg-bg border border-edge rounded-lg p-3">
                  <p className="text-xs text-faint mb-1 uppercase tracking-wide">Réponse</p>
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{answer}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
