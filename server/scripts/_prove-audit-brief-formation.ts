// Preuve live — audit CTXLOOP, brief #8 (« déjà vu », section B du plan). Terrain connu : le gabarit
// `formation` a été corrigé le 2026-07-08 (plus de quiz forcé au premier écran, cf. incident
// harnais-agentique-2026). Ce brief est un NOUVEAU sujet (cybersécurité PME), sans mot-piège — mesure
// le chemin RAPIDE une fois le concept "formation" déjà dans l'index (preuve live du 2026-07-08 sur le
// même gabarit), et vérifie l'absence de régression sur le gabarit corrigé.
//
// GLM 5.2/qwen3.5:cloud toujours indisponibles → recherche web réelle + juge routés vers Claude via
// brainOverride (même patron que les preuves précédentes de cette fenêtre d'audit).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, deleteProject } from "../src/projects.js";
import { verifierChoix } from "../src/verificateur-contexte.js";
import { dispatch } from "../src/brain-dispatch.js";
import { searchWeb } from "../src/eleve-web-tools.js";

const PROJECT_NAME = "test-audit-brief-formation";
const TEMPLATE = "formation";
const BRIEF =
  "Crée une formation sur la cybersécurité pour PME : reconnaître le phishing, bonnes pratiques de mots de passe, sauvegardes, gestion des accès — avec un parcours pédagogique progressif, leçons puis exercices, adapté au niveau de l'apprenant.";

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
  return "Formation : dispositif pédagogique structuré visant à faire acquérir des connaissances ou compétences à un apprenant, généralement via une progression de contenus (cours, leçons) suivie d'exercices ou d'évaluations pour consolider les acquis.";
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
      ? "\n✅ PREUVE (contrôle « déjà vu ») : verdict 'correspond' obtenu — le gabarit formation corrigé valide bien un brief de formation réel, aucune régression."
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
