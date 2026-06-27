// Wraps the Claude Agent SDK: runs one chat turn against a generated project
// and yields simplified events the frontend can render.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { subscriptionEnv } from "./llm-engine.js";
import { assembleSystemPrompt } from "./scenario.js";
import { visionServer } from "./vision.js";
import { relevantNotesSection } from "./notes-rag.js";
import { constellationsSection } from "./constellations.js";
import { proceduresPromptSection } from "./procedures.js";
import { inferProjectType } from "./blueprints.js";
import { WORKSPACE_DIR } from "./projects.js";
import { perfectPlanSection, loadContract } from "./perfect-plan.js";
import { paletteFromContract } from "./kernel-design-events.js";
import { relevantArtifactsSection } from "./kernel-artifacts.js";
import { relevantComponentsSection, blueprintHintSection, relevantSkillsSection } from "./kernel-reuse.js";

const DEFAULT_MODEL = process.env.MODEL ?? "sonnet";
export const ALLOWED_MODELS = ["sonnet", "opus", "haiku"] as const;
export type ModelChoice = (typeof ALLOWED_MODELS)[number];

// Second axis, orthogonal to the model (which brain): the effort mode (which
// rigour). MVP = fast and cheap (no analytic ritual, no extended thinking,
// minimal visual loop); Élite = the full arsenal. This is the switch every
// future advanced feature (Mango Plan, moodboard, temporal QA…) plugs into.
// "uxui"   = agent spécialisé UX/UI (shadcn, accessibilité, micro-interactions — Gemma local #145).
// "layout" = agent spécialisé CSS Layout (Grid, Flex, Container Queries, responsive — Gemma local #145).
export const ALLOWED_MODES = ["mvp", "elite", "finition", "esthetique", "discuss", "projet", "compose", "uxui", "layout"] as const;
// "nocturne" = mode INTERNE de génération autonome (boucle nocturne #58) : il
// déploie l'arsenal DESIGN d'Élite (moodboard Sharingan + recherche web +
// design-system) mais SANS les portes humaines (cadrage qui sollicite,
// clarification, Miroir) — personne ne répond la nuit. Non exposé au sélecteur
// UI → hors d'ALLOWED_MODES, ajouté au seul type Mode.
// "esthetique" = mode UTILISATEUR de polish graphique haute fidélité (#68) :
// raffine la BEAUTÉ d'un projet déjà construit — micro-interactions, animations,
// tokens granulaires, boucle visuelle complète. Pas de nouvelle feature, pas de
// web research — polissage pur sur l'existant.
// "compose" = mode 🧩 App composable (#138) : l'app générée est UN composant
// d'un OS d'apps qui se parlent. Arsenal Élite + contrat MangoApp (manifest
// .mangoapp.json) + colonne de données partagée (REST /api/shared) en tête.
export type Mode = (typeof ALLOWED_MODES)[number] | "nocturne";
const DEFAULT_MODE: Mode = "elite";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; name: string; detail: string }
  | {
      type: "result";
      sessionId: string;
      costUsd: number;
      numTurns: number;
      ok: boolean;
      error?: string;
      // Size of the conversation context (prompt tokens of the turn's last
      // API call) and the model's window — drives the proactive compaction.
      contextTokens?: number;
      contextWindow?: number;
    }
  | { type: "error"; message: string };

// Hermes-style parallel workstreams: an isolated builder subagent that owns
// one well-scoped slice of the app. Tools restricted to file work — no Bash,
// so parallel builders can't fight over npm or the dev server.
const BUILDER_PROMPT = `You are a builder subagent inside a local "Lovable-like" app builder, implementing ONE well-scoped part of an existing React + Vite project while sibling subagents may be working on other parts in parallel.
Rules:
- Implement ONLY the part described in your task; never touch files outside your scope (shared files like index.css are listed in the task when you may edit them).
- Keep the app compiling at every step. Follow the styling approach stated in the task (plain CSS or Tailwind v4 — the template has Tailwind preinstalled).
- Never remove or modify the <script data-mangoos="error-relay"> block in index.html.
- When done, return a short summary: files created/edited and what the parent must wire up (imports, routes, CSS hooks).`;

// Contrôleur subagent (finition phase): an adversarial Lead QA that audits
// the ALREADY-BUILT app and hardens it in place — it never adds features. The
// finition scenario tells the engine to delegate to it; same tool restriction
// as the builder (no Bash/server) so it can't fight over the dev server.
const CONTROLEUR_PROMPT = `You are a Lead Contrôleur / Controller subagent inside a local "Lovable-like" app builder. The app is ALREADY BUILT; your job is to make it solid and shippable — NOT to add features.
Audit the project adversarially and FIX what you find, staying strictly within existing scope:
- Edge cases: empty/whitespace/invalid/out-of-range input, very long text, 0/1/many items, duplicate actions, missing data.
- Missing states: every async or data-driven view must handle loading, empty and error — not just the happy path. A list must render cleanly with 0 items; a form must show validation errors.
- Hardening: validate/sanitise user input, make external links safe (rel="noopener"), basic a11y (labels, alt text, focus, contrast), confirm layout holds at mobile width.
- Bugs & dead code: fix real defects; remove obvious dead code/duplication you touch — never rewrite working code wholesale.
Rules:
- NEVER add a new feature, page or scope. If something looks like a missing feature rather than a defect, report it instead of building it.
- Keep the app compiling at every step. Follow the project's existing styling approach and conventions.
- Never remove or modify the <script data-mangoos="error-relay"> block in index.html.
- When done, return a short report: defects found, fixes applied (file by file), and anything that still needs the user's decision.`;

const AGENTS = {
  builder: {
    description:
      "Implements one well-scoped, independent part of the app (a section, component or page) in parallel with other builders. Give it a precise task: what to build, which files it owns, and any shared conventions (colors, fonts) it must follow.",
    prompt: BUILDER_PROMPT,
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
  },
  controleur: {
    description:
      "Adversarial Lead Contrôleur for the finition phase: audits the already-built app and FIXES hardening defects in place (edge cases, missing loading/empty/error states, input validation, a11y, responsive, bugs, dead code) WITHOUT adding any feature. Give it the project scope and the conventions to respect; it returns a report of what it fixed.",
    prompt: CONTROLEUR_PROMPT,
    tools: ["Read", "Write", "Edit", "Glob", "Grep"],
  },
};

// Read-only view of the subagent registry, for deterministic tests.
export const AGENTS_FOR_TEST: Record<string, { tools: string[] }> = AGENTS;

// Handle to the in-flight query so the HTTP layer can interrupt it.
let currentQuery: ReturnType<typeof query> | null = null;

export async function interruptAgent(): Promise<boolean> {
  if (!currentQuery) return false;
  try {
    await currentQuery.interrupt();
    return true;
  } catch (err) {
    console.warn("[agent] interrupt failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function* runAgent(
  prompt: string,
  projectDir: string,
  sessionId?: string,
  model?: ModelChoice,
  mode?: Mode,
  // Idée #56 Chantier C — present when the user builds within a tutorial; threads
  // the tutorial posture block into the system prompt (null/undefined otherwise).
  tutorial?: { id: number; stepTitle?: string } | null,
  // Mode Client — désactive les blocs de goût personnel (axiomes, préférences,
  // design-system, identité, références) et les remplace par clientContext.
  clientMode?: boolean,
  // Curseur de style 0→100 (% du goût personnel ; 100 = défaut plein style).
  styleStrength?: number,
): AsyncGenerator<AgentEvent> {
  const effectiveModel = model ?? DEFAULT_MODEL;
  const effectiveMode = mode ?? DEFAULT_MODE;
  // Élite + a thinking-capable model = the analytic ritual and native extended
  // thinking (adaptive = the model decides when/how much to think). MVP stays
  // lean: no ritual, no thinking — faster and cheaper, protects the quota.
  // Thinking option rides on the analytic ritual: Élite + a thinking-capable
  // model. (The matching ANALYTIC_RULES block is in the Élite scenario and
  // self-gates on the model — the two stay in sync.)
  const analytic = (effectiveMode === "elite" || effectiveMode === "finition" || effectiveMode === "nocturne" || effectiveMode === "esthetique" || effectiveMode === "projet" || effectiveMode === "compose") && effectiveModel !== "haiku";
  // Mango Plan + moodboard (ideas 9/11) are Élite-only — and the moodboard
  // needs the web. MVP gets WebSearch only for the auto-moodboard (1 search,
  // 1 capture — half-capacity, no WebFetch deep-reads reserved for Élite).
  // Nocturne déploie le moodboard COMPLET comme Élite (WebSearch + WebFetch).
  // Finition is frozen: no web research allowed.
  // Esthetique is a polish phase on an existing project: no web research needed.
  const webTools = effectiveMode === "elite" || effectiveMode === "nocturne" || effectiveMode === "projet" || effectiveMode === "compose" ? ["WebSearch", "WebFetch"] : effectiveMode === "mvp" ? ["WebSearch"] : [];
  // Idée #61 vague 2 — recall des notes personnelles pertinentes à ce tour
  // (sémantique Ollama, repli mots-clés ; "" si aucune note). Best-effort : ne
  // doit jamais empêcher un tour de démarrer.
  let notesSection = "";
  try {
    notesSection = await relevantNotesSection(prompt);
  } catch {
    notesSection = "";
  }
  // Idée #74 — constellations: un signal de contexte détecté sur la demande
  // injecte un pack de règles coordonnées AVANT la génération. Détection pure et
  // synchrone (sur le prompt), "" quand rien ne se déclenche. Best-effort.
  let constellationsBlock = "";
  try {
    constellationsBlock = constellationsSection(prompt, inferProjectType(prompt), WORKSPACE_DIR);
  } catch {
    constellationsBlock = "";
  }
  // Idée #75 — mémoire procédurale : récupère (sémantique + repli mots-clés) les
  // démarches de résolution passées qui matchent CETTE demande, "" si aucune.
  // Best-effort, n'embed que la requête (les procédures sont pré-indexées).
  let proceduresBlock = "";
  try {
    proceduresBlock = await proceduresPromptSection(WORKSPACE_DIR, prompt);
  } catch {
    proceduresBlock = "";
  }
  // Idée #99 — Perfect Plan : contrat de démarrage (synchrone, lecture JSON).
  const perfectPlanBlock = (() => { try { return perfectPlanSection(projectDir); } catch { return ""; } })();
  // Idée #118 — réinjection des artefacts : avant de coder, on cherche dans le
  // Blackboard les palettes déjà créées proches de la CIBLE de ce projet (celle du
  // Perfect Plan) et on les rappelle à l'agent (réutiliser > réinventer). Synchrone
  // et pur (embedding = histogramme RGB, pas d'Ollama). "" si pas de cible/aucune.
  const artifactsBlock = (() => {
    try {
      const targetColors = paletteFromContract(loadContract(projectDir));
      const project = projectDir.split(/[\\/]/).filter(Boolean).pop() ?? "";
      return relevantArtifactsSection(project, targetColors);
    } catch {
      return "";
    }
  })();
  // Idée #119 — réinjection « même façon » des composants & blueprints. Composants :
  // tri sémantique Blackboard (repli mots-clés), async best-effort ; remplace le dump
  // complet par les plus pertinents. Blueprints : rappel du type détecté (synchrone).
  let componentsBlock = "";
  try {
    componentsBlock = await relevantComponentsSection(prompt, WORKSPACE_DIR);
  } catch {
    componentsBlock = "";
  }
  const blueprintHint = (() => { try { return blueprintHintSection(prompt); } catch { return ""; } })();
  // Idée #120 — skills pertinents (même mécanisme que les composants), async best-effort.
  let skillsBlock = "";
  try {
    skillsBlock = await relevantSkillsSection(prompt);
  } catch {
    skillsBlock = "";
  }
  try {
    const q = query({
      prompt,
      options: {
        cwd: projectDir,
        model: effectiveModel,
        maxTurns: 40,
        // Force l'abonnement Claude Code (jamais les crédits API) : une
        // ANTHROPIC_API_KEY présente détournerait la génération principale vers
        // la facturation à l'usage. Voir subscriptionEnv() dans llm-engine.
        env: subscriptionEnv(),
        permissionMode: "acceptEdits",
        allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "mcp__vision__snapshot", "mcp__vision__clone_url", "mcp__vision__scrape_url", "mcp__vision__sharingan_url", "mcp__vision__sharingan_image", ...webTools],
        agents: AGENTS,
        mcpServers: { vision: visionServer },
        ...(analytic ? { thinking: { type: "adaptive", display: "summarized" } as const } : {}),
        // Memory is appended per turn as a frozen snapshot (Hermes pattern):
        // mid-turn writes to .memory.md land on disk and are picked up at the
        // start of the NEXT turn, keeping this turn's prompt stable.
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          // Coque Souple: the append is assembled from named blocks following
          // the scenario (= effort mode). Behavior-constant vs the old inline
          // concatenation (verified byte-for-byte).
          append: assembleSystemPrompt({ mode: effectiveMode, model: effectiveModel, projectDir, tutorial: tutorial ?? undefined, notesSection, constellationsSection: constellationsBlock, proceduresSection: proceduresBlock, clientMode, styleStrength, perfectPlanSection: perfectPlanBlock, artifactsSection: artifactsBlock, componentsSection: componentsBlock, blueprintHintSection: blueprintHint, skillsSection: skillsBlock }),
        },
        ...(sessionId ? { resume: sessionId } : {}),
      },
    });
    currentQuery = q;
    // Usage of the most recent MAIN-loop API call (subagent calls excluded):
    // input + cache tokens = how full the conversation context currently is.
    let lastUsage: {
      input_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    } | null = null;
    for await (const message of q) {
      if (message.type === "assistant") {
        if (!message.parent_tool_use_id && message.message.usage) {
          lastUsage = message.message.usage;
        }
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim()) {
            yield { type: "text", text: block.text };
          } else if (block.type === "thinking" && block.thinking?.trim()) {
            yield { type: "thinking", text: block.thinking };
          } else if (block.type === "tool_use") {
            // MCP names are noisy ("mcp__vision__snapshot") — show a clean label.
            const name =
              block.name === "mcp__vision__snapshot"
                ? "Snapshot"
                : block.name === "mcp__vision__clone_url"
                  ? "Clone web"
                  : block.name === "mcp__vision__scrape_url"
                    ? "Aspire web"
                    : block.name === "mcp__vision__sharingan_url"
                      ? "Sharingan"
                      : block.name === "mcp__vision__sharingan_image"
                        ? "Sharingan image"
                        : block.name;
            yield { type: "tool", name, detail: summarizeToolInput(name, block.input) };
          }
        }
      } else if (message.type === "result") {
        const contextTokens = lastUsage
          ? (lastUsage.input_tokens ?? 0) +
            (lastUsage.cache_read_input_tokens ?? 0) +
            (lastUsage.cache_creation_input_tokens ?? 0)
          : undefined;
        const contextWindow =
          Object.values(message.modelUsage ?? {})
            .map((u) => u.contextWindow ?? 0)
            .reduce((a, b) => Math.max(a, b), 0) || undefined;
        yield {
          type: "result",
          sessionId: message.session_id,
          costUsd: message.total_cost_usd ?? 0,
          numTurns: message.num_turns ?? 0,
          ok: message.subtype === "success",
          error: message.subtype === "success" ? undefined : message.subtype,
          contextTokens,
          contextWindow,
        };
      }
    }
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  } finally {
    currentQuery = null;
  }
}

function summarizeToolInput(name: string, input: unknown): string {
  const i = input as Record<string, unknown>;
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
      return String(i?.file_path ?? "");
    case "Bash":
      return String(i?.command ?? "").slice(0, 120);
    case "Glob":
    case "Grep":
      return String(i?.pattern ?? "");
    case "Agent":
    case "Task":
      return String(i?.description ?? i?.prompt ?? "").slice(0, 120);
    case "Clone web":
    case "Aspire web":
    case "Sharingan":
      return String(i?.url ?? "").slice(0, 100);
    case "Sharingan image":
      return String(i?.path ?? "").slice(0, 100);
    case "Snapshot": {
      const scale = i?.scale && Number(i.scale) > 1 ? ` ×${i.scale}` : "";
      // Surface a driven capture (interactive product piloted before the shot).
      const steps = Array.isArray(i?.inputs) ? (i.inputs as unknown[]) : [];
      const drive = steps.length ? ` ⟵ ${steps.length} action(s)` : "";
      if (i?.selector) return `${String(i.selector).slice(0, 80)}${scale}${drive}`;
      if (i?.box) {
        const b = i.box as Record<string, number>;
        return `zone ${b.width}×${b.height}${scale}${drive}`;
      }
      return `${i?.fullPage ? "page entière" : "aperçu"}${drive}`;
    }
    default:
      return "";
  }
}
