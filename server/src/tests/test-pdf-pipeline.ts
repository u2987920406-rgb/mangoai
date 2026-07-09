// Tests déterministes du pipeline PDF (#145, Chantier 3).
// Zéro réseau, zéro PDF réel : extractText/embed/ask sont mockés, le Blackboard
// tourne en MemoryStore. Couvre chunking, indexation, récupération sémantique +
// repli mots-clés, query RAG, extraction structurée, liste, suppression.
//
// Lancer : npx tsx src/test-pdf-pipeline.ts

import { Blackboard } from "../kernel/kernel-blackboard.js";
import {
  chunkPages,
  indexPdf,
  retrieveChunks,
  keywordRank,
  queryPdf,
  extractStructuredFromPdf,
  listPdfDocs,
  deletePdfDoc,
  parseJsonLoose,
  type PdfDeps,
  type PdfPage,
} from "../pdf-pipeline.js";

import { line, makeCheck } from "./test-util.js";
let failures = 0;
const check = makeCheck(() => { failures++; });

line("═");
console.log("test-pdf-pipeline — Agent PDF (#145, Chantier 3)");
line();

// Mock d'embedding DÉTERMINISTE : un vecteur dérivé de mots-clés (pas de réseau).
// Chaque dimension = présence d'un mot-thème → cosinus discrimine les sujets.
const THEMES = ["mangue", "facture", "client", "total", "react", "design"];
function fakeEmbed(text: string): number[] {
  const lower = text.toLowerCase();
  return THEMES.map((t) => (lower.includes(t) ? 1 : 0));
}

// ── [1] chunkPages (pur) ─────────────────────────────────────────────────────
console.log("\n  [1] chunkPages :");
const pages1: PdfPage[] = [
  { text: "Premier paragraphe sur la mangue.\n\nDeuxième paragraphe sur le client.", pageNum: 1 },
  { text: "Page deux : facture et total.", pageNum: 2 },
];
const chunks1 = chunkPages(pages1, "doc1");
check("3 chunks produits (2 paragraphes p1 + 1 p2)", chunks1.length === 3);
check("chunkIndex séquentiel 0,1,2", chunks1.every((c, i) => c.chunkIndex === i));
check("pageNum préservé (dernier chunk = page 2)", chunks1[2].pageNum === 2);
check("charStart renseigné (2e paragraphe > 0)", chunks1[1].charStart > 0);
check("docId propagé", chunks1.every((c) => c.docId === "doc1"));

// Re-split d'un bloc long (> 800 chars).
const longText = Array.from({ length: 60 }, (_, i) => `Phrase numero ${i} ici.`).join(" ");
const longChunks = chunkPages([{ text: longText, pageNum: 1 }], "doc-long");
check("bloc long re-splité en plusieurs chunks", longChunks.length > 1);
check("chaque chunk ≤ 800 chars", longChunks.every((c) => c.text.length <= 800));

// Page vide ignorée.
const emptyChunks = chunkPages([{ text: "   \n\n  ", pageNum: 1 }], "doc-empty");
check("page vide → 0 chunk", emptyChunks.length === 0);

// ── [2] indexPdf (mock extractText + embed) ──────────────────────────────────
console.log("\n  [2] indexPdf :");
const deps: PdfDeps = {
  extractText: async () => pages1,
  embed: async (t) => fakeEmbed(t),
  ask: async (_s, _u) => "réponse mock",
};

const bb = new Blackboard();
const meta = await indexPdf("/fake/path.pdf", "doc1", "rapport.pdf", bb, deps);
check("meta.docId = doc1", meta.docId === "doc1");
check("meta.filename = rapport.pdf", meta.filename === "rapport.pdf");
check("meta.pageCount = 2", meta.pageCount === 2);
check("meta.chunkCount = 3", meta.chunkCount === 3);
check("meta.indexedAt est une date ISO", !Number.isNaN(Date.parse(meta.indexedAt)));
check("chunks rangés sous scope pdf:doc1", bb.keys("pdf:doc1").length === 3);
check("meta rangée sous pdf:meta", bb.has("pdf:meta", "doc1"));

// Idempotence : réindexer écrase, ne double pas.
await indexPdf("/fake/path.pdf", "doc1", "rapport.pdf", bb, deps);
check("réindexation idempotente (toujours 3 chunks)", bb.keys("pdf:doc1").length === 3);

// ── [3] retrieveChunks — sémantique ──────────────────────────────────────────
console.log("\n  [3] retrieveChunks (sémantique) :");
const semHits = await retrieveChunks("facture et total du client", "doc1", bb, deps, 2);
check("récupère des chunks", semHits.length > 0);
check("top chunk concerne la facture/total (page 2)", semHits[0].pageNum === 2);

// ── [4] retrieveChunks — repli mots-clés (embed indisponible) ────────────────
console.log("\n  [4] retrieveChunks (repli mots-clés, embed → null) :");
const depsNoEmbed: PdfDeps = { ...deps, embed: async () => null };
const bb2 = new Blackboard();
await indexPdf("/fake/p.pdf", "doc2", "f.pdf", bb2, depsNoEmbed);
const kwHits = await retrieveChunks("mangue", "doc2", bb2, depsNoEmbed, 2);
check("repli mots-clés trouve le chunk 'mangue'", kwHits.some((c) => c.text.toLowerCase().includes("mangue")));

// keywordRank direct
const kr = keywordRank("client facture", chunks1, 5);
check("keywordRank classe par recouvrement", kr.length > 0 && kr[0].text.toLowerCase().includes("client"));
check("keywordRank ignore les chunks sans match", keywordRank("introuvablexyz", chunks1, 5).length === 0);

// ── [5] queryPdf ─────────────────────────────────────────────────────────────
console.log("\n  [5] queryPdf :");
let askedUser = "";
const depsAsk: PdfDeps = {
  ...deps,
  ask: async (_s, user) => {
    askedUser = user;
    return "Le total figure en page 2.";
  },
};
const qr = await queryPdf("quel est le total ?", "doc1", bb, depsAsk, 2);
check("answer non vide", qr.answer.length > 0);
check("sources renvoyées", qr.sources.length > 0);
check("contexte passé au modèle contient les extraits", askedUser.includes("Extrait"));

// Document inexistant → réponse honnête, zéro source.
const qrEmpty = await queryPdf("test", "inconnu", bb, depsAsk, 2);
check("doc inconnu → aucune source", qrEmpty.sources.length === 0);

// ── [6] extractStructuredFromPdf ─────────────────────────────────────────────
console.log("\n  [6] extractStructuredFromPdf :");
const depsJson: PdfDeps = {
  ...deps,
  ask: async () => '```json\n{"total": 42, "client": "Mango SARL"}\n```',
};
const extracted = (await extractStructuredFromPdf("extrais le total et le client", "doc1", bb, depsJson)) as Record<string, unknown>;
check("JSON parsé (total = 42)", extracted.total === 42);
check("JSON parsé (client = Mango SARL)", extracted.client === "Mango SARL");

// Réponse non-JSON → { raw }
const depsRaw: PdfDeps = { ...deps, ask: async () => "désolé je ne sais pas" };
const rawResult = (await extractStructuredFromPdf("x", "doc1", bb, depsRaw)) as Record<string, unknown>;
check("réponse non-JSON → { raw }", typeof rawResult.raw === "string");

// parseJsonLoose direct
check("parseJsonLoose : fences markdown", JSON.stringify(parseJsonLoose('```json\n{"a":1}\n```')) === '{"a":1}');
check("parseJsonLoose : objet noyé dans du texte", (parseJsonLoose('voici: {"b":2} fin') as { b: number }).b === 2);

// ── [7] listPdfDocs / deletePdfDoc ───────────────────────────────────────────
console.log("\n  [7] liste + suppression :");
const docs = listPdfDocs(bb);
check("listPdfDocs renvoie au moins doc1", docs.some((d) => d.docId === "doc1"));
const removed = deletePdfDoc("doc1", bb);
check("deletePdfDoc renvoie le nb de chunks ôtés", removed === 3);
check("chunks de doc1 supprimés", bb.keys("pdf:doc1").length === 0);
check("métadonnée de doc1 supprimée", !bb.has("pdf:meta", "doc1"));

// ── Résultat ─────────────────────────────────────────────────────────────────
line("═");
console.log(failures === 0
  ? "✅ Tous les checks sont verts — pipeline PDF prêt."
  : `❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
