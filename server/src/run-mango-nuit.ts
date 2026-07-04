// Runner du run nocturne « commande de Raf » (2026-06-30) — 4 projets ambitieux.
// Calqué sur run-tonight.ts (dispositif éprouvé) : createProject → Sharingan moodboard
// ($0) → runRelay (Élève GLM, escalade Claude SEULEMENT si build casse) → snap → juge.
//
// Différences voulues :
//   • Specs sur-mesure (mango-nuit-specs.ts), pas les 12 apps d'entraînement.
//   • Gère la REFONTE d'un projet EXISTANT (mango-quest) : pas de scaffold, on relaie
//     directement la tâche d'enrichissement sur le dossier existant.
//   • ZÉRO Flux (anti-L61) : aucune génération d'image GPU ; les images = Pexels (outil Élève).
//   • Resumable (.mango-nuit.state.json) : relancer reprend les projets non faits.
//
// Lancer :   npx tsx src/run-mango-nuit.ts
// Reprendre : même commande.

import "dotenv/config";
import { atomicWriteFileSync } from "./safe-io.js";
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { runRelay, defaultRelayDeps } from "./eleve.js";
import { judgeProject } from "./nocturnal.js";
import { sharinganAnalyze, capturePreview, type SharinganResult } from "./vision.js";
import { MANGO_NUIT, type MangoNuitSpec } from "./mango-nuit-specs.js";
import { flag } from "./flags.js";
import { runAsActor } from "./perimeter-context.js";
import { decideBudgetStop, spendGlobalBudget, localDateStr as globalBudgetToday, readGlobalBudgetState } from "./nocturnal-budget.js";

const STATE_FILE = path.join(WORKSPACE_DIR, ".mango-nuit.state.json");
const LOG_FILE = path.join(WORKSPACE_DIR, ".mango-nuit.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".mango-nuit.results.json");
const BILAN_FILE = path.join(WORKSPACE_DIR, ".mango-nuit.bilan.md");
const SHOTS_DIR = path.join(WORKSPACE_DIR, ".mango-nuit-shots");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* ignore */
  }
}

interface State {
  done: string[];
}
function loadState(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return { done: [] };
  }
}
function saveState(s: State): void {
  atomicWriteFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function markDone(s: State, id: string): void {
  if (!s.done.includes(id)) s.done.push(id);
  saveState(s);
}

interface ProjectResult {
  name: string;
  effort: string;
  buildOk: boolean;
  resolvedBy: string;
  attempts: number;
  usedClaude: boolean;
  score?: number;
  judgeComment?: string;
  costUsd: number;
  durationMs: number;
  paletteInjected: string[];
  shotAfter?: string;
  error?: string;
}

// ── Snapshot best-effort (CPU, Playwright) ────────────────────────────────────
function spawnDev(dir: string, port: number): ChildProcess {
  const isWin = process.platform === "win32";
  return spawn(isWin ? "npm.cmd" : "npm", ["run", "dev", "--", "--port", String(port), "--strictPort"], {
    cwd: dir,
    shell: isWin,
    windowsHide: true,
    stdio: "ignore",
  });
}
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } catch {
      /* */
    }
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      /* */
    }
  }
}
async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
async function snap(dir: string, port: number, label: string): Promise<string | undefined> {
  let child: ChildProcess | undefined;
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    child = spawnDev(dir, port);
    const url = `http://localhost:${port}`;
    if (!(await waitForServer(url, 45_000))) {
      log(`  · snap ${label} : preview non démarrée (skip)`);
      return undefined;
    }
    await new Promise((r) => setTimeout(r, 1800));
    const buf = await capturePreview(url);
    const file = path.join(SHOTS_DIR, `${label}.jpg`);
    fs.writeFileSync(file, buf);
    log(`  · snap ${label} : ${Math.round(buf.length / 1024)} Ko`);
    return file;
  } catch (e) {
    log(`  · snap ${label} : échec best-effort (${(e as Error).message})`);
    return undefined;
  } finally {
    if (child) killTree(child);
    await new Promise((r) => setTimeout(r, 900));
  }
}

// ── Sharingan pré-calculé → moodboard ($0) ────────────────────────────────────
async function buildMoodboard(leaders: string[]): Promise<{ block: string; palette: string[] }> {
  if (!leaders.length) return { block: "", palette: [] };
  const blocks: string[] = [];
  const allPalette: string[] = [];
  for (const url of leaders) {
    try {
      log(`  🔮 Sharingan ($0) sur ${url}…`);
      const r: SharinganResult = await sharinganAnalyze(url);
      allPalette.push(...r.palette);
      const fonts = r.fonts.length ? r.fonts.slice(0, 3) : r.typography.families.slice(0, 3);
      blocks.push(`• ${url}\n  Palette : ${r.palette.slice(0, 6).join(", ") || "(n/a)"}\n  Fonts : ${fonts.join(", ") || "(système)"}`);
    } catch (e) {
      log(`  ⚠ Sharingan ${url} : ${(e as Error).message} (on continue)`);
    }
  }
  if (!blocks.length) return { block: "", palette: [] };
  const palette = [...new Set(allPalette)].slice(0, 8);
  const block =
    `\n\n## MOODBOARD — charte extraite de leaders réels (Sharingan, $0)\n` +
    blocks.join("\n") +
    `\n\nInspire-toi de l'AMBIANCE et de la hiérarchie visuelle de ces références (sans copier). ` +
    `Définis tes couleurs en variables CSS :root.`;
  return { block, palette };
}

// ── Un projet ─────────────────────────────────────────────────────────────────
async function runProject(spec: MangoNuitSpec, state: State): Promise<ProjectResult | null> {
  if (state.done.includes(`done-${spec.name}`)) {
    log(`⏭  ${spec.name} déjà fait.`);
    return null;
  }
  const started = Date.now();
  const dir = projectDir(spec.name);
  log(`\n═══════════════════════════════════════════════════════════════`);
  log(`▶ [${spec.effort}] ${spec.name}${spec.existing ? " (REFONTE existant)" : ` (template ${spec.template})`}`);

  // 1. Création (sauf refonte d'un projet existant)
  if (spec.existing || projectExists(spec.name)) {
    log(`  · projet existant — ${spec.existing ? "refonte" : "reprise"}`);
    if (spec.existing && !projectExists(spec.name)) {
      const error = `refonte demandée mais projet absent : ${spec.name}`;
      log(`  ✗ ${error}`);
      return { name: spec.name, effort: spec.effort, buildOk: false, resolvedBy: "none", attempts: 0, usedClaude: false, costUsd: 0, durationMs: Date.now() - started, paletteInjected: [], error };
    }
  } else {
    try {
      await createProject(spec.name, spec.template);
      log(`  ✓ projet créé (${spec.template})`);
    } catch (e) {
      const error = `createProject: ${(e as Error).message}`;
      log(`  ✗ ${error}`);
      return { name: spec.name, effort: spec.effort, buildOk: false, resolvedBy: "none", attempts: 0, usedClaude: false, costUsd: 0, durationMs: Date.now() - started, paletteInjected: [], error };
    }
  }

  // 2. Sharingan moodboard ($0)
  const { block, palette } = await buildMoodboard(spec.leaders);
  const fullTask = spec.task + block;

  // 3. Construction par l'Élève GLM (escalade Claude sonnet SEULEMENT si build casse)
  let buildOk = false,
    resolvedBy = "none",
    attempts = 0,
    costUsd = 0;
  let error: string | undefined;
  try {
    const r = await runRelay(fullTask, dir, { maitreModel: "sonnet", onLog: (l) => log(`    [relay] ${l}`) }, defaultRelayDeps);
    buildOk = r.success;
    resolvedBy = r.resolvedBy;
    attempts = r.attempts;
    costUsd = r.costUsd;
    if (r.success) log(`  ✓ build OK — ${r.resolvedBy} en ${r.attempts} tentative(s)${costUsd > 0 ? `, escalade Claude $${costUsd.toFixed(3)}` : " ($0, 100% GLM)"}`);
    else {
      error = r.inspection.detail.slice(-200);
      log(`  ✗ build KO (${r.inspection.signal})`);
    }
  } catch (e) {
    error = `runRelay: ${(e as Error).message}`;
    log(`  ✗ ${error}`);
  }

  // 4. Snap après (best-effort) + juge
  const shotAfter = buildOk ? await snap(dir, spec.port, `${spec.name}-apres`) : undefined;
  let score: number | undefined,
    judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, spec.task);
      if (j) {
        score = j.score;
        judgeComment = j.comment;
        log(`  🏆 ${j.score}/10 — « ${j.comment} »`);
      }
    } catch {
      log(`  ⚠ juge indisponible`);
    }
  }

  markDone(state, `done-${spec.name}`);
  return { name: spec.name, effort: spec.effort, buildOk, resolvedBy, attempts, usedClaude: costUsd > 0, score, judgeComment, costUsd, durationMs: Date.now() - started, paletteInjected: palette, shotAfter, error };
}

// ── Bilan matinal ─────────────────────────────────────────────────────────────
function writeBilan(results: ProjectResult[]): void {
  const now = new Date().toISOString();
  const L: string[] = [
    `# Bilan run nocturne « commande de Raf » — ${now}`,
    "",
    `4 projets : 2 gros sites à fonctions (abyss, forge), 1 app de formation (toeic-quest), 1 refonte (mango-quest).`,
    `Pilote : **Élève GLM** ; Claude = escalade SEULEMENT si le build casse. Images : Pexels (zéro Flux/GPU, anti-L61).`,
    "",
    "## Tableau",
    "",
    "| Projet | Effort | Build | Brain | Claude ? | Score | Coût | Durée |",
    "|--------|--------|-------|-------|----------|-------|------|-------|",
  ];
  for (const r of results) {
    L.push(
      `| ${r.name} | ${r.effort} | ${r.buildOk ? "✅" : "❌"} | ${r.resolvedBy} | ${r.usedClaude ? "⚠ oui" : "non ($0)"} | ${r.score != null ? r.score + "/10" : "—"} | $${r.costUsd.toFixed(3)} | ${Math.round(r.durationMs / 60000)} min |`,
    );
  }
  L.push("", "## Détail", "");
  for (const r of results) {
    L.push(`### ${r.name} (${r.effort})`);
    if (r.paletteInjected.length) L.push(`- Palette moodboard : ${r.paletteInjected.join(", ")}`);
    if (r.shotAfter) L.push(`- Capture : \`${r.shotAfter}\``);
    if (r.judgeComment) L.push(`- Avis juge : ${r.judgeComment}`);
    if (r.error) L.push(`- ⚠ Erreur : ${r.error}`);
    L.push("");
  }
  const ok = results.filter((r) => r.buildOk).length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  L.push(
    "## Résumé",
    "",
    `- Builds OK : **${ok}/${results.length}**`,
    `- Coût Claude (escalade) total : **$${totalCost.toFixed(4)}**`,
    `- Captures : \`${SHOTS_DIR}\``,
  );
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF pour ce run — le Gardien (intention+goût+QA) ne s'exécutera pas, seul le build sera vérifié.");
  }

  log("\n🌙 ═══════════════════════════════════════════════════════════════");
  log(`   RUN NOCTURNE « commande de Raf » — ${MANGO_NUIT.length} projets`);
  log("   Élève GLM au volant · Claude = escalade seule · Images Pexels · 0 Flux");
  log("═══════════════════════════════════════════════════════════════════\n");

  const ollamaOk = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`).then((r) => r.ok).catch(() => false);
  log(ollamaOk ? "✓ Ollama :11434 OK" : "⚠ Ollama injoignable (le juge/vision local pourra manquer — on continue)");

  const state = loadState();
  const results: ProjectResult[] = [];
  // Budget-$ DUR global (gaté NOCTURNAL_BUDGET_HARD), PARTAGÉ avec Phase 0
  // (train-loop.ts) et Phase 2 (nocturnal.ts) via le ledger data/global-budget.json
  // (nocturnal-budget.ts). $0/absent = illimité.
  const globalBudgetCapUsd = Number(process.env.NOCTURNAL_GLOBAL_BUDGET_USD ?? 0);
  for (const spec of MANGO_NUIT) {
    // Frontière d'itération — jamais en cours de génération. Gate OFF → 0 I/O.
    const budgetStop = decideBudgetStop(flag("NOCTURNAL_BUDGET_HARD"), globalBudgetCapUsd, globalBudgetToday(), () => readGlobalBudgetState());
    if (budgetStop.stop) {
      log(`💰 ${budgetStop.reason} — arrêt propre (${results.length}/${MANGO_NUIT.length} projet(s) traité(s)).`);
      break;
    }
    try {
      const r = await runProject(spec, state);
      if (r) {
        results.push(r);
        atomicWriteFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        writeBilan(results); // bilan réécrit à chaque projet → consultable en cours de nuit
        if (flag("NOCTURNAL_BUDGET_HARD")) spendGlobalBudget(r.costUsd);
      }
    } catch (e) {
      log(`✗ ${spec.name} exception : ${(e as Error).stack ?? e}`);
    }
  }
  writeBilan(results);
  const ok = results.filter((r) => r.buildOk).length;
  log("\n🌅 ═══════════════════════════════════════════════════════════════");
  log(`   TERMINÉ — Builds OK : ${ok}/${results.length} · Bilan : ${BILAN_FILE}`);
  log("═══════════════════════════════════════════════════════════════════");
}

// (#180 É2) Phase 1 nocturne → acteur AUTONOME pour tout le run (périmètre restreint).
runAsActor("autonomous", main).catch((e) => {
  console.error("❌", e instanceof Error ? e.stack : e);
  process.exit(1);
});
