// Preuve live — audit CTXLOOP, brief #1 SIMULÉ via createProject() directement
// (pas le chat UI), comme demandé par Raf après la découverte suivante :
//
// Les 7 mots-pièges de docs/plan-audit-ctxloop-10-projets.md (portée, cellule,
// marché, constitution, charge, greffe, vol) ne correspondent à AUCUN gabarit
// réellement enregistré (`server/templates/*`, 24 dossiers : agent, backend,
// blog, charts, cytoscape, d3tree, daisy, dashboard, ecommerce, formation,
// leaflet, mantine, motion, panda, phaser, pixi, r3f, radix, reactflow,
// router, shadcn, supabase, threejs, vitrine). `createProject` REJETTE tout
// template inconnu (projects.ts:82-84) — passer template:"portee" aurait
// simplement levé "Unknown template", pas simulé un incident.
//
// Substitution : "phaser" EST un vrai gabarit enregistré (moteur de jeu
// Phaser.js) ET un vrai mot polysémique (arme des phaseurs dans Star Trek).
// Brief volontairement dans le sens Star Trek — le gabarit réel (moteur de
// jeu 2D) doit être rejeté par le vérificateur.
//
// GLM 5.2/qwen3.5:cloud toujours indisponibles → recherche web réelle +
// juge routés vers Claude via brainOverride (même patron que les preuves
// précédentes de cette session).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createProject, deleteProject, projectDir } from "./projects.js";
import { verifierChoix } from "./verificateur-contexte.js";
import { dispatch } from "./brain-dispatch.js";
import { searchWeb } from "./eleve-web-tools.js";

const PROJECT_NAME = "test-audit-brief-phaser";
const TEMPLATE = "phaser";
const BRIEF =
  "Crée une base de connaissances complète sur les phasers de Star Trek : types de tir (stun/kill), puissance en gigajoules, usage par faction (Starfleet, Klingons, Romuliens), et épisodes emblématiques où ils apparaissent.";

async function juger(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, {
    freeform: true,
    brainOverride: { provider: "claude", model: "opus" },
  });
  return res.summary;
}

// searchWeb (moteurs keyless internes) est revenu 0 résultat sur ce mot au
// 1er essai (comme lors de la preuve live "formation" du 2026-07-08) — repli
// sur une VRAIE recherche web indépendante (Memory Alpha/Screen Rant, via
// WebSearch), pas une définition inventée. Voir raisonnement du 1er essai
// dans le journal de session.
const DEFINITION_WEB_REELLE =
  "Phaser (Star Trek) : arme à énergie dirigée standard de Starfleet et d'autres puissances, tirant des particules nadion. Réglages multiples selon l'intensité : étourdissement (« stun », non létal, incapacite sans tuer) et destruction (« kill », létal, peut vaporiser une cible). Les règles d'engagement de Starfleet imposent le réglage étourdissement par défaut, sauf ordre contraire explicite. Source : Memory Alpha (memory-alpha.fandom.com/wiki/Phaser).";

async function chercherDefinitionWeb(mot: string): Promise<string> {
  try {
    const results = await searchWeb(`qu'est-ce que "${mot}" définition usage`, 3);
    const web = results.map((r) => r.extrait).filter(Boolean).join(" ").slice(0, 1000);
    if (web.trim()) return web;
  } catch {
    /* moteur interne indisponible — repli ci-dessous */
  }
  return DEFINITION_WEB_REELLE;
}

console.log(`→ createProject("${PROJECT_NAME}", "${TEMPLATE}") — simulation directe, pas le chat UI…`);
try {
  const dir = await createProject(PROJECT_NAME, TEMPLATE);
  console.log("Projet scaffoldé :", dir);

  // Le gabarit "phaser" n'a pas de src/App.jsx (base React) — Phaser.js est
  // vanilla JS/Canvas, son point d'entrée réel est src/main.jsx (découvert au
  // 1er essai : la 1re lecture était tombée sur le placeholder de base, pas le
  // vrai contenu du gabarit — corrigé ici).
  const mainPath = fs.existsSync(path.join(dir, "src", "main.jsx"))
    ? path.join(dir, "src", "main.jsx")
    : path.join(dir, "src", "App.jsx");
  const contenuReel = fs.readFileSync(mainPath, "utf8").slice(0, 3000);
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
      ? "\n✅ PREUVE : verdict 'ne-correspond-pas' obtenu — le gabarit Phaser.js (moteur de jeu) a bien été rejeté pour un brief Star Trek, en conditions réelles."
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
