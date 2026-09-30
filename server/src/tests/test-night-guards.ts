// night-guards : autorité d'arrêt du Disjoncteur ARMÉE par défaut, fail-open sur verdict périmé/absent.
import assert from "node:assert/strict";
import { flag } from "../flags.js";
import { freshBreakerVerdict, BREAKER_VERDICT_MAX_AGE_MS } from "../mangoqa.js";
import { warnIfBusSilent, resetBusSilenceWarning } from "../night-guards.js";
import { readPerimeterFlags } from "../perimeter.js";
import { decideBreakerStop } from "../nocturnal.js";
import { finiteBudgetUsd, DEFAULT_NIGHT_BUDGET_USD } from "../nocturnal-budget.js";

delete process.env.MANGOQA_STOP_AUTHORITY;
assert.equal(flag("MANGOQA_STOP_AUTHORITY"), true, "autorité d'arrêt armée par défaut");

const now = 1_000_000_000;
const unsafe = (evaluatedAt: number) => () => ({ available: true as const, safe: false, evaluatedAt, trips: [{ breaker: "cost-guard", action: "halt-spend", reason: "5.60$ > 5$" }] });

// verdict frais safe:false → ARRÊT
const fresh = decideBreakerStop(true, () => freshBreakerVerdict(unsafe(now - 5_000), now));
assert.equal(fresh.stop, true);
assert.match(fresh.reason ?? "", /cost-guard/);
// verdict périmé (MangoQA mort) → fail-open, pas de blocage éternel
const stale = decideBreakerStop(true, () => freshBreakerVerdict(unsafe(now - BREAKER_VERDICT_MAX_AGE_MS - 1), now));
assert.equal(stale.stop, false, "un safe:false figé depuis > 10 min ne bloque pas");
// absent → fail-open
assert.equal(decideBreakerStop(true, () => freshBreakerVerdict(() => ({ available: false, reason: "absent" }), now)).stop, false);
// désarmement explicite → verdict jamais lu
let read = 0;
assert.equal(decideBreakerStop(false, () => { read++; return freshBreakerVerdict(unsafe(now), now); }).stop, false);
assert.equal(read, 0);

// budgets à valeur propre : jamais 0
for (const raw of [undefined, "", "0", "x"]) assert.equal(finiteBudgetUsd(raw), DEFAULT_NIGHT_BUDGET_USD);
assert.equal(finiteBudgetUsd("3"), 3);
// Audit dormant #3 : les 3 garde-fous exigés par le périmètre autonome sont désormais armés d'emblée
for (const k of ["MANGOQA_STOP_AUTHORITY", "NOCTURNAL_BUDGET_HARD", "NOCTURNAL_QA_BUS"]) delete process.env[k];
assert.deepEqual(readPerimeterFlags(), { stopAuthority: true, budgetHard: true, qaBus: true });

// Bus silencieux : alerte une fois, jamais un arrêt
resetBusSilenceWarning();
const msgs: string[] = [];
const silent = { available: true as const, safe: true, trips: [], evaluatedAt: now, busStale: true, busAgeMs: 4 * 3600_000 };
assert.equal(warnIfBusSilent(silent, (m) => msgs.push(m)), true);
assert.equal(warnIfBusSilent(silent, (m) => msgs.push(m)), false, "une seule fois");
assert.match(msgs[0], /BUS SILENCIEUX depuis 240 min/);
assert.equal(decideBreakerStop(true, () => silent).stop, false, "un Bus muet n'arrête pas la nuit");
resetBusSilenceWarning();
assert.equal(warnIfBusSilent({ ...silent, busStale: false }, () => {}), false);
console.log("✓ test-night-guards");
