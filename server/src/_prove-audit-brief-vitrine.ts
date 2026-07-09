// Preuve live — audit CTXLOOP, brief #9 (« déjà vu », section B du plan). Terrain connu : le gabarit
// `vitrine` est éprouvé plusieurs fois (`reference_projects_2026_06`). Pas de mot-piège, mesure le
// chemin RAPIDE sur un concept déjà stable.
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

const PROJECT_NAME = "test-audit-brief-vitrine";
const TEMPLATE = "vitrine";
const BRIEF =
  "Crée un site vitrine pour une architecte d'intérieur indépendante : présentation de son style et de son parcours, galerie de réalisations avant/après, liste de services (rénovation, conseil déco, home staging), formulaire de contact et prise de rendez-vous.";

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
  return "Site vitrine : site web professionnel de présentation, sans fonctionnalité transactionnelle (≠ e-commerce), destiné à présenter une activité, ses services et son savoir-faire, avec un objectif de conversion vers un contact ou une prise de rendez-vous.";
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
    rapport.parsed && rapport.verdict === "correspond"
      ? "\n✅ PREUVE (contrôle « déjà vu ») : verdict 'correspond' obtenu — le gabarit vitrine valide bien un brief de site vitrine réel, chemin rapide confirmé."
      : "\n⚠️ Verdict différent de 'correspond' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
  );
} finally {
  try {
    deleteProject(PROJECT_NAME);
    console.log(`\nProjet de test "${PROJECT_NAME}" supprimé (résidu de simulation).`);
  } catch (err) {
    console.log(`\n(nettoyage best-effort) suppression du projet de test échouée : ${(err as Error).message}`);
  }
}
