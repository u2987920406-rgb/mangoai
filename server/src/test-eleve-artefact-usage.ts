// Tests du store éphémère d'usage d'artefacts (#156 / L29). In-process, par projet :
// record accumule + déduplique, take consomme-et-vide, clear oublie. Tolérant aux
// variations de chemin (path.resolve), ne lève jamais.

import path from "node:path";
import { recordArtefactUsage, takeArtefactUsage, clearArtefactUsage } from "./eleve-artefact-usage.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const P = "/ws/projA";
const Q = "/ws/projB";

// Repart propre (le store est un singleton de module).
clearArtefactUsage(P);
clearArtefactUsage(Q);

console.log("\n[1] record accumule + déduplique");
recordArtefactUsage(P, ["mango-carnet", "rust-lang.org"]);
recordArtefactUsage(P, ["mango-carnet", "  ", ""]); // doublon + vides ignorés
{
  const taken = takeArtefactUsage(P);
  check("2 provenances distinctes", taken.length === 2);
  check("contient les deux", taken.includes("mango-carnet") && taken.includes("rust-lang.org"));
}

console.log("\n[2] take VIDE (consommation unique)");
check("2e take → vide", takeArtefactUsage(P).length === 0);

console.log("\n[3] isolation par projet");
recordArtefactUsage(P, ["a"]);
recordArtefactUsage(Q, ["b"]);
{
  const tp = takeArtefactUsage(P);
  const tq = takeArtefactUsage(Q);
  check("P ne voit que 'a'", tp.length === 1 && tp[0] === "a");
  check("Q ne voit que 'b'", tq.length === 1 && tq[0] === "b");
}

console.log("\n[4] clé tolérante au path.resolve (writer ≠ reader)");
recordArtefactUsage("/ws/projC", ["x"]);
{
  // Lire avec un chemin équivalent non normalisé → même clé.
  const taken = takeArtefactUsage(path.join("/ws", "projC"));
  check("chemin équivalent → même bucket", taken.length === 1 && taken[0] === "x");
}

console.log("\n[5] clear oublie");
recordArtefactUsage(P, ["z"]);
clearArtefactUsage(P);
check("après clear → vide", takeArtefactUsage(P).length === 0);

console.log("\n[6] robustesse : record vide / take inconnu");
check("record([]) ne crée rien", (recordArtefactUsage(P, []), takeArtefactUsage(P).length === 0));
check("take d'un projet jamais vu → []", takeArtefactUsage("/jamais/vu").length === 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-artefact-usage : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
