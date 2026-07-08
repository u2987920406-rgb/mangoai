// Boucle de vérification contextuelle — Étape 1 (2026-07-08). Point de
// branchement réel dans le flux de création de projet (index.ts) : vérifie
// qu'un gabarit fraîchement choisi correspond au sens RÉEL du mot employé
// par l'utilisateur — incident déclencheur documenté dans statut.md/limites.md.
//
// Gate ELEVE_CONTEXT_LOOP (off par défaut). Fire-and-forget, JAMAIS bloquant
// (même patron que `generateLexique` dans index.ts) : cette Étape 1 est de
// l'OBSERVATION — chaque vérification est journalisée pour l'audit qui
// décidera si un vrai blocage se justifie (cf. le plan de cette étape).
import fs from "node:fs";
import path from "node:path";
import { flag } from "./flags.js";
import { verifierChoix } from "./verificateur-contexte.js";
import { logVerification } from "./concept-consolidation.js";
import { searchWeb } from "./eleve-web-tools.js";
import { dispatch } from "./brain-dispatch.js";

/** Extrait représentatif du gabarit fraîchement scaffoldé — le CONTENU réel,
 *  jamais juste son nom (c'est tout le sens de la boucle). `App.jsx` porte
 *  presque toujours l'essentiel de la structure/du flux d'un starter MangoOS. */
function lireContenuGabarit(dir: string): string {
  try {
    return fs.readFileSync(path.join(dir, "src", "App.jsx"), "utf8").slice(0, 3000);
  } catch {
    return "";
  }
}

async function chercherDefinitionWeb(mot: string): Promise<string> {
  const results = await searchWeb(`qu'est-ce que "${mot}" définition usage`, 3);
  return results.map((r) => r.extrait).filter(Boolean).join(" ").slice(0, 1000);
}

async function juger(system: string, user: string): Promise<string> {
  // Rôle "juge" du brain-registry (qwen3.5:cloud) — freeform : pas le contrat
  // JSON <<<MANGO>>>, une ligne de prose comme attendu par parseVerdictContexte.
  const res = await dispatch("juge", system, user, { freeform: true });
  return res.summary;
}

/**
 * Vérifie EN ARRIÈRE-PLAN qu'un gabarit correspond au sens réel du mot utilisé.
 * Ne lève jamais, ne bloque jamais la création du projet (appelée en
 * fire-and-forget par l'appelant, comme `generateLexique`). `dir` doit déjà
 * exister (appelée APRÈS `createProject`).
 */
export async function verifierChoixGabaritEnArrierePlan(template: string, prompt: string, dir: string): Promise<void> {
  if (!flag("ELEVE_CONTEXT_LOOP")) return;
  try {
    const contenuReel = lireContenuGabarit(dir);
    if (!contenuReel) return; // rien à comparer — pas d'écran App.jsx lisible
    const rapport = await verifierChoix(template, prompt, contenuReel, prompt, { chercherDefinitionWeb, juger });
    logVerification({
      concept: template,
      contexteSignature: prompt.slice(0, 200),
      verdict: rapport.verdict,
      cheminUtilise: rapport.cheminUtilise,
      // Issue réelle inconnue à cet instant — la consolidation nocturne la
      // complétera une fois le Gardien/Raf passés sur ce projet.
      issuePositive: null,
    });
  } catch {
    // best-effort — ne doit jamais perturber la construction
  }
}
