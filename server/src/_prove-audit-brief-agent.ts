// Preuve live — audit CTXLOOP, brief #2 (révision 2026-07-09 de docs/plan-audit-ctxloop-10-projets.md,
// remplace "Cellule" pour la même raison que le brief #1 : aucun gabarit réel ne s'appelle "cellule").
// "agent" EST un vrai gabarit enregistré (scaffold d'agent LLM/IA, orchestration d'outils) ET un vrai
// mot polysémique (agent de voyage, métier humain). Brief volontairement dans le sens agent de voyage —
// le gabarit réel (scaffold d'agent IA) doit être rejeté par le vérificateur.
//
// GLM 5.2/qwen3.5:cloud toujours indisponibles → recherche web réelle + juge routés vers Claude via
// brainOverride (même patron que les preuves précédentes de cette fenêtre d'audit).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, deleteProject } from "./projects.js";
import { verifierChoix } from "./verificateur-contexte.js";
import { dispatch } from "./brain-dispatch.js";
import { searchWeb } from "./eleve-web-tools.js";

const PROJECT_NAME = "test-audit-brief-agent";
const TEMPLATE = "agent";
const BRIEF =
  "Crée une app de gestion pour un agent de voyage indépendant : fiches clients, itinéraires de voyage en cours, suivi des réservations (vols/hôtels), échéances de paiement et rappels de relance client.";

async function juger(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, {
    freeform: true,
    brainOverride: { provider: "claude", model: "opus" },
  });
  return res.summary;
}

async function chercherDefinitionWeb(mot: string): Promise<string> {
  try {
    const results = await searchWeb(`qu'est-ce que "${mot}" définition usage`, 3);
    const web = results.map((r) => r.extrait).filter(Boolean).join(" ").slice(0, 1000);
    if (web.trim()) return web;
  } catch {
    /* moteur interne indisponible — repli ci-dessous */
  }
  // Repli déterministe, pas une définition inventée : agent de voyage (métier
  // humain), sens visé du brief, distinct d'un agent logiciel/IA.
  return "Agent de voyage : professionnel qui conseille, organise et vend des séjours/voyages pour des clients particuliers ou professionnels — réservation de vols, hôtels, transferts, gestion des dossiers clients, suivi des paiements et de la relation client. Métier humain de conseil et d'organisation, distinct d'un agent logiciel autonome (IA).";
}

console.log(`→ createProject("${PROJECT_NAME}", "${TEMPLATE}") — simulation directe, pas le chat UI…`);
try {
  const dir = await createProject(PROJECT_NAME, TEMPLATE);
  console.log("Projet scaffoldé :", dir);

  const contenuReel = fs.readFileSync(path.join(dir, "src", "App.jsx"), "utf8").slice(0, 3000);
  console.log("\nContenu réel du gabarit (extrait) :\n", contenuReel.slice(0, 300), "…\n");

  console.log("Brief :", BRIEF);
  console.log("→ vérification contexte↔choix (juge réel, web réel)…");
  const t0 = Date.now();
  const rapport = await verifierChoix(TEMPLATE, BRIEF, contenuReel, BRIEF, { chercherDefinitionWeb, juger });
  console.log(`\n=== (${Math.round((Date.now() - t0) / 1000)}s) ===`);
  console.log("cheminUtilise :", rapport.cheminUtilise);
  console.log("definitionUtilisee :", rapport.definitionUtilisee);
  console.log("verdict :", rapport.verdict);
  console.log("parsed :", rapport.parsed);
  console.log("raisonnement :", rapport.raisonnement);
  console.log(
    rapport.parsed && rapport.verdict === "ne-correspond-pas"
      ? "\n✅ PREUVE : verdict 'ne-correspond-pas' obtenu — le gabarit d'agent IA a bien été rejeté pour un brief d'agent de voyage humain, en conditions réelles."
      : "\n⚠️ Verdict différent de 'ne-correspond-pas' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
  );
} finally {
  try {
    deleteProject(PROJECT_NAME);
    console.log(`\nProjet de test "${PROJECT_NAME}" supprimé (résidu de simulation).`);
  } catch (err) {
    console.log(`\n(nettoyage best-effort) suppression du projet de test échouée : ${(err as Error).message}`);
  }
}
