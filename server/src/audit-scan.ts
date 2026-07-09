// Audit Scan — « l'examen blanc » (Phase Ultime, jalon D Phase 3).
//
// Fait tourner l'Élève local sur une suite FIGÉE held-out (audit-tasks.ts) et
// calcule un Score de Santé 100 % OBJECTIF (build OK, rendement 1er tour, nb de
// tentatives, temps mur). Outil de PILOTAGE, hors du chemin de production : ce
// fichier n'est JAMAIS importé par index.ts — c'est un CLI, comme les test-*.ts.
//
//   npx tsx src/audit-scan.ts            scan normal (journalisé, comparé au précédent)
//   npx tsx src/audit-scan.ts --ablate   ablation A/B : suite AVEC vs SANS le dernier
//                                         axiome → attribue causalement un « mauvais pli »
//
// Reproductibilité : chaque scan trace le digest du modèle, la version d'Ollama
// et le hash du registre d'axiomes — sinon une régression est inattribuable
// (nouvel axiome ? nouveau modèle ?).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runRelay, defaultRelayDeps } from "./eleve.js";
import {
  AXIOMS_FILE_NAME,
  loadAxioms,
  removeLastAxiom,
  removeAxiomAt,
  computeAblationVerdict,
  countCodeAxioms,
  PRUNE_MIN_AXIOMS,
} from "./axioms.js";
import { WORKSPACE_DIR } from "./projects.js";
import { AUDIT_TASKS, type AuditTask } from "./audit-tasks.js";
import { verifyEffect } from "./audit-verify.js";

const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const ELEVE_MODEL = process.env.ELEVE_MODEL ?? "gemma4:12b";
const MAX_ATTEMPTS = Number(process.env.ELEVE_MAX_ATTEMPTS ?? 2);
const SOURCE = path.resolve(process.cwd(), "..", "workspace", "test-pipeline");
const AUDIT_LOG = path.join(WORKSPACE_DIR, ".audit.jsonl");
const ABLATE = process.argv.includes("--ablate");
const PRUNE_SCAN = process.argv.includes("--prune-scan");

const line = (c = "─") => console.log(c.repeat(64));

interface TaskScore {
  id: string;
  complexity: string;
  buildOk: boolean;
  effectOk: boolean; // le changement demandé a-t-il VRAIMENT atterri (audit-verify)
  effectDetail: string;
  firstTry: boolean;
  attempts: number;
  durationMs: number;
}
interface Health {
  tasks: number;
  builtPct: number; // compile seulement
  effectPct: number; // build ET effet — le rendement RÉEL (ferme le caveat n°7)
  firstTryPct: number;
  avgAttempts: number;
  avgDurationMs: number;
}

// ── Projet support : copie jonctionnée de test-pipeline (pattern prouvé) ──────
function makeProject(): { dir: string; nmLink: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  fs.cpSync(SOURCE, dir, {
    recursive: true,
    filter: (s) => !/(^|[\\/])(node_modules|dist|\.git)([\\/]|$)/.test(path.relative(SOURCE, s)),
  });
  const nmLink = path.join(dir, "node_modules");
  fs.symlinkSync(path.join(SOURCE, "node_modules"), nmLink, "junction");
  return { dir, nmLink };
}
function cleanProject(dir: string, nmLink: string): void {
  if (process.platform === "win32") spawnSync("cmd", ["/c", "rmdir", nmLink]);
  else if (fs.existsSync(nmLink)) fs.unlinkSync(nmLink);
  if (!fs.existsSync(nmLink)) fs.rmSync(dir, { recursive: true, force: true });
}

// L'Élève SEUL, sans filet : escalade neutralisée → on mesure sa compétence brute.
const noEscalate = async () => ({ axiom: false, costUsd: 0, codeChanged: false });

async function scoreTask(task: AuditTask): Promise<TaskScore> {
  const { dir, nmLink } = makeProject();
  try {
    const t0 = Date.now();
    const r = await runRelay(
      task.prompt,
      dir,
      { maxEleveAttempts: MAX_ATTEMPTS, onLog: () => {} },
      { ...defaultRelayDeps, escalate: noEscalate },
    );
    // Vérification d'EFFET AVANT le nettoyage (les fichiers sont encore sur disque).
    // C'est ici qu'on démasque un build vert sans changement réel.
    const effect = verifyEffect(dir, task.expect);
    return {
      id: task.id,
      complexity: task.complexity,
      buildOk: r.success,
      effectOk: effect.ok,
      effectDetail: effect.detail,
      firstTry: r.success && effect.ok && r.attempts === 1,
      attempts: r.attempts,
      durationMs: Date.now() - t0,
    };
  } finally {
    cleanProject(dir, nmLink);
  }
}

function aggregate(results: TaskScore[]): Health {
  const n = results.length || 1;
  return {
    tasks: results.length,
    builtPct: Math.round((results.filter((r) => r.buildOk).length / n) * 100),
    effectPct: Math.round((results.filter((r) => r.buildOk && r.effectOk).length / n) * 100),
    firstTryPct: Math.round((results.filter((r) => r.firstTry).length / n) * 100),
    avgAttempts: Number((results.reduce((s, r) => s + r.attempts, 0) / n).toFixed(2)),
    avgDurationMs: Math.round(results.reduce((s, r) => s + r.durationMs, 0) / n),
  };
}

async function runSuite(label: string): Promise<TaskScore[]> {
  console.log(`\n▶ ${label} — ${AUDIT_TASKS.length} tâches sur ${ELEVE_MODEL}`);
  const results: TaskScore[] = [];
  for (const task of AUDIT_TASKS) {
    process.stdout.write(`   · ${task.id} (${task.complexity})… `);
    const s = await scoreTask(task);
    results.push(s);
    // Le cas qui démasque le caveat n°7 : build vert MAIS effet absent.
    const effectMark = s.buildOk
      ? s.effectOk
        ? "✓ effet"
        : "✗ EFFET ABSENT"
      : "—";
    console.log(
      `${s.buildOk ? "✅" : "❌"} build · ${effectMark}${s.firstTry ? " · 1er tour" : ""} · ${s.attempts} tent. · ${(s.durationMs / 1000).toFixed(1)}s`,
    );
    if (s.buildOk && !s.effectOk) console.log(`        ↳ ${s.effectDetail}`);
  }
  return results;
}

// ── Empreintes de reproductibilité ───────────────────────────────────────────
async function getJSON(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function fingerprint() {
  const ver = (await getJSON(`${OLLAMA}/api/version`)) as { version?: string } | null;
  const tags = (await getJSON(`${OLLAMA}/api/tags`)) as { models?: Array<{ name: string; digest?: string }> } | null;
  const digest = tags?.models?.find((m) => m.name === ELEVE_MODEL)?.digest ?? "?";
  const axiomsText = loadAxioms(WORKSPACE_DIR);
  // Empreinte de la suite : comparer deux scans n'a de sens QUE pour la même
  // suite de tâches (changer la suite invalide toute comparaison temporelle).
  const suiteHash = createHash("sha1")
    .update(AUDIT_TASKS.map((t) => `${t.id}::${t.prompt}`).join("\n"))
    .digest("hex")
    .slice(0, 12);
  return {
    ollamaVersion: ver?.version ?? "?",
    modelDigest: digest.slice(0, 12),
    axiomsHash: axiomsText ? createHash("sha1").update(axiomsText).digest("hex").slice(0, 12) : "vide",
    axiomsCount: (axiomsText.match(/AXIOME-/g) ?? []).length,
    suiteHash,
  };
}

function printHealth(h: Health): void {
  const gap = h.builtPct - h.effectPct;
  console.log(
    `   build ${h.builtPct}% · RENDEMENT RÉEL (build+effet) ${h.effectPct}%${gap > 0 ? ` ⚠ −${gap} pts d'effet manquant` : ""} · 1er tour réel ${h.firstTryPct}%`,
  );
  console.log(`   ${h.avgAttempts} tent./tâche · ${(h.avgDurationMs / 1000).toFixed(1)}s/tâche`);
}

function readScans(): Array<{ ts: string; health: Health; axiomsHash: string; suiteHash?: string; perTask: TaskScore[] }> {
  try {
    return fs
      .readFileSync(AUDIT_LOG, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ── Modes ────────────────────────────────────────────────────────────────────
async function normalScan(): Promise<void> {
  const fp = await fingerprint();
  // Ne comparer qu'aux scans de la MÊME suite (sinon pommes vs oranges).
  const previous = readScans().filter((s) => s.suiteHash === fp.suiteHash).at(-1) ?? null;
  const results = await runSuite("Scan");
  const health = aggregate(results);

  line("═");
  console.log("SCORE DE SANTÉ");
  line();
  printHealth(health);
  console.log(
    `   modèle ${fp.modelDigest} · ollama ${fp.ollamaVersion} · axiomes ${fp.axiomsCount} (${fp.axiomsHash}) · suite ${fp.suiteHash} (${AUDIT_TASKS.length} tâches)`,
  );

  if (previous) {
    const d = (a: number, b?: number) => (b == null ? "n/a" : a - b >= 0 ? `+${a - b}` : `${a - b}`);
    console.log(`\n   vs scan précédent (${previous.ts.slice(0, 16).replace("T", " ")}) :`);
    console.log(
      `     build ${d(health.builtPct, previous.health.builtPct)} pts · rendement réel ${d(health.effectPct, previous.health.effectPct)} pts · 1er tour réel ${d(health.firstTryPct, previous.health.firstTryPct)} pts`,
    );
    // Régression de COMPILATION (un fichier ne build plus)…
    const buildReg = results.filter((r) => {
      const before = previous.perTask.find((p) => p.id === r.id);
      return before?.buildOk && !r.buildOk;
    });
    // …et régression d'EFFET (le changement n'atterrit plus, build vert ou non) :
    // le mauvais pli SUBTIL que le build seul ne voyait pas.
    const effectReg = results.filter((r) => {
      const before = previous.perTask.find((p) => p.id === r.id);
      return before?.effectOk && !r.effectOk;
    });
    if (buildReg.length) {
      console.log(`   ⚠ MAUVAIS PLI (build) : ${buildReg.map((r) => r.id).join(", ")} compilai(en)t avant, plus maintenant.`);
    }
    if (effectReg.length) {
      console.log(`   ⚠ MAUVAIS PLI (effet) : ${effectReg.map((r) => r.id).join(", ")} appliquai(en)t le changement avant, plus maintenant.`);
    }
    if ((buildReg.length || effectReg.length) && previous.axiomsHash !== fp.axiomsHash) {
      console.log(`     (le registre d'axiomes a changé entre les deux scans — suspect n°1 ; lance --ablate)`);
    }
    if (!buildReg.length && !effectReg.length) console.log(`   ✓ aucune régression (build ni effet).`);
  } else {
    console.log(`\n   (première mesure de CETTE suite (${fp.suiteHash}) — pas de comparaison ; les suivants détecteront les dérives)`);
  }

  fs.appendFileSync(AUDIT_LOG, `${JSON.stringify({ ts: new Date().toISOString(), ...fp, health, perTask: results })}\n`);
  console.log(`\n→ Scan enregistré dans ${path.relative(process.cwd(), AUDIT_LOG)}`);
}

async function ablationScan(): Promise<void> {
  const axiomsPath = path.join(WORKSPACE_DIR, AXIOMS_FILE_NAME);
  if (!fs.existsSync(axiomsPath)) {
    console.log("⚠ Registre d'axiomes vide — rien à ablater. Lance d'abord un scan normal.");
    return;
  }
  // Octets BRUTS pour la restauration (loadAxioms trim/plafonne → ne pas s'en
  // servir pour sauvegarder, sinon la restauration n'est pas byte-identique).
  const rawOriginal = fs.readFileSync(axiomsPath, "utf8");
  const { without, removed } = removeLastAxiom(rawOriginal);
  if (!removed) {
    console.log("⚠ Un seul axiome ou registre illisible — rien à ablater proprement.");
    return;
  }

  console.log("Ablation A/B — le dernier axiome est-il un progrès ou un mauvais pli ?");
  console.log(`Dernier axiome testé :\n  ${removed.split("\n")[0]}`);

  const withResults = await runSuite("AVEC le dernier axiome");
  const withHealth = aggregate(withResults);

  let withoutHealth: Health;
  try {
    fs.writeFileSync(axiomsPath, without); // retire temporairement le dernier axiome
    console.log("(dernier axiome retiré temporairement du registre)");
    const withoutResults = await runSuite("SANS le dernier axiome");
    withoutHealth = aggregate(withoutResults);
  } finally {
    fs.writeFileSync(axiomsPath, rawOriginal); // RESTAURE les octets exacts, toujours
    console.log("\n(registre d'axiomes restauré à l'identique)");
  }

  line("═");
  console.log("VERDICT D'ABLATION");
  line();
  console.log("AVEC l'axiome :");
  printHealth(withHealth);
  console.log("SANS l'axiome :");
  printHealth(withoutHealth);

  // Signal de référence = le RENDEMENT RÉEL (build+effet), pas la seule compilation :
  // un axiome qui fait « compiler sans appliquer » serait un faux progrès.
  const dEffect = withHealth.effectPct - withoutHealth.effectPct;
  const dBuild = withHealth.builtPct - withoutHealth.builtPct;
  const dFirst = withHealth.firstTryPct - withoutHealth.firstTryPct;
  console.log("");
  if (dEffect < 0 || (dEffect === 0 && dBuild < 0) || (dEffect === 0 && dBuild === 0 && dFirst < 0)) {
    console.log(`⚠ MAUVAIS PLI : le dernier axiome DÉGRADE l'Élève (rendement réel ${dEffect} pts · build ${dBuild} · 1er tour ${dFirst}).`);
    console.log(`  → à amender ou retirer du registre (le clapet est anti-oubli, PAS anti-correction).`);
  } else if (dEffect > 0 || dBuild > 0 || dFirst > 0) {
    console.log(`✓ PROGRÈS : le dernier axiome AMÉLIORE l'Élève (rendement réel +${dEffect} pts · build +${dBuild} · 1er tour +${dFirst}).`);
  } else {
    console.log(`≈ NEUTRE : aucun effet mesurable sur cette suite (rendement réel, build et 1er tour inchangés).`);
  }
}

// ── Prune Scan (Clapet v4.0) ─────────────────────────────────────────────────
//
// For EACH axiom in the registry: runs the held-out suite WITH the full
// registry vs WITHOUT that axiom, computes the real-yield delta, and returns
// an ablation verdict (keep / neutral / prune).
//
// GATING: only emits prune recommendations when the registry has at least
// PRUNE_MIN_AXIOMS code axioms.  Below the threshold the signal is too noisy
// and the scan exits early with a friendly message.  This is EXPECTED today
// (the registry is nearly empty): the infrastructure is ready and will
// activate once there is enough fuel.
//
// SAFETY: after every per-axiom test run the EXACT raw bytes of the registry
// are restored.  --prune-scan is purely READ / RECOMMEND — it never deletes
// anything.  "prune" is a candidate flag for human review, not an action.
async function pruneScan(): Promise<void> {
  const axiomsPath = path.join(WORKSPACE_DIR, AXIOMS_FILE_NAME);
  if (!fs.existsSync(axiomsPath)) {
    console.log("⚠ Registre d'axiomes vide — rien à analyser. Lance d'abord un scan normal.");
    return;
  }

  // Read RAW bytes — do NOT use loadAxioms (it trims/caps and would break the
  // byte-identical restore that is mandatory after each ablation test).
  const rawOriginal = fs.readFileSync(axiomsPath, "utf8");

  // ── GATING ────────────────────────────────────────────────────────────────
  const codeCount = countCodeAxioms(rawOriginal);
  if (codeCount < PRUNE_MIN_AXIOMS) {
    console.log(
      `Clapet v4 prêt — ${codeCount} axiome(s) de code, seuil ${PRUNE_MIN_AXIOMS} non atteint → rien à élaguer pour l'instant.`,
    );
    console.log(
      `(infrastructure posée et dormante — elle s'activera quand le registre atteindra ${PRUNE_MIN_AXIOMS} axiomes BUILD/ARCH/DATA/PERF)`,
    );
    return;
  }

  // ── Parse axioms to know how many we'll iterate ───────────────────────────
  // We parse via the exported countCodeAxioms helper — but we also need the
  // full list.  We re-parse locally here (parseAxioms is private; we extract
  // the list from removeAxiomAt behaviour).
  const totalBlocks = (rawOriginal.match(/^\s*AXIOME-/gim) ?? []).length;
  if (totalBlocks === 0) {
    console.log("⚠ Aucun axiome parsé dans le registre.");
    return;
  }

  console.log(`\nClapet v4.0 — Prune Scan (${totalBlocks} axiomes, ${codeCount} de code)`);
  console.log(`Élève : ${ELEVE_MODEL}  ·  Suite : ${AUDIT_TASKS.length} tâches held-out`);
  console.log(`RAPPEL : "prune" = RECOMMANDATION seulement — aucun axiome ne sera supprimé automatiquement.\n`);

  // ── Run suite ONCE with the full registry as baseline ─────────────────────
  process.stdout.write("▶ Référence (registre complet)… ");
  const baseResults = await runSuite("Référence");
  const baseHealth = aggregate(baseResults);
  console.log(`   → rendement réel ${baseHealth.effectPct}%  build ${baseHealth.builtPct}%`);

  // ── Per-axiom ablation loop ───────────────────────────────────────────────
  interface PruneRow {
    index: number;
    header: string;
    cat: string;
    maturity: string;
    scope: string;
    yieldWith: number;
    yieldWithout: number;
    delta: number;
    verdict: "keep" | "neutral" | "prune";
  }
  const rows: PruneRow[] = [];

  for (let i = 0; i < totalBlocks; i++) {
    const { without, removed } = removeAxiomAt(rawOriginal, i);
    if (!removed) continue;

    const header = removed.split("\n")[0].trim();
    const catMatch = /AXIOME-([A-Z0-9]+)/i.exec(header);
    const cat = catMatch?.[1]?.toUpperCase() ?? "?";
    const maturity = /confirm/i.test(header) ? "confirmé" : /candidat/i.test(header) ? "candidat" : "?";
    const scopeMatch = /scope\s*:\s*(global|project|local)/i.exec(header);
    const scope = scopeMatch?.[1]?.toLowerCase() ?? "global";

    process.stdout.write(`   · [${i}] ${header.slice(0, 50)}… `);

    let withoutHealth: Health;
    try {
      fs.writeFileSync(axiomsPath, without); // temporarily remove axiom i
      const withoutResults = await runSuite(`SANS axiome ${i}`);
      withoutHealth = aggregate(withoutResults);
    } finally {
      fs.writeFileSync(axiomsPath, rawOriginal); // ALWAYS restore exact bytes
    }

    const { delta, verdict } = computeAblationVerdict(baseHealth.effectPct, withoutHealth.effectPct);
    const mark = verdict === "prune" ? "⚠ CANDIDAT ÉLAGAGE" : verdict === "neutral" ? "≈ neutre" : "✓ utile";
    console.log(`rendement sans: ${withoutHealth.effectPct}%  delta: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}  → ${mark}`);

    rows.push({ index: i, header, cat, maturity, scope, yieldWith: baseHealth.effectPct, yieldWithout: withoutHealth.effectPct, delta, verdict });
  }

  // ── Summary table ─────────────────────────────────────────────────────────
  line("═");
  console.log("RÉSUMÉ PRUNE SCAN");
  line();
  console.log(`${"Idx".padEnd(4)} ${"Cat".padEnd(7)} ${"Maturité".padEnd(10)} ${"Scope".padEnd(8)} ${"Avec%".padEnd(6)} ${"Sans%".padEnd(6)} ${"Delta".padEnd(7)} Verdict`);
  line();
  for (const r of rows) {
    const row = [
      String(r.index).padEnd(4),
      r.cat.padEnd(7),
      r.maturity.padEnd(10),
      r.scope.padEnd(8),
      String(r.yieldWith).padEnd(6),
      String(r.yieldWithout).padEnd(6),
      (r.delta >= 0 ? `+${r.delta.toFixed(1)}` : r.delta.toFixed(1)).padEnd(7),
      r.verdict === "prune" ? "⚠ CANDIDAT ÉLAGAGE" : r.verdict === "neutral" ? "≈ neutre" : "✓ utile",
    ].join(" ");
    console.log(row);
  }
  line();

  const pruneCount = rows.filter((r) => r.verdict === "prune").length;
  if (pruneCount > 0) {
    console.log(`\n${pruneCount} axiome(s) candidat(s) à l'élagage — revue HUMAINE requise avant toute suppression.`);
    console.log(`(le clapet est anti-OUBLI, pas anti-CORRECTION — aucune suppression automatique)`);
  } else {
    console.log(`\n✓ Aucun axiome candidat à l'élagage — le registre est utile dans son ensemble.`);
  }
}

// ── Entrée ───────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(path.join(SOURCE, "node_modules"))) {
    console.error(`✗ Projet support introuvable ou sans node_modules : ${SOURCE}`);
    console.error("  L'audit a besoin d'un projet Vite installé (workspace/test-pipeline).");
    process.exit(1);
  }
  console.log(`Audit Scan — Élève ${ELEVE_MODEL}${ABLATE ? " — mode ABLATION" : PRUNE_SCAN ? " — mode PRUNE SCAN" : ""}`);
  if (PRUNE_SCAN) await pruneScan();
  else if (ABLATE) await ablationScan();
  else await normalScan();
})();
