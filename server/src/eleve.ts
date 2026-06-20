// Boucle de relais Maître/Élève (Phase Ultime, Jalon D — le « rouage de la
// bascule »). Orchestre les 4 briques déjà prouvées :
//   parseContract (contract.ts) · executeContract (executor.ts) ·
//   inspectProject (inspection.ts) · selectAxioms (axioms.ts)
//
//   1. L'Élève (modèle OSS local, Gemma via Ollama) tente la tâche à coût zéro,
//      en répondant dans le contrat <mangoos>, nourri des axiomes pertinents.
//   2. MangoOS applique (executeContract) puis JUGE objectivement (inspectProject).
//   3. Build vert → l'Élève a réussi seul.
//   4. Après MAX échecs OBJECTIFS → ESCALADE : le Maître (Claude) corrige ET
//      distille un AXIOME (clapet anti-retour) que l'Élève lira la prochaine fois.
//
// Les « cerveaux » (askEleve, escalate) sont injectables → la logique de relais
// est testable de bout en bout sans réseau ni coût (voir test-relay.ts).

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { parseContract } from "./contract.js";
import { executeContract } from "./executor.js";
import { inspectProject, type Inspection } from "./inspection.js";
import { hasBackend, BACKEND_DIR_NAME } from "./backend-generator.js";
import { axiomsFingerprint, selectAxioms } from "./axioms.js";
import { loadMemory } from "./memory.js";
import { detectProjectType, inferProjectType } from "./blueprints.js";
import { WORKSPACE_DIR } from "./projects.js";
import { resolveProfile } from "./models/profile.js";
// #104 Phase 3 — moyens text-injectables dont Gemma était privé (procédures #75,
// constellations #74). Import sync, sans cycle (ces modules n'importent pas eleve).
import { listProcedures, loadProcedure } from "./procedures.js";
import { constellationsSection } from "./constellations.js";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const ELEVE_MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";

// Partition de la famille du modèle Élève : prompt système, fichiers d'axiomes,
// caps et routage d'escalade viennent du PROFIL (server/src/models/). Le cœur
// reste agnostique ; un modèle non reconnu retombe sur GENERIC = comportement
// actuel exact. Les ENV restent prioritaires (override global ponctuel).
const PROFILE = resolveProfile(ELEVE_MODEL);
const MAX_ELEVE_ATTEMPTS = Number(process.env.ELEVE_MAX_ATTEMPTS ?? PROFILE.caps.maxAttempts);
// Anti-saturation : nombre max d'axiomes injectés à l'Élève (modèle faible).
const ELEVE_AXIOM_CAP = Number(process.env.ELEVE_AXIOM_CAP ?? PROFILE.caps.axiomCap);
// Contenu des fichiers fourni à l'Élève (piste future n°1) : sans lui, un <edit>
// sur un fichier existant devine un <find> qui ne matche pas. Plafonné pour ne
// pas saturer un petit modèle : budget total + cap par fichier (caractères).
const ELEVE_FILE_BUDGET = Number(process.env.ELEVE_FILE_BUDGET ?? PROFILE.caps.fileBudget);
const ELEVE_FILE_MAX = Number(process.env.ELEVE_FILE_MAX ?? PROFILE.caps.fileMax);

// Provider de l'Élève (« Élève turbo », optionnel). Par défaut « ollama » = le
// modèle LOCAL ($0, souverain). En option « openai » = un endpoint compatible
// OpenAI (DeepSeek, Together, etc.) — plus puissant mais PAYANT et non local.
// Switch par .env, sans toucher au code : ELEVE_PROVIDER + ELEVE_API_URL/KEY.
export function normalizeEleveProvider(raw?: string): "ollama" | "openai" {
  return (raw ?? "").trim().toLowerCase() === "openai" ? "openai" : "ollama";
}
// Tolère une base (".../v1") OU l'endpoint complet (".../chat/completions").
export function completionsUrl(base: string): string {
  const b = (base ?? "").trim().replace(/\/+$/, "");
  return b.endsWith("/chat/completions") ? b : `${b}/chat/completions`;
}
export const ELEVE_PROVIDER = normalizeEleveProvider(process.env.ELEVE_PROVIDER);
const ELEVE_API_URL = process.env.ELEVE_API_URL ?? "https://api.deepseek.com/v1";
const ELEVE_API_KEY = process.env.ELEVE_API_KEY?.trim() ?? "";

export type ResolvedBy = "eleve" | "maitre" | "none";

export interface RelayResult {
  resolvedBy: ResolvedBy;
  attempts: number; // tentatives de l'Élève avant succès/escalade
  success: boolean; // le build passe à la fin
  inspection: Inspection; // verdict objectif final
  axiom: boolean; // un axiome a-t-il été écrit lors de l'escalade
  costUsd: number; // coût Claude (0 si l'Élève a suffi)
  log: string[]; // trace lisible
}

export interface RelayOptions {
  maxEleveAttempts?: number;
  /** Modèle Claude pour l'escalade (défaut sonnet). */
  maitreModel?: string;
  /** Reçoit chaque ligne de trace en direct (pour le streaming SSE). */
  onLog?: (line: string) => void;
  // #104 Phase 2 — porte FONCTIONNELLE : ne pas s'arrêter à « build vert » si
  // l'app est vide. Ne s'active que si gate=true (ou .env RELAY_FUNCTIONAL_GATE=1)
  // ET qu'un `judge` est fourni dans les deps. OFF par défaut → boucle inchangée.
  functionalGate?: boolean;
  /** Score fonctionnel minimal (/10) accepté quand la porte est active (défaut 5). */
  functionalMin?: number;
  // #104 Phase 3 — injecter à l'Élève les moyens text qu'il n'avait pas
  // (procédures #75, constellations #74). OFF par défaut (ou .env RELAY_INJECT_MEANS=1).
  injectMeans?: boolean;
}

/** Les deux cerveaux + les effets de bord, injectables pour les tests. */
export interface RelayDeps {
  askEleve: (system: string, user: string) => Promise<string>;
  inspect: (projectDir: string) => Promise<Inspection>;
  ensureDeps: (projectDir: string, log: (s: string) => void) => Promise<void>;
  escalate: (ctx: EscalationContext) => Promise<{ axiom: boolean; costUsd: number }>;
  // #104 Phase 2 — juge fonctionnel optionnel (injectable). Absent de
  // defaultRelayDeps → la porte ne peut JAMAIS se déclencher par défaut.
  judge?: (projectDir: string, task: string) => Promise<{ fonctionnel: number; note: string } | null>;
}

export interface EscalationContext {
  task: string;
  projectDir: string;
  lastError: string;
  maitreModel: string;
}

// ── Face ENTRÉE du contrat : la forme imposée à l'Élève ───────────────────────
// Fournie par la PARTITION de la famille du modèle (models/) : GENERIC = le
// format historique (write + edit) ; gemma = variante Write-only. Le core ne
// connaît aucune famille, il lit simplement PROFILE.system.
const ELEVE_SYSTEM = PROFILE.system;

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
): Array<{ path: string; content: string; truncated: boolean }> {
  const taskLow = task.toLowerCase();
  const relevant = files.filter((f) => {
    const base = (f.split("/").pop() ?? f).toLowerCase();
    return taskLow.includes(f.toLowerCase()) || taskLow.includes(base);
  });
  const out: Array<{ path: string; content: string; truncated: boolean }> = [];
  let budget = ELEVE_FILE_BUDGET;
  for (const f of relevant) {
    if (budget <= 0) break;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(projectDir, f), "utf8");
    } catch {
      continue; // binaire/illisible → on saute
    }
    const cap = Math.min(ELEVE_FILE_MAX, budget);
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

function buildEleveUser(task: string, projectDir: string, lastError: string, injectMeans = false): string {
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
    max: ELEVE_AXIOM_CAP,
    files: PROFILE.axiomFiles, // universel + mécaniques de la famille
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
  const contents = readListedFiles(projectDir, files, task);
  if (contents.length) {
    parts.push(
      "",
      "Contenu des fichiers cités (pour un <edit>, le <find> doit correspondre EXACTEMENT à un extrait ci-dessous) :",
      ...contents.map(
        (c) => `\n----- ${c.path}${c.truncated ? " (tronqué)" : ""} -----\n${c.content}`,
      ),
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
  parts.push("", "Réponds UNIQUEMENT dans le format <mangoos>.");
  return parts.join("\n");
}

// ── Cerveau Élève par défaut : Gemma local via Ollama ──────────────────────────
async function askEleveOllama(system: string, user: string): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ELEVE_MODEL,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

// ── Cerveau Élève « turbo » : endpoint compatible OpenAI (DeepSeek, etc.) ──────
// Même contrat d'E/S (system + user → texte) que la version Ollama → la boucle
// de relais est INCHANGÉE. ⚠ Payant : la note n'est PAS captée dans les
// métriques (le tour Élève reste compté coût 0 ; seule l'escalade Claude l'est).
async function askEleveOpenAI(system: string, user: string): Promise<string> {
  if (!ELEVE_API_KEY) {
    throw new Error("ELEVE_API_KEY manquante (provider « openai ») — ajoute-la dans server/.env.");
  }
  const res = await fetch(completionsUrl(ELEVE_API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ELEVE_API_KEY}` },
    body: JSON.stringify({
      model: ELEVE_MODEL,
      stream: false,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API Élève HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

// Aiguillage du cerveau Élève selon le provider (.env). Défaut : Ollama local.
async function askEleveDispatch(system: string, user: string): Promise<string> {
  return ELEVE_PROVIDER === "openai" ? askEleveOpenAI(system, user) : askEleveOllama(system, user);
}

async function npmInstallIfNeeded(dir: string, log: (s: string) => void, label: string): Promise<void> {
  if (fs.existsSync(path.join(dir, "node_modules"))) return;
  if (!fs.existsSync(path.join(dir, "package.json"))) return;
  log(`npm install (${label})…`);
  await new Promise<void>((resolve) => {
    const p = spawn("npm install", { cwd: dir, shell: true, windowsHide: true });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}

async function ensureDepsNpm(projectDir: string, log: (s: string) => void): Promise<void> {
  await npmInstallIfNeeded(projectDir, log, "dépendances manquantes");
  // Projet full-stack : le backend généré (api/) a son propre package.json et
  // doit être installé pour que l'inspection (tsc --noEmit) ne renvoie pas un
  // faux "backend-no-deps". hasBackend est false tant que l'Élève n'a pas créé
  // api/ → cet appel n'installe le backend qu'une fois qu'il existe.
  if (hasBackend(projectDir)) {
    await npmInstallIfNeeded(path.join(projectDir, BACKEND_DIR_NAME), log, "backend api/");
  }
}

// ── Cerveau Maître par défaut : Claude corrige + écrit l'axiome ────────────────
const ESCALATE_SYSTEM = `Tu es le MAÎTRE dans l'apprentissage de MangoOS. Un modèle
ÉLÈVE local a tenté une tâche et a ÉCHOUÉ à une vérification OBJECTIVE (le build ne
passe pas). Deux missions, dans l'ordre :
1. CORRIGE le projet pour que "npm run build" passe — changement minimal et correct,
   pas de refonte. Tu peux lire/éditer les fichiers et lancer le build pour vérifier.
2. Puis distille EXACTEMENT UN axiome universel dans le registre .axioms.md (à la
   racine du workspace) expliquant le PIÈGE qui a fait trébucher l'Élève — la
   RÈGLE/le POURQUOI, jamais le code. Format, en français, une ligne vide entre axiomes :
     AXIOME-[CAT]-[NN] (maturité: candidat · vu: AAAA-MM-JJ)
     - Contexte : intention générale d'ingénierie/UX
     - Piège : le piège invisible
     - Règle d'or : la règle universelle verrouillante
   CAT ∈ {VISION,UIUX,ARCH,DATA,PERF,A11Y,BUILD}. Un nouvel axiome est TOUJOURS
   "candidat". Plafond ~12 axiomes / 3000 car. : fusionne plutôt que gonfler.
Ne touche à aucun fichier hors du projet et du registre d'axiomes.`;

async function escalateToClaude(ctx: EscalationContext): Promise<{ axiom: boolean; costUsd: number }> {
  // Détection de l'axiome appris sur l'UNION des fichiers de la partition (un
  // axiome rangé dans .axioms.<famille>.md compte aussi), via une empreinte NON
  // plafonnée : un nouvel axiome est appendé en fin de registre, donc au-delà du
  // cap d'injection dès que l'union est volumineuse — le diff plafonné le raterait.
  const axBefore = axiomsFingerprint(WORKSPACE_DIR, PROFILE.axiomFiles);
  // cwd = workspace si le projet y vit (Claude atteint code + .axioms.md en
  // relatif, comme la revue) ; sinon repli sur le projet seul.
  const rel = path.relative(WORKSPACE_DIR, ctx.projectDir).replaceAll("\\", "/");
  const inside = rel !== "" && !rel.startsWith("..");
  const cwd = inside ? WORKSPACE_DIR : ctx.projectDir;
  const projRef = inside ? rel : ".";

  const prompt = [
    `Projet à réparer : ./${projRef}`,
    `Tâche demandée à l'Élève : ${ctx.task}`,
    "",
    "Échec objectif constaté :",
    ctx.lastError,
    "",
    `Registre d'axiomes (.axioms.md) actuel :`,
    axBefore || "(vide)",
    "",
    "Corrige le build, puis ajoute l'unique axiome, puis arrête-toi.",
    PROFILE.escalateAppendix, // "" pour GENERIC → prompt inchangé
  ].join("\n");

  const q = query({
    prompt,
    options: {
      cwd,
      model: ctx.maitreModel,
      maxTurns: 24,
      permissionMode: "acceptEdits",
      allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      systemPrompt: { type: "preset", preset: "claude_code", append: ESCALATE_SYSTEM },
    },
  });
  let costUsd = 0;
  for await (const m of q) if (m.type === "result") costUsd = m.total_cost_usd ?? 0;

  const axiom = axiomsFingerprint(WORKSPACE_DIR, PROFILE.axiomFiles) !== axBefore;
  return { axiom, costUsd };
}

export const defaultRelayDeps: RelayDeps = {
  askEleve: askEleveDispatch,
  inspect: inspectProject,
  ensureDeps: ensureDepsNpm,
  escalate: escalateToClaude,
};

/** Le rouage de la bascule : l'Élève tente, MangoOS juge, le Maître escalade. */
export async function runRelay(
  task: string,
  projectDir: string,
  opts: RelayOptions = {},
  deps: RelayDeps = defaultRelayDeps,
): Promise<RelayResult> {
  const maxAttempts = opts.maxEleveAttempts ?? MAX_ELEVE_ATTEMPTS;
  const maitreModel = opts.maitreModel ?? "sonnet";
  // #104 — options lues au moment de l'appel (env = défaut global, option =
  // override par appel). OFF par défaut → boucle historique inchangée.
  const functionalGate = opts.functionalGate ?? (process.env.RELAY_FUNCTIONAL_GATE === "1");
  const functionalMin = opts.functionalMin ?? Number(process.env.RELAY_FUNCTIONAL_MIN ?? 5);
  const injectMeans = opts.injectMeans ?? (process.env.RELAY_INJECT_MEANS === "1");
  const log: string[] = [];
  const push = (s: string) => {
    log.push(s);
    console.log(`[relay] ${s}`);
    opts.onLog?.(s);
  };

  // Sans dépendances, l'inspection renverrait un faux "no-deps" — on les pose une fois.
  await deps.ensureDeps(projectDir, push);

  // Inspecte, et si l'Élève a généré un backend (api/) sans dépendances, les pose
  // une fois puis ré-inspecte — sinon le backend renverrait un faux "backend-no-deps".
  const inspectReady = async (): Promise<Inspection> => {
    let insp = await deps.inspect(projectDir);
    if (insp.signal === "backend-no-deps") {
      push("📦 Installation des dépendances backend (api/)…");
      await deps.ensureDeps(projectDir, push);
      insp = await deps.inspect(projectDir);
    }
    return insp;
  };

  let lastError = "";
  let lastInspection: Inspection = { ok: false, signal: "build-failed", detail: "", durationMs: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    push(`Tentative ${attempt}/${maxAttempts} — l'Élève (${ELEVE_MODEL}) travaille…`);

    let raw: string;
    try {
      raw = await deps.askEleve(ELEVE_SYSTEM, buildEleveUser(task, projectDir, lastError, injectMeans));
    } catch (e) {
      lastError = `appel Élève impossible : ${(e as Error).message}`;
      push(`✗ ${lastError}`);
      continue;
    }

    const parsed = parseContract(raw);
    if (!parsed.ok) {
      lastError = `réponse hors-contrat : ${parsed.error}`;
      push(`✗ ${lastError}`);
      continue;
    }
    push(`Plan reçu (${parsed.actions.length} action(s))${parsed.repaired ? " [réparé]" : ""}`);

    const exec = await executeContract(parsed.actions, projectDir);
    if (!exec.ok) {
      const failed = exec.outcomes.find((o) => o.status === "failed");
      lastError = `exécution échouée : ${failed && "error" in failed ? failed.error : "?"}`;
      push(`✗ ${lastError}`);
      continue;
    }

    lastInspection = await inspectReady();
    if (lastInspection.ok) {
      // #104 Phase 2 — porte FONCTIONNELLE : un build vert ne suffit pas si l'app
      // est vide. Si la porte est active ET qu'un juge est fourni ET qu'il reste
      // des tentatives, on vérifie le score fonctionnel ; trop bas → on RELANCE
      // l'Élève avec un feedback STRUCTURÉ (ce qui manque + comment), pas
      // « réessaie ». Sans judge (cas par défaut) la porte est inerte.
      if (functionalGate && deps.judge && attempt < maxAttempts) {
        let verdict: { fonctionnel: number; note: string } | null = null;
        try { verdict = await deps.judge(projectDir, task); } catch { verdict = null; }
        if (verdict && verdict.fonctionnel < functionalMin) {
          lastError =
            `Le build PASSE mais l'app est FONCTIONNELLEMENT INCOMPLÈTE ` +
            `(score fonctionnel ${verdict.fonctionnel}/10 < ${functionalMin} requis). ` +
            `Ne te contente JAMAIS d'un projet qui compile et ne livre JAMAIS le template de démo : ` +
            `IMPLÉMENTE réellement CHAQUE fonctionnalité de la tâche (interactions au clic, états, ` +
            `persistance, validation — pas du décoratif). Diagnostic : ${verdict.note}`;
          push(`⚠ build vert MAIS fonctionnel ${verdict.fonctionnel}/10 < ${functionalMin} — relance avec feedback structuré`);
          continue;
        }
      }
      push(`✓ build vert — résolu par l'ÉLÈVE en ${attempt} tentative(s), coût 0`);
      return { resolvedBy: "eleve", attempts: attempt, success: true, inspection: lastInspection, axiom: false, costUsd: 0, log };
    }
    lastError = `build cassé (${lastInspection.signal}) : ${lastInspection.detail.slice(-300)}`;
    push(`✗ inspection objective : ${lastInspection.signal}`);
  }

  // ── Escalade vers le Maître ──
  push(`⤴ ${maxAttempts} échec(s) objectif(s) — ESCALADE vers le MAÎTRE (Claude/${maitreModel})`);
  const esc = await deps.escalate({ task, projectDir, lastError, maitreModel });
  lastInspection = await inspectReady();

  if (lastInspection.ok) {
    push(`✓ build vert — résolu par le MAÎTRE${esc.axiom ? " (+1 axiome appris)" : ""}, coût $${esc.costUsd.toFixed(4)}`);
    return { resolvedBy: "maitre", attempts: maxAttempts, success: true, inspection: lastInspection, axiom: esc.axiom, costUsd: esc.costUsd, log };
  }
  push(`✗ build encore cassé après escalade — échec`);
  return { resolvedBy: "none", attempts: maxAttempts, success: false, inspection: lastInspection, axiom: esc.axiom, costUsd: esc.costUsd, log };
}
