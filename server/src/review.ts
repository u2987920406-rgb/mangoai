// Background memory review, transposed from Hermes Agent's background_review.py:
// after the response is delivered to the user, a cheap silent agent (haiku)
// re-reads the turn and curates the two memory stores (Hermes' combined review):
//   - <project>/.memory.md  — facts about THIS project
//   - workspace/.user-profile.md — who the user is, across ALL projects
// It never competes with the user's task for attention or latency, and never
// recurses (it is not itself reviewed).
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  MEMORY_FILE_NAME,
  USER_PROFILE_FILE_NAME,
  loadMemory,
  loadUserProfile,
} from "./memory.js";
import { WORKSPACE_DIR } from "./projects.js";
import { listSkills, skillsSnapshot, SKILLS_DIR } from "./skills.js";
import { AXIOMS_FILE_NAME, axiomsSnapshot, loadAxioms } from "./axioms.js";
import {
  LANGUAGE_FILE_NAME,
  THINKING_STYLE_FILE_NAME,
  VISION_FILE_NAME,
  loadLanguage,
  loadThinkingStyle,
} from "./identity.js";
import { COMPONENTS_DIR_NAME, componentsSnapshot, listComponents } from "./components.js";
import { PROCEDURES_DIR_NAME, proceduresSnapshot, listProcedures, reindexProcedures } from "./procedures.js";
import { appendHistory, type ChatEntry } from "./history.js";

// One review at a time; a turn that ends while a review runs skips its review
// (same "best-effort, never pile up" stance as Hermes).
let reviewRunning = false;

export function reviewStatus(): { running: boolean } {
  return { running: reviewRunning };
}

// Hermes' combined review, adapted: MEMORY.md vs USER.md vs the skill library
// (declarative facts vs user identity vs procedural how-to knowledge).
const REVIEW_SYSTEM = `
You are a silent background reviewer for a "Lovable-like" app builder. Your ONLY
job is to curate the knowledge stores below (paths are given in the user message):
1. The PROJECT memory (${MEMORY_FILE_NAME} inside the project folder): design
   decisions, conventions, data shapes, pitfalls — facts scoped to THIS project.
2. The USER profile (${USER_PROFILE_FILE_NAME} at the workspace root): who the
   user is across ALL projects — language and tone they prefer, recurring design
   tastes, how they like to work. Only put a preference here when it is clearly
   general ("je n'aime pas...", "toujours", "de manière générale", or the same
   taste keeps coming back); when in doubt, keep it project-scoped.
3. The SKILL library (its ABSOLUTE directory is given in the user message as
   SKILLS_DIR): HOW to do a class of task — a non-trivial technique, fix,
   workaround or pattern that a future session on ANY project would benefit from
   (e.g. a working cart pattern, a tricky CSS/Vite fix, a layout recipe the user
   validated).
   Format: <SKILLS_DIR>/<class-level-name>/SKILL.md (build the path from the
   ABSOLUTE SKILLS_DIR given below — never a bare ".skills/..."), starting with YAML frontmatter
   (--- name: <name> / description: <one line, when to use> ---), then concise
   steps with the actual code that worked. Be ACTIVE about skills: when the
   turn produced a working UI pattern, interaction, or fix (even a small one —
   a scroll button, an accordion, a form validation), capturing it is the
   default; a pass that saves nothing is a missed learning opportunity.
   Preference order: PATCH an existing skill that covers the territory > add
   detail to it > CREATE a new one. The name MUST be class-level
   ("panier-ecommerce", "bouton-scroll-top"), NEVER a one-session artifact
   ("fix-bug-du-jour"). Skip only pure Q&A turns or trivial one-line tweaks.
4. The AXIOM registry (${AXIOMS_FILE_NAME} at the workspace root) — the
   "knowledge flywheel". UNIVERSAL, abstract engineering/UX rules, independent
   of language, framework or project. An axiom is the WHY/RULE, NEVER the HOW
   (procedural code belongs in a skill) and NEVER a project fact. Add one ONLY
   when the turn exposed a non-obvious trap whose lesson generalises to ANY
   future project (a layout pitfall, a state-management gotcha, a perf rule).
   Format — one block per axiom, in French, separated by a blank line:
     AXIOME-[CAT]-[NN] (maturité: candidat | confirmé · vu: AAAA-MM-JJ)
     - Contexte : the general engineering/UX intent
     - Piège : the invisible trap the code or human falls into
     - Règle d'or : the universal locking rule
   CAT examples: VISION, UIUX, ARCH, DATA, PERF, A11Y. Number per category.
   GUARD-RAILS (mandatory — this clapet is anti-FORGETTING, not anti-correction):
   - A NEWLY created axiom is ALWAYS "candidat" — never write "confirmé" on an
     axiom's first appearance, however certain it seems. Promote to "confirmé"
     ONLY when a LATER, separate turn independently reconfirms an existing one.
   - Falsifiable: if THIS turn contradicts an existing axiom, you MUST amend or
     delete it (refresh its date) — never keep a rule observed to be false.
   - An axiom is a DEFAULT, not dogma; a user's explicit choice that overrides
     one is NOT a reason to weaken the axiom (it stays a default for next time).
   - Hard cap: keep the registry under ~12 axioms and 3000 characters. When
     full, MERGE overlapping axioms or drop the weakest "candidat" — never grow
     past the cap. Quality over quantity: most turns add NO axiom.
5. The LANGUAGE store (${LANGUAGE_FILE_NAME} at the workspace root) — the user's
   PERSONAL VOCABULARY: their shortcuts, habitual phrasings, recurring
   dictation/transcription errors (voice dictation mangles technical terms), and
   expressions that carry a precise meaning here ("on attaque" = implement now,
   "on creuse" = explore deeper without coding yet). Add an entry ONLY when a
   language pattern RECURS or is clearly idiosyncratic — not a one-off wording.
   Short French bullets, under 25 lines, MERGE don't duplicate.
6. The THINKING-STYLE store (${THINKING_STYLE_FILE_NAME} at the workspace root) —
   HOW the user decides: explores before acting, validates by logic, thinks in
   analogies, questions before accepting; when they explore vs when they want
   execution. Add an entry ONLY when a decision pattern is visible across the
   turn(s) — not a single instance. Short French bullets, under 25 lines, MERGE.
7. The COMPONENT library (${COMPONENTS_DIR_NAME}/ at the workspace root, path given in
   the user message as COMPONENTS_DIR) — REUSABLE React/JSX/TSX components. Each
   component lives in its own subfolder: <Name>/component.tsx + <Name>/meta.json
   ({"name","description","tags":[],"props":[],"usedIn":[],"createdAt":"ISO","updatedAt":"ISO"}).
   Extract a component ONLY when the turn produced a well-formed, self-contained
   React component (≥ 20 lines, props API visible, NO project-specific data hardcoded)
   that would plausibly be reused in a DIFFERENT project. Use PascalCase for the
   folder/name. The existing component list is given in the user message.
   SKIP: domain-specific components, trivial wrappers (< 20 lines), one-off layouts,
   and anything that imports project-specific data, hooks or API paths.
   If a component with the same name already exists and the new version is better,
   overwrite it and update meta.json's updatedAt + usedIn.
8. The PROCEDURE library (its ABSOLUTE directory is given in the user message as
   PROCEDURES_DIR) — PROCEDURAL MEMORY: the REASONING PLAYBOOK for solving a
   recurring NON-TRIVIAL technical problem (pagination, auth, drag-and-drop, file
   upload, debounced search, infinite scroll, optimistic update…). A procedure is
   the DÉMARCHE — the situation, the order of steps, the reasoning, the PITFALLS
   avoided, how it was validated. This is DISTINCT from the three look-alikes:
   - NOT a skill: a skill is copy-paste CODE for a class of task; a procedure is
     HOW you reasoned to a solution (steps + traps), not the final snippet.
   - NOT an axiom: an axiom is an abstract universal RULE (the why); a procedure
     is a concrete solving path for a specific problem class.
   - NOT project memory: a procedure generalises across projects.
   Create one ONLY when THIS turn actually SOLVED such a problem via a reusable
   approach. Format — two files per procedure, build the path from the ABSOLUTE
   PROCEDURES_DIR (never a bare ".procedures/..."):
     <PROCEDURES_DIR>/<slug>/meta.json — {"slug","name","problem":"the triggering
       situation in one line","tags":[],"usedIn":[],"createdAt":"ISO","updatedAt":"ISO"}
       (NO "embedding" field — it is computed elsewhere; never write it yourself).
     <PROCEDURES_DIR>/<slug>/PROCEDURE.md — "## Problème", then "## Démarche" (the
       ordered steps WITH the reasoning and the traps avoided), then "## Validation".
   slug = kebab-case class-level ("pagination-cote-client", "auth-supabase-session"),
   never a one-session artifact. PATCH an existing procedure before creating a new
   one. Skip trivial turns — most turns add NO procedure.
ABSOLUTE RULE — ${VISION_FILE_NAME}: you must NEVER create, edit or touch the
.vision.md file. It is 100% MANUAL, authored only by the user via explicit
signals. Even if the turn looks like a validated pattern, do NOT write it there.
User preferences and corrections ("stop doing X", "I don't like Y") are
FIRST-CLASS signals — save them in the right memory store.
Do NOT save anywhere: transient errors that were fixed by retrying, one-off task
narratives, anything obvious from reading the code, environment-dependent
failures, negative claims like "X does not work" (capture the FIX instead). Do
NOT duplicate a skill's how-to as an axiom, and never put project specifics in
the axiom registry.
Rules for memory files: short factual bullets, in French; under 50 lines for the
project memory, under 25 for the profile. MERGE and rewrite existing entries
instead of appending duplicates; delete entries that became wrong. When a
preference graduates to the profile, remove its duplicate from project memories
you are editing.
ABSOLUTE PATHS ONLY: every store's full absolute path is given in the user
message — write exactly there. Never resolve a relative ".skills/..." or bare
filename yourself (it would land in the wrong directory).
Do not modify ANY other file. Do not run commands.
If nothing is worth saving anywhere, reply exactly "Nothing to save." and stop.`;

const MAX_TRANSCRIPT_CHARS = 8000;

function formatTranscript(turn: ChatEntry[]): string {
  const lines = turn.map((e) => `[${e.role}] ${e.text}`).join("\n");
  return lines.length > MAX_TRANSCRIPT_CHARS
    ? `${lines.slice(0, MAX_TRANSCRIPT_CHARS)}\n[... transcript truncated]`
    : lines;
}

/** Fire-and-forget: reviews the finished turn and updates both memory stores.
 *  Renvoie la promesse (au lieu de l'avaler en interne) depuis 2026-07-23 (#0.4,
 *  audit fault-finding) — le caller peut désormais la suivre via turn-ledger.ts::
 *  trackDeferred, sans que ça retarde qui que ce soit (fire-and-forget inchangé si
 *  le caller ne fait rien de la promesse renvoyée). */
export function spawnBackgroundReview(projectDir: string, turn: ChatEntry[]): Promise<void> {
  if (reviewRunning) return Promise.resolve();
  reviewRunning = true;
  return (async () => {
    try {
      const memoryBefore = loadMemory(projectDir);
      const profileBefore = loadUserProfile(WORKSPACE_DIR);
      const skillsBefore = skillsSnapshot();
      const axiomsBefore = axiomsSnapshot(WORKSPACE_DIR);
      const languageBefore = loadLanguage(WORKSPACE_DIR);
      const thinkingBefore = loadThinkingStyle(WORKSPACE_DIR);
      const componentsBefore = componentsSnapshot(WORKSPACE_DIR);
      const proceduresBefore = proceduresSnapshot(WORKSPACE_DIR);
      // Absolute paths only — a relative ".skills/..." or bare filename can be
      // resolved by the reviewer against the wrong base and land outside the
      // workspace (observed: a skill written to the repo root). Forward slashes
      // for cross-platform clarity to the model.
      const abs = (p: string) => p.replaceAll("\\", "/");
      const memoryPath = abs(path.join(projectDir, MEMORY_FILE_NAME));
      const profilePath = abs(path.join(WORKSPACE_DIR, USER_PROFILE_FILE_NAME));
      const skillsDirPath = abs(SKILLS_DIR);
      const axiomsPath = abs(path.join(WORKSPACE_DIR, AXIOMS_FILE_NAME));
      const languagePath = abs(path.join(WORKSPACE_DIR, LANGUAGE_FILE_NAME));
      const thinkingPath = abs(path.join(WORKSPACE_DIR, THINKING_STYLE_FILE_NAME));
      const componentsDirPath = abs(path.join(WORKSPACE_DIR, COMPONENTS_DIR_NAME));
      const proceduresDirPath = abs(path.join(WORKSPACE_DIR, PROCEDURES_DIR_NAME));
      const skillList = listSkills()
        .map((s) => `- ${s.name}: ${s.description}`)
        .join("\n");
      const componentList = listComponents(WORKSPACE_DIR)
        .map((c) => `- ${c.name}: ${c.description}${c.tags.length ? ` [${c.tags.join(", ")}]` : ""}`)
        .join("\n");
      const procedureList = listProcedures(WORKSPACE_DIR)
        .map((p) => `- ${p.name}: ${p.problem}${p.tags.length ? ` [${p.tags.join(", ")}]` : ""}`)
        .join("\n");
      const prompt = [
        "Conversation turn to review:",
        formatTranscript(turn),
        "",
        `PROJECT memory file (absolute path — write here): ${memoryPath} — current content:`,
        memoryBefore || "(the file does not exist yet)",
        "",
        `USER profile file (absolute path — write here): ${profilePath} — current content:`,
        profileBefore || "(the file does not exist yet)",
        "",
        `SKILLS_DIR (absolute — create skills as ${skillsDirPath}/<name>/SKILL.md):`,
        skillList || "(none yet)",
        "",
        `AXIOM registry file (absolute path — write here): ${axiomsPath} — current content:`,
        loadAxioms(WORKSPACE_DIR) || "(the file does not exist yet)",
        "",
        `LANGUAGE file (absolute path — write here): ${languagePath} — current content:`,
        languageBefore || "(the file does not exist yet)",
        "",
        `THINKING-STYLE file (absolute path — write here): ${thinkingPath} — current content:`,
        thinkingBefore || "(the file does not exist yet)",
        "",
        `COMPONENTS_DIR (absolute — create components as ${componentsDirPath}/<Name>/component.tsx + meta.json):`,
        componentList || "(none yet)",
        "",
        `PROCEDURES_DIR (absolute — create procedures as ${proceduresDirPath}/<slug>/meta.json + PROCEDURE.md):`,
        procedureList || "(none yet)",
        "",
        `Reminder: NEVER touch ${VISION_FILE_NAME} — it is manual-only.`,
        "Update the store(s) if warranted, then stop.",
      ].join("\n");

      const q = query({
        prompt,
        options: {
          // Workspace root so both the project memory and the profile are in
          // scope; the system prompt forbids touching anything else.
          cwd: WORKSPACE_DIR,
          model: process.env.REVIEW_MODEL ?? "haiku",
          maxTurns: 12,
          permissionMode: "acceptEdits",
          allowedTools: ["Read", "Write", "Edit"],
          systemPrompt: { type: "preset", preset: "claude_code", append: REVIEW_SYSTEM },
        },
      });
      let cost = 0;
      for await (const message of q) {
        if (message.type === "result") cost = message.total_cost_usd ?? 0;
      }

      const memoryChanged = loadMemory(projectDir) !== memoryBefore;
      const profileChanged = loadUserProfile(WORKSPACE_DIR) !== profileBefore;
      const skillsChanged = skillsSnapshot() !== skillsBefore;
      const axiomsChanged = axiomsSnapshot(WORKSPACE_DIR) !== axiomsBefore;
      const languageChanged = loadLanguage(WORKSPACE_DIR) !== languageBefore;
      const thinkingChanged = loadThinkingStyle(WORKSPACE_DIR) !== thinkingBefore;
      const componentsChanged = componentsSnapshot(WORKSPACE_DIR) !== componentsBefore;
      const proceduresChanged = proceduresSnapshot(WORKSPACE_DIR) !== proceduresBefore;
      // Idée #75 — embarque l'embedding des procédures fraîchement écrites par le
      // reviewer (hors du chemin du tour). Best-effort : repli mots-clés si Ollama down.
      if (proceduresChanged) {
        try {
          await reindexProcedures(WORKSPACE_DIR);
        } catch {
          /* indexation best-effort */
        }
      }
      if (memoryChanged || profileChanged || skillsChanged || axiomsChanged || languageChanged || thinkingChanged || componentsChanged || proceduresChanged) {
        const what = [
          ...(memoryChanged ? ["mémoire du projet"] : []),
          ...(profileChanged ? ["profil utilisateur"] : []),
          ...(skillsChanged ? ["bibliothèque de skills"] : []),
          ...(axiomsChanged ? ["registre d'axiomes"] : []),
          ...(languageChanged ? ["vocabulaire personnel"] : []),
          ...(thinkingChanged ? ["style de pensée"] : []),
          ...(componentsChanged ? ["bibliothèque de composants"] : []),
          ...(proceduresChanged ? ["mémoire procédurale"] : []),
        ].join(" + ");
        console.log(`[review] ${what} updated ($${cost.toFixed(4)})`);
        // Visible on the next history reload, like the "version saved" line.
        appendHistory(projectDir, [
          { role: "status", text: `🧠 ${what.charAt(0).toUpperCase()}${what.slice(1)} mis à jour`, ts: new Date().toISOString() },
        ]);
      } else {
        console.log(`[review] nothing to save ($${cost.toFixed(4)})`);
      }
    } catch (err) {
      console.warn("[review]", err instanceof Error ? err.message : err);
    } finally {
      reviewRunning = false;
    }
  })();
}
