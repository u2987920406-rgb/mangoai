// Preuve live — audit CTXLOOP, brief #2 (remplace "Cellule" pour la même raison
// que le brief #1 : aucun gabarit réel ne s'appelle "cellule"). "router" EST un
// vrai gabarit enregistré (squelette multi-pages react-router-dom) ET un vrai
// mot polysémique (routeur Wi-Fi domestique, matériel réseau). Brief
// volontairement dans le sens matériel réseau — le gabarit réel (site
// multi-pages) doit être rejeté par le vérificateur.
//
// GLM 5.2/qwen3.5:cloud toujours indisponibles → recherche web réelle + juge
// routés vers Claude via brainOverride (même patron que les preuves précédentes).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, deleteProject } from "../src/projects.js";
import { verifierChoix } from "../src/verificateur-contexte.js";
import { dispatch } from "../src/brain-dispatch.js";
import { searchWeb } from "../src/eleve-web-tools.js";

const PROJECT_NAME = "test-audit-brief-router";
const TEMPLATE = "router";
const BRIEF =
  "Crée un guide de configuration pour mon routeur Wi-Fi domestique : changer le mot de passe par défaut, ouvrir des ports pour un serveur de jeu, mettre à jour le firmware, dépanner une connexion qui coupe régulièrement.";

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
    /* moteur interne indisponible */
  }
  // Repli déterministe, pas une définition inventée : router Wi-Fi domestique
  // (matériel réseau), sens visé du brief, distinct de react-router-dom.
  return "Routeur (matériel réseau) : appareil qui dirige le trafic entre un réseau local (Wi-Fi/Ethernet) et Internet. Configuration typique via une interface web (192.168.x.x) : mot de passe Wi-Fi, redirection de ports (port forwarding), mise à jour du firmware, DHCP, sécurité (WPA2/WPA3).";
}

console.log(`→ createProject("${PROJECT_NAME}", "${TEMPLATE}") — simulation directe…`);
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
      ? "\n✅ PREUVE : verdict 'ne-correspond-pas' obtenu — le gabarit react-router-dom a bien été rejeté pour un brief de config routeur Wi-Fi, en conditions réelles."
      : "\n⚠️ Verdict différent de 'ne-correspond-pas' — voir raisonnement ci-dessus (résultat honnête, pas forcé).",
  );
} finally {
  try {
    deleteProject(PROJECT_NAME);
    console.log(`\nProjet de test "${PROJECT_NAME}" supprimé.`);
  } catch (err) {
    console.log(`\n(nettoyage best-effort) suppression échouée : ${(err as Error).message}`);
  }
}
