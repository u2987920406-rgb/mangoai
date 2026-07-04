// Tests A1.4 (2026-07-04) — validation MÉCANIQUE avant promotion d'un axiome
// (dédup sémantique + quarantaine), revue globale backlog #9.
//
// Prouve :
//  - splitAxiomBlocks : découpe verbatim, ignore l'avant-premier-en-tête ;
//  - bestSimilarity : cosinus max, capte l'EXACT (cos=1), ignore embeddings vides ;
//  - planPromotion (PUR) : doublon d'un confirmé → skip ; nouveau → quarantaine
//    (seen=1) ; re-vu → promotion ; promoteAfter=1 → promotion immédiate ;
//  - runAxiomValidation (deps FACTICES, disque réel) : nouveau → quarantaine SANS
//    toucher .axioms.md ; re-vu → promu dans .axioms.md, quarantaine vidée ;
//    quasi-doublon d'un confirmé → .axioms-conflicts.md, .axioms.md inchangé ;
//    embed null → promotion directe (fail-open) ;
//  - appendConfirmedAxiom : bytes STRICTEMENT identiques à l'append historique
//    (preuve que la branche gate OFF est byte-identique) ;
//  - gate OFF (défaut) : flag AXIOMS_VALIDATION inactif.
//
// Lancer : npx tsx src/test-axioms-validation.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  splitAxiomBlocks,
  bestSimilarity,
  planPromotion,
  runAxiomValidation,
  appendConfirmedAxiom,
  loadQuarantine,
  AXIOMS_QUARANTINE_FILE_NAME,
  PROMOTE_AFTER_DEFAULT,
  SIMILARITY_THRESHOLD,
  type QuarantineEntry,
} from "./axioms-validation.js";
import { AXIOMS_FILE_NAME } from "./axioms.js";
import { ATOMS_CONFLICTS_FILE_NAME } from "./axioms-drift.js";
import { flag } from "./flags.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-axioms-validation (A1.4)");
console.log("─".repeat(60));

// Embedding déterministe : le mot-clé dominant fixe la direction du vecteur.
// Deux textes "pagination" sont quasi colinéaires ; "espacement" est orthogonal.
function fakeEmbed(text: string): number[] {
  const paginer = /pagin/i.test(text) ? 1 : 0;
  const espacement = /espace|padding/i.test(text) ? 1 : 0;
  const bruit = (text.length % 7) * 0.001;
  return [paginer, espacement, bruit];
}

const NOW = "2026-07-04T00:00:00.000Z";

// ── splitAxiomBlocks (PUR) ───────────────────────────────────────────────────
{
  const raw = "# entête ignorée\n\nAXIOME-A ligne\n- détail\n\nAXIOME-B autre\n- détail";
  const blocks = splitAxiomBlocks(raw);
  check("découpe en 2 blocs", blocks.length === 2);
  check("bloc A verbatim (avec ses détails)", blocks[0] === "AXIOME-A ligne\n- détail");
  check("bloc B verbatim", blocks[1] === "AXIOME-B autre\n- détail");
  check("l'avant-premier-en-tête (commentaire) est ignoré", !blocks.join("").includes("entête ignorée"));
  check("texte vide → 0 bloc", splitAxiomBlocks("").length === 0);
  check("texte sans en-tête AXIOME- → 0 bloc", splitAxiomBlocks("juste du texte\nsans axiome").length === 0);
}

// ── bestSimilarity (PUR) ─────────────────────────────────────────────────────
{
  const items = [
    { text: "orthogonal", embedding: [0, 1, 0] },
    { text: "identique", embedding: [1, 0, 0] },
    { text: "vide", embedding: [] },
  ];
  const best = bestSimilarity([1, 0, 0], items);
  check("capte le doublon EXACT (cos=1)", !!best && best.index === 1 && Math.abs(best.score - 1) < 1e-9);
  check("liste vide → null", bestSimilarity([1, 0, 0], []) === null);
  check("embedding vide ignoré (pas de crash)", bestSimilarity([1, 0, 0], [{ text: "vide", embedding: [] }]) === null);
}

// ── planPromotion (PUR) ──────────────────────────────────────────────────────
{
  const embPaginer = fakeEmbed("paginer");
  // 1. Doublon d'un confirmé → skip-duplicate.
  const dup = planPromotion({
    candidate: "AXIOME-DATA-02 paginer systématiquement",
    candidateEmbedding: embPaginer,
    confirmed: [{ text: "AXIOME-DATA-01 toujours paginer les grands tableaux", embedding: fakeEmbed("paginer tableaux") }],
    quarantine: [],
    threshold: SIMILARITY_THRESHOLD,
    promoteAfter: PROMOTE_AFTER_DEFAULT,
    now: NOW,
  });
  check("doublon d'un confirmé → skip-duplicate", dup.action === "skip-duplicate");
  check("skip-duplicate → quarantaine inchangée (vide)", dup.quarantine.length === 0);

  // 2. Nouveau candidat (aucun confirmé proche) → quarantaine, seen=1.
  const fresh = planPromotion({
    candidate: "AXIOME-DATA-01 toujours paginer",
    candidateEmbedding: embPaginer,
    confirmed: [{ text: "AXIOME-UIUX-01 échelle d'espacement", embedding: fakeEmbed("espace padding") }],
    quarantine: [],
    threshold: SIMILARITY_THRESHOLD,
    promoteAfter: 2,
    now: NOW,
  });
  check("nouveau (promoteAfter=2) → quarantine", fresh.action === "quarantine");
  check("quarantine → 1 entrée seen=1", fresh.quarantine.length === 1 && fresh.quarantine[0].seen === 1);

  // 3. Candidat déjà en quarantaine (proche) re-vu → promotion.
  const existingQuar: QuarantineEntry = { text: "AXIOME-DATA-01 toujours paginer", seen: 1, firstSeen: NOW, lastSeen: NOW };
  const promote = planPromotion({
    candidate: "AXIOME-DATA-01 paginer encore",
    candidateEmbedding: embPaginer,
    confirmed: [],
    quarantine: [{ entry: existingQuar, embedding: fakeEmbed("paginer") }],
    threshold: SIMILARITY_THRESHOLD,
    promoteAfter: 2,
    now: "2026-07-05T00:00:00.000Z",
  });
  check("re-vu en quarantaine (seen atteint promoteAfter) → promote", promote.action === "promote");
  check("promote → l'entrée quitte la quarantaine", promote.quarantine.length === 0);
  check("promote → texte de l'entrée quarantaine (pas du nouveau libellé)", promote.action === "promote" && promote.text === existingQuar.text);

  // 4. promoteAfter=1 → promotion immédiate d'un nouveau.
  const immediate = planPromotion({
    candidate: "AXIOME-X neuf",
    candidateEmbedding: [0, 0, 1],
    confirmed: [],
    quarantine: [],
    threshold: SIMILARITY_THRESHOLD,
    promoteAfter: 1,
    now: NOW,
  });
  check("promoteAfter=1 → promotion immédiate", immediate.action === "promote");
  check("promoteAfter=1 → quarantaine reste vide", immediate.quarantine.length === 0);
}

// ── appendConfirmedAxiom : bytes == append historique ────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axval-bytes-"));
  const axPath = path.join(dir, AXIOMS_FILE_NAME);
  // Reproduit l'ordre exact de l'append historique de reviewToAxioms.
  appendConfirmedAxiom(dir, "AXIOME-A un");
  appendConfirmedAxiom(dir, "AXIOME-B deux");
  const got = fs.readFileSync(axPath, "utf8");
  const expected = "AXIOME-A un" + "\n\n" + "AXIOME-B deux" + "\n";
  check("appendConfirmedAxiom : bytes STRICTEMENT identiques à l'append historique", got === expected);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── runAxiomValidation (deps FACTICES, disque réel) ──────────────────────────
async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axval-"));
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Quarantaine avant promotion : 1er passage = quarantaine (0 axiome injecté) ;
// 2e passage = promotion (axiome injecté, quarantaine vidée).
await withDir(async (dir) => {
  const deps = { embed: async (t: string) => fakeEmbed(t) };
  const r1 = await runAxiomValidation(dir, "AXIOME-DATA-01 toujours paginer les grands tableaux", deps);
  check("1er passage → outcome 'quarantined'", r1.outcomes[0] === "quarantined");
  check("1er passage → .axioms.md N'EST PAS créé (rien injecté à vie)", !fs.existsSync(path.join(dir, AXIOMS_FILE_NAME)));
  check("1er passage → quarantaine créée (seen=1)", loadQuarantine(dir).length === 1 && loadQuarantine(dir)[0].seen === 1);

  const r2 = await runAxiomValidation(dir, "AXIOME-DATA-01 paginer toujours les tableaux volumineux", deps);
  check("2e passage (re-vu) → outcome 'promoted'", r2.outcomes[0] === "promoted");
  check("2e passage → .axioms.md créé (promotion)", fs.existsSync(path.join(dir, AXIOMS_FILE_NAME)));
  check("2e passage → quarantaine vidée", loadQuarantine(dir).length === 0);
});

// Dédup : un quasi-doublon d'un CONFIRMÉ n'est pas ré-injecté, il est consigné.
await withDir(async (dir) => {
  fs.writeFileSync(path.join(dir, AXIOMS_FILE_NAME), "AXIOME-DATA-01 toujours paginer les grands tableaux\n");
  const before = fs.readFileSync(path.join(dir, AXIOMS_FILE_NAME), "utf8");
  const deps = { embed: async (t: string) => fakeEmbed(t) };
  const r = await runAxiomValidation(dir, "AXIOME-DATA-99 paginer systématiquement les tableaux volumineux", deps);
  check("quasi-doublon d'un confirmé → outcome 'skipped-duplicate'", r.outcomes[0] === "skipped-duplicate");
  check("quasi-doublon → .axioms.md INCHANGÉ (pas de croissance)", fs.readFileSync(path.join(dir, AXIOMS_FILE_NAME), "utf8") === before);
  check("quasi-doublon → consigné dans .axioms-conflicts.md", fs.existsSync(path.join(dir, ATOMS_CONFLICTS_FILE_NAME)));
  check("quasi-doublon → PAS mis en quarantaine", !fs.existsSync(path.join(dir, AXIOMS_QUARANTINE_FILE_NAME)) || loadQuarantine(dir).length === 0);
});

// Fail-open : embed null → promotion directe (un axiome n'est jamais perdu).
await withDir(async (dir) => {
  const deps = { embed: async () => null };
  const r = await runAxiomValidation(dir, "AXIOME-DATA-01 toujours paginer les grands tableaux", deps);
  check("embed null → outcome 'promoted' (fail-open, promotion directe)", r.outcomes[0] === "promoted");
  check("embed null → .axioms.md créé directement", fs.existsSync(path.join(dir, AXIOMS_FILE_NAME)));
});

// Deps qui lèvent → runAxiomValidation ne propage jamais.
await withDir(async (dir) => {
  const throwing = { embed: async () => { throw new Error("Ollama KO"); } };
  let threw = false;
  try { await runAxiomValidation(dir, "AXIOME-DATA-01 x", throwing); } catch { threw = true; }
  check("deps qui lèvent → runAxiomValidation n'échoue jamais (fail-open)", threw === false);
});

// ── gate OFF par défaut ──────────────────────────────────────────────────────
{
  const prev = process.env.AXIOMS_VALIDATION;
  delete process.env.AXIOMS_VALIDATION;
  check("gate AXIOMS_VALIDATION absent → inactif (défaut off)", flag("AXIOMS_VALIDATION") === false);
  if (prev === undefined) delete process.env.AXIOMS_VALIDATION; else process.env.AXIOMS_VALIDATION = prev;
}

console.log(`\n${fail === 0 ? "✅" : "❌"} axioms-validation : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
