// Tests C3 (2026-07-03) — mécanisme d'ensemble/vote (brain-ensemble.ts).
// 100 % pur : membres FACTICES (closures), zéro réseau. Prouve : vote majoritaire,
// pas-de-consensus → dégradé, membres échoués ignorés, mode juge (arbitrage +
// seuil de 2 avis), ensemble vide, un membre qui lève → dégradé sans propager.
import { deliberate, type EnsembleMember, type EnsembleOptions } from "../brain/brain-ensemble.js";
import type { AgentResult } from "../agent/agent-contract.js";
import type { AgentId } from "../brain/brain-registry.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const JUGE = "juge" as AgentId;
function res(status: AgentResult["status"], summary: string, data: Record<string, unknown> = {}): AgentResult {
  return { status, agent: JUGE, summary, data, confidence: status === "ok" ? 0.9 : 0, durationMs: 1 };
}
const member = (r: AgentResult): EnsembleMember => async () => r;

async function run() {
  console.log("─".repeat(60));
  console.log("test-brain-ensemble (C3)");
  console.log("─".repeat(60));

  console.log("\n[1] Majorité — clé la plus votée gagne (défaut keyFn = status)");
  {
    // 2 "ok" + 1 "error" (l'error ne vote pas car non-valide) → clé "ok" majoritaire.
    const r = await deliberate(JUGE, [member(res("ok", "A")), member(res("ok", "B")), member(res("error", "boom"))], { aggregator: "majority" });
    check("consensus atteint → status ok", r.status === "ok");
    check("annotation ensemble présente", (r.data as { ensemble?: { agree: number } }).ensemble?.agree === 2);
  }

  console.log("\n[2] Majorité — vote sur une clé métier (keyFn numérique bucketé)");
  {
    // couverture parsée puis bucketée : deux ≥80 (haut), un <80 (bas) → "haut" gagne.
    const bucket = (r: AgentResult) => (parseInt(r.summary.replace(/\D+/g, ""), 10) >= 80 ? "haut" : "bas");
    const opts: EnsembleOptions = { aggregator: "majority", keyFn: bucket };
    const r = await deliberate(JUGE, [member(res("ok", "couverture 90")), member(res("ok", "couverture 85")), member(res("ok", "couverture 30"))], opts);
    check("clé métier majoritaire (haut) gagne", (r.data as { ensemble?: { key: string } }).ensemble?.key === "haut");
  }

  console.log("\n[3] Majorité — pas de consensus → dégradé (l'appelant gardera son repli)");
  {
    const opts: EnsembleOptions = { aggregator: "majority", keyFn: (r) => r.summary, minAgree: 2 };
    const r = await deliberate(JUGE, [member(res("ok", "A")), member(res("ok", "B")), member(res("ok", "C"))], opts);
    check("3 avis divergents, seuil 2 → dégradé", r.status === "error" && /pas de consensus/.test(r.summary));
    check("les avis sont joints (diagnostic)", Array.isArray((r.data as { avis?: unknown }).avis));
  }

  console.log("\n[4] Membres échoués ignorés dans le vote");
  {
    // 1 ok + 2 timeouts → un seul votant, minAgree = floor(1/2)+1 = 1 → l'unique ok gagne.
    const r = await deliberate(JUGE, [member(res("ok", "seul valide")), member(res("timeout", "t1")), member(res("error", "e1"))], { aggregator: "majority" });
    check("les invalides ne votent pas ; l'unique valide tranche", r.status === "ok" && r.summary === "seul valide");
  }

  console.log("\n[5] Mode juge — arbitrage sur >= 2 avis valides");
  {
    let recu = 0;
    const opts: EnsembleOptions = {
      aggregator: "judge",
      judge: async (valides) => { recu = valides.length; return res("ok", `arbitré depuis ${valides.length} avis`); },
    };
    const r = await deliberate(JUGE, [member(res("ok", "A")), member(res("ok", "B")), member(res("error", "x"))], opts);
    check("l'arbitre reçoit les 2 avis VALIDES", recu === 2);
    check("verdict de l'arbitre renvoyé", r.status === "ok" && /arbitré depuis 2/.test(r.summary));
  }

  console.log("\n[6] Mode juge — < 2 avis valides → dégradé (arbitrage impossible)");
  {
    const opts: EnsembleOptions = { aggregator: "judge", judge: async () => res("ok", "ne devrait pas être appelé") };
    const r = await deliberate(JUGE, [member(res("ok", "seul")), member(res("timeout", "t"))], opts);
    check("1 seul avis valide → dégradé, arbitre non appelé", r.status === "error" && /arbitrage impossible/.test(r.summary));
  }

  console.log("\n[7] Robustesse — ensemble vide + membre qui LÈVE");
  {
    const vide = await deliberate(JUGE, [], { aggregator: "majority" });
    check("ensemble vide → dégradé (jamais de crash)", vide.status === "error" && /vide/.test(vide.summary));
    const throwMember: EnsembleMember = async () => { throw new Error("boom interne"); };
    const r = await deliberate(JUGE, [member(res("ok", "ok")), throwMember], { aggregator: "majority" });
    check("un membre qui lève est absorbé (pas de propagation)", r.status === "ok");
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-ensemble : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

void run();
