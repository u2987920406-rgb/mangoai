// Agent PDF (#145, Chantier 3) — pipeline d'ingestion + RAG sémantique local.
//
// Souveraineté totale : extraction via pdfjs-dist (pur JS, zéro service cloud),
// embeddings via Ollama (nomic-embed-text, $0), stockage dans un Blackboard
// SQLite DÉDIÉ (pdf-store.db) pour isoler les chunks PDF des artefacts design.
// La synthèse (query/extraction) passe par askOllama (Gemma local) — Claude
// n'est JAMAIS appelé ici.
//
// Tout le pipeline est INJECTABLE (PdfDeps) → testable sans réseau ni PDF réel.
// L'extracteur réel (pdfjs-dist) est chargé DYNAMIQUEMENT (extractPdfText) pour
// que les tests n'aient aucune dépendance sur le module natif.

import { Blackboard } from "./kernel/kernel-blackboard.js";
import { cosine } from "./kernel/kernel-blackboard-store.js";

// ── Types du domaine ─────────────────────────────────────────────────────────

/** Une page extraite d'un PDF (texte brut + numéro 1-indexé). */
export interface PdfPage {
  text: string;
  pageNum: number;
}

/** Un fragment de document, l'unité d'indexation et de récupération. */
export interface PdfChunk {
  docId: string;
  chunkIndex: number;
  text: string;
  pageNum: number;
  charStart: number;
}

/** Métadonnées d'un document indexé (rangées sous scope "pdf:meta"). */
export interface PdfDocMeta {
  docId: string;
  filename: string;
  pageCount: number;
  chunkCount: number;
  indexedAt: string;
}

/** Dépendances injectables — réseau et I/O isolés pour les tests. */
export interface PdfDeps {
  /** Extrait le texte page par page d'un PDF. Défaut : pdfjs-dist (dynamique). */
  extractText: (path: string) => Promise<PdfPage[]>;
  /** Embedding d'un texte (null si Ollama injoignable → repli mots-clés). */
  embed: (text: string) => Promise<number[] | null>;
  /** Synthèse LLM locale (system, user) → réponse. Défaut : askOllama. */
  ask: (system: string, user: string) => Promise<string>;
}

// Scopes du Blackboard PDF dédié.
const META_SCOPE = "pdf:meta";
const chunkScope = (docId: string) => `pdf:${docId}`;

const MAX_CHUNK_CHARS = 800;
const MAX_EXTRACT_CHARS = 12000; // garde-fou pour l'extraction structurée (contexte borné)

// ── Chunking (pur, déterministe) ─────────────────────────────────────────────

/** Découpe les pages en fragments : split sur les paragraphes (`\n\n`), puis
 * re-split tout bloc qui dépasse `maxChars` (par phrases, sinon par tranches).
 * Chaque chunk garde son `pageNum` et son `charStart` dans la page → sourcing. */
export function chunkPages(pages: PdfPage[], docId: string, maxChars = MAX_CHUNK_CHARS): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  let chunkIndex = 0;
  for (const page of pages) {
    const text = (page.text ?? "").trim();
    if (!text) continue;
    // Position de chaque paragraphe dans la page d'origine (pour charStart).
    let cursor = 0;
    const paragraphs = page.text.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const start = page.text.indexOf(para, cursor);
      cursor = start >= 0 ? start + para.length : cursor;
      const trimmed = para.trim();
      if (!trimmed) continue;
      for (const piece of splitToMax(trimmed, maxChars)) {
        chunks.push({
          docId,
          chunkIndex: chunkIndex++,
          text: piece.text,
          pageNum: page.pageNum,
          charStart: (start >= 0 ? start : 0) + piece.offset,
        });
      }
    }
  }
  return chunks;
}

/** Re-split un bloc trop long : par phrases d'abord, par tranches dures sinon. */
function splitToMax(block: string, maxChars: number): Array<{ text: string; offset: number }> {
  if (block.length <= maxChars) return [{ text: block, offset: 0 }];
  const out: Array<{ text: string; offset: number }> = [];
  const sentences = block.split(/(?<=[.!?])\s+/);
  let buf = "";
  let bufOffset = 0;
  let scan = 0;
  for (const s of sentences) {
    const at = block.indexOf(s, scan);
    scan = at >= 0 ? at + s.length : scan;
    if (s.length > maxChars) {
      // Phrase géante → tranches dures.
      if (buf) {
        out.push({ text: buf.trim(), offset: bufOffset });
        buf = "";
      }
      for (let i = 0; i < s.length; i += maxChars) {
        out.push({ text: s.slice(i, i + maxChars).trim(), offset: (at >= 0 ? at : 0) + i });
      }
      continue;
    }
    if (buf.length + s.length + 1 > maxChars) {
      out.push({ text: buf.trim(), offset: bufOffset });
      buf = s;
      bufOffset = at >= 0 ? at : 0;
    } else {
      if (!buf) bufOffset = at >= 0 ? at : 0;
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf.trim()) out.push({ text: buf.trim(), offset: bufOffset });
  return out.filter((c) => c.text.length > 0);
}

// ── Indexation ───────────────────────────────────────────────────────────────

/** Extrait, découpe, embarque (best-effort) et range un PDF dans le Blackboard.
 * Renvoie les métadonnées du document. Idempotent par docId (écrase l'ancien). */
export async function indexPdf(
  pdfPath: string,
  docId: string,
  filename: string,
  bb: Blackboard,
  deps: PdfDeps,
): Promise<PdfDocMeta> {
  const pages = await deps.extractText(pdfPath);
  const chunks = chunkPages(pages, docId);

  // Purge un éventuel ancien index du même docId avant de réécrire.
  for (const key of bb.keys(chunkScope(docId))) bb.delete(chunkScope(docId), key);

  for (const chunk of chunks) {
    const embedding = (await deps.embed(chunk.text)) ?? undefined;
    bb.put(chunkScope(docId), `c${chunk.chunkIndex}`, chunk, embedding);
  }

  const meta: PdfDocMeta = {
    docId,
    filename,
    pageCount: pages.length,
    chunkCount: chunks.length,
    indexedAt: new Date().toISOString(),
  };
  bb.put(META_SCOPE, docId, meta);
  return meta;
}

// ── Récupération sémantique ──────────────────────────────────────────────────

/** Les k chunks les plus pertinents : sémantique (cosinus sur embeddings) quand
 * la requête s'encode ET que des chunks portent un embedding ; repli mots-clés
 * sinon. Pur vis-à-vis du réseau (via deps.embed). */
export async function retrieveChunks(
  query: string,
  docId: string,
  bb: Blackboard,
  deps: PdfDeps,
  k = 4,
): Promise<PdfChunk[]> {
  const scope = chunkScope(docId);
  const keys = bb.keys(scope);
  if (keys.length === 0) return [];

  const qv = await deps.embed(query);
  if (qv) {
    const hits = bb.search(scope, qv, k);
    if (hits.length > 0) return hits.map((h) => h.value as PdfChunk);
  }

  // Repli déterministe par mots-clés.
  return keywordRank(query, keys.map((key) => bb.get<PdfChunk>(scope, key)!).filter(Boolean), k);
}

/** Tri par recouvrement de mots-clés (déterministe, sans réseau). */
export function keywordRank(query: string, chunks: PdfChunk[], k: number): PdfChunk[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return chunks
    .map((c) => {
      const text = c.text.toLowerCase();
      const score = words.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => s.c);
}

/** Répond à une question sur un document via RAG : récupère les chunks
 * pertinents puis synthétise une réponse locale (Gemma), avec les sources. */
export async function queryPdf(
  query: string,
  docId: string,
  bb: Blackboard,
  deps: PdfDeps,
  k = 4,
): Promise<{ answer: string; sources: PdfChunk[] }> {
  const chunks = await retrieveChunks(query, docId, bb, deps, k);
  if (chunks.length === 0) {
    return { answer: "Aucun passage pertinent trouvé dans ce document.", sources: [] };
  }
  const context = chunks
    .map((c, i) => `[Extrait ${i + 1} — page ${c.pageNum}]\n${c.text}`)
    .join("\n\n");
  const answer = await deps.ask(
    "Tu es un assistant qui répond STRICTEMENT à partir des extraits fournis d'un document. Si l'information n'y est pas, dis-le. Cite les numéros de page.",
    `Extraits du document :\n${context}\n\nQuestion : ${query}\n\nRéponse concise, en t'appuyant uniquement sur les extraits ci-dessus :`,
  );
  return { answer, sources: chunks };
}

/** Extraction structurée : demande au modèle local de produire du JSON conforme
 * à une instruction, à partir du contenu (borné) du document. Renvoie l'objet
 * parsé, ou `{ raw }` si la réponse n'est pas du JSON valide. */
export async function extractStructuredFromPdf(
  instruction: string,
  docId: string,
  bb: Blackboard,
  deps: PdfDeps,
): Promise<unknown> {
  const scope = chunkScope(docId);
  const chunks = bb
    .keys(scope)
    .map((key) => bb.get<PdfChunk>(scope, key)!)
    .filter(Boolean)
    .sort((a, b) => a.chunkIndex - b.chunkIndex);

  let context = "";
  for (const c of chunks) {
    if (context.length + c.text.length > MAX_EXTRACT_CHARS) break;
    context += `${c.text}\n\n`;
  }
  if (!context) return null;

  const raw = await deps.ask(
    "Tu extrais des données structurées d'un document. Réponds UNIQUEMENT avec du JSON valide, sans texte autour, sans balises markdown.",
    `Document :\n${context}\n\nInstruction : ${instruction}\n\nJSON :`,
  );
  return parseJsonLoose(raw);
}

/** Parse défensif : tolère les fences markdown ```json … ``` et le bruit autour. */
export function parseJsonLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // Tente d'isoler le 1er objet/array.
    const match = text.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* tombe sur raw */
      }
    }
    return { raw };
  }
}

// ── Liste / suppression ──────────────────────────────────────────────────────

/** Toutes les métadonnées de documents indexés (les plus récents d'abord). */
export function listPdfDocs(bb: Blackboard): PdfDocMeta[] {
  return bb
    .keys(META_SCOPE)
    .map((key) => bb.get<PdfDocMeta>(META_SCOPE, key)!)
    .filter(Boolean)
    .sort((a, b) => (a.indexedAt < b.indexedAt ? 1 : -1));
}

/** Supprime un document : ses chunks + sa métadonnée. Renvoie le nb de chunks ôtés. */
export function deletePdfDoc(docId: string, bb: Blackboard): number {
  const scope = chunkScope(docId);
  const keys = bb.keys(scope);
  for (const key of keys) bb.delete(scope, key);
  bb.delete(META_SCOPE, docId);
  return keys.length;
}

// ── Dépendances par défaut (production) ──────────────────────────────────────

/** Extracteur réel via pdfjs-dist — chargé DYNAMIQUEMENT (les tests n'en
 * dépendent pas). Utilise le build legacy (Node, pas de DOM/worker). */
export async function extractPdfText(pdfPath: string): Promise<PdfPage[]> {
  const fs = await import("node:fs");
  // Le build legacy fonctionne en Node sans worker ni canvas.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: unknown) => (it as { str?: string }).str ?? "")
      .join(" ")
      .replace(/[ \t]+/g, " ");
    pages.push({ text, pageNum: i });
  }
  await doc.cleanup();
  return pages;
}

/** Les dépendances de production : pdfjs-dist + Ollama (embed + ask). */
export async function defaultPdfDeps(): Promise<PdfDeps> {
  const { safeEmbed } = await import("./notes-rag.js");
  const { askOllama } = await import("./ollama.js");
  return {
    extractText: extractPdfText,
    embed: safeEmbed,
    ask: (system, user) => askOllama(system, user, { model: process.env.PDF_AGENT_MODEL }),
  };
}
