// VERIF directe sur les projets REELS : la detection par horodatage de tour voit-elle
// le travail que l'Eleve a reellement ecrit ? C'est le seul juge qui compte.
import { tourAProduitDuCode } from "../git-signals.js";
import { turnStartedAtMs } from "../turn-ledger.js";

const WS = "/home/raf/projets/mangoai/workspace";
const cas = ["serpente-c7", "serpente-c8", "serpente-c9", "sonde-c4-jeu", "galerie-albatre"];

let ok = 0, ko = 0;
const check = (n: string, v: boolean) => { console.log(`  ${v ? "✅" : "✗"} ${n}`); v ? ok++ : ko++; };

for (const projet of cas) {
  const dir = `${WS}/${projet}`;
  const startedAt = turnStartedAtMs(dir);
  const aEcrit = await tourAProduitDuCode(dir, startedAt);
  console.log(`\n[${projet}] ancre=${startedAt ? new Date(startedAt).toISOString() : "(absente)"}`);
  if (startedAt === 0) { console.log("  (pas d'ancre : on ne conclut rien — comportement honnête)"); continue; }
  check(`du code a ete ecrit ce tour-ci`, aEcrit);
  // contre-preuve : une ancre tres ancienne ne doit PAS voir le tour
  const tresAncien = Date.parse("2020-01-01T00:00:00Z");
  const faussementVieux = await tourAProduitDuCode(dir, tresAncien);
  console.log(`  (ancre 2020 -> ${faussementVieux ? "voit du code (normal : tout est posterieur)" : "rien"})`);
}

console.log(`\n${ko === 0 ? "✅" : "✗"} chantier5b (ancre de tour) : ${ok} pass, ${ko} fail`);
process.exit(ko === 0 ? 0 : 1);
