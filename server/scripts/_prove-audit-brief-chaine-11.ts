// Preuve live — audit CTXLOOP, brief #11 (section C du plan, docs/plan-audit-ctxloop-10-projets.md).
// Chaîne de 3 mots-pièges de la section A (cellule, vol, marché) combinés dans une phrase au sens
// COHÉRENT (sécurité publique/commerçants) — attend le verdict "coherente", PAS "incoherente" : ce
// brief teste que la boucle ne signale pas un faux positif quand les termes forment un vrai narratif
// unifié, contrairement au brief déjà rejoué (docs cf. _prove-chaine-ambigue.ts) qui, lui, mélangeait
// des domaines réellement disjoints.
//
// GLM 5.2/qwen3.5:cloud toujours indisponibles → extraction + jugement routés vers Claude via
// brainOverride (même patron que les preuves précédentes de cette fenêtre d'audit).
import "dotenv/config";
import { verifierChaineAmbigue } from "../src/chaine-ambigue.js";
import { dispatch } from "../src/brain-dispatch.js";
import { searchWeb } from "../src/eleve-web-tools.js";

const BRIEF =
  "Application pour gérer la cellule de crise pendant un vol organisé à l'étalage sur le marché du centre-ville";

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
  rapport.parsed && rapport.verdict === "coherente"
    ? "\n✅ PREUVE : verdict 'coherente' obtenu — la chaîne cellule+vol+marché forme bien un narratif unifié (sécurité publique), pas de faux positif."
    : "\n⚠️ Verdict différent de 'coherente' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
);
