// Idée #103 — Mango Agent Factory. Génération de code + registry JSON des agents.
import path from "node:path";
import fs from "node:fs";
import { WORKSPACE_DIR } from "../projects.js";
import { AGENTS_DIR } from "./agent-bus.js";
import { resolveProvider } from "../llm/llm-engine.js";
import { getBrain } from "../kernel.js";
import { atomicWriteFileSync } from "../safe-io.js";
import type { AgentDef, AgentCategory } from "./agent-types.js";

const REGISTRY_FILE    = path.join(path.resolve(import.meta.dirname, "..", ".."), "server", "data", "agents-registry.json");
const TEMPLATE_DIR     = path.join(path.resolve(import.meta.dirname, "..", ".."), "server", "templates", "agent");
const TEMPLATE_AGENT   = path.join(TEMPLATE_DIR, "agent.js");

// Deps injectables (tests sans réseau).
export interface FactoryDeps {
  ask: (system: string, user: string) => Promise<string>;
}

const defaultFactoryDeps: FactoryDeps = {
  ask: (system, user) =>
    getBrain().complete(system, user, {
      provider: resolveProvider(process.env["AGENT_FACTORY_PROVIDER"]),
      maxTokens: 2000,
    }),
};

// ── Registry ──────────────────────────────────────────────────────────────────

export function loadAgentRegistry(): AgentDef[] {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")) as AgentDef[];
  } catch {
    return [];
  }
}

export function saveAgentDef(def: AgentDef): void {
  const registry = loadAgentRegistry();
  const idx = registry.findIndex((d) => d.id === def.id);
  if (idx >= 0) registry[idx] = def;
  else registry.push(def);
  atomicWriteFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

export function loadAgentDef(agentId: string): AgentDef | null {
  return loadAgentRegistry().find((d) => d.id === agentId) ?? null;
}

export function deleteAgent(agentId: string): void {
  // Retire du registry
  const registry = loadAgentRegistry().filter((d) => d.id !== agentId);
  atomicWriteFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  // Supprime le dossier workspace/.agents/<slug>
  const dir = agentDir(agentId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export function agentDir(agentId: string): string {
  const safe = agentId.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80);
  return path.join(AGENTS_DIR, safe);
}

export function generateAgentId(name: string, category: AgentCategory): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${category}-${slug}-${Date.now().toString(36)}`;
}

// ── Génération du code ────────────────────────────────────────────────────────

const GENERATION_SYSTEM = `Tu es un générateur de code Node.js pour MangoOS Agent Factory.
Tu reçois la définition d'un agent et le squelette de base (agent.js).
Tu dois générer UNIQUEMENT le contenu des 3 fonctions marquées [MANGO:CUSTOM] :
  1. getSystemPrompt() — décrit le rôle précis de l'agent
  2. runTask(context)  — logique métier principale (utilise askMango pour le LLM)
  3. shouldStop(state, lastResult) — condition d'arrêt (selon la catégorie)

RÈGLES ABSOLUES :
- Renvoie UNIQUEMENT un objet JSON avec 3 clés : "getSystemPrompt", "runTask", "shouldStop"
- Chaque valeur = le corps de la fonction (sans "function xxx() {" ni accolades extérieures)
- Utilise askMango(system, user) pour tout appel LLM — JAMAIS fetch vers api.anthropic.com
- Utilise sendToAgent(toId, type, payload) pour communiquer avec d'autres agents
- Utilise checkInbox() déjà appelé — context.messages contient les messages reçus
- Code ES modules (import/export déjà fait dans le squelette)
- Pas de commentaires inutiles, code propre et minimal

Exemple de sortie attendue :
{
  "getSystemPrompt": "return \`Tu es un agent de veille...\\n\${config.description}\`;",
  "runTask": "const result = await askMango(getSystemPrompt(), \`Analyse: \${JSON.stringify(context.input)}\`);\\nreturn result;",
  "shouldStop": "return false;"
}`;

export async function generateAgentCode(
  def: AgentDef,
  deps: FactoryDeps = defaultFactoryDeps,
): Promise<{ code: string; error?: string }> {
  const template = fs.readFileSync(TEMPLATE_AGENT, "utf8");

  const user = `Voici la définition de l'agent à générer :
${JSON.stringify(def, null, 2)}

Voici le squelette complet (agent.js) que tu dois personnaliser :
${template}

Génère les 3 fonctions [MANGO:CUSTOM] adaptées à cet agent.`;

  let raw: string;
  try {
    raw = await deps.ask(GENERATION_SYSTEM, user);
  } catch (err) {
    return { code: template, error: `Génération LLM échouée : ${(err as Error).message}` };
  }

  // Extraire le JSON de la réponse (peut être entouré de ```json ... ```)
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw];
  const jsonStr = (jsonMatch[1] ?? raw).trim();

  let parsed: { getSystemPrompt?: string; runTask?: string; shouldStop?: string };
  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch {
    return { code: template, error: "Réponse LLM non parsable en JSON" };
  }

  // Injecter les 3 fonctions dans le template
  let code = template;
  if (parsed.getSystemPrompt) {
    code = code.replace(
      /\/\/ ── \[MANGO:CUSTOM\] System prompt ──.*?^function getSystemPrompt\(\) \{[\s\S]*?^\}/m,
      `// ── [MANGO:CUSTOM] System prompt ──────────────────────────────────────\nfunction getSystemPrompt() {\n  ${parsed.getSystemPrompt}\n}`,
    );
  }
  if (parsed.runTask) {
    code = code.replace(
      /\/\/ ── \[MANGO:CUSTOM\] Logique métier principale ──.*?^async function runTask\(context\) \{[\s\S]*?^\}/m,
      `// ── [MANGO:CUSTOM] Logique métier principale ──────────────────────────\nasync function runTask(context) {\n  ${parsed.runTask}\n}`,
    );
  }
  if (parsed.shouldStop) {
    code = code.replace(
      /\/\/ ── \[MANGO:CUSTOM\] Condition d'arrêt ──.*?^function shouldStop\(state, _lastResult\) \{[\s\S]*?^\}/m,
      `// ── [MANGO:CUSTOM] Condition d'arrêt ─────────────────────────────────\nfunction shouldStop(state, _lastResult) {\n  ${parsed.shouldStop}\n}`,
    );
  }

  return { code };
}

// ── Scaffold du dossier ───────────────────────────────────────────────────────

export async function scaffoldAgent(
  def: AgentDef,
  deps: FactoryDeps = defaultFactoryDeps,
): Promise<{ ok: boolean; dir: string; error?: string }> {
  const dir = agentDir(def.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });

  // Générer le code
  const { code, error } = await generateAgentCode(def, deps);

  // Écrire agent.js
  atomicWriteFileSync(path.join(dir, "agent.js"), code);

  // Écrire config.json (la définition complète sérialisée)
  atomicWriteFileSync(path.join(dir, "config.json"), JSON.stringify(def, null, 2));

  // Écrire state.json initial
  const initState = {
    id: def.id,
    status: "idle",
    taskCount: 0,
    errorCount: 0,
  };
  atomicWriteFileSync(path.join(dir, "state.json"), JSON.stringify(initState, null, 2));

  // Sauvegarder dans le registry
  saveAgentDef(def);

  return { ok: true, dir, ...(error ? { error } : {}) };
}
