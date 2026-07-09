import { Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { embedOllama } from "./ollama.js";

const DATA_DIR = path.join(process.cwd(), "..", "server", "data");
const NOTES_FILE = path.join(DATA_DIR, "notes.jsonl");

interface Note {
  id: string;
  ts: string;
  content: string;
  tags: string[];
  project?: string;
  embedding?: number[]; // vecteur Ollama (#61 vague 2), calculé best-effort
}

/** Note sans son embedding (charge utile légère renvoyée aux clients). */
function publicNote(n: Note): Omit<Note, "embedding"> {
  const { embedding: _omit, ...rest } = n;
  return rest;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadNotes(): Note[] {
  ensureDataDir();
  if (!fs.existsSync(NOTES_FILE)) return [];
  const lines = fs.readFileSync(NOTES_FILE, "utf-8").split("\n").filter(Boolean);
  return lines.map((l) => JSON.parse(l) as Note);
}

function saveNotes(notes: Note[]) {
  ensureDataDir();
  fs.writeFileSync(NOTES_FILE, notes.map((n) => JSON.stringify(n)).join("\n") + (notes.length ? "\n" : ""), "utf-8");
}

function matchNote(note: Note, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    note.content.toLowerCase().includes(lower) ||
    note.tags.some((t) => t.toLowerCase().includes(lower))
  );
}

function topByKeyword(notes: Note[], question: string, limit = 5): Note[] {
  const words = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const scored = notes.map((n) => {
    const text = (n.content + " " + n.tags.join(" ")).toLowerCase();
    const score = words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
    return { note: n, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.note);
}

/**
 * Parse a raw LLM tag string into a clean array of tags.
 * - Split on commas or newlines
 * - Trim whitespace
 * - Lowercase
 * - Strip leading '#'
 * - Deduplicate
 * - Cap at 4 tags
 * - Filter empty strings
 */
export function parseTags(raw: string): string[] {
  const parts = raw.split(/[,\n]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const tag = part.trim().toLowerCase().replace(/^#+/, "");
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
    if (result.length >= 4) break;
  }
  return result;
}

/**
 * Filter notes by project (strict equality).
 */
export function filterByProject(notes: Note[], project: string): Note[] {
  return notes.filter((n) => n.project === project);
}

async function generateTags(content: string): Promise<string[]> {
  try {
    const provider = resolveProvider(process.env.NOTES_PROVIDER, "claude");
    const raw = await getBrain().complete(
      "",
      `Generate 2 to 4 short tags (one or two words each, lowercase, no #) for the following note. Return only the tags separated by commas, nothing else.\n\nNote: ${content}`,
      { provider, maxTokens: 60 }
    );
    return parseTags(raw);
  } catch {
    return [];
  }
}

// ── Recherche sémantique (#61 vague 2) ───────────────────────────────────────

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Embedding best-effort : null si Ollama injoignable ou modèle d'embedding absent.
 * Exporté pour être réutilisé par d'autres magasins à récupération sémantique
 * (ex. procédures #75) — même chaîne Ollama nomic-embed-text, même dégradation. */
export async function safeEmbed(text: string): Promise<number[] | null> {
  try {
    return await embedOllama(text);
  } catch {
    return null;
  }
}

/** Top-N notes les plus pertinentes : sémantique (cosinus sur embeddings Ollama)
 * quand les notes en portent ET que la requête s'encode ; sinon repli mots-clés. */
async function relevantNotes(notes: Note[], query: string, limit = 3): Promise<Note[]> {
  const withEmb = notes.filter((n) => Array.isArray(n.embedding) && n.embedding!.length > 0);
  if (withEmb.length > 0) {
    const qv = await safeEmbed(query);
    if (qv) {
      return withEmb
        .map((n) => ({ n, score: cosine(qv, n.embedding!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.n);
    }
  }
  return topByKeyword(notes, query, limit);
}

/** Bloc de notes pertinentes à réinjecter dans le system prompt à chaque tour.
 * "" si aucune note ne correspond. Best-effort : ne lève jamais. */
export async function relevantNotesSection(query: string, limit = 3): Promise<string> {
  try {
    if (!query?.trim()) return "";
    const notes = loadNotes();
    if (notes.length === 0) return "";
    const top = await relevantNotes(notes, query, limit);
    if (top.length === 0) return "";
    const block = top
      .map((n) => `- (${n.ts.slice(0, 10)}${n.tags.length ? ` · ${n.tags.join(", ")}` : ""}) ${n.content}`)
      .join("\n");
    return `\n\nPersonal notes relevant to this request (auto-recalled, idea #61) — use them as context/preferences when relevant, never quote them verbatim:\n${block}`;
  } catch {
    return "";
  }
}

export function registerNotesRAGRoutes(app: Express): void {
  app.post("/api/notes", async (req, res) => {
    const { content, tags, project } = req.body as { content?: string; tags?: string[]; project?: string };
    if (!content?.trim()) {
      res.status(400).json({ error: "content required" });
      return;
    }
    const notes = loadNotes();

    // Determine tags: respect user-provided tags, otherwise auto-generate
    const userTags = Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [];
    const resolvedTags = userTags.length > 0 ? userTags : await generateTags(content.trim());

    const embedding = (await safeEmbed(content.trim())) ?? undefined;
    const note: Note = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      content: content.trim(),
      tags: resolvedTags,
      ...(project ? { project } : {}),
      ...(embedding ? { embedding } : {}),
    };
    notes.push(note);
    saveNotes(notes);
    res.json(publicNote(note));
  });

  app.get("/api/notes", (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const project = (req.query.project as string | undefined)?.trim();
    let notes = loadNotes();
    if (project) notes = filterByProject(notes, project);
    if (q) notes = notes.filter((n) => matchNote(n, q));
    res.json(notes.slice().reverse().map(publicNote));
  });

  app.delete("/api/notes/:id", (req, res) => {
    const { id } = req.params;
    const notes = loadNotes();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      res.status(404).json({ error: "not found" });
      return;
    }
    notes.splice(idx, 1);
    saveNotes(notes);
    res.json({ ok: true });
  });

  app.put("/api/notes/:id", async (req, res) => {
    const { id } = req.params;
    const { content, tags, project } = req.body as { content?: string; tags?: string[]; project?: string };
    const notes = loadNotes();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const existing = notes[idx];
    const newContent = content !== undefined ? content.trim() : existing.content;
    const contentChanged = content !== undefined && newContent !== existing.content;
    // Recompute the embedding only when the text actually changed (best-effort).
    const embedding = contentChanged ? ((await safeEmbed(newContent)) ?? existing.embedding) : existing.embedding;
    const updated: Note = {
      ...existing,
      ...(content !== undefined ? { content: newContent } : {}),
      ...(Array.isArray(tags) ? { tags: tags.map((t) => t.trim()).filter(Boolean) } : {}),
      ...(project !== undefined ? { project: project || undefined } : {}),
      ...(embedding ? { embedding } : {}),
    };
    notes[idx] = updated;
    saveNotes(notes);
    res.json(publicNote(updated));
  });

  // Backfill embeddings for notes missing them (best-effort). Idempotent.
  app.post("/api/notes/reindex", async (_req, res) => {
    const notes = loadNotes();
    let indexed = 0, failed = 0;
    for (const n of notes) {
      if (Array.isArray(n.embedding) && n.embedding.length > 0) continue;
      const v = await safeEmbed(n.content);
      if (v) { n.embedding = v; indexed++; } else { failed++; }
    }
    saveNotes(notes);
    res.json({ total: notes.length, indexed, failed });
  });

  app.post("/api/notes/ask", async (req, res) => {
    const { question } = req.body as { question?: string };
    if (!question?.trim()) {
      res.status(400).json({ error: "question required" });
      return;
    }
    const notes = loadNotes();
    const relevant = topByKeyword(notes, question);
    const provider = resolveProvider(process.env.RAG_PROVIDER, "claude");

    try {
      if (relevant.length === 0) {
        const answer = await getBrain().complete(
          "",
          `Tu es un assistant personnel. L'utilisateur n'a pas encore de notes enregistrées (ou aucune note ne correspond à sa question).\n\nQuestion : ${question}\n\nRéponds brièvement en le précisant.`,
          { provider, maxTokens: 1024 }
        );
        res.json({ answer, sources: [] });
        return;
      }

      const context = relevant
        .map((n, i) => `[Note ${i + 1} — ${n.ts.slice(0, 10)}${n.tags.length ? ` | tags: ${n.tags.join(", ")}` : ""}]\n${n.content}`)
        .join("\n\n");

      const answer = await getBrain().complete(
        "",
        `Tu es un assistant personnel qui répond en te basant sur les notes de l'utilisateur.\n\nNotes pertinentes :\n${context}\n\nQuestion : ${question}\n\nRéponds de façon concise et précise en t'appuyant sur les notes ci-dessus.`,
        { provider, maxTokens: 1024 }
      );
      res.json({ answer, sources: relevant.map((n) => n.id) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error });
    }
  });
}
