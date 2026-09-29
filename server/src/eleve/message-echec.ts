// CHANTIER 1 (2026-09-29) - le message d'echec du relais doit dire le FAIT.
//
// Mesure sur les donnees reelles (37 runs, .metrics.jsonl + .chat-history.json) :
//   - 12 messages d'echec, dont 4 annoncaient "ni l'agent ni le Maitre n'ont fait
//     passer le build (ok)" : le build PASSAIT, le message etait donc FAUX.
//   - et tous annoncaient "ni le Maitre" alors que le Maitre n'avait JAMAIS ete
//     appele (ELEVE_ESCALATE_ON_BLOCK absent de .env, donc desarme).
// Deux mensonges distincts, corriges ici en nommant la cause reelle.
import type { RelayResult } from "./types.js";

/** Le signal d'inspection rend-il vrai le mot "build" ? tsc:ok = oui. */
const BUILD_OK = /^(ok|clean|tsc:ok|no-deps)$/i;

export function messageEchecRelais(r: RelayResult): string {
  const sig = r.inspection?.signal ?? "inconnu";
  const buildPasse = BUILD_OK.test(sig);
  const maitre = r.maitreAppele === true;
  const qui = maitre
    ? "ni l'agent ni le Maitre n'ont "
    : "l'agent n'a pas ";

  switch (r.echecCause) {
    case "cerveau-injoignable":
      return `❌ Echec : le cerveau de l'agent n'a pas repondu (5 tentatives). `
        + `Aucun code n'a pu etre produit ce tour. Relance-moi quand l'API est revenue.`;
    case "aucun-changement":
      return `❌ Echec : le build passe (${sig}) mais AUCUN fichier de code n'a ete modifie `
        + `- ce n'est pas une resolution. Precise ce qui doit changer.`;
    case "maitre-non-appele":
      return `❌ Echec : l'agent n'a pas termine et l'escalade au Maitre est DESARMEE `
        + `(ELEVE_ESCALATE_ON_BLOCK off). Personne n'a repris ce tour.`;
    default:
      return buildPasse
        ? `❌ Echec : le build passe (${sig}) mais ${qui}conclu le tour.`
        : `❌ Echec : ${qui}fait passer le build (${sig}).`;
  }
}
