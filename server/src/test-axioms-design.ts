// Tests de la partition design des axiomes (N12 — audit nuit 2026-07-03).
// Déterministe, workspace temporaire jetable, zéro réseau. On prouve :
//   - section vide si .axioms.design.md absent ou vide ;
//   - injection avec cap DÉDIÉ (AXIOMS_DESIGN_MAX_CHARS) + marqueur de troncature ;
//   - appendAxiom route vers le bon fichier selon {design} (et n'écrit RIEN
//     dans l'autre) ;
//   - le registre général reste intact (la partition n'y touche pas).
//
// Lancer :  npx tsx src/test-axioms-design.ts

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AXIOMS_FILE_NAME,
  AXIOMS_DESIGN_FILE_NAME,
  AXIOMS_DESIGN_MAX_CHARS,
  designAxiomsSection,
  appendAxiom,
  loadAxioms,
} from "./axioms.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axioms-design-"));
try {
  console.log("\n[1] designAxiomsSection — fichier absent / vide");
  check("fichier absent → section vide", designAxiomsSection(dir) === "");
  fs.writeFileSync(path.join(dir, AXIOMS_DESIGN_FILE_NAME), "   \n  \n", "utf8");
  check("fichier blanc → section vide", designAxiomsSection(dir) === "");

  console.log("\n[2] designAxiomsSection — injection normale");
  const body = "UX-10 — Chaque choix visuel doit être justifiable par le sujet.\nAVOID-26 — Hiérarchie avant couleur.";
  fs.writeFileSync(path.join(dir, AXIOMS_DESIGN_FILE_NAME), body, "utf8");
  const section = designAxiomsSection(dir);
  check("contenu injecté intégralement", section.includes("UX-10") && section.includes("AVOID-26"));
  check("cadrage design présent (nom du fichier + posture)", section.includes(AXIOMS_DESIGN_FILE_NAME) && /Design axioms/.test(section));
  check("pas de troncature sous le cap", !section.includes("tronqué"));

  console.log("\n[3] designAxiomsSection — cap dédié respecté");
  const huge = "AVOID-99 — ligne de bourrage pour dépasser le cap design. ".repeat(60); // ~3400 car.
  fs.writeFileSync(path.join(dir, AXIOMS_DESIGN_FILE_NAME), huge, "utf8");
  const capped = designAxiomsSection(dir);
  check("marqueur de troncature présent", capped.includes(`tronqué à ${AXIOMS_DESIGN_MAX_CHARS}`));
  // Le corps plafonné = cap + marqueur ; la section entière reste bornée (cadrage ~180 car.).
  check("corps plafonné au cap dédié", capped.length <= AXIOMS_DESIGN_MAX_CHARS + 300);
  const custom = designAxiomsSection(dir, 100);
  check("maxChars explicite honoré (cap 100)", custom.includes("tronqué à 100") && custom.length <= 100 + 300);

  console.log("\n[4] appendAxiom — routage vers la partition");
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "axioms-design-append-"));
  appendAxiom(dir2, "UX-40 — Nouvel axiome design distillé.", { design: true });
  check("design:true → écrit dans .axioms.design.md", fs.readFileSync(path.join(dir2, AXIOMS_DESIGN_FILE_NAME), "utf8").includes("UX-40"));
  check("design:true → .axioms.md PAS créé", !fs.existsSync(path.join(dir2, AXIOMS_FILE_NAME)));

  appendAxiom(dir2, "AXIOME-BUILD-77 (maturité: candidat)\n- Règle d'or : rester en ESM.");
  check("défaut → écrit dans .axioms.md", loadAxioms(dir2).includes("AXIOME-BUILD-77"));
  check("défaut → la partition design intacte", !fs.readFileSync(path.join(dir2, AXIOMS_DESIGN_FILE_NAME), "utf8").includes("BUILD-77"));

  console.log("\n[5] appendAxiom — appends successifs = une ligne chacun");
  appendAxiom(dir2, "UX-41 — Deuxième axiome design.", { design: true });
  const designRaw = fs.readFileSync(path.join(dir2, AXIOMS_DESIGN_FILE_NAME), "utf8");
  check("les deux axiomes sur des lignes séparées", designRaw.split(/\r?\n/).filter(Boolean).length === 2);
  // Fichier existant SANS \n final : l'append ne colle pas les deux axiomes.
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "axioms-design-nolf-"));
  fs.writeFileSync(path.join(dir3, AXIOMS_DESIGN_FILE_NAME), "UX-1 — sans saut de ligne final", "utf8");
  appendAxiom(dir3, "UX-2 — appendé ensuite", { design: true });
  const lines3 = fs.readFileSync(path.join(dir3, AXIOMS_DESIGN_FILE_NAME), "utf8").split(/\r?\n/).filter(Boolean);
  check("append sur fichier sans \\n final → toujours 2 lignes", lines3.length === 2 && lines3[1].includes("UX-2"));

  console.log("\n[6] appendAxiom — entrées dégénérées, fail-open");
  appendAxiom(dir2, "   ", { design: true });
  check("ligne blanche ignorée (rien d'appendé)", fs.readFileSync(path.join(dir2, AXIOMS_DESIGN_FILE_NAME), "utf8") === designRaw);
  let threw = false;
  try { appendAxiom("Z:\\\\chemin\\impossible\\!!", "UX-42 — ne doit pas lever", { design: true }); } catch { threw = true; }
  check("répertoire impossible → ne lève pas", threw === false);
} finally {
  // Nettoyage best-effort des tmp (jamais bloquant).
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* tant pis */ }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} axioms-design : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
