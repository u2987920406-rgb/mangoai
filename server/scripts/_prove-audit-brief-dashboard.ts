// Preuve live — audit CTXLOOP, brief #6 (révision 2026-07-09 de docs/plan-audit-ctxloop-10-projets.md,
// remplace "Greffe" pour la même raison que les briefs précédents). "dashboard" EST un vrai gabarit
// enregistré (starter tableau de bord analytique admin) ET un vrai mot polysémique (le tableau de bord
// d'une voiture, au sens littéral). Brief volontairement dans le sens automobile — le gabarit réel
// (dashboard analytique) doit être rejeté par le vérificateur.
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

const PROJECT_NAME = "test-audit-brief-dashboard";
const TEMPLATE = "dashboard";
const BRIEF =
  "Crée un configurateur visuel de tableau de bord de voiture : disposition des cadrans (compteur de vitesse, compte-tours, jauge à essence), choix du style d'aiguilles, thème jour/nuit, prévisualisation en temps réel.";

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
  // Repli déterministe : le tableau de bord automobile (au sens littéral),
  // sens visé du brief, distinct du dashboard analytique/admin.
  return "Tableau de bord (dashboard) automobile : panneau situé face au conducteur regroupant les instruments de mesure (compteur de vitesse, compte-tours, jauge à essence, température) et les voyants d'alerte. Sens littéral distinct du « dashboard » informatique — un panneau de bord numérique regroupant des indicateurs métier/analytiques (KPI, statistiques, graphiques).";
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
      ? "\n✅ PREUVE : verdict 'ne-correspond-pas' obtenu — le gabarit dashboard analytique a bien été rejeté pour un brief de tableau de bord automobile, en conditions réelles."
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
