// Tests A1.3 (2026-07-03) — détecteur de contradiction/dérive mémoire.
// Prouve : detectConflicts (pur) trie/plafonne/respecte le seuil ;
// formatConflictReport produit un rapport horodaté mentionnant l'arbitrage ;
// checkAxiomDrift avec deps FACTICES écrit .axioms-conflicts.md quand conflit,
// rien sinon ; embed null → fail-open TOTAL (aucun fichier créé) ; gate off →
// appendAxiom n'appelle jamais le détecteur (aucun .axioms-conflicts.md).
//
// Lancer : npx tsx src/test-axioms-drift.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectConflicts,
  formatConflictReport,
  checkAxiomDrift,
  loadExistingAxiomLines,
  ATOMS_CONFLICTS_FILE_NAME,
  DRIFT_THRESHOLD,
  type ConflictPair,
  type DriftDeps,
} from "./axioms-drift.js";
import { appendAxiom, AXIOMS_FILE_NAME } from "./axioms.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-axioms-drift (A1.3)");
console.log("─".repeat(60));

// ── detectConflicts : PUR ────────────────────────────────────────────────────
{
  // Deux axiomes "proches" (embeddings quasi identiques) → cos > 0.8 → paire.
  const proche = { ligne: "toujours paginer un tableau volumineux", embedding: [1, 0, 0] };
  const presqueProche = { ligne: "paginer systématiquement les grands tableaux", embedding: [0.99, 0.05, 0] };
  const orthogonal = { ligne: "utiliser une échelle d'espacement unique", embedding: [0, 1, 0] };

  const pairs = detectConflicts("toujours paginer un tableau volumineux", [proche, presqueProche, orthogonal], [1, 0, 0]);
  check("axiomes proches (cos>0.8) → détecte une/des paire(s)", pairs.length >= 1);
  check("axiome orthogonal exclu", !pairs.some((p) => p.existant === orthogonal.ligne));
  check("paire contient le score", pairs.every((p) => typeof p.score === "number" && p.score >= DRIFT_THRESHOLD));

  const seulOrthogonal = detectConflicts("toujours paginer un tableau volumineux", [orthogonal], [1, 0, 0]);
  check("axiomes orthogonaux → aucune paire", seulOrthogonal.length === 0);

  // Seuil respecté : un score juste sous le seuil par défaut est exclu.
  const sousLeSeuil = { ligne: "à peine similaire", embedding: [0.7, 0.7, 0.14] }; // cos ≈ 0.7 avec [1,0,0]
  const withSeuil = detectConflicts("x", [sousLeSeuil], [1, 0, 0], 0.8);
  check("score sous le seuil → exclu", withSeuil.length === 0);
  const withSeuilBas = detectConflicts("x", [sousLeSeuil], [1, 0, 0], 0.5);
  check("seuil abaissé → la même paire redevient détectée", withSeuilBas.length === 1);

  // Max 5, trié par score décroissant.
  const many = Array.from({ length: 10 }, (_, i) => ({
    ligne: `existant-${i}`,
    embedding: [1 - i * 0.01, i * 0.01, 0], // score décroissant avec i croissant
  }));
  const capped = detectConflicts("nouveau", many, [1, 0, 0]);
  check("plafonné à 5 paires max", capped.length <= 5);
  check("trié par score décroissant", capped.every((p, i) => i === 0 || capped[i - 1].score >= p.score));
  check("les 5 meilleurs scores sont bien les premiers existants (les plus proches)", capped.length === 0 || capped[0].existant === "existant-0");

  // Ligne identique mot pour mot → pas remontée comme "paire suspecte" (hors scope ici).
  const identique = detectConflicts("même règle exacte", [{ ligne: "même règle exacte", embedding: [1, 0, 0] }], [1, 0, 0]);
  check("ligne strictement identique → exclue (doublon trivial hors scope)", identique.length === 0);
}

// ── formatConflictReport ─────────────────────────────────────────────────────
{
  const empty = formatConflictReport([], new Date("2026-07-03T10:00:00.000Z"));
  check("aucune paire → rapport vide", empty === "");

  const pairs: ConflictPair[] = [
    { nouveau: "toujours paginer les grands tableaux", existant: "paginer systématiquement les tableaux volumineux", score: 0.93 },
  ];
  const date = new Date("2026-07-03T10:00:00.000Z");
  const report = formatConflictReport(pairs, date);
  check("rapport horodaté (ISO présent)", report.includes(date.toISOString()));
  check("mentionne l'arbitrage (fusionner/amender/garder)", /fusionner/i.test(report) && /amender/i.test(report) && /garder/i.test(report));
  check("mentionne le nouvel axiome", report.includes(pairs[0].nouveau));
  check("mentionne l'axiome existant", report.includes(pairs[0].existant));
  check("mentionne le score", report.includes("0.930"));
  check("précise qu'aucune suppression n'est automatique", /jamais|aucune suppression/i.test(report));
}

// ── loadExistingAxiomLines ───────────────────────────────────────────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axdrift-load-"));
  fs.writeFileSync(path.join(dir, AXIOMS_FILE_NAME), "# commentaire\n\nAXIOME-A ligne 1\nAXIOME-B ligne 2\n");
  const lines = loadExistingAxiomLines(dir, AXIOMS_FILE_NAME);
  check("ignore les commentaires et lignes vides", lines.every((l) => l.ligne.length > 0 && !l.ligne.startsWith("#")));
  check("garde les lignes d'axiomes", lines.some((l) => l.ligne === "AXIOME-A ligne 1") && lines.some((l) => l.ligne === "AXIOME-B ligne 2"));
  check("fichier absent → tableau vide (fail-open)", loadExistingAxiomLines(dir, ".fichier-inexistant.md").length === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── checkAxiomDrift : deps FACTICES, disque réel ─────────────────────────────
// Embedding déterministe par contenu textuel : deux textes "similaires" (même
// mot-clé dominant) donnent des vecteurs proches, sinon orthogonaux — permet
// de simuler un vrai conflit sémantique sans dépendre d'Ollama.
function fakeEmbed(text: string): number[] {
  const paginer = /pagin/i.test(text) ? 1 : 0;
  const espacement = /espace|padding/i.test(text) ? 1 : 0;
  const bruit = text.length % 7 * 0.001; // légère variation pour ne pas être parfaitement colinéaire
  return [paginer, espacement, bruit];
}

async function withDriftFile(fn: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axdrift-"));
  try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

await withDriftFile(async (dir) => {
  fs.writeFileSync(
    path.join(dir, AXIOMS_FILE_NAME),
    "AXIOME-DATA-01 toujours paginer les grands tableaux\nAXIOME-UIUX-01 utiliser une échelle d'espacement unique\n",
  );
  const deps: DriftDeps = { embed: async (t) => fakeEmbed(t), loadExisting: loadExistingAxiomLines };
  await checkAxiomDrift(dir, "AXIOME-DATA-02 paginer systématiquement les tableaux volumineux", AXIOMS_FILE_NAME, deps);
  const conflictsFile = path.join(dir, ATOMS_CONFLICTS_FILE_NAME);
  check("conflit détecté → .axioms-conflicts.md créé", fs.existsSync(conflictsFile));
  if (fs.existsSync(conflictsFile)) {
    const content = fs.readFileSync(conflictsFile, "utf8");
    check("rapport contient le nouvel axiome", content.includes("paginer systématiquement les tableaux volumineux"));
    check("rapport contient l'axiome existant en conflit", content.includes("toujours paginer les grands tableaux"));
    check("rapport ne contient PAS l'axiome orthogonal (espacement)", !content.includes("échelle d'espacement"));
  }
});

await withDriftFile(async (dir) => {
  fs.writeFileSync(path.join(dir, AXIOMS_FILE_NAME), "AXIOME-UIUX-01 utiliser une échelle d'espacement unique\n");
  const deps: DriftDeps = { embed: async (t) => fakeEmbed(t), loadExisting: loadExistingAxiomLines };
  await checkAxiomDrift(dir, "AXIOME-DATA-01 toujours paginer les grands tableaux", AXIOMS_FILE_NAME, deps);
  check("aucun conflit → aucun fichier créé", !fs.existsSync(path.join(dir, ATOMS_CONFLICTS_FILE_NAME)));
});

await withDriftFile(async (dir) => {
  fs.writeFileSync(path.join(dir, AXIOMS_FILE_NAME), "AXIOME-DATA-01 toujours paginer les grands tableaux\n");
  const deps: DriftDeps = { embed: async () => null, loadExisting: loadExistingAxiomLines };
  await checkAxiomDrift(dir, "AXIOME-DATA-02 paginer systématiquement les tableaux volumineux", AXIOMS_FILE_NAME, deps);
  check("embed null → fail-open total, aucun fichier créé", !fs.existsSync(path.join(dir, ATOMS_CONFLICTS_FILE_NAME)));
});

await withDriftFile(async (dir) => {
  // Deps qui lèvent des exceptions à chaque étape → checkAxiomDrift ne doit
  // JAMAIS propager (fail-open total).
  const throwingDeps: DriftDeps = {
    embed: async () => { throw new Error("Ollama injoignable"); },
    loadExisting: () => { throw new Error("disque en panne"); },
  };
  let threw = false;
  try {
    await checkAxiomDrift(dir, "AXIOME-DATA-01 x", AXIOMS_FILE_NAME, throwingDeps);
  } catch {
    threw = true;
  }
  check("deps qui lèvent → checkAxiomDrift n'échoue jamais (fail-open)", threw === false);
});

// ── câblage appendAxiom : gate off/on ────────────────────────────────────────
function withGate(val: string | undefined, fn: () => Promise<void> | void) {
  const prev = process.env.AXIOMS_DRIFT;
  if (val === undefined) delete process.env.AXIOMS_DRIFT; else process.env.AXIOMS_DRIFT = val;
  return Promise.resolve(fn()).finally(() => {
    if (prev === undefined) delete process.env.AXIOMS_DRIFT; else process.env.AXIOMS_DRIFT = prev;
  });
}

await withDriftFile(async (dir) => {
  // Gate OFF (absent) : appendAxiom n'appelle jamais le détecteur — même en
  // appendant deux axiomes quasi-identiques, aucun .axioms-conflicts.md
  // n'apparaît (safeEmbed réel n'est même pas censé être invoqué par ce chemin ;
  // on vérifie l'OBSERVABLE : l'absence de fichier, après un court délai pour
  // laisser une éventuelle tâche fire-and-forget résiduelle se terminer).
  await withGate(undefined, async () => {
    appendAxiom(dir, "AXIOME-DATA-01 toujours paginer les grands tableaux");
    appendAxiom(dir, "AXIOME-DATA-02 paginer systématiquement les tableaux volumineux");
    // Laisse le tick microtask s'écouler au cas où quelque chose serait lancé.
    await new Promise((r) => setTimeout(r, 50));
  });
  check("gate AXIOMS_DRIFT absent (off) → appendAxiom n'appelle jamais le détecteur", !fs.existsSync(path.join(dir, ATOMS_CONFLICTS_FILE_NAME)));
  check("gate off → les deux axiomes sont bien appendés (comportement inchangé)", fs.readFileSync(path.join(dir, AXIOMS_FILE_NAME), "utf8").includes("AXIOME-DATA-02"));
});

console.log(`\n${fail === 0 ? "✅" : "❌"} axioms-drift : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
