// (Chantier archi — découpage runRelay) Construction du prompt "utilisateur"
// envoyé à l'Élève : listing/lecture de fichiers, axiomes, moyens injectés.
// Extrait VERBATIM de relay.ts (buildEleveUser + helpers privés). Aucun
// changement de comportement.
import fs from "node:fs";
import path from "node:path";
import { selectAxioms } from "../axioms.js";
import { loadMemory } from "../memory.js";
import { detectProjectType, inferProjectType } from "../blueprints.js";
import { WORKSPACE_DIR } from "../projects.js";
import { listProcedures, loadProcedure } from "../procedures.js";
import { constellationsSection } from "../constellations.js";

function listProjectFiles(projectDir: string, cap = 40): string[] {
  const out: string[] = [];
  const skip = new Set(["node_modules", "dist", ".git", ".assets", ".snapshots"]);
  const walk = (dir: string) => {
    if (out.length >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (skip.has(e.name) || e.name.startsWith(".env")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else out.push(path.relative(projectDir, abs).replaceAll("\\", "/"));
    }
  };
  walk(projectDir);
  return out;
}

/** Lit le contenu des fichiers PERTINENTS (mentionnés dans la tâche), plafonné,
 * pour que l'Élève produise des `<find>` exacts sur les fichiers à retoucher.
 * Filtrage volontaire : déverser tout le projet sature un petit modèle et
 * dégrade même les tâches de création (mesuré par l'Audit Scan). On ne donne
 * donc le contenu QUE des fichiers cités par la tâche (le cas des `<edit>`). */
function readListedFiles(
  projectDir: string,
  files: string[],
  task: string,
  fileBudget: number,
  fileMax: number,
): Array<{ path: string; content: string; truncated: boolean }> {
  const taskLow = task.toLowerCase();
  const relevant = files.filter((f) => {
    const base = (f.split("/").pop() ?? f).toLowerCase();
    return taskLow.includes(f.toLowerCase()) || taskLow.includes(base);
  });
  const out: Array<{ path: string; content: string; truncated: boolean }> = [];
  let budget = fileBudget;
  for (const f of relevant) {
    if (budget <= 0) break;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(projectDir, f), "utf8");
    } catch {
      continue; // binaire/illisible → on saute
    }
    const cap = Math.min(fileMax, budget);
    const truncated = raw.length > cap;
    const content = truncated ? raw.slice(0, cap) : raw;
    budget -= content.length;
    out.push({ path: f, content, truncated });
  }
  return out;
}

/** Message « utilisateur » envoyé à l'Élève : tâche + contexte + axiomes +
 * (en cas de reprise) la raison objective de l'échec précédent à corriger. */
// #104 Phase 3 — moyens text injectés à l'Élève (procédures #75 + constellations
// #74), matching mots-clés SYNCHRONE (pas d'embeddings dans le tour), CAPPÉ dur
// pour ne pas saturer un petit modèle. "" si rien / désactivé.
const INJECT_PROC_CAP = Number(process.env.RELAY_INJECT_PROC_CAP ?? 2); // procédures max
const INJECT_PROC_BODY_MAX = Number(process.env.RELAY_INJECT_PROC_BODY_MAX ?? 1100); // car./procédure

function injectedMeansSection(task: string): string {
  const parts: string[] = [];
  // 1. Procédures pertinentes (mots-clés : ≥2 tokens du problème/tags dans la tâche).
  try {
    const taskLow = task.toLowerCase();
    const scored = listProcedures(WORKSPACE_DIR)
      .map((m) => {
        const toks = `${m.name} ${m.problem} ${m.tags.join(" ")}`.toLowerCase().match(/[a-zà-ÿ0-9]{4,}/g) ?? [];
        const hits = new Set(toks.filter((t) => taskLow.includes(t))).size;
        return { m, hits };
      })
      .filter((s) => s.hits >= 2)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, INJECT_PROC_CAP);
    for (const { m } of scored) {
      const entry = loadProcedure(WORKSPACE_DIR, m.slug);
      if (!entry) continue;
      const body = entry.body.length > INJECT_PROC_BODY_MAX ? entry.body.slice(0, INJECT_PROC_BODY_MAX) + "\n…" : entry.body;
      parts.push(`### Procédure apprise : ${m.name}\n${body}`);
    }
  } catch { /* best-effort */ }
  // 2. Constellations (packs de règles, déjà cappés et purs).
  try {
    const c = constellationsSection(task, inferProjectType(task), WORKSPACE_DIR);
    if (c) parts.push(c);
  } catch { /* best-effort */ }
  if (!parts.length) return "";
  return [
    "",
    "═══ MÉTHODES & RÈGLES APPLICABLES (suis-les, elles viennent de solutions validées) ═══",
    ...parts,
    "═══ fin méthodes ═══",
  ].join("\n");
}

export function buildEleveUser(
  task: string,
  projectDir: string,
  lastError: string,
  injectMeans: boolean,
  callCaps: { axiomCap: number; axiomFiles: string[]; fileBudget: number; fileMax: number },
  // Résumé d'EXPLORATION agentique (cerveau fort qui a lu/cherché le projet avec
  // ses outils avant de coder). "" pour les profils non agentiques (inchangé).
  explorationNote = "",
  // true → consigne FINALE adaptée au moteur agentique (outils), pas au contrat
  // <mangoos>. Le reste (axiomes, contenus de fichiers) est identique.
  agentic = false,
): string {
  const files = listProjectFiles(projectDir);
  // v2.1 : type de projet détecté de façon robuste — la tâche d'abord, puis la
  // MÉMOIRE du projet si la tâche est neutre (ex. "ajoute un bouton" sur un
  // dashboard existant). Récupération d'axiomes par type bien plus fiable que
  // le seul prompt du tour.
  const projectType = detectProjectType(task, loadMemory(projectDir));
  // v2 : on ne sert à l'Élève (modèle faible) que les axiomes PERTINENTS pour
  // cette tâche, plafonnés — sinon un petit modèle sature. Claude, lui, reçoit
  // le registre complet (selectAxioms sans contexte, via scenario.ts).
  const axioms = selectAxioms(WORKSPACE_DIR, {
    task,
    projectType,
    max: callCaps.axiomCap,
    files: callCaps.axiomFiles,
  });
  const parts = [
    `TÂCHE : ${task}`,
    "",
    "Fichiers existants du projet :",
    files.length ? files.map((f) => `- ${f}`).join("\n") : "(projet vide)",
  ];
  // Contenu des fichiers (piste n°1) : indispensable pour les <edit> ciblés —
  // le <find> doit reprendre un extrait EXACT du contenu ci-dessous. Limité aux
  // fichiers cités par la tâche (sinon on sature l'Élève — mesuré par l'audit).
  const contents = readListedFiles(projectDir, files, task, callCaps.fileBudget, callCaps.fileMax);
  if (contents.length) {
    parts.push(
      "",
      "Contenu des fichiers cités (pour un <edit>, le <find> doit correspondre EXACTEMENT à un extrait ci-dessous) :",
      ...contents.map(
        (c) => `\n----- ${c.path}${c.truncated ? " (tronqué)" : ""} -----\n${c.content}`,
      ),
    );
  }
  if (explorationNote) {
    parts.push(
      "",
      "Ce que tu as découvert en explorant le projet avec tes outils (sers-t'en, ne re-devine pas) :",
      explorationNote,
    );
  }
  if (axioms) parts.push("", axioms);
  // #104 Phase 3 — moyens injectés (procédures #75 + constellations #74), cappés.
  if (injectMeans) {
    const means = injectedMeansSection(task);
    if (means) parts.push(means);
  }
  if (lastError) {
    parts.push(
      "",
      "⚠ Ta tentative précédente a ÉCHOUÉ à une vérification objective. Corrige précisément :",
      lastError,
    );
  }
  parts.push(
    "",
    agentic
      ? "Construis le projet en appelant tes OUTILS (write_file, edit_file, run_command, read_file, check_build). Après chaque écriture importante, appelle check_build ; s'il échoue, lis l'erreur et CORRIGE avant de continuer. Quand la tâche est faite ET le build vert, appelle finish(summary). N'appelle jamais npm install ni git."
      : "Réponds UNIQUEMENT dans le format <mangoos>.",
  );
  return parts.join("\n");
}
