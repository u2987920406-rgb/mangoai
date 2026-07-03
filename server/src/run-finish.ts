import "dotenv/config";

// Phase 0 (#104) — Claude FINIT les 3 projets de la nuit, en mode CAPTURE.
//   1. Archive l'état Gemma de chaque projet (→ .gemma-snapshots/<name>) pour
//      pouvoir differ Gemma-vs-Claude plus tard (Phase 1 reverse-engineering).
//   2. Claude implémente RÉELLEMENT les features manquantes via /api/chat :
//      elite (features) → esthetique (polish) → finition (QA). snap avant/après
//      (#80) se déclenche dans ces modes.
//   3. Juge #59 par projet.
//
// Lancer :   npx tsx src/run-finish.ts
// Reprendre : même commande (état dans .finish.state.json).

import fs from "node:fs";
import path from "node:path";
import { projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { judgeProject } from "./nocturnal.js";
import { FINISH_SPECS } from "./tonight-specs.js";
import { flag } from "./flags.js";

const BASE = process.env.MANGO_URL ?? "http://localhost:3000";
const STATE_FILE   = path.join(WORKSPACE_DIR, ".finish.state.json");
const LOG_FILE     = path.join(WORKSPACE_DIR, ".finish.log");
const RESULTS_FILE = path.join(WORKSPACE_DIR, ".finish.results.json");
const BILAN_FILE   = path.join(WORKSPACE_DIR, ".finish.bilan.md");
const SNAP_DIR     = path.join(WORKSPACE_DIR, ".gemma-snapshots");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* */ }
}

interface State { done: string[]; sessions: Record<string, string>; }
function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State; }
  catch { return { done: [], sessions: {} }; }
}
function saveState(s: State): void { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function markDone(s: State, id: string): void { if (!s.done.includes(id)) s.done.push(id); saveState(s); }

// ── Archive de l'état Gemma (copie du code source, hors lourd/git) ─────────────
const SKIP = new Set(["node_modules", "dist", ".git", ".snapshots", ".diffs", ".gemma-snapshots"]);
function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else { try { fs.copyFileSync(s, d); } catch { /* skip locked/binary */ } }
  }
}
function archiveGemma(name: string, state: State): void {
  const key = `archive-${name}`;
  if (state.done.includes(key)) { log(`  · archive Gemma ${name} déjà faite`); return; }
  const dst = path.join(SNAP_DIR, name);
  try {
    fs.rmSync(dst, { recursive: true, force: true });
    copyDir(projectDir(name), dst);
    log(`  📸 état Gemma archivé → ${dst}`);
    markDone(state, key);
  } catch (e) {
    log(`  ⚠ archive ${name} : ${(e as Error).message} (on continue)`);
  }
}

// ── Consigne d'autonomie ────────────────────────────────────────────────────
const AUTO =
  "IMPORTANT : session autonome, NE pose AUCUNE question. Prends toutes les décisions toi-même " +
  "avec des défauts brièvement énoncés, puis construis directement. Réponds « vas-y avec ton jugement » " +
  "à tes propres questions de cadrage.";

// ── Lecteur SSE (modèle run-showcase.ts) ────────────────────────────────────
interface PhaseResult { id: string; mode: string; ok: boolean; costUsd: number; numTurns: number; ms: number; error?: string; }
async function runPhase(
  projectName: string,
  phase: { id: string; mode: string; prompt: string },
  sessionId: string | undefined,
): Promise<{ result: PhaseResult; sessionId: string | undefined }> {
  const started = Date.now();
  const body = { prompt: phase.prompt, projectName, model: "sonnet", mode: phase.mode, sessionId };
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    return { result: { id: phase.id, mode: phase.mode, ok: false, costUsd: 0, numTurns: 0, ms: Date.now() - started, error: `fetch: ${(e as Error).message}` }, sessionId };
  }
  if (!res.ok || !res.body) {
    return { result: { id: phase.id, mode: phase.mode, ok: false, costUsd: 0, numTurns: 0, ms: Date.now() - started, error: `HTTP ${res.status}` }, sessionId };
  }
  let newSession = sessionId, costUsd = 0, numTurns = 0, ok = false;
  let error: string | undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  // Durci #104 : une coupure du flux SSE (backend redémarré, socket fermé) ne
  // doit PAS tuer le run — on la capture, on marque la phase incomplète (ok reste
  // false sauf si le result est déjà arrivé) → la reprise repartira de là.
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        let ev: any;
        try { ev = JSON.parse(dataLine.slice(6)); } catch { continue; }
        switch (ev.type) {
          case "status": log(`    · [${phase.id}] ${ev.text}`); break;
          case "text": if (ev.text?.trim()) log(`    💬 [${phase.id}] ${ev.text.trim().slice(0, 140)}`); break;
          case "tool": log(`    🔧 [${phase.id}] ${ev.name} ${String(ev.detail ?? "").slice(0, 80)}`); break;
          case "result":
            ok = !!ev.ok; costUsd = ev.costUsd ?? 0; numTurns = ev.numTurns ?? 0; error = ev.error;
            if (ev.sessionId) newSession = ev.sessionId; break;
          case "error": error = ev.message; log(`    ❌ [${phase.id}] ${ev.message}`); break;
        }
      }
    }
  } catch (e) {
    if (!ok) error = error ?? `flux interrompu: ${(e as Error).message}`;
    log(`    ⚠ [${phase.id}] flux interrompu: ${(e as Error).message} (reprenable)`);
  }
  return { result: { id: phase.id, mode: phase.mode, ok, costUsd, numTurns, ms: Date.now() - started, error }, sessionId: newSession };
}

// ── Specs (= la liste des features à RÉELLEMENT implémenter) ─────────────────
//    Source unique : tonight-specs.ts (mêmes apps que run-tonight / run-learn).
const SPECS: Record<string, string> = FINISH_SPECS;

function phasesFor(name: string): Array<{ id: string; mode: string; prompt: string }> {
  const spec = SPECS[name];
  return [
    {
      id: "elite", mode: "elite",
      prompt: `${AUTO}\n\nTu reprends un projet React + Vite dont le SQUELETTE a été posé par un modèle local, ` +
        `mais où les FONCTIONNALITÉS sont incomplètes ou absentes (souvent il ne reste que le template de démo). ` +
        `Analyse l'existant, NE repars PAS de zéro quand du code utile existe, et IMPLÉMENTE RÉELLEMENT toutes les features de la spec :\n\n${spec}\n\n` +
        `La FONCTION prime : chaque feature listée doit MARCHER (clics, états, persistance, validation — pas du décoratif). ` +
        `Une charte graphique est déjà ancrée dans le code (palette/fonts) — garde la cohérence visuelle. ` +
        `Vérifie le rendu avec la boucle vision (snapshot). Build vert ET features fonctionnelles obligatoires.`,
    },
    {
      id: "esthetique", mode: "esthetique",
      prompt: `${AUTO}\n\nPhase ✨ Raffinement esthétique. FEATURE FREEZE (n'ajoute aucune feature). ` +
        `Soigne : micro-interactions (hover, transitions, focus ring), profondeur (ombres/élévation), ` +
        `tokens CSS granulaires, hiérarchie typographique fine, retours visuels (loading/succès/erreur). ` +
        `Boucle vision pour comparer le rendu avant/après.`,
    },
    {
      id: "finition", mode: "finition",
      prompt: `Phase 🛡️ Finition. FEATURE FREEZE. QA adversarial : accessibilité clavier (Tab/Enter/Escape, labels), ` +
        `responsive 320px → desktop, cas limites (champs vides, données 0/1/many, actions répétées), ` +
        `états loading/empty/error partout. Corrige les vrais défauts, consigne le reste.`,
    },
  ];
}

// ── Bilan ────────────────────────────────────────────────────────────────────
interface ProjectResult { name: string; phases: PhaseResult[]; buildOk: boolean; costUsd: number; score?: number; dims?: Record<string, number>; comment?: string; }
function writeBilan(results: ProjectResult[]): void {
  const L: string[] = [
    `# Bilan Phase 0 (#104) — Claude finit ${results.length} app(s) — ${new Date().toISOString()}`, "",
    "| Projet | Build | Phases OK | Score | Coût |",
    "|--------|-------|-----------|-------|------|",
  ];
  for (const r of results) {
    const ok = r.phases.filter((p) => p.ok).length;
    L.push(`| ${r.name} | ${r.buildOk ? "✅" : "❌"} | ${ok}/${r.phases.length} | ${r.score != null ? r.score + "/10" : "—"} | $${r.costUsd.toFixed(3)} |`);
  }
  L.push("", "## Détail", "");
  for (const r of results) {
    L.push(`### ${r.name}`);
    for (const p of r.phases) L.push(`- ${p.ok ? "✅" : "❌"} ${p.id} (${p.mode}) — ${p.numTurns} turns · $${p.costUsd.toFixed(3)} · ${Math.round(p.ms / 1000)}s${p.error ? " · ERR " + p.error : ""}`);
    if (r.dims) L.push(`- Juge : ${Object.entries(r.dims).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    if (r.comment) L.push(`- Avis : ${r.comment}`);
    L.push("");
  }
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  L.push("## Résumé", "", `- Coût Claude total : **$${totalCost.toFixed(3)}**`, `- États Gemma archivés : \`${SNAP_DIR}\` (pour la Phase 1 reverse-engineering)`);
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!flag("ELEVE_CLOSURE_GATE")) {
    console.warn("[gardien] ⚠ ELEVE_CLOSURE_GATE est OFF pour ce run — le Gardien (intention+goût+QA) ne s'exécutera pas, seul le build sera vérifié.");
  }

  log("\n🎯 ═══════════════════════════════════════════════════════════════");
  log(`   PHASE 0 (#104) — Claude finit ${Object.keys(SPECS).length} app(s) du run`);
  log("   Archive Gemma → elite (features) → esthetique → finition → juge");
  log("═══════════════════════════════════════════════════════════════════\n");

  const backendOk = await fetch(`${BASE}/api/projects`).then((r) => r.ok).catch(() => false);
  if (!backendOk) { console.error("❌ Backend :3000 injoignable — lance : cd server && npm run start"); process.exit(1); }
  log("✓ Backend :3000 OK");

  const state = loadState();
  const results: ProjectResult[] = [];
  fs.mkdirSync(SNAP_DIR, { recursive: true });

  // Garde-budget : Claude finit les apps une par une ; dès que le cumul atteint
  // FINISH_BUDGET_USD, on s'arrête PROPREMENT (les apps non finies restent en
  // l'état Gemma — toujours exploitables en Phase 2 via leur snapshot). $0 / absent = illimité.
  const budgetUsd = Number(process.env.FINISH_BUDGET_USD ?? 0);
  const spent = () => results.reduce((s, r) => s + r.costUsd, 0);

  for (const name of Object.keys(SPECS)) {
    if (budgetUsd > 0 && spent() >= budgetUsd) {
      log(`\n💰 Budget $${budgetUsd} atteint (dépensé $${spent().toFixed(2)}) — arrêt propre. Apps restantes laissées en l'état Gemma.`);
      break;
    }
    if (!projectExists(name)) { log(`✗ ${name} introuvable — skip`); continue; }
    log(`\n═══ ${name} ═══`);

    // 1. Archive Gemma AVANT toute édition Claude
    archiveGemma(name, state);

    // 2. Phases Claude
    let sessionId = state.sessions[name];
    const phaseResults: PhaseResult[] = [];
    let buildOk = false, cost = 0;
    for (const phase of phasesFor(name)) {
      const key = `${name}-${phase.id}`;
      if (state.done.includes(key)) { log(`⏭  ${key} déjà fait`); phaseResults.push({ id: phase.id, mode: phase.mode, ok: true, costUsd: 0, numTurns: 0, ms: 0 }); buildOk = true; continue; }
      log(`▶ [${name}] ${phase.id} (${phase.mode})…`);
      const { result, sessionId: ns } = await runPhase(name, phase, sessionId);
      if (ns) { sessionId = ns; state.sessions[name] = ns; saveState(state); }
      phaseResults.push(result); cost += result.costUsd;
      log(`${result.ok ? "✅" : "❌"} ${phase.id} — ${result.numTurns} turns · $${result.costUsd.toFixed(3)} · ${Math.round(result.ms / 1000)}s${result.error ? " ERR:" + result.error : ""}`);
      if (result.ok) { markDone(state, key); buildOk = true; }
      else log(`⚠ phase en échec — on continue (mode autonome)`);
    }

    // 3. Juge
    let score: number | undefined, dims: Record<string, number> | undefined, comment: string | undefined;
    if (buildOk) {
      try {
        const j = await judgeProject(projectDir(name), SPECS[name]);
        if (j) { score = j.score; dims = j.dims as unknown as Record<string, number>; comment = j.comment; log(`🏆 ${j.score}/10 — « ${j.comment} »`); }
      } catch { log(`⚠ juge indisponible`); }
    }
    results.push({ name, phases: phaseResults, buildOk, costUsd: cost, score, dims, comment });
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  }

  writeBilan(results);
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0);
  log("\n🌅 ═══════════════════════════════════════════════════════════════");
  log(`   PHASE 0 TERMINÉE — coût Claude $${totalCost.toFixed(3)}`);
  log(`   Bilan : ${BILAN_FILE} · États Gemma : ${SNAP_DIR}`);
  log("═══════════════════════════════════════════════════════════════════");
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
