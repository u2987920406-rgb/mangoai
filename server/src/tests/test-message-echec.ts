// CHANTIER 1 (2026-09-29) - le message d'echec doit dire le FAIT.
//
// Mesure sur les donnees reelles (37 runs : .metrics.jsonl + .chat-history.json) :
//   - 14 runs sur 37 (38 %) se terminent en erreur.
//   - 12 messages d'echec, dont 4 annoncaient "le build ne passe pas (ok)" : le
//     build PASSAIT -> message FAUX.
//   - TOUS impliquaient le Maitre, qui n'avait JAMAIS ete appele (escalade
//     desarmee : cout Claude total mesure = 0 $ sur 37 runs).
// Ce test verrouille : chaque cause produit un message qui dit la VERITE.
import { messageEchecRelais } from "../eleve/message-echec.js";
import type { RelayResult } from "../eleve/types.js";

let pass = 0;
let fail = 0;
function check(nom: string, cond: boolean) {
  if (cond) { pass++; console.log("  OK   " + nom); }
  else { fail++; console.log("  FAIL " + nom); }
}
const inp = (o: Partial<RelayResult>) => ({ inspection: { signal: "ok", ok: true, detail: "" }, ...o }) as unknown as RelayResult;
const insp = (signal: string, ok: boolean) => ({ signal, ok, detail: "" }) as unknown as RelayResult["inspection"];

console.log("[1] le build PASSE (signal ok) mais le Maitre n'a rien change");
{
  const m = messageEchecRelais(inp({ resolvedBy: "none", success: false, echecCause: "aucun-changement", maitreAppele: true }));
  check("ne dit PAS que le build ne passe pas", !/ne passe pas|fait passer le build/.test(m));
  check("dit que le build passe", /build passe/i.test(m));
  check("nomme l'absence de changement", /AUCUN fichier/i.test(m));
}

console.log("[2] cerveau injoignable");
{
  const m = messageEchecRelais(inp({ resolvedBy: "none", success: false, echecCause: "cerveau-injoignable", maitreAppele: false }));
  check("nomme le cerveau", /cerveau/i.test(m));
  check("ne parle pas du Maitre", !/Maitre/i.test(m));
}

console.log("[3] Maitre non appele (escalade desarmee)");
{
  const m = messageEchecRelais(inp({ resolvedBy: "none", success: false, echecCause: "maitre-non-appele", maitreAppele: false }));
  check("dit que le Maitre est desarme", /DESARMEE/i.test(m));
  check("ne dit pas que le Maitre n'a pas REUSSI", !/ni le Maitre n'ont fait passer/.test(m));
}

console.log("[4] build reellement casse, Maitre appele");
{
  const m = messageEchecRelais(inp({ inspection: insp("tsc:error", false), resolvedBy: "none", success: false, echecCause: "build-casse", maitreAppele: true }));
  check("dit que le build ne passe pas", /fait passer le build/i.test(m));
  check("implique le Maitre a juste titre", /Maitre/i.test(m));
}

console.log("[5] aucune combinaison ne ment sur le signal");
{
  const signaux = ["ok", "tsc:ok", "clean", "no-deps", "tsc:error", "build-failed"];
  let mensonges = 0;
  for (const s of signaux) {
    for (const cause of ["aucun-changement", "build-casse", "cerveau-injoignable", "maitre-non-appele"] as const) {
      const ok = /^(ok|clean|tsc:ok|no-deps)$/i.test(s);
      const m = messageEchecRelais(inp({ inspection: insp(s, ok), resolvedBy: "none", success: false, echecCause: cause, maitreAppele: true }));
      // mensonge = affirmer que le build ne passe pas alors qu'il passe
      if (ok && /ne passe pas|fait passer le build/i.test(m)) mensonges++;
    }
  }
  check("aucun mensonge sur 24 combinaisons", mensonges === 0);
}

console.log("");
console.log(fail === 0 ? `OK message echec : ${pass} pass, 0 fail` : `ECHEC message echec : ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
