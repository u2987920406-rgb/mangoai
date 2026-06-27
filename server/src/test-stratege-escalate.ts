// Tests de l'échelle d'escalade de l'exécutant (stratege-escalate.ts) — Phase 4.
// PUR, déterministe : env injectée, aucun réseau.
import {
  executorLadder, nextExecutorRung, isBrainInadequate, brainEscalationNudge, formatExecutorEscalation,
} from "./stratege-escalate.js";
import { newStrategeState, commitRemedy } from "./stratege.js";
import type { Diagnosis, BlockerClass } from "./stratege-signals.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
const diag = (blocker: BlockerClass, detail?: string): Diagnosis => ({ blocker, cause: "c", evidence: "e", remedy: "r", detail });
const CURRENT = { model: "glm-5.2:cloud", provider: "openai" as const };

console.log("[1] executorLadder — barreau supérieur configurable");
{
  const noSup = executorLadder(CURRENT, {});
  check("sans env supérieur → 1 seul barreau (courant)", noSup.length === 1 && noSup[0].tier === 0);

  const withSup = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: "gemma4:31b-cloud" });
  check("avec modèle supérieur → 2 barreaux", withSup.length === 2 && withSup[1].tier === 1);
  check("barreau 1 = modèle configuré", withSup[1].model === "gemma4:31b-cloud");
  check("provider défaut = ollama", withSup[1].provider === "ollama");

  const prov = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: "big", STRATEGE_EXEC_ESCALATE_PROVIDER: "openai" });
  check("provider respecté si fourni", prov[1].provider === "openai");
  const badProv = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: "big", STRATEGE_EXEC_ESCALATE_PROVIDER: "bogus" });
  check("provider invalide → repli ollama", badProv[1].provider === "ollama");

  const same = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: CURRENT.model });
  check("supérieur identique au courant → ignoré (1 barreau)", same.length === 1);
}

console.log("\n[2] nextExecutorRung — borné, jamais de descente");
{
  const ladder = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: "big" });
  const up = nextExecutorRung(ladder, 0);
  check("depuis barreau 0 → barreau 1", up?.tier === 1);
  check("depuis le sommet (1) → null (rend la main)", nextExecutorRung(ladder, 1) === null);
  check("échelle d'un seul barreau → jamais de montée", nextExecutorRung(executorLadder(CURRENT, {}), 0) === null);
}

console.log("\n[3] isBrainInadequate — récidive après remède déjà tenté");
{
  const st = newStrategeState();
  const kg = diag("knowledge-gap");
  check("1re occurrence (pas encore tentée) → false", isBrainInadequate(kg, st) === false);
  commitRemedy(kg, st); // le Stratège a tenté son remède
  check("récidive (remède déjà tenté) → true", isBrainInadequate(kg, st) === true);
  check("autre classe non tentée → false", isBrainInadequate(diag("wandering"), st) === false);
  check("blocage none → jamais inadéquat", isBrainInadequate(diag("none"), st) === false);

  // discrimination par detail : missing-dependency:gsap tenté ≠ :three
  const st2 = newStrategeState();
  commitRemedy(diag("missing-dependency", "gsap"), st2);
  check("même classe, detail différent → false (pas la même clé)", isBrainInadequate(diag("missing-dependency", "three"), st2) === false);
  check("même classe + même detail → true", isBrainInadequate(diag("missing-dependency", "gsap"), st2) === true);
}

console.log("\n[4] nudges & observabilité");
{
  const ladder = executorLadder(CURRENT, { STRATEGE_EXEC_ESCALATE_MODEL: "gemma4:31b-cloud" });
  const rung = ladder[1];
  const nudge = brainEscalationNudge(diag("knowledge-gap"), rung);
  check("nudge cite le cerveau plus fort", /gemma4:31b-cloud/.test(nudge));
  check("nudge demande de finir (finish)", /finish/.test(nudge));
  check("format observabilité cite le barreau", /barreau 1/.test(formatExecutorEscalation(diag("knowledge-gap"), rung)));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-escalate : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
