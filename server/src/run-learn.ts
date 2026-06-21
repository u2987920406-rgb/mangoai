// Chaînage autonome #104 — s'exécute APRÈS la Phase 0 (run-finish.ts).
//   1. Attend la fin de Phase 0 (apparition de .finish.bilan.md).
//   2. Pour chaque projet : reverse-engineering du diff Gemma→Claude → procédure #75.
//   3. Réindexe les procédures (embeddings, best-effort).
//   4. Validation BOUCLE FERMÉE : re-run Gemma SEUL sur une tâche similaire bornée,
//      avec injectMeans + porte fonctionnelle → mesure si Gemma fait mieux.
//
// Détaché : npx tsx src/run-learn.ts  (tourne des heures, attend Phase 0, finit seul)

import fs from "node:fs";
import path from "node:path";
import { createProject, projectDir, projectExists, WORKSPACE_DIR } from "./projects.js";
import { runRelay, defaultRelayDeps, type RelayDeps } from "./eleve.js";
import { judgeProject } from "./nocturnal.js";
import { learnFromSolution } from "./reverse-learn.js";
import { reindexProcedures, listProcedures } from "./procedures.js";
import { LEARN_TASKS } from "./tonight-specs.js";

const FINISH_BILAN = path.join(WORKSPACE_DIR, ".finish.bilan.md");
const SNAP_DIR     = path.join(WORKSPACE_DIR, ".gemma-snapshots");
const LOG_FILE     = path.join(WORKSPACE_DIR, ".relearn.log");
const BILAN_FILE   = path.join(WORKSPACE_DIR, ".relearn.bilan.md");

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch { /* */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tâches d'origine (= ce que Claude a réellement implémenté en Phase 0).
//    Source unique : tonight-specs.ts (mêmes apps que run-tonight / run-finish).
//    run-learn ne diffe QUE les projets ayant une archive Gemma (.gemma-snapshots/<name>) — voir boucle.
const TASKS: Record<string, string> = LEARN_TASKS;

// Juge réel branché dans la boucle (Phase 2) : expose le score FONCTIONNEL.
const judge: RelayDeps["judge"] = async (dir, task) => {
  const j = await judgeProject(dir, task);
  return j ? { fonctionnel: j.dims.fonctionnel, note: j.comment } : null;
};

async function waitForPhase0(maxHours = 7): Promise<boolean> {
  if (fs.existsSync(FINISH_BILAN)) { log("✓ Phase 0 déjà terminée (.finish.bilan.md présent)"); return true; }
  log(`⏳ attente de la fin de Phase 0 (sentinelle ${FINISH_BILAN})…`);
  const deadline = Date.now() + maxHours * 3600_000;
  while (Date.now() < deadline) {
    await sleep(60_000);
    if (fs.existsSync(FINISH_BILAN)) { log("✓ Phase 0 terminée — on enchaîne"); return true; }
  }
  log("⚠ timeout d'attente de Phase 0 — on tente quand même avec ce qui existe");
  return false;
}

async function main(): Promise<void> {
  log("\n🔁 ═══════════════════════════════════════════════════════════════");
  log("   RUN-LEARN (#104) — reverse-engineering + validation boucle fermée");
  log("═══════════════════════════════════════════════════════════════════\n");

  await waitForPhase0();

  const nowIso = new Date().toISOString();
  const learned: { project: string; ok: boolean; name?: string; reason?: string }[] = [];

  // ── 2. Reverse-engineering des paires Gemma→Claude (celles ayant une archive) ──
  for (const [name, task] of Object.entries(TASKS)) {
    const gemmaDir = path.join(SNAP_DIR, name);
    const claudeDir = projectDir(name);
    if (!fs.existsSync(gemmaDir)) { log(`⏭  ${name} : pas d'archive Gemma — skip`); learned.push({ project: name, ok: false, reason: "archive Gemma absente" }); continue; }
    log(`\n🔬 ${name} — distillation de la procédure…`);
    try {
      const r = await learnFromSolution({ workspaceDir: WORKSPACE_DIR, task, gemmaDir, claudeDir, nowIso });
      if (r.ok) log(`  ✓ procédure apprise : « ${r.name} » (${r.slug})`);
      else log(`  ✗ ${r.reason}`);
      learned.push({ project: name, ok: r.ok, name: r.name, reason: r.reason });
    } catch (e) {
      log(`  ✗ exception : ${(e as Error).message}`);
      learned.push({ project: name, ok: false, reason: (e as Error).message });
    }
  }

  // ── 3. Réindexation (embeddings) — best-effort ─────────────────────────────
  try { const r = await reindexProcedures(WORKSPACE_DIR); log(`\n📇 procédures réindexées : ${r.indexed} ok, ${r.failed} échec`); }
  catch (e) { log(`⚠ réindexation : ${(e as Error).message}`); }

  const allProcs = listProcedures(WORKSPACE_DIR).map((m) => m.name);
  log(`📚 procédures disponibles : ${allProcs.join(" · ") || "(aucune)"}`);

  // ── 4. Validation BOUCLE FERMÉE ────────────────────────────────────────────
  // Tâche bornée et SIMILAIRE (CRUD + localStorage) → la procédure apprise
  // devrait aider Gemma. On compare au flashcards de la nuit (fonctionnel 1/10).
  const VAL = "validation-relearn";
  const valTask =
    "Crée une app de liste de tâches (todo) en React + Tailwind v4, PERSISTÉE en localStorage : " +
    "ajouter une tâche, la cocher/décocher, la supprimer, filtrer (toutes/actives/faites), compteur de restantes. " +
    "Tout survit au refresh (localStorage). Responsive.";
  let valScore: number | undefined, valBuild = false, valBy = "—";
  try {
    if (!projectExists(VAL)) await createProject(VAL, "shadcn");
    log(`\n🧪 Validation : re-run Gemma sur « todo localStorage » (injectMeans + porte fonctionnelle)…`);
    const r = await runRelay(valTask, projectDir(VAL),
      { maxEleveAttempts: 2, functionalGate: true, functionalMin: 5, injectMeans: true, onLog: (l) => log(`    [val] ${l}`) },
      { ...defaultRelayDeps, judge });
    valBuild = r.success; valBy = r.resolvedBy;
    if (r.success) {
      const j = await judgeProject(projectDir(VAL), valTask);
      if (j) { valScore = j.dims.fonctionnel; log(`  🏆 fonctionnel ${j.dims.fonctionnel}/10 — « ${j.comment} »`); }
    }
  } catch (e) { log(`  ✗ validation : ${(e as Error).message}`); }

  // ── Bilan ──────────────────────────────────────────────────────────────────
  const L: string[] = [
    `# Bilan run-learn (#104) — ${new Date().toISOString()}`, "",
    "## Procédures distillées (reverse-engineering Gemma→Claude)", "",
    "| Projet | Apprise ? | Procédure |", "|--------|-----------|-----------|",
    ...learned.map((l) => `| ${l.project} | ${l.ok ? "✅" : "❌"} | ${l.name ?? l.reason ?? "—"} |`),
    "", `Procédures disponibles : ${allProcs.join(" · ") || "(aucune)"}`,
    "", "## Validation boucle fermée (Gemma seul, tâche todo+localStorage similaire)", "",
    `- Build : ${valBuild ? "✅" : "❌"} (résolu par ${valBy})`,
    `- Score FONCTIONNEL : **${valScore != null ? valScore + "/10" : "—"}**`,
    `- Référence : flashcards de la nuit = **1/10** fonctionnel (Gemma sans procédure).`,
    "", valScore != null && valScore >= 5
      ? "→ **Gain net** : avec la procédure injectée + la porte fonctionnelle, Gemma produit une app réellement fonctionnelle sur une tâche bornée similaire."
      : "→ Résultat à interpréter : si le score reste bas, cela confirme le plafond du 12B sur la génération multi-features (cf. #55 LoRA) — la mécanique d'apprentissage est en place, le modèle reste la limite.",
  ];
  fs.writeFileSync(BILAN_FILE, L.join("\n") + "\n");
  log(`\n📋 Bilan : ${BILAN_FILE}`);
  log("🔁 RUN-LEARN terminé.");
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.stack : e); process.exit(1); });
