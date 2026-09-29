// D1 (audit 2026-09-28, B4) — LA LECTURE du compteur de consommation.
//
// Defaut vise : `startLLMRun` ouvrait bien un compteur, `recordLLMUsage` l'alimentait,
// mais AUCUN code de production n'appelait `getLLMRun()` — seulement les tests. La
// consommation etait donc comptee et jamais montree : B4, "structurellement non
// mesurable". Ce test prouve que la lecture existe et qu'elle remonte bien le detail
// par modele (prealable a D6, qui doit comparer un AVANT/APRES par modele).
//
// Execution : npx tsx src/tests/test-consommation-lue.ts
// Deterministe, ZERO reseau.
import { startLLMRun, resetLLMUsage, recordLLMUsage } from "../llm/llm-usage.js";
import { journaliserConsommation } from "../eleve/relay.js";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  X ${name}`);
  }
}

async function run(): Promise<void> {
  // ── [A] un build vide ne pollue pas le fil (bruit zero) ─────────────────────
  resetLLMUsage();
  startLLMRun("build vide");
  const vides: string[] = [];
  journaliserConsommation((s) => vides.push(s));
  check("run sans appel : aucune ligne poussee (pas de bruit)", vides.length === 0);

  // ── [B] un build mesure pousse UNE ligne, avec le detail par modele ─────────
  resetLLMUsage();
  startLLMRun("build mesure");
  recordLLMUsage({ usage: { prompt_tokens: 1000, completion_tokens: 250, total_tokens: 1250 } }, { model: "deepseek-v4.1-flash" });
  recordLLMUsage({ usage: { prompt_tokens: 400, completion_tokens: 100, total_tokens: 500 } }, { model: "opus-5-5" });
  const lignes: string[] = [];
  journaliserConsommation((s) => lignes.push(s));
  check("un appel mesure : exactement une ligne", lignes.length === 1);
  const ligne = lignes[0] ?? "";
  check("la ligne porte le total cumule (1750)", ligne.includes("1750"));
  check("la ligne porte le nombre d'appels (2)", ligne.includes("2 appel"));
  check("la ligne porte le detail par modele", ligne.includes("deepseek-v4.1-flash") && ligne.includes("opus-5-5"));
  check("le detail distingue les deux modeles (pas un total muet)", new Set(ligne.match(/\d+ jt\/\d+ appel/g) ?? []).size === 2);

  // ── [C] l'honnetete est preservee : les appels sans usage sont SIGNALES ─────
  resetLLMUsage();
  startLLMRun("build partiellement muet");
  recordLLMUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }, { model: "m" });
  recordLLMUsage(undefined, { model: "muet" });
  const honnetes: string[] = [];
  journaliserConsommation((s) => honnetes.push(s));
  check("appel non mesure : signale explicitement", (honnetes[0] ?? "").includes("non mesur"));

  // ── [D] la lecture est IDEMPOTENTE par construction : ne leve jamais ───────
  resetLLMUsage();
  let aLeve = false;
  try {
    journaliserConsommation(() => {
      throw new Error("push casse");
    });
  } catch {
    aLeve = true;
  }
  check("un push defaillant ne fait jamais remonter d'exception", !aLeve);

  console.log(`\n${fail === 0 ? "OK" : "ECHEC"} consommation lue (D1/B4) : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
})
