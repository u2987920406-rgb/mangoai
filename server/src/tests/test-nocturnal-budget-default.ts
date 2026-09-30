// Plafond $ nocturne : ARMÉ par défaut avec valeur FINIE (audit dormant 2026-09-30 : aucun frein monétaire).
import assert from "node:assert/strict";
import { flag } from "../flags.js";
import { DEFAULT_NIGHT_BUDGET_USD, globalBudgetCapUsd, decideBudgetStop } from "../nocturnal-budget.js";

delete process.env.NOCTURNAL_BUDGET_HARD;
assert.equal(flag("NOCTURNAL_BUDGET_HARD"), true, "armé par défaut");
process.env.NOCTURNAL_BUDGET_HARD = "off";
assert.equal(flag("NOCTURNAL_BUDGET_HARD"), false, "désarmement explicite possible");
// une ligne vide (`X=` copiée de .env.example) ne doit pas désarmer en silence
process.env.NOCTURNAL_BUDGET_HARD = "";
assert.equal(flag("NOCTURNAL_BUDGET_HARD"), true, "valeur vide = défaut (armé)");
delete process.env.NOCTURNAL_BUDGET_HARD;

for (const raw of [undefined, "", "0", "-3", "abc", "NaN"]) {
  assert.equal(globalBudgetCapUsd({ NOCTURNAL_GLOBAL_BUDGET_USD: raw } as NodeJS.ProcessEnv), DEFAULT_NIGHT_BUDGET_USD, `plafond fini pour ${String(raw)}`);
}
assert.ok(DEFAULT_NIGHT_BUDGET_USD > 0 && Number.isFinite(DEFAULT_NIGHT_BUDGET_USD));
assert.equal(globalBudgetCapUsd({ NOCTURNAL_GLOBAL_BUDGET_USD: "7.5" } as NodeJS.ProcessEnv), 7.5);

const today = "2026-09-30";
const over = decideBudgetStop(flag("NOCTURNAL_BUDGET_HARD"), globalBudgetCapUsd({} as NodeJS.ProcessEnv), today, () => ({ date: today, spentUsd: 25 }));
assert.equal(over.stop, true, "dépasse le plafond par défaut → arrêt");
const under = decideBudgetStop(true, DEFAULT_NIGHT_BUDGET_USD, today, () => ({ date: today, spentUsd: 1 }));
assert.equal(under.stop, false);
console.log("✓ test-nocturnal-budget-default");
