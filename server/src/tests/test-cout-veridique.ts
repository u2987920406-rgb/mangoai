// B14 (audit 2026-09-28) — la table de couts dit-elle la VERITE ?
//
// Defaut vise : la table indexait sur le TRANSPORT (`provider`) et non sur la realite de
// facturation. Deux erreurs en sens inverse :
//   • `claude/opus` a 30 $/Mtok alors que le chemin Claude de ce harnais passe par
//     l'ABONNEMENT Claude Code (cout credits = 0) → dissuasion financiere infondee,
//     alerte « anti-derive » declenchee a tort ;
//   • `ollama/*` a 0 « local → gratuit » alors qu'il n'y a PAS de daemon Ollama local
//     (tous les roles pointent https://ollama.com/v1) → cout reel invisible.
//
// Execution : cd server && npx tsx src/tests/test-cout-veridique.ts
// Deterministe, zero reseau (le registre est lu, aucun appel modele).
import { estimatePipelineCost } from "../agent/agent-contract.js";
import { getBrain, type AgentId } from "../brain/brain-registry.js";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  x ${name}`);
  }
}

const M = 1_000_000;

console.log("[B14] la table de couts dit la verite");

// 1. Aucun role du registre ne doit declencher l'alerte pour un run normal.
//    NB : le registre route TOUS les roles vers Ollama Cloud (provider `openai` +
//    baseUrl ollama.com) — il n'y a plus de role `claude` par defaut. Le cas abonnement
//    est donc verifie a la source (assertion 5), pas via un role inexistant.
{
  const r = estimatePipelineCost(["orchestrateur"], M);
  check(`un role sur 1M tokens n'alerte pas (usd=${r.usd})`, r.warning === false);
  check(`...mais son cout n'est PAS nul : Ollama Cloud est facture (usd=${r.usd})`, r.usd > 0);
}

// 2. Le cout Ollama Cloud n'est PAS nul — c'etait le mensonge inverse.
//    Les roles du registre pointent tous ollama.com : le cout doit etre > 0 et VISIBLE.
{
  const role = "codeur";
  const brain = getBrain(role);
  check(
    `le role ${role} pointe bien Ollama Cloud (baseUrl=${brain.baseUrl})`,
    /ollama\.com/i.test(brain.baseUrl ?? ""),
  );
  const r = estimatePipelineCost([role], M);
  check(`Ollama Cloud n'est pas gratuit (usd=${r.usd} > 0)`, r.usd > 0);
}

// 3. Un pipeline complet coute un chiffre PLAUSIBLE (ni 0, ni 30 $/Mtok).
{
  const agents = ["orchestrateur", "architecte", "codeur", "testeur", "auditeur"] as const;
  const r = estimatePipelineCost([...agents], M);
  check(`pipeline de 5 roles sur 1M tokens : cout plausible (usd=${r.usd})`, r.usd > 0 && r.usd < 5);
}

// 4. Non-regression : un endpoint LOCAL reste reellement gratuit.
//    (On ne peut pas modifier le registre ici — on verifie l'invariant par le role
//    dont le baseUrl est local s'il en existe un ; sinon le test est neutre.)
{
  const local = (["orchestrateur", "architecte", "codeur", "vision", "testeur", "auditeur", "juge"] as AgentId[])
    .map((r) => getBrain(r))
    .find((b) => /localhost|127\.0\.0\.1/.test(b.baseUrl ?? ""));
  if (local) {
    check("un endpoint local reste a cout nul", estimatePipelineCost(["juge"], M).usd === 0);
  } else {
    console.log("  (aucun role local dans le registre — invariant local non exerce ici)");
  }
}

// 5. La table ne doit plus contenir l'ancienne promesse fausse.
{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../agent/agent-contract.ts", import.meta.url), "utf8"),
  );
  check("l'ancienne mention « local → gratuit » sur ollama/* a disparu", !/ollama\/\*":\s*0,\s*\/\/\s*local/.test(src));
  check("la voie plateforme payante est explicite (anthropic/opus)", src.includes('"anthropic/opus"'));
  // La voie ABONNEMENT (cout credits nul) doit rester declaree : c'est ce qui evite
  // d'alerter a tort quand un role repasse sur Claude.
  check("la voie abonnement Claude est a cout nul", /"claude\/\*":\s*ABONNEMENT_CLAUDE/.test(src));
  check("Ollama Cloud est tarife dans la table", src.includes('"ollama-cloud/*"'));
}

console.log(`\n${fail === 0 ? "OK" : "ECHEC"} cout veridique (B14) : ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
