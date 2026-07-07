// Tests du disjoncteur de la forge auto (#168 tranche 2) — PUR, aucune I/O, aucun LLM.
import {
  autoForgeConfig, newAutoForgeState, canAutoForge, recordAutoForge,
  OPUS_FORGE_EST_USD, resolveGapBlockers, isTransientBlocker, DEFAULT_GAP_BLOCKERS,
  type AutoForgeConfig,
} from "./self-evolution-autoforge.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const cfg = (o: Partial<AutoForgeConfig> = {}): AutoForgeConfig => ({
  enabled: true, maxForgesPerRun: 1, opusBudgetUsd: 0.5, maxAgentsTotal: 24, ...o,
});

console.log("[1] autoForgeConfig — défauts sûrs (OFF) + parsing env");
{
  const def = autoForgeConfig({});
  check("gate OFF par défaut", def.enabled === false);
  check("plafond forges défaut = 1", def.maxForgesPerRun === 1);
  check("budget Opus défaut = 0.5", def.opusBudgetUsd === 0.5);

  check("plafond global agents défaut = 24", def.maxAgentsTotal === 24);

  const on = autoForgeConfig({ SELF_EVOLVE_AUTO: "on", SELF_EVOLVE_MAX_FORGES: "3", SELF_EVOLVE_OPUS_BUDGET_USD: "1.25", SELF_EVOLVE_MAX_AGENTS_TOTAL: "40" });
  check("SELF_EVOLVE_AUTO=on → enabled", on.enabled === true);
  check("max forges lu", on.maxForgesPerRun === 3);
  check("budget lu", on.opusBudgetUsd === 1.25);
  check("plafond global agents lu", on.maxAgentsTotal === 40);

  const bad = autoForgeConfig({ SELF_EVOLVE_AUTO: "on", SELF_EVOLVE_MAX_FORGES: "-9", SELF_EVOLVE_OPUS_BUDGET_USD: "abc" });
  check("valeurs invalides → repli défaut", bad.maxForgesPerRun === 1 && bad.opusBudgetUsd === 0.5);
}

console.log("\n[2] canAutoForge — le disjoncteur (gate OFF interdit)");
{
  const d = canAutoForge(cfg({ enabled: false }), newAutoForgeState());
  check("gate OFF → refus + raison validation humaine", !d.allow && /validation humaine/.test(d.reason));
}

console.log("\n[3] canAutoForge — plafond de forges par run");
{
  const c = cfg({ maxForgesPerRun: 2 });
  check("0 forge → autorisé", canAutoForge(c, { forges: 0, spentUsd: 0 }).allow);
  check("1 forge → encore autorisé", canAutoForge(c, { forges: 1, spentUsd: 0 }).allow);
  const d = canAutoForge(c, { forges: 2, spentUsd: 0 });
  check("2 forges (=plafond) → refus", !d.allow && /plafond de 2/.test(d.reason));
  check("plafond 0 → refus", !canAutoForge(cfg({ maxForgesPerRun: 0 }), newAutoForgeState()).allow);
}

console.log("\n[4] canAutoForge — garde-coût Opus");
{
  const c = cfg({ opusBudgetUsd: 0.2 });
  check("sous le budget → autorisé", canAutoForge(c, { forges: 0, spentUsd: 0 }, 0.12).allow);
  const d = canAutoForge(c, { forges: 0, spentUsd: 0.12 }, 0.12); // 0.24 > 0.20
  check("dépasserait le budget → refus + raison garde-coût", !d.allow && /garde-coût Opus/.test(d.reason));
}

console.log("\n[5] recordAutoForge — comptabilité immuable");
{
  const s0 = newAutoForgeState();
  const s1 = recordAutoForge(s0, 0.1);
  check("état de départ inchangé (immutable)", s0.forges === 0 && s0.spentUsd === 0);
  check("forge comptée + coût cumulé", s1.forges === 1 && Math.abs(s1.spentUsd - 0.1) < 1e-9);
  const s2 = recordAutoForge(s1); // coût par défaut
  check("2ᵉ forge + coût défaut ajouté", s2.forges === 2 && Math.abs(s2.spentUsd - (0.1 + OPUS_FORGE_EST_USD)) < 1e-9);
  const s3 = recordAutoForge(s2, -5); // coût invalide → défaut
  check("coût invalide → repli sur estimation", Math.abs(s3.spentUsd - (s2.spentUsd + OPUS_FORGE_EST_USD)) < 1e-9);
}

console.log("\n[6] scénario complet — 2 forges autorisées puis disjoncteur");
{
  const c = cfg({ maxForgesPerRun: 2, opusBudgetUsd: 1 });
  let s = newAutoForgeState();
  check("forge #1 autorisée", canAutoForge(c, s).allow);
  s = recordAutoForge(s, 0.12);
  check("forge #2 autorisée", canAutoForge(c, s).allow);
  s = recordAutoForge(s, 0.12);
  check("forge #3 refusée (plafond)", !canAutoForge(c, s).allow);
}

console.log("\n[6b] canAutoForge — plafond GLOBAL cross-run du nombre d'agents (revue Fable #2)");
{
  const c = cfg({ maxAgentsTotal: 24 });
  check("23 agents existants → encore autorisé", canAutoForge(c, newAutoForgeState(), OPUS_FORGE_EST_USD, 23).allow);
  const d = canAutoForge(c, newAutoForgeState(), OPUS_FORGE_EST_USD, 24);
  check("24 agents existants (=plafond) → refus + raison plafond global", !d.allow && /plafond GLOBAL/.test(d.reason));
  check("plafond global à 0 → désactivé (pas de refus sur ce critère)", canAutoForge(cfg({ maxAgentsTotal: 0 }), newAutoForgeState(), OPUS_FORGE_EST_USD, 999).allow);
  check("sans argument (défaut 0 existants) → autorisé", canAutoForge(c, newAutoForgeState()).allow);
}

console.log("\n[7] resolveGapBlockers — trigger pilotable (#168 tranche 3)");
{
  const def = resolveGapBlockers({});
  check("défaut = les classes par défaut (dont repetitive-failure)", def.has("repetitive-failure") && def.size === DEFAULT_GAP_BLOCKERS.length);
  check("défaut contient les 4 classes historiques", def.has("plateau-iterations") && def.has("wandering") && def.has("knowledge-gap") && def.has("wrong-tool"));
  const custom = resolveGapBlockers({ SELF_EVOLVE_BLOCKERS: "plateau-iterations, wandering ,design-gap" });
  check("CSV custom → parse + trim des espaces", custom.size === 3 && custom.has("design-gap") && custom.has("wandering"));
  check("vide/espaces → repli sur le défaut", resolveGapBlockers({ SELF_EVOLVE_BLOCKERS: "   " }).size === DEFAULT_GAP_BLOCKERS.length);
}

console.log("\n[8] isTransientBlocker — filtre des faux blocages réseau (#168 tranche 3)");
{
  check("fetch failed → transitoire", isTransientBlocker("moteur agentique : fetch failed"));
  check("ECONNRESET → transitoire", isTransientBlocker("Error: read ECONNRESET"));
  check("socket hang up → transitoire", isTransientBlocker("socket hang up"));
  check("plafond d'itérations normal → PAS transitoire", !isTransientBlocker("iterations=24/24 tâche trop large"));
  check("erreur de code normale → PAS transitoire", !isTransientBlocker("SyntaxError: Unexpected token"));
  check("vide → PAS transitoire", !isTransientBlocker(""));
}

console.log(`\n=== self-evolution-autoforge : ${pass} ✓ / ${fail} ✗ ===`);
if (fail > 0) process.exit(1);
