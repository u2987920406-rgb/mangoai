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
  capRegistry,
} from "../axioms.js";

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
  // (2026-08-06, lot 4) La rotation est FIGÉE ON — le flag AXIOMS_ROTATE n'existe
  // plus. Ce bloc affirmait l'inverse (« gate off → aucune archive ») ; il affirme
  // désormais ce qui compte vraiment : **une variable d'environnement résiduelle ne
  // peut plus rééteindre la rotation**. Un `AXIOMS_ROTATE=off` traînant dans un
  // vieux .env doit rester sans effet, sinon le figeage n'en est pas un.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axrot-figee-"));
  withGate("off", () => {
    for (let i = 0; i < 500; i++) appendAxiom(dir, `AX-off-${i} règle universelle assez longue pour peser`);
  });
  const archiveExists = fs.existsSync(path.join(dir, AXIOMS_ARCHIVE_FILE_NAME));
  check("AXIOMS_ROTATE=off résiduel → la rotation a QUAND MÊME eu lieu (flag figé ON)", archiveExists === true);
  check("l'injection reste bornée au cap", loadAxioms(dir).length <= AXIOMS_MAX_CHARS + 120);

  // Et le point de la correction : ce qui est injecté, ce sont les axiomes RÉCENTS.
  // Avant le 2026-08-06, `capRegistry` gardait le DÉBUT du fichier — sur le registre
  // réel de Raf, 1,1 % du contenu était injecté, et toujours les plus vieux.
  const injecte = loadAxioms(dir);
  check("l'injection contient les axiomes RÉCENTS (AX-off-499)", injecte.includes("AX-off-499"));
  check("l'injection ne contient PAS les plus anciens (AX-off-0)", !injecte.includes("AX-off-0 "));
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  // capRegistry seule, sans disque : le sens de la troncature.
  const vieux = "AXIOME-ANCIEN-000 le tout premier, appris il y a longtemps";
  const recent = "AXIOME-RECENT-999 le tout dernier, appris a l'instant";
  const gros = [vieux, ...Array.from({ length: 400 }, (_, i) => `AXIOME-${i} remplissage assez long pour peser sur le cap d'injection`), recent].join("\n");

  const borne = capRegistry(gros);
  check(`capRegistry : le registre (${gros.length} car.) dépasse largement le cap (${AXIOMS_MAX_CHARS})`, gros.length > AXIOMS_MAX_CHARS * 5);
  check("capRegistry garde le PLUS RÉCENT", borne.includes(recent));
  check("capRegistry écarte le PLUS ANCIEN", !borne.includes(vieux));
  check("capRegistry reste borné", borne.length <= AXIOMS_MAX_CHARS + 200);
  // Une frontière de ligne : injecter un demi-axiome (un « Contexte : » sans sa
  // « Règle d'or ») est pire que ne pas l'injecter — le modèle lit une prémisse
  // sans sa conclusion et la prend pour une règle.
  const corps = borne.split("\n").slice(1).join("\n");
  check("capRegistry coupe à une frontière de ligne", /^AXIOME-/.test(corps));
  check("capRegistry dit ce qu'il a écarté", borne.startsWith("[..."));
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
