// Preuve live (PAS des mocks) — Étape 1bis, boucle de vérification contextuelle.
// Rejoue un brief à chaîne RÉELLEMENT incohérente (3 mots-pièges mélangés sans
// narratif fédérateur) contre une vraie recherche web + un vrai juge, pour
// confirmer que verifierChaineAmbigue rend bien "incoherente" en conditions
// réelles (pas seulement sur les mocks de test-chaine-ambigue.ts).
//
// GLM 5.2/qwen3.5:cloud indisponibles au moment de l'écriture (cf. statut.md
// suite 9/10) → extraction et jugement routés vers Claude via brainOverride
// explicite (même patron que la preuve live de l'Étape 1 sur "formation").
import "dotenv/config";
import { verifierChaineAmbigue } from "../src/chaine-ambigue.js";
import { dispatch } from "../src/brain-dispatch.js";
import { searchWeb } from "../src/eleve-web-tools.js";

// Tentative 1 (conservée dans l'historique de session) : "Fais-moi une app sur
// la cellule de crise pour gérer le marché de notre greffe" → verdict réel
// "incertaine" (2 termes détectés : greffe, marché — "cellule de crise" jugée
// non-ambiguë en tant qu'expression figée par l'extracteur réel). Résultat
// honnête, pas forcé, mais ne démontre pas le chemin "incoherente" en
// conditions réelles — d'où cette 2e tentative, plus nettement incohérente
// (4 domaines totalement disjoints, aucun narratif fédérateur possible).
const BRIEF =
  "Application pour suivre la portée de nos chatons qui viennent de naître, gérer le greffe du tribunal de commerce, et organiser une charge de cavalerie pour le club de sport";

async function extraire(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, {
    freeform: true,
    brainOverride: { provider: "claude", model: "sonnet" },
  });
  return res.summary;
}

async function juger(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, {
    freeform: true,
    brainOverride: { provider: "claude", model: "opus" },
  });
  return res.summary;
}

async function chercherDefinitionWeb(mot: string): Promise<string> {
  const results = await searchWeb(`qu'est-ce que "${mot}" définition usage`, 3);
  return results.map((r) => r.extrait).filter(Boolean).join(" ").slice(0, 1000);
}

console.log("Brief :", BRIEF);
console.log("→ extraction des termes ambigus (Sonnet, réel)…");
const t0 = Date.now();
const rapport = await verifierChaineAmbigue(BRIEF, { extraire, juger, chercherDefinitionWeb });
console.log(`\n=== (${Math.round((Date.now() - t0) / 1000)}s) ===`);
console.log("termesEnJeu :", rapport.termesEnJeu);
console.log("definitionsUtilisees :", rapport.definitionsUtilisees);
console.log("verdict :", rapport.verdict);
console.log("parsed :", rapport.parsed);
console.log("raisonnement :", rapport.raisonnement);
console.log(
  rapport.parsed && rapport.verdict === "incoherente"
    ? "\n✅ PREUVE : verdict 'incoherente' obtenu sur un brief réellement incohérent, en conditions réelles."
    : "\n⚠️ Verdict différent de 'incoherente' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
);
