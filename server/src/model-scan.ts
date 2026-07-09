// Examen d'entrée du cerveau (#148) — le « révélateur de cerveau » de Raf.
//
// Quand on branche un modèle INCONNU (Qwen-Coder, DeepSeek, un local…), on ne
// sait pas ce qu'il vaut : sait-il appeler des outils ? suivre un contrat ?
// coder ? raisonner ? Ce module le MESURE par une batterie de sondes à signaux
// OBJECTIFS (la marque de fabrique MangoOS : juger sur du mesurable, pas au
// feeling) et en tire un VERDICT DE PLACEMENT + un profil suggéré.
//
// Sortie : où placer ce cerveau —
//   "agentic"  → assez fort pour la boucle à outils (coder/planifier)
//   "contract" → écriture via contrat <mangoos>, pas d'outils
//   "discuss"  → trop faible pour construire, bon pour discuter
//   "reject"   → ne vaut pas le coup → rester sur le cerveau courant
//
// Module PUR : le transport (ask texte + post function-calling) est INJECTÉ →
// testable sans réseau. defaultScanDeps() (import dynamique d'eleve.js) fournit
// le transport réel pour la CLI / le live.

import vm from "node:vm";
import { z } from "zod";
import { ToolRegistry, toOpenAITools } from "./kernel/kernel-mcp.js";
import { parseContract } from "./contract.js";
import type { PostFn, ToolCall } from "./eleve-runtime.js";
import type { ModelProfile } from "./models/profile.js";

export type ScanVerdict = "agentic" | "contract" | "discuss" | "reject";

export interface ProbeResult {
  id: string;
  dimension: string;
  passed: boolean;
  score: number; // 0..1
  detail: string;
  latencyMs: number;
}

export interface ScanReport {
  model: string;
  probes: ProbeResult[];
  /** dimension → score 0..1 */
  capabilities: Record<string, number>;
  verdict: ScanVerdict;
  /** Bribe de ModelProfile dérivée de la mesure (le reste = prose, à la Phase E). */
  suggestedProfile: { agentic: boolean; caps: ModelProfile["caps"]; verdict: ScanVerdict };
  avgLatencyMs: number;
  summary: string;
}

/** Transport injecté : complétion texte + function-calling. */
export interface ScanDeps {
  ask: (system: string, user: string) => Promise<string>;
  post: PostFn;
}

// Caps suggérées selon le niveau (cap anti-saturation : un petit modèle se noie).
const CAPS_AGENTIC: ModelProfile["caps"] = { axiomCap: 10, fileBudget: 24_000, fileMax: 6_000, maxAttempts: 3 };
const CAPS_CONTRACT: ModelProfile["caps"] = { axiomCap: 6, fileBudget: 14_000, fileMax: 4_000, maxAttempts: 3 };
const CAPS_WEAK: ModelProfile["caps"] = { axiomCap: 4, fileBudget: 9_000, fileMax: 3_000, maxAttempts: 2 };

// ── Utilitaires ──────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

function parseJsonLoose(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/[[{][\s\S]*[\]}]/);
    if (m) try { return JSON.parse(m[0]); } catch { /* tombe */ }
    return null;
  }
}

/** Exécute le code d'une fonction sum(a,b) en bac à sable (vm + timeout) et
 * vérifie sum(2,3)===5. Sécurité : pas de globals, timeout 1 s. */
function testSumCode(raw: string): boolean {
  let code = raw.trim().replace(/^```(?:[a-z]+)?\s*/i, "").replace(/```\s*$/i, "").trim();
  code = code.replace(/\bexport\s+(default\s+)?/g, ""); // export invalide en vm
  try {
    // La valeur de complétion du script = la dernière expression (plus fiable
    // qu'une propriété du sandbox, robuste à const/function/arrow).
    const result = vm.runInNewContext(`${code}\n;(typeof sum === 'function') ? sum(2, 3) : null`, {}, { timeout: 1000 });
    return result === 5;
  } catch {
    return false;
  }
}

// ── Les SONDES (chacune : un signal objectif) ────────────────────────────────

async function probeReasoning(deps: ScanDeps): Promise<ProbeResult> {
  const { value, ms } = await timed(() =>
    deps.ask(
      "Tu réponds UNIQUEMENT par un nombre, rien d'autre.",
      "Un compteur démarre à 0 et augmente de 7 à chaque étape. Quelle est sa valeur après 3 étapes ?",
    ),
  );
  const passed = /\b21\b/.test(value);
  return { id: "reasoning", dimension: "raisonnement", passed, score: passed ? 1 : 0, detail: passed ? "21 ✓" : `attendu 21, reçu « ${value.slice(0, 40)} »`, latencyMs: ms };
}

async function probeJson(deps: ScanDeps): Promise<ProbeResult> {
  const { value, ms } = await timed(() =>
    deps.ask(
      "Réponds UNIQUEMENT avec du JSON valide, sans texte ni balises markdown.",
      'Renvoie un objet JSON avec la clé "somme" égale à 12+30 et la clé "nom" égale à "mango".',
    ),
  );
  const obj = parseJsonLoose(value) as { somme?: unknown; nom?: unknown } | null;
  const validJson = obj !== null && typeof obj === "object";
  const correct = !!obj && obj.somme === 42 && obj.nom === "mango";
  const score = correct ? 1 : validJson ? 0.5 : 0;
  return { id: "json", dimension: "format JSON", passed: correct, score, detail: correct ? "JSON exact ✓" : validJson ? "JSON valide mais valeurs fausses" : "pas de JSON valide", latencyMs: ms };
}

async function probeInstruction(deps: ScanDeps): Promise<ProbeResult> {
  const { value, ms } = await timed(() =>
    deps.ask("Réponds en UN SEUL mot, sans ponctuation.", "Quelle est la capitale de la France ?"),
  );
  const cleaned = value.trim().replace(/[.!?]/g, "");
  const oneWord = cleaned.split(/\s+/).filter(Boolean).length === 1;
  const right = /paris/i.test(cleaned);
  const score = (oneWord ? 0.5 : 0) + (right ? 0.5 : 0);
  return { id: "instruction", dimension: "suivi de consigne", passed: oneWord && right, score, detail: `« ${cleaned.slice(0, 30)} »${oneWord ? " (1 mot)" : " (trop de mots)"}`, latencyMs: ms };
}

const CONTRACT_SYSTEM =
  "Tu produis des actions dans le format <mangoos>. Pour créer un fichier : " +
  '<mangoos><write path="chemin">contenu</write><summary>…</summary></mangoos>. ' +
  "Réponds UNIQUEMENT avec ce bloc.";

async function probeContract(deps: ScanDeps): Promise<ProbeResult> {
  const { value, ms } = await timed(() =>
    deps.ask(CONTRACT_SYSTEM, "Crée un fichier nommé hello.txt contenant le texte : Bonjour Mango."),
  );
  const parsed = parseContract(value);
  const hasWrite = parsed.ok && parsed.actions.some((a) => a.kind === "write");
  const score = parsed.ok ? (hasWrite ? 1 : 0.5) : 0;
  return { id: "contract", dimension: "contrat <mangoos>", passed: hasWrite, score, detail: parsed.ok ? (hasWrite ? "write valide ✓" : "bloc ok, pas de write") : `hors-contrat : ${parsed.error}`, latencyMs: ms };
}

async function probeToolCalling(deps: ScanDeps): Promise<ProbeResult> {
  // Un seul outil stub (read_file) ; on observe si le modèle émet un tool_call valide.
  const reg = new ToolRegistry();
  reg.register({ name: "read_file", description: "Lit un fichier du projet.", inputSchema: { path: z.string() }, handler: () => ({ text: "" }) });
  const tools = toOpenAITools(reg);
  let ms = 0;
  let toolCalls: ToolCall[] | undefined;
  try {
    const r = await timed(() =>
      deps.post(
        [
          { role: "system", content: "Tu es un agent qui dispose d'outils. Utilise-les pour répondre." },
          { role: "user", content: "Lis le fichier src/App.jsx pour voir son contenu." },
        ],
        tools,
      ),
    );
    ms = r.ms;
    toolCalls = r.value.toolCalls;
  } catch (e) {
    return { id: "tool-calling", dimension: "appel d'outils", passed: false, score: 0, detail: `erreur transport : ${(e as Error).message}`, latencyMs: ms };
  }
  if (!toolCalls?.length) {
    return { id: "tool-calling", dimension: "appel d'outils", passed: false, score: 0, detail: "aucun tool_call émis", latencyMs: ms };
  }
  const tc = toolCalls[0];
  const nameOk = tc.function.name === "read_file";
  let argsOk = false;
  try {
    argsOk = typeof (JSON.parse(tc.function.arguments || "{}") as { path?: unknown }).path === "string";
  } catch { /* args non JSON */ }
  const score = nameOk ? (argsOk ? 1 : 0.7) : 0.4;
  return { id: "tool-calling", dimension: "appel d'outils", passed: nameOk && argsOk, score, detail: `tool_call « ${tc.function.name} »${argsOk ? " + args valides ✓" : " (args douteux)"}`, latencyMs: ms };
}

async function probeCoding(deps: ScanDeps): Promise<ProbeResult> {
  const { value, ms } = await timed(() =>
    deps.ask("Réponds avec UNIQUEMENT le code JavaScript, sans explication ni balises.", "Écris une fonction nommée sum(a, b) qui renvoie la somme de a et b."),
  );
  const works = testSumCode(value);
  return { id: "coding", dimension: "codage exécutable", passed: works, score: works ? 1 : 0, detail: works ? "sum(2,3)===5 ✓ (exécuté)" : "code absent/incorrect", latencyMs: ms };
}

// ── Le RUNNER : tiers cost-aware + early-exit + verdict ───────────────────────

const T0_REJECT_THRESHOLD = 0.35; // sous ce niveau au Tier 0, on arrête (reject)

export async function scanModel(
  model: string,
  deps: ScanDeps,
  opts: { onProbe?: (r: ProbeResult) => void } = {},
): Promise<ScanReport> {
  const probes: ProbeResult[] = [];
  const run = async (p: () => Promise<ProbeResult>) => {
    const r = await p();
    probes.push(r);
    opts.onProbe?.(r);
    return r;
  };

  // Tier 0 — texte (le moins cher) : raisonnement, JSON, consigne, contrat.
  const reasoning = await run(() => probeReasoning(deps));
  const json = await run(() => probeJson(deps));
  const instruction = await run(() => probeInstruction(deps));
  const contract = await run(() => probeContract(deps));
  const t0avg = (reasoning.score + json.score + instruction.score + contract.score) / 4;

  let tool: ProbeResult | null = null;
  let coding: ProbeResult | null = null;
  // Early-exit : si le modèle échoue même les bases, inutile de tester outils/codage.
  if (t0avg >= T0_REJECT_THRESHOLD) {
    tool = await run(() => probeToolCalling(deps)); // Tier 1 — le GATE agentique
    coding = await run(() => probeCoding(deps)); // Tier 2 — codage exécutable
  }

  const capabilities: Record<string, number> = {};
  for (const p of probes) capabilities[p.dimension] = p.score;

  // Verdict de placement.
  const toolOk = (tool?.score ?? 0) >= 0.8;
  const codeOk = (coding?.score ?? 0) >= 0.6;
  const contractOk = contract.passed;
  const baseOk = (reasoning.score + json.score + instruction.score) / 3 >= 0.5;

  let verdict: ScanVerdict;
  if (t0avg < T0_REJECT_THRESHOLD) verdict = "reject";
  else if (toolOk && codeOk) verdict = "agentic";
  else if (contractOk || codeOk) verdict = "contract";
  else if (baseOk) verdict = "discuss";
  else verdict = "reject";

  const caps = verdict === "agentic" ? CAPS_AGENTIC : verdict === "contract" ? CAPS_CONTRACT : CAPS_WEAK;
  const avgLatencyMs = Math.round(probes.reduce((n, p) => n + p.latencyMs, 0) / Math.max(1, probes.length));

  const summary = verdictSummary(verdict, model);
  return {
    model,
    probes,
    capabilities,
    verdict,
    suggestedProfile: { agentic: verdict === "agentic", caps, verdict },
    avgLatencyMs,
    summary,
  };
}

function verdictSummary(v: ScanVerdict, model: string): string {
  switch (v) {
    case "agentic":
      return `🟢 ${model} : assez fort pour la BOUCLE AGENTIQUE (outils) — apte à coder/planifier dans la boucle.`;
    case "contract":
      return `🟡 ${model} : écriture via CONTRAT <mangoos> (pas d'outils fiables) — apte à construire en mode contrat.`;
    case "discuss":
      return `🔵 ${model} : trop faible pour construire, mais correct pour DISCUTER/planifier en texte.`;
    case "reject":
      return `🔴 ${model} : ne passe pas l'examen — mieux vaut rester sur le cerveau courant.`;
  }
}

/** Rapport lisible (tableau) pour la CLI. */
export function formatReport(r: ScanReport): string {
  const rows = r.probes
    .map((p) => `  ${p.passed ? "✓" : "·"} ${p.dimension.padEnd(22)} ${(p.score * 100).toFixed(0).padStart(3)}%  ${p.latencyMs}ms  ${p.detail}`)
    .join("\n");
  return [
    `\n═══ EXAMEN D'ENTRÉE — ${r.model} ═══`,
    rows,
    `  ─`,
    `  Latence moyenne : ${r.avgLatencyMs}ms`,
    `  Profil suggéré  : agentic=${r.suggestedProfile.agentic} · caps=${JSON.stringify(r.suggestedProfile.caps)}`,
    `\n  VERDICT : ${r.summary}`,
  ].join("\n");
}

/** Transport réel (import dynamique d'eleve.js → aucune dépendance statique). */
export async function defaultScanDeps(model?: string): Promise<ScanDeps> {
  const { chatEleve, elevePost } = await import("./eleve.js");
  return {
    ask: (system, user) => chatEleve(system, user, model),
    post: elevePost(model),
  };
}

// ── CLI : npx tsx --env-file=.env src/model-scan.ts [modèle] ──────────────────
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("/model-scan.ts");
if (isMain) {
  (async () => {
    const model = process.argv[2] ?? process.env.ELEVE_MODEL ?? "(défaut)";
    console.log(`Examen d'entrée du cerveau : ${model} (provider ${process.env.ELEVE_PROVIDER ?? "ollama"})…`);
    const deps = await defaultScanDeps(process.argv[2]);
    const report = await scanModel(model, deps, { onProbe: (p) => console.log(`  → ${p.dimension} : ${(p.score * 100).toFixed(0)}%`) });
    console.log(formatReport(report));
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
