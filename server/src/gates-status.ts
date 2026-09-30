// UNE source pour VOIR l'état de tous les interrupteurs (audit dormant, règle 5) :
// « un gate qu'on ne peut pas inspecter est un gate qu'on croit armé ».
//
// Deux familles :
//   • le registre central `flags.ts` (FLAGS) — lu via flag() ;
//   • les gates « bruts » : `process.env.X === "on"` lus directement ailleurs (opt-in d'outils,
//     escalades, hooks…). Ils ne sont pas dans FLAGS mais DOIVENT être listés ICI — le test
//     `test-gates-status` scanne le code et échoue si un nouveau gate brut n'y figure pas.
// Et les PLAFONDS (budgets $) avec leur valeur EFFECTIVE, pour prouver qu'aucun n'est « illimité ».
//
// Accès : GET /api/gates (system-routes.ts) ou `npm run gates` (gates-cli.ts).
import { FLAGS, flagFrom, type FlagName } from "./flags.js";
import fs from "node:fs";
import { dataDir } from "./safe-io.js";
import { globalBudgetCapUsd, finiteBudgetUsd } from "./nocturnal-budget.js";

export interface RawGate {
  env: string;
  /** Ce que le gate active quand il vaut "on". */
  description: string;
}

/** Gates lus en brut (`=== "on"`), hors registre FLAGS. Tous défaut OFF. */
export const RAW_GATES: RawGate[] = [
  { env: "BRAIN_DISPATCH", description: "Dispatch multi-lentilles (orchestrator/patrol) via le registre des cerveaux." },
  { env: "ELEVE_AUTOTEST", description: "Outils ecris_test / lance_tests : l'Élève se construit un filet de parcours rejouables." },
  { env: "ELEVE_BRAIN_ESCALATE", description: "Escalade de cerveau du moteur agentique (relay-agentic)." },
  { env: "ELEVE_BRICKS", description: "Outil assemble_brique : briques back éprouvées (auth/db/paiement/sécurité/RGPD)." },
  { env: "ELEVE_CONTENT", description: "Outils genere_contenu / verifie_coherence_images." },
  { env: "ELEVE_DELEGATE_AGENTIC", description: "Délégation agentique à des sous-agents." },
  { env: "ELEVE_FLUX", description: "Génération d'images Flux." },
  { env: "ELEVE_GODOT", description: "Famille d'outils Godot." },
  { env: "ELEVE_HOOKS", description: "Hooks Pre/PostToolUse (.hooks/hooks.json du projet)." },
  { env: "ELEVE_KREA", description: "Génération d'images Krea." },
  { env: "ELEVE_MCP_EXTERNAL", description: "Outils MCP externes (Blender/GIMP/Inkscape)." },
  { env: "ELEVE_SITE_IMAGE_GEN", description: "Génération d'images par l'outil de construction de site." },
  { env: "ELEVE_SPECULATIVE", description: "Exécution spéculative en worktree (#171)." },
  { env: "ELEVE_STRATEGE_LEARN", description: "Apprentissage du Stratège depuis les runs." },
  { env: "ELEVE_UNITY", description: "Famille d'outils Unity." },
  { env: "ELEVE_VAULT", description: "Outil utilise_secret (coffre-fort de secrets #170)." },
  { env: "INSPECT_TIMING", description: "Chronométrage détaillé de l'inspection (diagnostic)." },
  { env: "STRATEGE_BRAIN_ESCALATE", description: "Escalade de cerveau du Stratège." },
];

export interface GateState {
  name: string;
  env: string;
  active: boolean;
  /** Valeur quand la variable est absente. */
  armedByDefault: boolean;
  /** true si l'état actif vient d'une valeur d'env explicite (≠ défaut). */
  overridden: boolean;
  source: "registry" | "raw";
  description: string;
}

export interface CapState { name: string; env: string; effectiveUsd: number; finite: boolean; note: string }

/** Un planificateur/état qui décide seul de tourner ou non — « enabled » vit dans un fichier, pas dans un flag. */
export interface SchedulerState { name: string; file: string; active: boolean; detail: string }

export interface GatesReport {
  generatedAt: string;
  armed: GateState[];
  off: GateState[];
  caps: CapState[];
  schedulers: SchedulerState[];
}

function readJson(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(dataDir(file), "utf8")); } catch { return null; }
}

/** États pilotés par fichier de données (absent = inactif) : le planificateur nocturne, le cron, les agents. */
export function schedulersReport(): SchedulerState[] {
  const noct = readJson("nocturnal-config.json") as { enabled?: boolean; count?: number; hour?: number } | null;
  const cron = readJson("cron-tasks.json");
  const agents = readJson("agents-registry.json");
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return [
    { name: "planificateur nocturne auto", file: "nocturnal-config.json", active: Boolean(noct?.enabled), detail: noct ? `enabled=${Boolean(noct.enabled)}, ${noct.count ?? 3} projet(s) à ${noct.hour ?? 2} h` : "fichier absent → désactivé (les nuits passent par des scripts lancés à la main)" },
    { name: "cron-scheduler", file: "cron-tasks.json", active: n(cron) > 0, detail: `${n(cron)} tâche(s)` },
    { name: "agents restaurés au boot", file: "agents-registry.json", active: n(agents) > 0, detail: `${n(agents)} agent(s)` },
  ];
}

export function gatesReport(env: NodeJS.ProcessEnv = process.env): GatesReport {
  const all: GateState[] = [];
  for (const name of Object.keys(FLAGS) as FlagName[]) {
    const spec = FLAGS[name];
    const raw = env[spec.env];
    all.push({
      name, env: spec.env, active: flagFrom(name, env), armedByDefault: spec.default,
      overridden: raw !== undefined && raw.trim() !== "" && flagFrom(name, env) !== spec.default,
      source: "registry", description: spec.description,
    });
  }
  const registered = new Set(all.map((g) => g.env));
  for (const g of RAW_GATES) {
    if (registered.has(g.env)) continue;
    const active = env[g.env] === "on";
    all.push({ name: g.env, env: g.env, active, armedByDefault: false, overridden: active, source: "raw", description: g.description });
  }
  const capOf = (name: string, envName: string, usd: number, note: string): CapState => ({ name, env: envName, effectiveUsd: usd, finite: Number.isFinite(usd) && usd > 0, note });
  const caps: CapState[] = [
    capOf("plafond nuit (ledger partagé)", "NOCTURNAL_GLOBAL_BUDGET_USD", globalBudgetCapUsd(env), flagFrom("NOCTURNAL_BUDGET_HARD", env) ? "armé" : "DÉSARMÉ (NOCTURNAL_BUDGET_HARD=off)"),
    capOf("plafond run-finish", "FINISH_BUDGET_USD", finiteBudgetUsd(env.FINISH_BUDGET_USD), "défaut fini"),
    capOf("plafond Grand Chantier", "GRAND_CHANTIER_BUDGET_USD", finiteBudgetUsd(env.GRAND_CHANTIER_BUDGET_USD), "défaut fini (opts.budgetUsd explicite prime)"),
  ];
  return {
    generatedAt: new Date().toISOString(),
    armed: all.filter((g) => g.active).sort((a, b) => a.name.localeCompare(b.name)),
    off: all.filter((g) => !g.active).sort((a, b) => a.name.localeCompare(b.name)),
    caps,
    schedulers: schedulersReport(),
  };
}

/** Rendu texte pour la CLI. */
export function formatGatesReport(r: GatesReport): string {
  const L: string[] = [];
  L.push(`=== GATES — ${r.generatedAt} ===`, "", `ARMÉS (${r.armed.length})`);
  for (const g of r.armed) L.push(`  ✔ ${g.env.padEnd(34)} ${g.armedByDefault ? "(défaut ON)" : "(posé par env)"}`);
  L.push("", `OFF (${r.off.length}) — volontaires, à activer par variable d'environnement`);
  for (const g of r.off) L.push(`  ○ ${g.env.padEnd(34)} ${g.armedByDefault ? "(défaut ON, désarmé par env)" : ""}${g.description.split(/\.\s/)[0].slice(0, 90)}`);
  L.push("", "PLAFONDS $ (valeurs effectives)");
  for (const c of r.caps) L.push(`  ${c.finite ? "✔" : "✗ ILLIMITÉ"} ${c.name.padEnd(30)} ${c.effectiveUsd} $  [${c.env}] ${c.note}`);
  L.push("", "PLANIFICATEURS (états pilotés par fichier de données)");
  for (const sc of r.schedulers) L.push(`  ${sc.active ? "✔" : "○"} ${sc.name.padEnd(30)} ${sc.detail}  [data/${sc.file}]`);
  return L.join("\n");
}
