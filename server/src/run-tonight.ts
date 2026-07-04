import "dotenv/config";

// Run nocturne 2026-06-19 — 3 projets M / L / XL
// OBJECTIF (consigne Raf) : « moins utiliser Claude ».
//   - Sharingan PRÉ-CALCULÉ par sharinganAnalyze() (Playwright pur, $0, zéro LLM)
//     puis INJECTÉ dans le prompt de Gemma → l'Élève bâtit avec une vraie charte.
//   - Construction = Gemma 4 12B via runRelay ($0). Claude n'intervient QUE par
//     ESCALADE si un build casse (mécanisme intégré à runRelay).
//   - Snap AVANT (template nu) / APRÈS (app construite) via capturePreview() ($0).
//   - Juge #59 par projet, analyse d'évolution des règles #76 en clôture.
//
// Lancer :   npx tsx src/run-tonight.ts
// Reprendre : même commande (état gardé dans .tonight.state.json).

import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { runRelay, defaultRelayDeps } from "./eleve.js";
import { judgeProject } from "./nocturnal.js";
import { runEvolution } from "./prompt-evolution.js";
import { sharinganAnalyze, capturePreview, type SharinganResult } from "./vision.js";
import { TONIGHT, type Spec } from "./tonight-specs.js";
import { flag } from "./flags.js";
import { decideBudgetStop, spendGlobalBudget, localDateStr as globalBudgetToday, readGlobalBudgetState } from "./nocturnal-budget.js";

const STATE_FILE   = path.join(WORKSPACE_DIR, ".tonight.state.json");
const LOG_FILE     = path.join(WORKSPACE_DIR, ".tonight.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".tonight.results.json");
const BILAN_FILE   = path.join(WORKSPACE_DIR, ".tonight.bilan.md");
const SHOTS_DIR    = path.join(WORKSPACE_DIR, ".tonight-shots");

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
}

// ── State (résumabilité) ───────────────────────────────────────────────────────
interface State { done: string[]; }
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State; }
  catch { return { done: [] }; }
}
function saveState(s: State): void { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function markDone(s: State, id: string): void { if (!s.done.includes(id)) s.done.push(id); saveState(s); }

// ── Résultats ───────────────────────────────────────────────────────────────────
interface ProjectResult {
  name: string; effort: string; template: string;
  buildOk: boolean; resolvedBy: string; attempts: number; usedClaude: boolean;
  score?: number; dims?: Record<string, number>; judgeComment?: string;
  costUsd: number; durationMs: number;
  sharinganLeaders: string[]; paletteInjected: string[];
  shotBefore?: string; shotAfter?: string; error?: string;
}

// ── Snapshot best-effort : démarre un preview Vite, capture, tue le serveur ─────
function spawnDev(dir: string, port: number): ChildProcess {
  const isWin = process.platform === "win32";
  // npm run dev -- --port N --strictPort ; stdio ignoré (on poll le port).
  return spawn(isWin ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--port", String(port), "--strictPort"],
    { cwd: dir, shell: isWin, windowsHide: true, stdio: "ignore" });
}
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); } catch { /* */ }
  } else {
    try { child.kill("SIGKILL"); } catch { /* */ }
  }
}
async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
/** Démarre la preview du projet, capture l'écran, tue le serveur. Renvoie le
 *  chemin du JPEG ou undefined. 100 % best-effort : ne casse jamais le run. */
async function snap(dir: string, port: number, label: string): Promise<string | undefined> {
  let child: ChildProcess | undefined;
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    child = spawnDev(dir, port);
    const url = `http://localhost:${port}`;
    const up = await waitForServer(url, 40_000);
    if (!up) { log(`  · snap ${label} : preview non démarrée (skip)`); return undefined; }
    await new Promise((r) => setTimeout(r, 1500)); // settle fonts/HMR
    const buf = await capturePreview(url);
    const file = path.join(SHOTS_DIR, `${label}.jpg`);
    fs.writeFileSync(file, buf);
    log(`  · snap ${label} : ${Math.round(buf.length / 1024)} Ko → ${file}`);
    return file;
  } catch (e) {
    log(`  · snap ${label} : échec (${(e as Error).message}) — best-effort, on continue`);
    return undefined;
  } finally {
    if (child) killTree(child);
    await new Promise((r) => setTimeout(r, 800)); // laisse le port se libérer
  }
}

// ── Sharingan pré-calculé ($0) → bloc moodboard compact pour Gemma ─────────────
async function buildMoodboard(leaders: string[]): Promise<{ block: string; palette: string[] }> {
  const blocks: string[] = [];
  const allPalette: string[] = [];
  for (const url of leaders) {
    try {
      log(`  🔮 Sharingan ($0) sur ${url}…`);
      const r: SharinganResult = await sharinganAnalyze(url);
      allPalette.push(...r.palette);
      const fonts = r.fonts.length ? r.fonts.slice(0, 3) : r.typography.families.slice(0, 3);
      blocks.push(
        `• ${url}\n` +
        `  Palette : ${r.palette.slice(0, 6).join(", ") || "(n/a)"}\n` +
        `  Fonts   : ${fonts.join(", ") || "(système)"}\n` +
        `  Tailles : ${r.typography.sizes.slice(0, 4).join(", ") || "(n/a)"} · Graisses : ${r.typography.weights.slice(0, 3).join(", ") || "(n/a)"}`,
      );
      log(`  ✓ ${url} → ${r.palette.length} couleurs, ${fonts.length} fonts`);
    } catch (e) {
      log(`  ⚠ Sharingan ${url} : ${(e as Error).message} (on continue sans)`);
    }
  }
  if (!blocks.length) return { block: "", palette: [] };
  // Palette consolidée (dédoublonnée, cap 8) pour la consigne finale.
  const palette = [...new Set(allPalette)].slice(0, 8);
  const block =
    `\n\n## MOODBOARD — charte extraite de leaders réels (Sharingan, $0)\n` +
    blocks.join("\n") +
    `\n\nCONSIGNE DESIGN : ancre la charte graphique sur CES couleurs (${palette.join(", ")}) ` +
    `et CES typographies. Importe les fonts via Google Fonts si absentes du système. ` +
    `Définis les couleurs comme variables CSS :root. Vise une identité soignée et cohérente, ` +
    `pas un copier-coller : inspire-toi de l'ambiance, garde une vraie hiérarchie visuelle.`;
  return { block, palette };
}

// ── Un projet : snap avant → moodboard → Gemma → snap après → juge ─────────────
// (le type Spec et la liste des projets viennent de tonight-specs.ts)
async function runProject(spec: Spec, state: State): Promise<ProjectResult | null> {
  if (state.done.includes(`done-${spec.name}`)) {
    log(`⏭  ${spec.name} déjà fait.`);
    return null;
  }
  const started = Date.now();
  const dir = projectDir(spec.name);
  log(`\n═══════════════════════════════════════════════════════════════`);
  log(`▶ [${spec.effort}] ${spec.name} (template ${spec.template})`);

  // 1. Création
  if (!projectExists(spec.name)) {
    try { await createProject(spec.name, spec.template); log(`  ✓ projet créé`); }
    catch (e) {
      const error = `createProject: ${(e as Error).message}`;
      log(`  ✗ ${error}`);
      return { name: spec.name, effort: spec.effort, template: spec.template, buildOk: false,
        resolvedBy: "none", attempts: 0, usedClaude: false, costUsd: 0, durationMs: Date.now() - started,
        sharinganLeaders: spec.leaders, paletteInjected: [], error };
    }
  } else {
    log(`  · projet existant — reprise`);
  }

  // 2. Snap AVANT (template nu) — best-effort
  const shotBefore = await snap(dir, spec.port, `${spec.name}-avant`);

  // 3. Sharingan pré-calculé → moodboard injecté ($0, zéro Claude)
  const { block, palette } = await buildMoodboard(spec.leaders);
  const fullTask = spec.task + block +
    `\n\nIMPORTANT : session autonome. Prends toutes les décisions toi-même. ` +
    `La FONCTION prime : chaque feature listée doit MARCHER. Le build doit passer.`;

  // 4. Construction par Gemma (escalade Claude SEULEMENT si build casse)
  let buildOk = false, resolvedBy = "none", attempts = 0, costUsd = 0;
  let error: string | undefined;
  try {
    const r = await runRelay(fullTask, dir,
      { maitreModel: "sonnet", onLog: (l) => log(`    [relay] ${l}`) },
      defaultRelayDeps);
    buildOk = r.success; resolvedBy = r.resolvedBy; attempts = r.attempts; costUsd = r.costUsd;
    if (r.success) log(`  ✓ build OK — résolu par ${r.resolvedBy} en ${r.attempts} tentative(s)${costUsd > 0 ? `, escalade Claude $${costUsd.toFixed(3)}` : " ($0, 100% Gemma)"}`);
    else { error = r.inspection.detail.slice(-200); log(`  ✗ build KO (${r.inspection.signal})`); }
  } catch (e) {
    error = `runRelay: ${(e as Error).message}`;
    log(`  ✗ ${error}`);
  }

  // 5. Snap APRÈS (app construite) — best-effort
  const shotAfter = buildOk ? await snap(dir, spec.port, `${spec.name}-apres`) : undefined;

  // 6. Juge #59
  let score: number | undefined, dims: Record<string, number> | undefined, judgeComment: string | undefined;
  if (buildOk) {
    try {
      const j = await judgeProject(dir, spec.task);
      if (j) { score = j.score; dims = j.dims as unknown as Record<string, number>; judgeComment = j.comment;
        log(`  🏆 ${j.score}/10 — « ${j.comment} »`); }
    } catch { log(`  ⚠ juge indisponible`); }
  }

  markDone(state, `done-${spec.name}`);
  return { name: spec.name, effort: spec.effort, template: spec.template, buildOk, resolvedBy, attempts,
    usedClaude: costUsd > 0, score, dims, judgeComment, costUsd, durationMs: Date.now() - started,
    sharinganLeaders: spec.leaders, paletteInjected: palette, shotBefore, shotAfter, error };
}

// ── Bilan matinal ────────────────────────────────────────────────────────────
function writeBilan(results: ProjectResult[], evolutionSummary: string): void {
  const now = new Date().toISOString();
  const L: string[] = [
    `# Bilan run nocturne — ${now}`, "",
    `Objectif : ${results.length} projets construits par **Gemma 4 12B** avec un **Sharingan pré-calculé** ($0),`,
    `Claude réduit à l'**escalade** sur échec de build.`, "",
    "## Tableau", "",
    "| Projet | Effort | Template | Build | Brain | Claude ? | Score | Coût | Durée |",
    "|--------|--------|----------|-------|-------|----------|-------|------|-------|",
  ];
  for (const r of results) {
    L.push(`| ${r.name} | ${r.effort} | ${r.template} | ${r.buildOk ? "✅" : "❌"} | ${r.resolvedBy} | ${r.usedClaude ? "⚠ oui (escalade)" : "non ($0)"} | ${r.score != null ? r.score + "/10" : "—"} | $${r.costUsd.toFixed(3)} | ${Math.round(r.durationMs / 60000)} min |`);
  }
  L.push("", "## Détail par projet", "");
  for (const r of results) {
    L.push(`### ${r.name} (${r.effort})`);
    L.push(`- Sharingan : ${r.sharinganLeaders.join(", ")}`);
    L.push(`- Palette injectée : ${r.paletteInjected.join(", ") || "(aucune)"}`);
    if (r.shotBefore) L.push(`- Snap avant : \`${r.shotBefore}\``);
    if (r.shotAfter) L.push(`- Snap après : \`${r.shotAfter}\``);
    if (r.dims) L.push(`- Axes juge : ${Object.entries(r.dims).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    if (r.judgeComment) L.push(`- Avis : ${r.judgeComment}`);
    if (r.error) L.push(`- ⚠ Erreur : ${r.error}`);
    L.push("");
  }
  const ok = results.filter((r) => r.buildOk).length;
  const claudeCount = results.filter((r) => r.usedClaude).length;
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  const withScore = results.filter((r) => r.score != null);
  const avg = withScore.reduce((s, r) => s + (r.score ?? 0), 0) / Math.max(1, withScore.length);
  L.push("## Évolution des règles #76", "", evolutionSummary || "(indisponible)", "");
  L.push("## Résumé", "",
    `- Builds OK : **${ok}/${results.length}**`,
    `- Projets ayant nécessité Claude (escalade) : **${claudeCount}/${results.length}**`,
    `- Score moyen : **${avg.toFixed(1)}/10**`,
    `- Coût Claude total : **$${totalCost.toFixed(4)}**`,
    `- Snapshots : \`${SHOTS_DIR}\``);
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

// ── Specs des projets (source unique : tonight-specs.ts) ───────────────────────
const SPECS: Spec[] = TONIGHT;

// ── Main ────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF pour ce run — le Gardien (intention+goût+QA) ne s'exécutera pas, seul le build sera vérifié.");
  }

  log("\n🌙 ═══════════════════════════════════════════════════════════════");
  log(`   RUN NOCTURNE — ${SPECS.length} apps (entraînement de l'Élève)`);
  log("   Gemma 4 12B + Sharingan pré-calculé ($0) · Claude = escalade seule");
  log("═══════════════════════════════════════════════════════════════════\n");

  // Prérequis
  const ollamaOk = await fetch(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/tags`).then((r) => r.ok).catch(() => false);
  if (!ollamaOk) { console.error("❌ Ollama injoignable sur :11434 — lance : ollama serve"); process.exit(1); }
  log("✓ Ollama :11434 OK");

  const state = loadState();
  const results: ProjectResult[] = [];
  // Budget-$ DUR global (gaté NOCTURNAL_BUDGET_HARD), PARTAGÉ avec Phase 0
  // (train-loop.ts) et Phase 2 (nocturnal.ts) via le ledger data/global-budget.json
  // (nocturnal-budget.ts). $0/absent = illimité.
  const globalBudgetCapUsd = Number(process.env.NOCTURNAL_GLOBAL_BUDGET_USD ?? 0);
  // (N17, watchdog mural par run) Deadline du run entier, regarde nocturnal.ts ligne 558.
  // Défaut 480 min (8 h), configurable via TONIGHT_BUDGET_MIN.
  const tonightBudgetMs = Math.max(60 * 60_000, Number(process.env.TONIGHT_BUDGET_MIN ?? 480) * 60_000);
  const tonightDeadline = Date.now() + tonightBudgetMs;

  for (const spec of SPECS) {
    // (N17) Vérification à la frontière d'itération : si la deadline du run est
    // dépassée, arrête proprement (les résultats jusqu'ici sont conservés).
    // Même pattern que nocturnal.ts ligne 585.
    if (Date.now() >= tonightDeadline) {
      log(`⏱ Deadline du run atteinte — ${results.length}/${SPECS.length} projet(s) traité(s), arrêt propre.`);
      break;
    }
    // Frontière d'itération — jamais en cours de génération. Gate OFF → 0 I/O.
    const budgetStop = decideBudgetStop(flag("NOCTURNAL_BUDGET_HARD"), globalBudgetCapUsd, globalBudgetToday(), () => readGlobalBudgetState());
    if (budgetStop.stop) {
      log(`💰 ${budgetStop.reason} — arrêt propre (${results.length}/${SPECS.length} projet(s) traité(s)).`);
      break;
    }
    try {
      const r = await runProject(spec, state);
      if (r) {
        results.push(r);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
        if (flag("NOCTURNAL_BUDGET_HARD")) spendGlobalBudget(r.costUsd);
      }
    } catch (e) {
      log(`✗ ${spec.name} exception : ${(e as Error).stack ?? e}`);
    }
  }

  // Évolution des règles #76 (passe finale)
  log("\n🔄 Analyse d'évolution des règles #76…");
  let evolutionSummary = "";
  try {
    const evo = await runEvolution(WORKSPACE_DIR, `tonight-${Date.now().toString(36)}`, new Date().toISOString());
    evolutionSummary = `**Run** \`${evo.id}\` — ${evo.proposals.length} proposition(s)\n\n` +
      evo.proposals.map((p) => `- [\`${p.kind}\`] **${p.title}** : ${p.rationale.slice(0, 120)}`).join("\n");
    log(`✓ ${evo.proposals.length} proposition(s) — panneau « Évolution des règles ».`);
  } catch (e) {
    evolutionSummary = `Erreur : ${(e as Error).message}`;
    log(`⚠ ${evolutionSummary}`);
  }

  writeBilan(results, evolutionSummary);

  const ok = results.filter((r) => r.buildOk).length;
  const claudeCount = results.filter((r) => r.usedClaude).length;
  log("\n🌅 ═══════════════════════════════════════════════════════════════");
  log(`   TERMINÉ — Builds OK : ${ok}/${results.length} · Claude (escalade) : ${claudeCount}/${results.length}`);
  log(`   Bilan : ${BILAN_FILE}`);
  log("═══════════════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
