// Boucle de vérification contextuelle — Étape 1 (2026-07-08). Point de
// branchement réel dans le flux de création de projet (index.ts) : vérifie
// qu'un gabarit fraîchement choisi correspond au sens RÉEL du mot employé
// par l'utilisateur — incident déclencheur documenté dans statut.md/limites.md.
//
// Gate ELEVE_CONTEXT_LOOP (off par défaut). Fire-and-forget, JAMAIS bloquant
// (même patron que `generateLexique` dans index.ts) : cette Étape 1 est de
// l'OBSERVATION — chaque vérification est journalisée pour l'audit qui
// décidera si un vrai blocage se justifie (cf. le plan de cette étape).
//
// L111 (audit CTXLOOP, 2026-07-09) : ce hook est déclenché dans index.ts APRÈS
// la génération réelle (runRelay/streamAgentTurn), pas juste après
// createProject() — sinon `lireContenuGabarit` ne voit que le placeholder
// générique du scaffold, faux `ne-correspond-pas` systématique sur les
// gabarits de CONTENU (vitrine/ecommerce/blog/scènes de démo threejs…) même
// quand le choix de gabarit était correct.
import fs from "node:fs";
import path from "node:path";
import { flag } from "./flags.js";
import { verifierChoix } from "./verificateur-contexte.js";
import { verifierChaineAmbigue, type RapportChaineAmbigue } from "./chaine-ambigue.js";
import { logVerification } from "./concept-consolidation.js";
import { searchWeb } from "./eleve-tools/eleve-web-tools.js";
import { dispatch } from "./brain.js";

/** Extrait représentatif du contenu RÉEL du projet — le CONTENU, jamais juste
 *  le nom du gabarit (c'est tout le sens de la boucle). Appelé après la
 *  génération (cf. L111 ci-dessus), donc `App.jsx` porte déjà ce que l'Élève/
 *  Claude a effectivement écrit pour ce brief, pas le placeholder du starter. */
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

/** Extracteur de termes ambigus — même rôle "juge", freeform : la réponse
 *  attendue est un JSON court, pas le contrat <<<MANGO>>>. */
async function extraire(system: string, user: string): Promise<string> {
  const res = await dispatch("juge", system, user, { freeform: true });
  return res.summary;
}

const CHAINE_TIMEOUT_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(onTimeout), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(onTimeout);
    });
  });
}

/**
 * Analyse EN AMONT (avant l'injection du manifeste de domaine) la cohérence
 * jointe des termes ambigus consécutifs du brief. Contrairement à
 * `verifierChoixGabaritEnArrierePlan` (observation pure, a posteriori), cet
 * appel est SYNCHRONE et BORNÉ (timeout court) : seul un verdict
 * "incoherente" PARSÉ demande de supprimer le manifeste de domaine ce
 * tour-là — tout le reste (coherente/incertaine/timeout/erreur) laisse le
 * comportement byte-identique à aujourd'hui. Ne lève jamais.
 */
export async function analyserChaineEnAmontDuGabarit(
  agentPrompt: string,
): Promise<{ suppressDomain: boolean; rapport: RapportChaineAmbigue | null }> {
  if (!flag("ELEVE_CONTEXT_CHAINE")) return { suppressDomain: false, rapport: null };
  try {
    const rapport = await withTimeout(
      verifierChaineAmbigue(agentPrompt, { extraire, juger, chercherDefinitionWeb }),
      CHAINE_TIMEOUT_MS,
      null,
    );
    if (!rapport) return { suppressDomain: false, rapport: null };
    logVerification({
      concept: rapport.termesEnJeu.join(" + ") || "(aucun terme ambigu)",
      contexteSignature: agentPrompt.slice(0, 200),
      verdict: rapport.verdict,
      cheminUtilise: "aucun",
      issuePositive: null,
    });
    const suppressDomain = rapport.parsed && rapport.verdict === "incoherente";
    return { suppressDomain, rapport };
  } catch {
    return { suppressDomain: false, rapport: null };
  }
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
