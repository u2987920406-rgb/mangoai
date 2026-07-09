// Idée #44 — Orchestration « conseil d'experts » (READ-ONLY). Pensée pour le
// RATTRAPAGE d'un projet dévié (mauvais cadrage/prompt de départ), pas pour la
// génération initiale. N lentilles d'expertise lisent le projet CHACUNE sous son
// seul angle → diagnostics fusionnés en un PLAN DE REPRISE priorisé et validable
// → le builder (un seul writer) l'applique séquentiellement. On fusionne des
// DIAGNOSTICS (texte) — facile — jamais du code en parallèle (merge hell évité).
//
// Léger en archi : 1 fichier sur le routeur askLLM ($0 abonnement). Read-only sur
// le code de l'app : le seul fichier écrit est le doc .recovery-plan.md (un plan,
// pas du code), que le builder lit ensuite pour appliquer pas à pas.
import path from "node:path";
import fs from "node:fs";
import { getBrain } from "./kernel.js";
import { dispatch } from "./brain.js";
import type { AgentId } from "./brain/brain-registry.js";
import type { AgentResult } from "./agent/agent-contract.js";
import { findSourceFiles } from "./multi-project.js";
import { projectDir as resolveProjectDir } from "./projects.js";
import { loadMemory } from "./memory.js";
import { loadArchitecture } from "./architecture.js";
import { loadLexique } from "./lexique.js";
import { loadMiroir } from "./miroir.js";
import { matchAgentToProject } from "./super-agent-builder.js";

export const RECOVERY_FILE_NAME = ".recovery-plan.md";

const MAX_FILES = 14;
const MAX_CHARS_PER_FILE = 1800;
const MAX_CONTEXT_CHARS = 26000;
const RECOVERY_MAX_CHARS = 4000;

export interface CouncilLens {
  key: string;
  title: string;
  focus: string;
  /** Brain-Dispatch #150 : cerveau dédié de cette lentille. Quand BRAIN_DISPATCH=on,
   *  le diagnostic est routé vers ce cerveau ; sinon le cerveau global (défaut). */
  agentId?: AgentId;
}

// Fixed diagnostic panel — guarantees a real council even with zero super-agents.
// Each lens reads the WHOLE project but reports ONLY through its own angle.
export const DEFAULT_LENSES: CouncilLens[] = [
  {
    key: "architecture",
    title: "Architecte logiciel",
    agentId: "architecte",
    focus:
      "structure des fichiers, séparation des responsabilités, gestion d'état, flux de données, couplage/duplication, dette technique qui bloque l'évolution.",
  },
  {
    key: "product",
    title: "Product / cadrage",
    agentId: "designer_ux",
    focus:
      "alignement avec le BESOIN réel de l'utilisateur : est-ce qu'on construit la bonne chose ? scope qui a dévié, fonctionnalités manquantes ou hors-sujet, hypothèses de départ erronées.",
  },
  {
    key: "ux",
    title: "UX / UI",
    agentId: "designer_ux",
    focus:
      "cohérence visuelle et de navigation, hiérarchie, lisibilité, accessibilité de base, états vides/chargement/erreur côté expérience, friction du parcours principal.",
  },
  {
    key: "data",
    title: "Données & état",
    agentId: "architecte",
    focus:
      "modèle de données, forme de l'état, persistance, cohérence des sources de vérité, cas où les données manquent/sont invalides.",
  },
  {
    key: "robustness",
    title: "Robustesse",
    agentId: "auditeur",
    focus:
      "cas limites, validation des entrées, gestion d'erreur, sécurité des liens/entrées, comportements cassants, ce qui plante en conditions réelles.",
  },
];

export interface Diagnosis {
  lens: string; // lens title
  key: string; // lens key
  findings: string; // markdown text returned by the expert (read-only)
}

export interface CouncilResult {
  council: string[]; // lens titles convened
  diagnoses: Diagnosis[];
  plan: string; // prioritized recovery plan (markdown)
}

// ── Read-only project context (bounded snapshot) ─────────────────────────────

/** Gathers a bounded, read-only snapshot of the project: founding docs +
 *  a capped sample of source files. Never writes. */
export function gatherProjectContext(dir: string): string {
  const parts: string[] = [];

  const planPath = path.join(dir, "plan.md");
  try {
    const plan = fs.readFileSync(planPath, "utf8").trim();
    if (plan) parts.push(`## plan.md\n${plan.slice(0, 4000)}`);
  } catch {
    // no plan.md — fine
  }

  const docs: Array<[string, string]> = [
    ["Mémoire projet", loadMemory(dir)],
    ["Architecture (#38)", loadArchitecture(dir)],
    ["Contrat de langage (#45)", loadLexique(dir)],
    ["Le Miroir (#48)", loadMiroir(dir)],
  ];
  for (const [label, content] of docs) {
    if (content && content.trim()) parts.push(`## ${label}\n${content.trim().slice(0, 3000)}`);
  }

  // Source files preview (capped count + chars per file).
  let files: string[] = [];
  try {
    files = findSourceFiles(dir).slice(0, MAX_FILES);
  } catch {
    files = [];
  }
  for (const rel of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, rel), "utf8");
      const snippet = raw.length > MAX_CHARS_PER_FILE ? `${raw.slice(0, MAX_CHARS_PER_FILE)}\n…(tronqué)` : raw;
      parts.push(`### ${rel}\n\`\`\`\n${snippet}\n\`\`\``);
    } catch {
      // skip unreadable file
    }
  }

  let context = parts.join("\n\n");
  if (context.length > MAX_CONTEXT_CHARS) {
    context = `${context.slice(0, MAX_CONTEXT_CHARS)}\n…(contexte tronqué)`;
  }
  return context || "(projet vide ou illisible)";
}

/** Builds the council: the fixed diagnostic panel, plus the matched business
 *  super-agent (#40) as an extra DOMAIN lens when one fits the project. */
export function buildCouncil(projectName: string): CouncilLens[] {
  const lenses = [...DEFAULT_LENSES];
  try {
    const matched = matchAgentToProject(projectName);
    if (matched) {
      lenses.push({
        key: `expert-${matched.agent.id}`,
        title: `Expert métier — ${matched.agent.name}`,
        focus: `expertise du domaine « ${matched.agent.domain} ». ${matched.agent.systemPrompt.slice(0, 600)}`,
      });
    }
  } catch {
    // matching is best-effort; the fixed panel already guarantees a council
  }
  return lenses;
}

// ── LLM brains (injectable for testing) ──────────────────────────────────────

export interface OrchestratorDeps {
  ask: (system: string, user: string) => Promise<string>;
}

const defaultDeps: OrchestratorDeps = {
  ask: (system, user) => getBrain().complete(system, user, { maxTokens: 1400 }),
};

/** Routage Brain-Dispatch opt-in : actif seulement si BRAIN_DISPATCH=on. */
function dispatchEnabled(): boolean {
  return process.env.BRAIN_DISPATCH === "on";
}

/** Extrait un texte de diagnostic lisible d'un AgentResult (contrat Mango JSON). */
function findingsFromResult(r: AgentResult): string {
  if (r.status === "error" || r.status === "timeout") return "";
  // L'expert place souvent son analyse markdown dans un champ de data ; sinon résumé.
  let rich = "";
  for (const v of Object.values(r.data ?? {})) {
    if (typeof v === "string" && v.trim().length > rich.length) rich = v.trim();
  }
  return (rich.length > (r.summary ?? "").length ? rich : (r.summary ?? "")).trim();
}

/** Le cerveau de la lentille : son agent dédié (si dispatch activé) sinon le défaut. */
async function askLens(lens: CouncilLens, system: string, user: string, deps: OrchestratorDeps): Promise<string> {
  if (lens.agentId && dispatchEnabled()) {
    // Le contexte est le PROPRE projet de l'utilisateur → trustExternal (pas un input hostile).
    const r = await dispatch(lens.agentId, system, user, { trustExternal: true });
    return findingsFromResult(r);
  }
  return (await deps.ask(system, user)).trim();
}

/** One expert's READ-ONLY diagnosis through a single lens. Never proposes code
 *  to write — only what's wrong and the direction to fix, under its angle. */
export async function diagnose(
  lens: CouncilLens,
  context: string,
  problem: string,
  deps: OrchestratorDeps = defaultDeps,
): Promise<Diagnosis | null> {
  const system = `Tu es un ${lens.title} senior. Tu audites un projet React/Vite qui a DÉVIÉ (mauvais cadrage de départ). Tu lis le projet UNIQUEMENT sous ton angle : ${lens.focus}\nTu es en LECTURE SEULE : tu ne proposes PAS de code à écrire, tu IDENTIFIES les problèmes réels sous ton angle et la DIRECTION de correction. Sois concret, ancré sur le code/les docs fournis, jamais générique.`;
  const problemBlock = problem.trim() ? `\n\nCe que l'utilisateur signale comme ayant dévié :\n"${problem.trim()}"` : "";
  const user = `Contexte du projet (extraits) :\n${context}${problemBlock}\n\nDonne ton diagnostic sous TON SEUL angle (${lens.title}). Format : 2 à 5 puces, chacune « **Problème** (gravité haute/moyenne/basse) — pourquoi ça pose problème — direction de correction (sans écrire le code) ». Si sous ton angle tout est sain, dis-le en une ligne. Réponds en français, concis.`;
  try {
    const findings = await askLens(lens, system, user, deps);
    if (!findings) return null;
    return { lens: lens.title, key: lens.key, findings };
  } catch {
    return null; // a failed lens must not kill the council
  }
}

/** Merges the read-only diagnoses into ONE prioritized, validable recovery plan.
 *  Merging diagnoses (text) is easy — that's the whole point of #44. */
export async function synthesizeRecoveryPlan(
  diagnoses: Diagnosis[],
  problem: string,
  deps: OrchestratorDeps = defaultDeps,
): Promise<string> {
  const block = diagnoses.map((d) => `### ${d.lens}\n${d.findings}`).join("\n\n");
  const problemBlock = problem.trim() ? `\n\nProblème signalé par l'utilisateur : "${problem.trim()}"` : "";
  const system =
    "Tu es le chef d'orchestre d'un conseil d'experts qui rattrape un projet dévié. On te donne les diagnostics de plusieurs experts (chacun sous son angle). Tu les FUSIONNES en UN plan de reprise priorisé, dédupliqué, exécutable PAS À PAS par un seul développeur (un seul writer, séquentiel — pas de fusion de code parallèle).";
  const user = `Diagnostics du conseil :\n\n${block}${problemBlock}\n\nProduis un PLAN DE REPRISE en markdown, titré "# Plan de reprise", avec :\n- une ligne de synthèse du vrai problème de fond ;\n- une liste ORDONNÉE d'étapes (la plus haute priorité d'abord), chaque étape : « **N. Titre** (priorité haute/moyenne/basse) — quoi faire et pourquoi — fichiers probablement concernés ». Déduplique ce qui revient chez plusieurs experts. 5 à 10 étapes max, concrètes et séquentielles. Réponds en français.`;
  try {
    const plan = (await deps.ask(system, user)).trim();
    return plan;
  } catch {
    return "";
  }
}

/**
 * Runs the full read-only council on a project and saves the recovery plan as
 * a DOC (.recovery-plan.md) the builder applies sequentially afterwards. Never
 * touches the app's code. Per-lens errors are swallowed (a dead lens is skipped).
 */
export async function runCouncil(
  projectName: string,
  problem = "",
  deps: OrchestratorDeps = defaultDeps,
): Promise<CouncilResult> {
  const dir = resolveProjectDir(projectName);
  const context = gatherProjectContext(dir);
  const lenses = buildCouncil(projectName);

  const settled = await Promise.all(lenses.map((lens) => diagnose(lens, context, problem, deps)));
  const diagnoses = settled.filter((d): d is Diagnosis => d !== null);

  const plan = diagnoses.length > 0 ? await synthesizeRecoveryPlan(diagnoses, problem, deps) : "";
  if (plan) saveRecoveryPlan(dir, plan);

  return { council: lenses.map((l) => l.title), diagnoses, plan };
}

// ── Recovery plan artifact (the single writer reads this, applies it pas-à-pas) ─

export function loadRecoveryPlan(dir: string): string {
  try {
    const text = fs.readFileSync(path.join(dir, RECOVERY_FILE_NAME), "utf8").trim();
    return text.length > RECOVERY_MAX_CHARS
      ? `${text.slice(0, RECOVERY_MAX_CHARS)}\n[... tronqué]`
      : text;
  } catch {
    return "";
  }
}

export function saveRecoveryPlan(dir: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, RECOVERY_FILE_NAME), content, "utf8");
}

export function clearRecoveryPlan(dir: string): void {
  try {
    fs.rmSync(path.join(dir, RECOVERY_FILE_NAME), { force: true });
  } catch {
    // already gone
  }
}

/** System-prompt section injecting an active recovery plan ("" if absent). The
 *  builder is the SINGLE writer: it applies the plan sequentially, one step per
 *  turn, and reports progress. Zero weight until a council has run. */
export function recoveryPromptSection(dir: string): string {
  const content = loadRecoveryPlan(dir);
  if (!content) return "";
  return `\n\nPlan de reprise actif (${RECOVERY_FILE_NAME}, issu du conseil d'experts #44) — ce projet a dévié et un plan de rattrapage priorisé existe. Tu es le SEUL writer : applique-le SÉQUENTIELLEMENT, UNE étape à la fois (la plus prioritaire d'abord), en vérifiant après chaque étape ; n'attaque pas plusieurs étapes en parallèle. Dis brièvement quelle étape tu traites. Quand toutes les étapes sont faites, signale-le à l'utilisateur :\n${content}`;
}
