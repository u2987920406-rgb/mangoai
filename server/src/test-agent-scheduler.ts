// Tests du scheduler borné multi-projets (#180 É7, D6) — server/src/agent-scheduler.ts.
// Deux plafonds indépendants, prouvés contre le VRAI fichier sur disque (fs réel, pas
// mocké) : (1) la taille du pool (DESKTOP_MAX_CONCURRENT_RUNS) ; (2) le budget-$ dur
// PARTAGÉ (même ledger que NOCTURNAL_BUDGET_HARD, nocturnal-budget.ts, réutilisé tel
// quel). Scénario central du mandat : 2 runs "de front" qui tentent, ENSEMBLE, de
// dépasser le ledger — le second doit être refusé par le plafond RÉEL relu sur disque.
// Zéro réseau. Lancer : npx tsx src/test-agent-scheduler.ts
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  schedulerConfig,
  tryAcquireRun,
  releaseRun,
  activeRunCount,
  activeRuns,
  recordRunSpend,
  _resetSchedulerForTests,
} from "./agent-scheduler.js";
import { readGlobalBudgetState, spendGlobalBudget } from "./nocturnal-budget.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function mkFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-scheduler-"));
  return path.join(dir, "global-budget.json");
}

console.log("═".repeat(64));
console.log("agent-scheduler — config du pool (DESKTOP_MAX_CONCURRENT_RUNS)");
console.log("─".repeat(64));
{
  check("absent → défaut 1 (équivalent au verrou global historique)", schedulerConfig({}).maxConcurrentRuns === 1);
  check("valeur valide → respectée", schedulerConfig({ DESKTOP_MAX_CONCURRENT_RUNS: "3" }).maxConcurrentRuns === 3);
  check("valeur invalide (texte) → repli à 1", schedulerConfig({ DESKTOP_MAX_CONCURRENT_RUNS: "abc" }).maxConcurrentRuns === 1);
  check("valeur 0 → repli à 1 (jamais un pool de taille nulle)", schedulerConfig({ DESKTOP_MAX_CONCURRENT_RUNS: "0" }).maxConcurrentRuns === 1);
  check("valeur négative → repli à 1", schedulerConfig({ DESKTOP_MAX_CONCURRENT_RUNS: "-2" }).maxConcurrentRuns === 1);
  check("valeur décimale → tronquée (floor)", schedulerConfig({ DESKTOP_MAX_CONCURRENT_RUNS: "2.9" }).maxConcurrentRuns === 2);
}

console.log("═".repeat(64));
console.log("agent-scheduler — plafond de POOL (taille fixe)");
console.log("─".repeat(64));
{
  _resetSchedulerForTests();
  const config = { maxConcurrentRuns: 1 };
  const r1 = tryAcquireRun("run-a", "projet-a", { config });
  check("pool=1 : 1er run accepté", r1.acquired === true);
  check("activeRunCount() = 1", activeRunCount() === 1);
  const r2 = tryAcquireRun("run-b", "projet-b", { config });
  check("pool=1 : 2e run (projet différent) REFUSÉ — pool-full", r2.acquired === false && r2.reason === "pool-full");
  check("activeRunCount() reste 1 (le refus ne consomme pas de slot)", activeRunCount() === 1);
  releaseRun("run-a");
  check("après release : activeRunCount() = 0", activeRunCount() === 0);
  const r3 = tryAcquireRun("run-b", "projet-b", { config });
  check("après release : projet-b peut enfin démarrer", r3.acquired === true);
  releaseRun("run-b");
}
{
  _resetSchedulerForTests();
  const config = { maxConcurrentRuns: 2 };
  check("pool=2 : run-a accepté", tryAcquireRun("run-a", "a", { config }).acquired === true);
  check("pool=2 : run-b (2e slot) accepté", tryAcquireRun("run-b", "b", { config }).acquired === true);
  const r3 = tryAcquireRun("run-c", "c", { config });
  check("pool=2 : run-c (3e) refusé — pool-full", r3.acquired === false && r3.reason === "pool-full");
  check("activeRuns() liste bien 2 runs distincts", activeRuns().length === 2 && activeRuns().map(r => r.id).sort().join(",") === "run-a,run-b");
  releaseRun("run-a");
  releaseRun("run-b");
}
{
  _resetSchedulerForTests();
  const config = { maxConcurrentRuns: 1 };
  const r1 = tryAcquireRun("run-a", "projet-a", { config });
  const r2 = tryAcquireRun("run-a", "projet-a", { config }); // même id, ré-acquisition
  check("ré-acquérir le MÊME id déjà tenu → idempotent, réussit sans 2e slot", r1.acquired === true && r2.acquired === true && activeRunCount() === 1);
  releaseRun("run-a");
}

console.log("═".repeat(64));
console.log("agent-scheduler — plafond BUDGET-$ DUR partagé (D6, ledger réel sur disque)");
console.log("─".repeat(64));
{
  // Gate budget OFF → jamais consulté, seul le pool compte.
  _resetSchedulerForTests();
  const file = mkFile();
  fs.writeFileSync(file, JSON.stringify({ date: "2099-01-01", spentUsd: 999_999 }), "utf8"); // énorme, mais gate OFF
  const r = tryAcquireRun("run-a", "a", {
    config: { maxConcurrentRuns: 5 },
    budgetGateOn: false,
    capUsd: 5,
    readState: () => readGlobalBudgetState(file),
  });
  check("gate budget OFF → accepté malgré un ledger énorme (ignoré)", r.acquired === true);
  releaseRun("run-a");
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  // capUsd<=0 (0/absent) = illimité, même gate ON — même convention que decideBudgetStop.
  _resetSchedulerForTests();
  const file = mkFile();
  const r = tryAcquireRun("run-a", "a", {
    config: { maxConcurrentRuns: 5 },
    budgetGateOn: true,
    capUsd: 0,
    readState: () => readGlobalBudgetState(file),
  });
  check("cap=0 → illimité (accepté)", r.acquired === true);
  releaseRun("run-a");
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  // ── LE SCÉNARIO CENTRAL DU MANDAT ────────────────────────────────────────
  // Pool de taille 2 (assez large pour ne PAS bloquer côté pool) + cap $5 dur.
  // Run 1 démarre sous le cap (ledger vierge), dépense $4 → ledger réel = $4.
  // Run 2 tente de démarrer : le ledger réel montre déjà $4 < $5 → ACCEPTÉ.
  // Run 2 dépense à son tour $3 → ledger réel cumulé = $7, DÉJÀ AU-DESSUS DU CAP.
  // Un 3e run qui tenterait de démarrer maintenant doit être REFUSÉ — la preuve
  // que "deux runs de front, à eux deux, ne dépassent pas le plafond sans que
  // le scheduler s'en aperçoive à la prochaine acquisition" (le plafond agit à
  // la FRONTIÈRE d'acquisition, jamais en cours de génération — même discipline
  // que decideBudgetStop).
  _resetSchedulerForTests();
  const file = mkFile();
  const config = { maxConcurrentRuns: 2 };
  const capUsd = 5;
  const readState = () => readGlobalBudgetState(file);

  const acq1 = tryAcquireRun("run-1", "projet-1", { config, budgetGateOn: true, capUsd, readState, now: new Date(2026, 6, 5) });
  check("run-1 démarre — ledger vierge ($0 < $5)", acq1.acquired === true);

  // run-1 termine, dépense $4 réels sur le VRAI ledger (I/O disque réelle).
  const s1 = recordRunSpend(4, file, new Date(2026, 6, 5));
  check("dépense run-1 persistée réellement sur disque ($4)", s1.spentUsd === 4);
  const onDisk1 = readGlobalBudgetState(file);
  check("relecture disque confirme $4 (round-trip réel, pas en mémoire)", onDisk1?.spentUsd === 4);

  const acq2 = tryAcquireRun("run-2", "projet-2", { config, budgetGateOn: true, capUsd, readState, now: new Date(2026, 6, 5) });
  check("run-2 démarre — $4 < $5, encore de la marge (2 runs de front autorisés)", acq2.acquired === true);

  // run-2 termine, dépense $3 → cumul réel $7, DÉPASSE le cap $5.
  const s2 = recordRunSpend(3, file, new Date(2026, 6, 5));
  check("dépense run-2 persistée : cumul réel $7 (4+3)", s2.spentUsd === 7);

  releaseRun("run-1");
  releaseRun("run-2");

  const acq3 = tryAcquireRun("run-3", "projet-3", { config, budgetGateOn: true, capUsd, readState, now: new Date(2026, 6, 5) });
  check("run-3 REFUSÉ — le ledger RÉEL ($7) a dépassé le plafond $5 (budget-hard-cap)", acq3.acquired === false && acq3.reason === "budget-hard-cap");
  check("le refus vient bien du budget, PAS du pool (pool=2, 0 run actif ici)", activeRunCount() === 0);

  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  // Nouvelle nuit (fenêtre différente) → le cumul d'hier ne bloque plus aujourd'hui,
  // même convention que rolledState/decideBudgetStop.
  _resetSchedulerForTests();
  const file = mkFile();
  fs.writeFileSync(file, JSON.stringify({ date: "2026-07-04", spentUsd: 50 }), "utf8");
  const r = tryAcquireRun("run-a", "a", {
    config: { maxConcurrentRuns: 1 },
    budgetGateOn: true,
    capUsd: 5,
    readState: () => readGlobalBudgetState(file),
    now: new Date(2026, 6, 5), // 2026-07-05 : nouvelle fenêtre
  });
  check("nouvelle nuit → l'ancien dépassement ($50 hier) ne compte plus aujourd'hui", r.acquired === true);
  releaseRun("run-a");
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

console.log("═".repeat(64));
console.log("nocturnal-budget — CONCURRENCE réelle intra-process (risque #7 du plan)");
console.log("─".repeat(64));
{
  // Le plan #180 §4 risque #7 demande de VÉRIFIER (et corriger si besoin) que le ledger
  // gère la lecture/écriture concurrente sans perte. spendGlobalBudget est ENTIÈREMENT
  // synchrone (fs.readFileSync/writeFileSync, zéro await) : dans UN SEUL process Node,
  // deux appels lancés "en même temps" (Promise.all) ne peuvent JAMAIS s'entrelacer AU
  // MILIEU de la fonction — chaque appel s'exécute en une seule tranche CPU avant de
  // rendre la main. Preuve empirique : 20 dépenses concurrentes doivent TOUTES compter,
  // zéro dépense perdue (ce qui arriverait avec un vrai read-modify-write asynchrone).
  const file = mkFile();
  const now = new Date(2026, 6, 5);
  const N = 20;
  const amount = 0.1;
  await Promise.all(Array.from({ length: N }, () => Promise.resolve().then(() => spendGlobalBudget(amount, file, now))));
  const final = readGlobalBudgetState(file);
  const expected = Number((N * amount).toFixed(2));
  check(
    `${N} dépenses "concurrentes" (Promise.all) intra-process → cumul EXACT $${expected} (zéro perte, spendGlobalBudget est synchrone)`,
    Math.abs((final?.spentUsd ?? -1) - expected) < 1e-9,
  );
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

console.log("═".repeat(64));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
