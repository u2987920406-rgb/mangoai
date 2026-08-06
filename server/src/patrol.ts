// Idée #73 — « L'armée automatique ». Des patrouilleurs spécialisés convoqués
// AUTOMATIQUEMENT après chaque tour livré, en parallèle, fire-and-forget, dont le
// résultat agrégé est injecté dans le chat sous forme de rapport compact. L'armée
// PATROUILLE — elle ne répond pas à un ordre de l'utilisateur. La condition
// d'activation de chaque patrouilleur = pattern matching sur les fichiers
// modifiés au dernier tour + le type de projet.
//
// Pattern de référence : spawnBackgroundReview (review.ts) — verrou
// anti-empilement, lancé après que la réponse soit livrée (zéro latence pour
// l'utilisateur). Moteur : askLLM (abonnement Claude $0, jamais new Anthropic),
// injectable via `deps` pour des tests déterministes (modèle orchestrator.ts).
import path from "node:path";
import fs from "node:fs";
import { resolveProvider } from "./llm/llm-engine.js";
import { getBrain } from "./kernel.js";
import { dispatch } from "./brain.js";
import type { AgentId } from "./brain/brain-registry.js";
import type { AgentResult } from "./agent/agent-contract.js";
import { appendHistory } from "./history.js";
import type { ProjectType } from "./blueprints.js";

// Contexte lu une fois et partagé entre tous les patrouilleurs déclenchés.
export interface PatrolContext {
  projectDir: string;
  projectType: ProjectType;
  changedFiles: string[]; // chemins relatifs posix (sortie git)
  fileContents: Map<string, string>; // rel -> contenu lu, borné
}

export interface Patroller {
  id: string;
  label: string;
  emoji: string;
  // Décide si CE patrouilleur doit auditer ce tour. Pur, testable.
  triggers(ctx: PatrolContext): boolean;
  // Angle d'audit injecté en system prompt.
  system: string;
  /** Brain-Dispatch #150 : cerveau dédié de ce patrouilleur (routé si BRAIN_DISPATCH=on). */
  agentId?: AgentId;
}

export interface PatrolFinding {
  id: string;
  label: string;
  emoji: string;
  report: string;
  clean: boolean; // true => rien à signaler, masqué de l'agrégat
}

// Cerveau injectable (testé sans réseau). Défaut = askLLM via l'abonnement.
export interface PatrolDeps {
  ask: (system: string, user: string) => Promise<string>;
}

const defaultDeps: PatrolDeps = {
  ask: (system, user) =>
    getBrain().complete(system, user, {
      provider: resolveProvider(process.env.PATROL_PROVIDER), // défaut claude/abonnement $0
      maxTokens: 600,
    }),
};

// ── Lecture bornée du delta du tour ──────────────────────────────────────────
const MAX_PATROL_FILES = 12;
const MAX_CHARS_PER_FILE = 4000;

/** Lit le contenu (borné) des fichiers modifiés. Les triggers s'évaluent sur la
 * liste BRUTE `changedFiles` (un fichier supprimé matche encore par son nom) ;
 * le contenu est fourni à part, et un fichier illisible/supprimé est sauté. */
export function buildPatrolContext(
  projectDir: string,
  projectType: ProjectType,
  changedFiles: string[],
): PatrolContext {
  const fileContents = new Map<string, string>();
  for (const rel of changedFiles.slice(0, MAX_PATROL_FILES)) {
    try {
      const raw = fs.readFileSync(path.join(projectDir, rel), "utf8");
      fileContents.set(
        rel,
        raw.length > MAX_CHARS_PER_FILE ? `${raw.slice(0, MAX_CHARS_PER_FILE)}\n…(tronqué)` : raw,
      );
    } catch {
      /* fichier supprimé/illisible → ignoré, mais reste dans changedFiles */
    }
  }
  return { projectDir, projectType, changedFiles, fileContents };
}

// ── Triggers : helpers de pattern matching ───────────────────────────────────
const RE_UI = /\.(jsx|tsx|html|vue|svelte)$/i;
const RE_JSX = /\.(jsx|tsx)$/i;
const RE_SECURITY_PATH = /(server|api|route|auth|middleware|\.env|supabase|\bdb\b|sql|query)/i;
const RE_BACKEND_FILE = /^(server|api|routes?)\//i;
const RE_CODE = /\.(jsx|tsx|js|ts|mjs|cjs)$/i;

function any(files: string[], re: RegExp): boolean {
  return files.some((f) => re.test(f));
}

/** Un fichier de code importe-t-il un package node_modules (import "bare", non
 * relatif et non absolu) — signal d'un poids de bundle à surveiller. */
function importsBarePackage(ctx: PatrolContext): boolean {
  for (const [rel, content] of ctx.fileContents) {
    if (!RE_CODE.test(rel)) continue;
    // A bare specifier: `from 'pkg'`, `import 'pkg'` or `require('pkg')` whose
    // path doesn't start with "." or "/" (i.e. a node_modules package).
    if (/(?:from|import|require)\s*\(?\s*['"][^.\/][^'"]*['"]/.test(content)) return true;
  }
  return false;
}

/** Le contenu trahit-il un point sensible côté SPA (XSS, client supabase, auth) ? */
function hasSensitiveContent(ctx: PatrolContext): boolean {
  for (const content of ctx.fileContents.values()) {
    if (/dangerouslySetInnerHTML|createClient\s*\(|\bsignIn|\bsignUp|password|api[_-]?key|secret/i.test(content)) {
      return true;
    }
  }
  return false;
}

// ── Le registre des 5 patrouilleurs ──────────────────────────────────────────
export const PATROLLERS: Patroller[] = [
  {
    id: "a11y",
    label: "Accessibilité",
    emoji: "♿",
    agentId: "auditeur",
    triggers: (ctx) =>
      any(ctx.changedFiles, RE_UI) &&
      ["dashboard", "jeu", "slides", "vitrine", "webapp", "fullstack"].includes(ctx.projectType),
    system: `You are an Accessibility patroller in a local app builder. You audit ONLY accessibility (WCAG) in the changed files of a React + Vite project. Static analysis only — no execution.
Look for: images without alt, buttons/icons without accessible name (aria-label), poor or hardcoded color contrast, broken heading hierarchy (<h1>/<h2> order), <div onClick> used as a button instead of <button>, form inputs without an associated <label>, modals/dialogs without focus management, missing lang.
Report at most 4 concrete issues, each one short bullet: "- problem — file:where — fix". Be specific and actionable; skip stylistic nitpicks. If nothing notable, reply EXACTLY "RAS".`,
  },
  {
    id: "security",
    label: "Sécurité",
    emoji: "🔒",
    agentId: "auditeur",
    triggers: (ctx) =>
      any(ctx.changedFiles, RE_SECURITY_PATH) ||
      any(ctx.changedFiles, RE_BACKEND_FILE) ||
      hasSensitiveContent(ctx),
    system: `You are a Security patroller in a local app builder. You audit ONLY security in the changed files. Static analysis only.
Look for: hardcoded secrets/API keys, SQL or command injection, overly permissive CORS, an endpoint missing auth/authorization, eval/Function on untrusted input, path traversal, dangerouslySetInnerHTML with unsanitized data (XSS), secrets shipped to the browser (VITE_ prefixed secret).
Report at most 4 issues, each bullet prefixed with severity: "- (haute|moyenne|basse) problem — file:where — fix". If nothing notable, reply EXACTLY "RAS".`,
  },
  {
    id: "seo",
    label: "SEO",
    emoji: "🔍",
    agentId: "chercheur",
    triggers: (ctx) =>
      ["vitrine", "webapp", "fullstack"].includes(ctx.projectType) &&
      (ctx.projectType === "vitrine" ||
        any(ctx.changedFiles, /(^|\/)index\.html$/i) ||
        any(ctx.changedFiles, /(pages?|app|routes?)\/.*\.(jsx|tsx|html)$/i)),
    system: `You are an SEO patroller in a local app builder. You audit ONLY SEO/discoverability in the changed files. Static analysis only.
Look for: missing/empty <title> or meta description, missing Open Graph / Twitter card tags, more than one <h1> or no <h1>, missing lang on <html>, non-semantic markup where landmarks (header/nav/main/footer) belong, images without dimensions (layout shift).
Report at most 4 concrete bullets: "- problem — file:where — fix". If nothing notable, reply EXACTLY "RAS".`,
  },
  {
    id: "perf",
    label: "Performance",
    emoji: "⚡",
    agentId: "architecte",
    triggers: (ctx) =>
      any(ctx.changedFiles, RE_JSX) && !["slides", "autre"].includes(ctx.projectType),
    system: `You are a Performance patroller in a local app builder. You audit ONLY React render performance in the changed files. STATIC analysis only — never claim a runtime measurement.
Look for: useEffect with a missing/incorrect dependency array, expensive computation in render not memoized (useMemo), new object/array/function literals passed as props on every render (breaks memoization), list items without a stable key (index-as-key on dynamic lists), state updates causing cascade re-renders, large unsplit imports rendered eagerly.
Report at most 4 prioritized bullets: "- problem — file:where — fix". If nothing notable, reply EXACTLY "RAS".`,
  },
  {
    id: "bundle",
    label: "Bundle",
    emoji: "📦",
    agentId: "architecte",
    triggers: (ctx) =>
      !["slides", "autre"].includes(ctx.projectType) &&
      (any(ctx.changedFiles, /(^|\/)package\.json$/i) || importsBarePackage(ctx)),
    system: `You are a Bundle-size patroller in a local app builder. You audit ONLY JS bundle weight from the imports in the changed files. STATIC analysis only — no build is run, do not invent kB figures.
Look for known-heavy dependencies and patterns: moment (vs date-fns/Intl), full lodash barrel import (vs lodash-es / per-method), chart.js / recharts, three, framer-motion, full @mui barrel import, full firebase import, axios where fetch suffices; barrel imports pulling a whole library; route-level code that should be lazy-loaded (React.lazy/dynamic import).
Report at most 4 bullets: "- library/pattern — why it's heavy — lighter alternative". If nothing notable, reply EXACTLY "RAS".`,
  },
];

// ── Exécution d'un patrouilleur ──────────────────────────────────────────────
/** Lance UN patrouilleur sur le contexte. Un throw ou une sortie « RAS » donne
 * un finding « propre » (masqué). Jamais d'exception propagée. */
export async function runPatroller(
  p: Patroller,
  ctx: PatrolContext,
  deps: PatrolDeps = defaultDeps,
): Promise<PatrolFinding> {
  const relevant = ctx.changedFiles
    .filter((f) => ctx.fileContents.has(f))
    .map((f) => `### ${f}\n\`\`\`\n${ctx.fileContents.get(f)}\n\`\`\``)
    .join("\n\n");
  const user = [
    `Project type: ${ctx.projectType}.`,
    `Changed files this turn: ${ctx.changedFiles.join(", ")}.`,
    "",
    "Source code of the changed files (static analysis, no execution):",
    relevant || "(no readable content)",
    "",
    'Audit ONLY through your lens. If there is nothing notable, reply EXACTLY "RAS".',
  ].join("\n");
  try {
    const report = await askPatrol(p, user, deps);
    const clean = report === "" || /^RAS\b/i.test(report);
    return { id: p.id, label: p.label, emoji: p.emoji, report, clean };
  } catch {
    return { id: p.id, label: p.label, emoji: p.emoji, report: "", clean: true };
  }
}

/** Routage Brain-Dispatch opt-in : actif seulement si BRAIN_DISPATCH=on. */
function patrolDispatchEnabled(): boolean {
  return process.env.BRAIN_DISPATCH === "on";
}

/** Extrait le rapport texte d'un AgentResult (contrat Mango JSON). "" si échec. */
function reportFromResult(r: AgentResult): string {
  if (r.status === "error" || r.status === "timeout") return "";
  let rich = "";
  for (const v of Object.values(r.data ?? {})) {
    if (typeof v === "string" && v.trim().length > rich.length) rich = v.trim();
  }
  return (rich.length > (r.summary ?? "").length ? rich : (r.summary ?? "")).trim();
}

/** Le cerveau du patrouilleur : son agent dédié (si dispatch activé) sinon le défaut. */
async function askPatrol(p: Patroller, user: string, deps: PatrolDeps): Promise<string> {
  if (p.agentId && patrolDispatchEnabled()) {
    // Code du PROPRE projet de l'utilisateur → trustExternal.
    const r = await dispatch(p.agentId, p.system, user, { trustExternal: true });
    return reportFromResult(r);
  }
  return (await deps.ask(p.system, user)).trim();
}

// ── Agrégation : un seul message status compact, RAS masqués (anti-spam) ──────
export function aggregatePatrol(findings: PatrolFinding[]): string | null {
  const flagged = findings.filter((f) => !f.clean && f.report);
  if (flagged.length === 0) return null;
  const body = flagged.map((f) => `${f.emoji} **${f.label}**\n${f.report}`).join("\n\n");
  return `🛡️ Patrouille automatique (${flagged.length}/${findings.length})\n\n${body}`;
}

// ── Cœur testable : sélection → exécution parallèle → agrégation → injection ──
/** Tout le travail de la patrouille, sans le timing fire-and-forget. Renvoie le
 * message injecté (et l'écrit dans l'historique), ou null si rien à dire. */
export async function runPatrolOnce(
  projectDir: string,
  projectType: ProjectType,
  changedFiles: string[],
  deps: PatrolDeps = defaultDeps,
): Promise<string | null> {
  const ctx = buildPatrolContext(projectDir, projectType, changedFiles);
  const active = PATROLLERS.filter((p) => p.triggers(ctx));
  if (active.length === 0) return null;
  const findings = await Promise.all(active.map((p) => runPatroller(p, ctx, deps)));
  const report = aggregatePatrol(findings);
  if (report) {
    appendHistory(projectDir, [{ role: "status", text: report, ts: new Date().toISOString() }]);
  }
  return report;
}

// ── Wrapper fire-and-forget (verrou SÉPARÉ de la review) ──────────────────────
let patrolRunning = false;

export function patrolStatus(): { running: boolean } {
  return { running: patrolRunning };
}

/** Lance l'armée en arrière-plan après un tour livré. Kill-switch
 * PATROL_ENABLED=0. Verrou distinct de reviewRunning : review et patrouille
 * tournent en parallèle. Renvoie la promesse (2026-07-23, #0.4, audit
 * fault-finding) — suivable via turn-ledger.ts::trackDeferred, sans retarder
 * le caller (fire-and-forget inchangé si la promesse n'est pas utilisée). */
export function spawnPatrol(
  projectDir: string,
  projectType: ProjectType,
  changedFiles: string[],
  deps: PatrolDeps = defaultDeps,
): Promise<void> {
  if (process.env.PATROL_ENABLED === "0") return Promise.resolve();
  if (patrolRunning || changedFiles.length === 0) return Promise.resolve();
  patrolRunning = true;
  return runPatrolOnce(projectDir, projectType, changedFiles, deps)
    .then((report) => {
      if (report) console.log(`[patrol] rapport injecté (${changedFiles.length} fichiers)`);
    })
    .catch((err) => console.warn("[patrol]", err instanceof Error ? err.message : err))
    .finally(() => {
      patrolRunning = false;
    });
}
