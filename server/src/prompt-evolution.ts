// Idée #76 — Auto-réécriture partielle du prompt (évolution des règles). Couche
// MÉTA au-dessus du flux d'apprentissage : le reviewer / le feedback 👍👎 (#41) /
// les reviews nocturnes (#58) distillent des axiomes RÉACTIVEMENT, un par un.
// #76 regarde l'ENSEMBLE périodiquement (axiomes + escalades récurrentes du
// .train.jsonl) et PROPOSE des évolutions STRUCTURELLES des règles — consolider
// des doublons, promouvoir un candidat récurrent, ajouter une règle pour un pattern
// d'escalade non couvert, retirer un axiome obsolète — JAMAIS appliquées seules.
//
// Cible appliquable = .axioms.md (réceptacle de règles symboliques éditable). Les
// suggestions sur scenario.ts (code source de l'app) sont AFFICHÉES, jamais écrites.
//
// Moule = orchestrator.ts (#44) : gather borné → askLLM → proposition → validation
// humaine → application. Parse robuste = parseRadar. Scheduler = nocturnal.ts.
import path from "node:path";
import { atomicWriteFileSync } from "./safe-io.js";
import fs from "node:fs";
import type { Express, Request, Response } from "express";
import { resolveProvider } from "./llm-engine.js";
import { getBrain } from "./kernel.js";
import { AXIOMS_FILE_NAME, capRegistry, loadAxioms, axiomStats } from "./axioms.js";
import { WORKSPACE_DIR } from "./projects.js";

const DATA_DIR = path.join(process.cwd(), "..", "server", "data");
const RUNS_FILE = path.join(DATA_DIR, "prompt-evolution.json");
const CONFIG_FILE = path.join(DATA_DIR, "prompt-evolution-config.json");

export type ProposalKind = "add" | "consolidate" | "promote" | "remove" | "scenario";

export interface EvolutionProposal {
  id: string;
  kind: ProposalKind;
  title: string;
  rationale: string; // le pattern récurrent observé
  targetIds: string[]; // ids d'axiomes concernés (AXIOME-CAT-NN) ; [] pour add/scenario
  newText: string; // bloc d'axiome final (add/consolidate/promote) | suggestion (scenario)
  status: "pending" | "applied" | "rejected";
  appliedAt?: string;
}

export interface EvolutionRun {
  id: string;
  ts: string;
  summary: string; // patterns de correction détectés
  proposals: EvolutionProposal[];
}

export interface EvolutionDeps {
  ask: (system: string, user: string) => Promise<string>;
}
const defaultDeps: EvolutionDeps = {
  ask: (system, user) =>
    getBrain().complete(system, user, {
      provider: resolveProvider(process.env.PROMPT_EVOLUTION_PROVIDER, "claude"),
      maxTokens: 1600,
    }),
};

// ── Découpage des axiomes en blocs (pur, pour l'application) ──────────────────
/** Découpe le registre en blocs (un par header "AXIOME-…"). Conserve verbatim. */
export function splitAxiomBlocks(raw: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    const text = cur.join("\n").trim();
    if (text && /^\s*AXIOME-/i.test(cur[0] ?? "")) blocks.push(text);
    cur = [];
  };
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*AXIOME-/i.test(line)) flush();
    cur.push(line);
  }
  flush();
  return blocks;
}

/** Id canonique d'un bloc d'axiome ("AXIOME-CAT-NN"), ou null. */
export function axiomId(block: string): string | null {
  return /^\s*(AXIOME-[A-Z0-9]+-\d+)/i.exec(block)?.[1]?.toUpperCase() ?? null;
}

// ── Application d'une proposition au registre (pur, testable) ─────────────────
/** Applique UNE proposition au texte brut des axiomes et renvoie le nouveau texte
 * (plafonné). Sûr : un id introuvable est ignoré (no-op partiel), jamais d'exception. */
export function applyToAxioms(rawAxioms: string, p: EvolutionProposal): string {
  if (p.kind === "scenario") return rawAxioms; // jamais écrit dans les axiomes
  const blocks = splitAxiomBlocks(rawAxioms);
  const targets = new Set(p.targetIds.map((t) => t.toUpperCase()));
  const keep = blocks.filter((b) => {
    const id = axiomId(b);
    return !(id && targets.has(id));
  });
  let result: string[];
  if (p.kind === "remove") {
    result = keep;
  } else if (p.kind === "add" || p.kind === "consolidate") {
    // add : on garde tout + le nouveau ; consolidate : on a retiré les targets + le fusionné.
    result = p.kind === "add" ? [...blocks, p.newText.trim()] : [...keep, p.newText.trim()];
  } else {
    // promote : remplace les blocs ciblés par la version promue (insérée à leur place logique).
    result = [...keep, p.newText.trim()];
  }
  return capRegistry(result.filter(Boolean).join("\n\n").trim());
}

// ── Analyse des corrections (gather, lecture seule, borné) ───────────────────
const MAX_CONTEXT_CHARS = 12000;

/** Compte les escalades Élève→Maître par type de projet (signal de correction
 * récurrent) à partir de .train.jsonl. Tolérant aux lignes malformées. */
function escalationsByType(workspaceDir: string): Record<string, number> {
  const counts: Record<string, number> = {};
  try {
    const lines = fs.readFileSync(path.join(workspaceDir, ".train.jsonl"), "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as { resolvedBy?: string; projectType?: string; kind?: string };
        if (e.resolvedBy === "maitre") {
          const key = e.projectType || e.kind || "autre";
          counts[key] = (counts[key] ?? 0) + 1;
        }
      } catch {
        /* ligne ignorée */
      }
    }
  } catch {
    /* pas de .train.jsonl */
  }
  return counts;
}

export function gatherEvolutionContext(workspaceDir: string): string {
  const axioms = loadAxioms(workspaceDir) || "(registre vide)";
  const stats = axiomStats(workspaceDir);
  const esc = escalationsByType(workspaceDir);
  const escLine = Object.entries(esc)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}: ${n}`)
    .join(" · ") || "(aucune escalade enregistrée)";
  const ctx = [
    "AXIOM REGISTRY (current rules):",
    axioms,
    "",
    `STATS: ${stats.total} axioms (confirmé: ${stats.byMaturity.confirmé}, candidat: ${stats.byMaturity.candidat}) · by category: ${Object.entries(stats.byCat).map(([c, n]) => `${c}:${n}`).join(", ") || "—"}`,
    "",
    `RECURRING CORRECTIONS (Élève→Claude escalations by project type, from .train.jsonl): ${escLine}`,
  ].join("\n");
  return ctx.length > MAX_CONTEXT_CHARS ? `${ctx.slice(0, MAX_CONTEXT_CHARS)}\n…(truncated)` : ctx;
}

// ── Proposition (askLLM) + parse robuste ─────────────────────────────────────
const EVOLUTION_SYSTEM = `You are the META-curator of a local app builder's RULE registry (axioms). You NEVER apply changes — you PROPOSE structural improvements for a human to approve.
Given the current axioms + recurring-correction signals, propose a SMALL set (0 to 5) of high-value evolutions. Kinds:
- "consolidate": two or more axioms overlap → merge them into one tighter axiom (targetIds = the ids merged, newText = the merged axiom block).
- "promote": a "candidat" axiom that recurs / is validated → bump it to "confirmé" (targetIds = [the id], newText = the same axiom with maturity confirmé).
- "add": a recurring correction pattern not covered by any axiom → a NEW universal axiom (targetIds = [], newText = the new axiom block).
- "remove": an axiom contradicted, obsolete, or never useful (targetIds = [the id], newText = "").
- "scenario": a suggestion about the system-prompt BLOCKS (scenario.ts) — DESCRIPTION ONLY, never applied automatically (newText = the human-readable suggestion).
Axiom block format (French body): "AXIOME-[CAT]-[NN] (maturité: candidat|confirmé · vu: AAAA-MM-JJ)\\n- Contexte : …\\n- Piège : …\\n- Règle d'or : …". Keep ids stable; for "add" pick the next free number in the category. Be conservative: most runs propose 0-2 changes. Output STRICT JSON only:
{"summary":"one line on the patterns you saw","proposals":[{"kind":"…","title":"…","rationale":"…","targetIds":["AXIOME-…"],"newText":"…"}]}`;

export function parseEvolutionProposals(raw: string): { summary: string; proposals: Omit<EvolutionProposal, "id" | "status">[] } {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { summary: "", proposals: [] };
    const obj = JSON.parse(match[0]) as { summary?: unknown; proposals?: unknown[] };
    const validKinds: ProposalKind[] = ["add", "consolidate", "promote", "remove", "scenario"];
    const proposals = (Array.isArray(obj.proposals) ? obj.proposals : [])
      .map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        const kind = (typeof o.kind === "string" && validKinds.includes(o.kind as ProposalKind) ? o.kind : "add") as ProposalKind;
        return {
          kind,
          title: typeof o.title === "string" ? o.title : "",
          rationale: typeof o.rationale === "string" ? o.rationale : "",
          targetIds: Array.isArray(o.targetIds) ? o.targetIds.filter((x): x is string => typeof x === "string").map((s) => s.toUpperCase()) : [],
          newText: typeof o.newText === "string" ? o.newText : "",
        };
      })
      // une proposition appliquable doit avoir du texte (sauf remove) ; scenario garde son texte
      .filter((p) => p.kind === "remove" || p.newText.trim().length > 0)
      .filter((p) => p.title.trim().length > 0);
    return { summary: typeof obj.summary === "string" ? obj.summary : "", proposals };
  } catch {
    return { summary: "", proposals: [] };
  }
}

/** Analyse + propose. Sauve un run, le renvoie. `idSeed`/`ts` passés par l'appelant
 * (pas de Date.now ici pour rester pur/reproductible côté tests). */
export async function runEvolution(
  workspaceDir: string,
  idSeed: string,
  ts: string,
  deps: EvolutionDeps = defaultDeps,
): Promise<EvolutionRun> {
  const context = gatherEvolutionContext(workspaceDir);
  let parsed: { summary: string; proposals: Omit<EvolutionProposal, "id" | "status">[] } = { summary: "", proposals: [] };
  try {
    const raw = await deps.ask(EVOLUTION_SYSTEM, context);
    parsed = parseEvolutionProposals(raw);
  } catch {
    parsed = { summary: "", proposals: [] };
  }
  const run: EvolutionRun = {
    id: idSeed,
    ts,
    summary: parsed.summary,
    proposals: parsed.proposals.map((p, i) => ({ ...p, id: `${idSeed}-${i}`, status: "pending" as const })),
  };
  const runs = loadRuns();
  runs.unshift(run);
  saveRuns(runs);
  return run;
}

// ── Persistance des runs ─────────────────────────────────────────────────────
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadRuns(): EvolutionRun[] {
  try {
    const data = JSON.parse(fs.readFileSync(RUNS_FILE, "utf8")) as { runs?: EvolutionRun[] };
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

export function saveRuns(runs: EvolutionRun[]): void {
  ensureDataDir();
  atomicWriteFileSync(RUNS_FILE, JSON.stringify({ runs: runs.slice(0, 20) }, null, 2));
}

function findProposal(runs: EvolutionRun[], runId: string, proposalId: string): EvolutionProposal | null {
  return runs.find((r) => r.id === runId)?.proposals.find((p) => p.id === proposalId) ?? null;
}

/** Approuve + applique : kinds axiomes → écrit .axioms.md ; scenario → status seul. */
export function applyProposal(workspaceDir: string, runId: string, proposalId: string, ts: string): EvolutionProposal | null {
  const runs = loadRuns();
  const p = findProposal(runs, runId, proposalId);
  if (!p) return null;
  if (p.kind !== "scenario") {
    const axiomsPath = path.join(workspaceDir, AXIOMS_FILE_NAME);
    let raw = "";
    try {
      raw = fs.readFileSync(axiomsPath, "utf8");
    } catch {
      raw = "";
    }
    const next = applyToAxioms(raw, p);
    atomicWriteFileSync(axiomsPath, `${next}\n`);
  }
  p.status = "applied";
  p.appliedAt = ts;
  saveRuns(runs);
  return p;
}

export function rejectProposal(runId: string, proposalId: string): EvolutionProposal | null {
  const runs = loadRuns();
  const p = findProposal(runs, runId, proposalId);
  if (!p) return null;
  p.status = "rejected";
  saveRuns(runs);
  return p;
}

// ── Scheduler nocturne optionnel (modèle nocturnal.ts) ───────────────────────
interface EvolutionConfig {
  enabled: boolean;
  hour: number; // 0-23, heure locale
  lastAutoRun?: string; // YYYY-MM-DD
}

function loadConfig(): EvolutionConfig {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as Partial<EvolutionConfig>;
    return { enabled: c.enabled === true, hour: typeof c.hour === "number" ? c.hour : 4, ...(c.lastAutoRun ? { lastAutoRun: c.lastAutoRun } : {}) };
  } catch {
    return { enabled: false, hour: 4 };
  }
}

function saveConfig(c: EvolutionConfig): void {
  ensureDataDir();
  atomicWriteFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startPromptEvolutionScheduler(): void {
  let running = false;
  const tick = () => {
    const cfg = loadConfig();
    if (!cfg.enabled || running) return;
    if (new Date().getHours() !== cfg.hour) return;
    if (cfg.lastAutoRun === localDate()) return;
    saveConfig({ ...cfg, lastAutoRun: localDate() });
    running = true;
    const seed = `auto-${localDate()}-${Date.now()}`;
    void runEvolution(WORKSPACE_DIR, seed, new Date().toISOString())
      .catch((err) => console.warn("[prompt-evolution]", err instanceof Error ? err.message : err))
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, 15 * 60 * 1000);
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerPromptEvolutionRoutes(app: Express): void {
  app.post("/api/prompt-evolution/run", async (_req: Request, res: Response) => {
    try {
      const seed = `run-${Date.now()}`;
      const run = await runEvolution(WORKSPACE_DIR, seed, new Date().toISOString());
      res.json({ run });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/prompt-evolution", (_req: Request, res: Response) => {
    res.json({ runs: loadRuns() });
  });

  app.post("/api/prompt-evolution/:runId/:pid/apply", (req: Request, res: Response) => {
    const p = applyProposal(WORKSPACE_DIR, req.params["runId"] as string, req.params["pid"] as string, new Date().toISOString());
    if (!p) {
      res.status(404).json({ error: "proposition introuvable" });
      return;
    }
    res.json({ ok: true, proposal: p });
  });

  app.post("/api/prompt-evolution/:runId/:pid/reject", (req: Request, res: Response) => {
    const p = rejectProposal(req.params["runId"] as string, req.params["pid"] as string);
    if (!p) {
      res.status(404).json({ error: "proposition introuvable" });
      return;
    }
    res.json({ ok: true, proposal: p });
  });

  app.delete("/api/prompt-evolution/:runId", (req: Request, res: Response) => {
    saveRuns(loadRuns().filter((r) => r.id !== req.params["runId"]));
    res.json({ ok: true });
  });

  app.get("/api/prompt-evolution/config", (_req: Request, res: Response) => {
    res.json(loadConfig());
  });

  app.put("/api/prompt-evolution/config", (req: Request, res: Response) => {
    const body = req.body as Partial<EvolutionConfig>;
    const cur = loadConfig();
    const next: EvolutionConfig = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : cur.enabled,
      hour: typeof body.hour === "number" && body.hour >= 0 && body.hour <= 23 ? body.hour : cur.hour,
      ...(cur.lastAutoRun ? { lastAutoRun: cur.lastAutoRun } : {}),
    };
    saveConfig(next);
    res.json(next);
  });

  // Démarre le créneau nocturne optionnel (off par défaut), comme nocturnal/radar.
  startPromptEvolutionScheduler();
}
