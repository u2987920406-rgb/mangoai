// Tests déterministes des 2 derniers 🔴 de la revue globale 2026-07-03 :
//   1. Branchement Bus/QA de la boucle nocturne (NOCTURNAL_QA_BUS)
//      → planNocturnalQaEmission() (nocturnal.ts) : décide QUOI publier.
//   2. Budget-$ DUR global partagé Phase 0/1/2 (NOCTURNAL_BUDGET_HARD)
//      → nocturnal-budget.ts : decideBudgetStop / recordSpend / ledger fichier.
// Fichiers temp injectés, deps injectées → zéro I/O réel sur le vrai workspace,
// zéro réseau. Lancer : npx tsx src/test-nocturnal-budget-qa.ts
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  decideBudgetStop,
  recordSpend,
  rolledState,
  localDateStr,
  readGlobalBudgetState,
  writeGlobalBudgetState,
  spendGlobalBudget,
  type GlobalBudgetState,
} from "../nocturnal-budget.js";
import { planNocturnalQaEmission } from "../nocturnal.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function mkFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nocturnal-budget-"));
  return path.join(dir, "global-budget.json");
}

// ── A. localDateStr / rolledState — fenêtre = la nuit ────────────────────────
console.log("═".repeat(56));
console.log("nocturnal-budget — fenêtre (date locale) et rollover");
console.log("─".repeat(56));
{
  check("localDateStr → format YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(localDateStr(new Date(2026, 6, 3))));
  check("localDateStr → 2026-07-03 (mois 0-indexé + padding)", localDateStr(new Date(2026, 6, 3)) === "2026-07-03");
}
{
  const r = rolledState(null, "2026-07-03");
  check("rolledState(null) → état neuf $0", r.date === "2026-07-03" && r.spentUsd === 0);
}
{
  const r = rolledState({ date: "2026-07-03", spentUsd: 4.2 }, "2026-07-03");
  check("rolledState — même jour → état conservé tel quel", r.spentUsd === 4.2);
}
{
  const r = rolledState({ date: "2026-07-02", spentUsd: 99 }, "2026-07-03");
  check("rolledState — nouvelle nuit → repart à $0 (même gros cumul hier)", r.date === "2026-07-03" && r.spentUsd === 0);
}

// ── B. recordSpend — cumul IMMUTABLE ─────────────────────────────────────────
console.log("═".repeat(56));
console.log("nocturnal-budget — recordSpend (pur, immutable)");
console.log("─".repeat(56));
{
  const a: GlobalBudgetState = { date: "2026-07-03", spentUsd: 1 };
  const b = recordSpend(a, "2026-07-03", 0.5);
  check("recordSpend — cumule", b.spentUsd === 1.5);
  check("recordSpend — ne MUTE PAS l'état d'entrée", a.spentUsd === 1);
}
{
  const b = recordSpend(null, "2026-07-03", 2);
  check("recordSpend — état absent → part de $0", b.spentUsd === 2);
}
{
  const b = recordSpend({ date: "2026-07-02", spentUsd: 50 }, "2026-07-03", 1);
  check("recordSpend — nouvelle nuit → ignore l'ancien cumul", b.spentUsd === 1 && b.date === "2026-07-03");
}
{
  const b = recordSpend({ date: "2026-07-03", spentUsd: 1 }, "2026-07-03", -5);
  check("recordSpend — coût négatif ignoré (jamais de cumul négatif)", b.spentUsd === 1);
}
{
  const b = recordSpend({ date: "2026-07-03", spentUsd: 1 }, "2026-07-03", NaN);
  check("recordSpend — coût non-fini ignoré", b.spentUsd === 1);
}

// ── C. decideBudgetStop — les scénarios du mandat ────────────────────────────
console.log("═".repeat(56));
console.log("nocturnal-budget — decideBudgetStop (frontière d'itération)");
console.log("─".repeat(56));

// (a) gate OFF → jamais, ET readState n'est PAS appelé (0 I/O, byte-identique)
{
  let reads = 0;
  const decision = decideBudgetStop(false, 5, "2026-07-03", () => { reads++; return { date: "2026-07-03", spentUsd: 999 }; });
  check("(a) gate OFF → stop:false (cumul énorme ignoré)", decision.stop === false);
  check("(a) gate OFF → readState JAMAIS appelé (0 I/O)", reads === 0);
}
// (b) gate ON + capUsd <= 0 (0 ou négatif) → illimité, readState pas nécessaire
{
  let reads = 0;
  const decision = decideBudgetStop(true, 0, "2026-07-03", () => { reads++; return { date: "2026-07-03", spentUsd: 999 }; });
  check("(b) gate ON + cap=0 → illimité (stop:false)", decision.stop === false);
  check("(b) cap<=0 → readState pas appelé non plus", reads === 0);
}
{
  const decision = decideBudgetStop(true, -3, "2026-07-03", () => ({ date: "2026-07-03", spentUsd: 5 }));
  check("(b') cap négatif → traité comme illimité", decision.stop === false);
}
// (c) gate ON + cap>0 + état absent (null) → repart de $0 → continue
{
  const decision = decideBudgetStop(true, 5, "2026-07-03", () => null);
  check("(c) gate ON + état absent → stop:false (repart de $0)", decision.stop === false && decision.spentUsd === 0);
}
// (d) gate ON + cumul < cap → continue
{
  let reads = 0;
  const decision = decideBudgetStop(true, 5, "2026-07-03", () => { reads++; return { date: "2026-07-03", spentUsd: 3 }; });
  check("(d) cumul $3 < plafond $5 → stop:false", decision.stop === false);
  check("(d) → readState appelé exactement 1×", reads === 1);
}
// (e) gate ON + cumul >= cap → ARRÊT, raison lisible
{
  const decision = decideBudgetStop(true, 5, "2026-07-03", () => ({ date: "2026-07-03", spentUsd: 5.4 }));
  check("(e) cumul $5.40 ≥ plafond $5 → stop:true", decision.stop === true);
  check("(e) → raison mentionne le cumul et le plafond", (decision.reason ?? "").includes("5.40") && (decision.reason ?? "").includes("5.00"));
  check("(e) → spentUsd/capUsd propagés", decision.spentUsd === 5.4 && decision.capUsd === 5);
}
// (f) gate ON + cumul HIER dépassait le plafond, mais NOUVELLE NUIT → continue
{
  const decision = decideBudgetStop(true, 5, "2026-07-03", () => ({ date: "2026-07-02", spentUsd: 50 }));
  check("(f) fenêtre = nouvelle nuit → l'ancien dépassement ne compte plus", decision.stop === false);
}
// (g) égalité exacte cumul === cap → ARRÊT (>=)
{
  const decision = decideBudgetStop(true, 5, "2026-07-03", () => ({ date: "2026-07-03", spentUsd: 5 }));
  check("(g) cumul == plafond → stop:true (>=)", decision.stop === true);
}

// ── D. Ledger fichier (I/O réelle, fichier temp) ─────────────────────────────
console.log("═".repeat(56));
console.log("nocturnal-budget — ledger persisté (I/O fail-open + atomique)");
console.log("─".repeat(56));
{
  const file = mkFile();
  const r = readGlobalBudgetState(file);
  check("fichier absent → readGlobalBudgetState fail-open (null)", r === null);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  const file = mkFile();
  fs.writeFileSync(file, "{ pas du JSON", "utf8");
  const r = readGlobalBudgetState(file);
  check("JSON corrompu → fail-open (null), pas de throw", r === null);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  const file = mkFile();
  fs.writeFileSync(file, JSON.stringify({ date: "2026-07-03", spentUsd: "beaucoup" }), "utf8");
  const r = readGlobalBudgetState(file);
  check("spentUsd non-numérique → invalide → null", r === null);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  const file = mkFile();
  writeGlobalBudgetState({ date: "2026-07-03", spentUsd: 2.5 }, file);
  const r = readGlobalBudgetState(file);
  check("write puis read → round-trip fidèle", r?.date === "2026-07-03" && r?.spentUsd === 2.5);
  check("écriture atomique → pas de .tmp résiduel", !fs.existsSync(`${file}.tmp`));
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  const file = mkFile();
  const now = new Date(2026, 6, 3);
  const s1 = spendGlobalBudget(1.2, file, now);
  check("spendGlobalBudget — 1ère dépense sur ledger vierge", s1.spentUsd === 1.2);
  const s2 = spendGlobalBudget(0.8, file, now);
  check("spendGlobalBudget — cumule à travers deux appels (simule 2 process)", s2.spentUsd === 2.0);
  const onDisk = readGlobalBudgetState(file);
  check("spendGlobalBudget — persiste réellement (relu identique)", Math.abs((onDisk?.spentUsd ?? -1) - 2.0) < 1e-9);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
{
  // Nouvelle nuit : le ledger d'hier ne doit pas polluer aujourd'hui.
  const file = mkFile();
  writeGlobalBudgetState({ date: "2026-07-02", spentUsd: 40 }, file);
  const today = spendGlobalBudget(1, file, new Date(2026, 6, 3));
  check("spendGlobalBudget — nouvelle nuit → repart de $0 (+1)", today.spentUsd === 1 && today.date === "2026-07-03");
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}

// ── E. planNocturnalQaEmission — branchement Bus/QA (NOCTURNAL_QA_BUS) ───────
console.log("═".repeat(56));
console.log("nocturnal — planNocturnalQaEmission (gate NOCTURNAL_QA_BUS)");
console.log("─".repeat(56));

const okOutcome = { project: "nuit-abc-1", ok: true, costUsd: 0.42, numTurns: 7, durationMs: 120_000, changedFiles: ["src/App.tsx", "src/index.css"] };
const koOutcome = { project: "nuit-abc-2", ok: false, costUsd: 0.10, numTurns: 3, durationMs: 30_000, changedFiles: [] };

{
  const plan = planNocturnalQaEmission(false, okOutcome);
  check("gate OFF → null (0 émission, comportement historique)", plan === null);
}
{
  const plan = planNocturnalQaEmission(true, okOutcome);
  check("gate ON + succès → plan non null", plan !== null);
  check("→ chatTurn.project = nom du projet nocturne", plan?.chatTurn.project === "nuit-abc-1");
  check("→ chatTurn.mode = 'nocturne'", plan?.chatTurn.mode === "nocturne");
  check("→ chatTurn.ok reflète le succès", plan?.chatTurn.ok === true);
  check("→ chatTurn.costUsd/numTurns/durationMs = mêmes noms de champs que ChatTurnOutcome (Disjoncteur)", plan?.chatTurn.costUsd === 0.42 && plan?.chatTurn.numTurns === 7 && plan?.chatTurn.durationMs === 120_000);
  check("→ succès : pas de champ error", plan?.chatTurn.error === undefined);
  check("→ phaseComplete.projectName = nom du projet", plan?.phaseComplete.projectName === "nuit-abc-1");
  check("→ phaseComplete.phase = 'nocturne'", plan?.phaseComplete.phase === "nocturne");
  check("→ phaseComplete.changedFiles propagés (Write/Edit du tour)", (plan?.phaseComplete.changedFiles ?? []).length === 2);
}
{
  const plan = planNocturnalQaEmission(true, koOutcome);
  check("gate ON + échec → plan non null (audit demandé même sur build cassé)", plan !== null);
  check("→ chatTurn.ok = false", plan?.chatTurn.ok === false);
  check("→ échec : champ error renseigné (le Disjoncteur voit l'échec)", typeof plan?.chatTurn.error === "string" && (plan?.chatTurn.error?.length ?? 0) > 0);
}

console.log("═".repeat(56));
if (fail === 0) console.log(`✅ All ${pass}/${pass} checks passed.`);
else { console.log(`❌ ${fail} échec(s) (${pass} ok).`); process.exit(1); }
