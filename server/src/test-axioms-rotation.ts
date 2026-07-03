// Tests A0.3 (2026-07-03) — rotation VISIBLE des axiomes (bornage disque).
// Prouve : planAxiomRotation (pur) coupe à une frontière de ligne, ne rote que
// si > factor×cap, garde les récents ; appendAxiom avec AXIOMS_ROTATE=on archive
// les anciens sans rien perdre ; gate off → aucune rotation, comportement A0.1
// inchangé (l'injection loadAxioms reste identique).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planAxiomRotation,
  appendAxiom,
  loadAxioms,
  AXIOMS_FILE_NAME,
  AXIOMS_ARCHIVE_FILE_NAME,
  AXIOMS_MAX_CHARS,
} from "./axioms.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("─".repeat(60));
console.log("test-axioms-rotation (A0.3)");
console.log("─".repeat(60));

// ── planAxiomRotation : PUR ──────────────────────────────────────────────────
{
  // Sous le seuil (factor×cap) → pas de rotation.
  const small = "a\n".repeat(10);
  check("sous le seuil → pas de rotation", planAxiomRotation(small, 100, 3).rotate === false);

  // Au-dessus du seuil → rotation, coupe à une frontière de ligne, garde ~cap récents.
  const lines = Array.from({ length: 400 }, (_, i) => `axiom-${i}`).join("\n") + "\n";
  const plan = planAxiomRotation(lines, 100, 3); // 400 lignes ~3600c > 300
  check("au-dessus du seuil → rotate", plan.rotate === true);
  check("archive + kept = contenu original (rien perdu)", (plan.archive + "\n" + plan.kept).replace(/\n+/g, "\n") === lines.replace(/\n+/g, "\n"));
  check("coupe à une frontière de ligne (kept commence par un axiome entier)", /^axiom-\d+/.test(plan.kept));
  check("kept garde les axiomes RÉCENTS (dernier présent)", plan.kept.includes("axiom-399"));
  check("archive contient les ANCIENS (premier présent)", plan.archive.includes("axiom-0"));
  // kept est coupé à la 1ʳᵉ ligne APRÈS (len-cap) → légèrement < cap, jamais vide, borné.
  check("kept non vide et borné autour du cap", plan.kept.length > 0 && plan.kept.length <= 100 + 20);

  // Une seule ligne géante → on ne coupe pas au milieu.
  const giant = "x".repeat(1000);
  check("ligne géante unique → pas de rotation (ne coupe pas un axiome)", planAxiomRotation(giant, 100, 3).rotate === false);
}

// ── appendAxiom + AXIOMS_ROTATE : disque réel ────────────────────────────────
function withGate(val: string | undefined, fn: () => void) {
  const prev = process.env.AXIOMS_ROTATE;
  if (val === undefined) delete process.env.AXIOMS_ROTATE; else process.env.AXIOMS_ROTATE = val;
  try { fn(); } finally { if (prev === undefined) delete process.env.AXIOMS_ROTATE; else process.env.AXIOMS_ROTATE = prev; }
}

{
  // Gate OFF : append massif → fichier grossit, PAS d'archive (comportement A0.1).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axrot-off-"));
  withGate("off", () => {
    for (let i = 0; i < 500; i++) appendAxiom(dir, `AX-off-${i} règle universelle assez longue pour peser`);
  });
  const archiveExists = fs.existsSync(path.join(dir, AXIOMS_ARCHIVE_FILE_NAME));
  check("gate off → aucune archive créée", archiveExists === false);
  // L'injection reste plafonnée (loadAxioms) — inchangée.
  check("gate off → loadAxioms reste borné au cap", loadAxioms(dir).length <= AXIOMS_MAX_CHARS + 120);
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // Gate ON : append massif → rotation, archive créée, rien perdu, injection identique.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axrot-on-"));
  const all: string[] = [];
  withGate("on", () => {
    for (let i = 0; i < 500; i++) {
      const a = `AX-on-${i} règle universelle assez longue pour peser sur le cap`;
      all.push(a);
      appendAxiom(dir, a);
    }
  });
  const axFile = path.join(dir, AXIOMS_FILE_NAME);
  const archFile = path.join(dir, AXIOMS_ARCHIVE_FILE_NAME);
  check("gate on → archive créée", fs.existsSync(archFile));
  const live = fs.readFileSync(axFile, "utf8");
  const arch = fs.existsSync(archFile) ? fs.readFileSync(archFile, "utf8") : "";
  // Rien perdu : chaque axiome est SOIT dans le vivant SOIT dans l'archive.
  const lost = all.filter((a) => !live.includes(a) && !arch.includes(a));
  check(`aucun axiome perdu (perdus: ${lost.length})`, lost.length === 0);
  // Les plus récents sont dans le fichier vivant.
  check("les axiomes récents restent dans le registre vivant", live.includes("AX-on-499"));
  // Le fichier vivant est allégé (borné autour du cap, pas 500 axiomes).
  check("registre vivant allégé (< 6× cap)", live.length < AXIOMS_MAX_CHARS * 6);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${fail === 0 ? "✅" : "❌"} axioms-rotation : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
