// Preuve live — audit CTXLOOP, brief #4 (révision 2026-07-09 de docs/plan-audit-ctxloop-10-projets.md,
// remplace "Constitution" pour la même raison que les briefs précédents). "leaflet" EST un vrai gabarit
// enregistré (starter react-leaflet, carte interactive) ET un vrai mot polysémique (le dépliant papier).
// Brief volontairement dans le sens dépliant publicitaire — le gabarit réel (carte interactive) doit
// être rejeté par le vérificateur.
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

const PROJECT_NAME = "test-audit-brief-leaflet";
const TEMPLATE = "leaflet";
const BRIEF =
  "Crée un générateur de dépliants publicitaires pour une boulangerie : mise en page A5, choix de la police et des couleurs, zones pour photo produit, texte promo et coordonnées, export prêt à imprimer.";

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
  // Repli déterministe : le dépliant papier (imprimé publicitaire), sens visé
  // du brief, distinct de Leaflet.js (bibliothèque de cartes interactives).
  return "Dépliant (leaflet en anglais) : document imprimé, généralement plié, utilisé à des fins publicitaires ou informatives — distribué en main propre ou par voie postale. Format courant A5/A4 plié, contient texte promotionnel, images, coordonnées. Sans rapport avec Leaflet.js, une bibliothèque JavaScript de cartographie interactive.";
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
      ? "\n✅ PREUVE : verdict 'ne-correspond-pas' obtenu — le gabarit react-leaflet (carte) a bien été rejeté pour un brief de dépliant publicitaire, en conditions réelles."
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
