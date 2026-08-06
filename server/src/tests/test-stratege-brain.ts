// Tests du cerveau Stratège Phase 3 (stratege-brain.ts) — sortie contrainte, échelle
// d'escalade bornée, parseur pur. Dispatch INJECTÉ : aucun réseau, déterministe.
import {
  parseStrategeClass,
  refinedDiagnosis,
  reclassifyAmbiguous,
  consultRungWithVote,
  buildStrategeSystem,
  buildStrategeUser,
  BRAIN_CATALOGUE,
  type StrategeDispatch,
} from "../stratege/stratege-brain.js";
import type { AgentResult } from "../agent/agent-contract.js";
import type { AgentId } from "../brain/brain-registry.js";
import type { BlockerSymptoms } from "../stratege/stratege-signals.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const ok = (summary: string): AgentResult => ({
  status: "ok", agent: "orchestrateur", summary, data: {}, confidence: 0.9, durationMs: 1,
});
const err = (): AgentResult => ({
  status: "error", agent: "orchestrateur", summary: "", data: {}, confidence: 0, durationMs: 1,
});

const SYMPTOMS: BlockerSymptoms = {
  buildOk: false, finished: false, stuck: false, iterations: 7, maxIterations: 24,
  buildDetail: "SomeError: weird failure the regex did not catch", toolNames: ["run_command", "run_command"],
  task: "ajoute une carte interactive",
};

/** Dispatch factice qui enregistre les appels et renvoie une réponse par barreau (selon l'ordre). */
function fakeDispatch(replies: string[]): { fn: StrategeDispatch; calls: AgentId[] } {
  const calls: AgentId[] = [];
  const fn: StrategeDispatch = async (agentId, _sys, _user) => {
    calls.push(agentId);
    const r = replies[calls.length - 1];
    return r === "__err__" ? err() : ok(r ?? "");
  };
  return { fn, calls };
}

console.log("[1] parseStrategeClass — sortie contrainte");
{
  check("ligne CLASSE: knowledge-gap → knowledge-gap", parseStrategeClass("CLASSE: knowledge-gap\nil a inventé l'API") === "knowledge-gap");
  check("CLASSE: wrong-tool (casse/espacement tolérés)", parseStrategeClass("classe :  wrong-tool ") === "wrong-tool");
  check("CLASSE: inconnu → null (reste ambigu)", parseStrategeClass("CLASSE: inconnu\nrien ne colle") === null);
  check("classe hors catalogue → null", parseStrategeClass("CLASSE: missing-dependency") === null);
  check("nouvelle classe repetitive-failure reconnue (#168 tranche 3)", parseStrategeClass("CLASSE: repetitive-failure\nil patche en boucle") === "repetitive-failure");
  check("texte vide → null", parseStrategeClass("") === null);
  check("repli : 1re classe citée si pas de ligne CLASSE:", parseStrategeClass("je pense que c'est du wandering ici") === "wandering");
  check("« inconnu » avant la classe → null", parseStrategeClass("inconnu, mais peut-être plateau-iterations") === null);
  check("classe avant « inconnu » → la classe", parseStrategeClass("plutôt flaky-resource, sinon inconnu") === "flaky-resource");
}

console.log("\n[2] refinedDiagnosis — remède dérivé du catalogue");
{
  const d = refinedDiagnosis("knowledge-gap", "CLASSE: knowledge-gap\nil a deviné l'usage de la lib", "barreau 1 (local)");
  check("blocker = classe choisie", d.blocker === "knowledge-gap");
  check("evidence trace le barreau (observabilité)", /barreau 1/.test(d.evidence));
  check("remedy = REMEDY_BY_CLASS", /chercher_web/.test(d.remedy));
  check("cause = justification du cerveau (tronquée)", /deviné/.test(d.cause));
  check("cause nettoyée de la ligne CLASSE:", !/CLASSE:/i.test(d.cause));
}

console.log("\n[3] reclassifyAmbiguous — barreau 1 (local) tranche");
{
  const { fn, calls } = fakeDispatch(["CLASSE: knowledge-gap\ndoc manquante"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn });
  check("renvoie un diagnostic raffiné", d?.blocker === "knowledge-gap");
  check("UN SEUL appel cerveau (pas d'escalade inutile)", calls.length === 1);
  check("barreau 1 = agent « stratege » par défaut", calls[0] === "orchestrateur");
}

console.log("\n[4] barreau 1 échoue, escalade cloud DÉSACTIVÉE → null, pas de barreau 2");
{
  const { fn, calls } = fakeDispatch(["CLASSE: inconnu"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn, escalateCloud: false });
  check("reste ambigu (null)", d === null);
  check("aucun barreau 2 appelé (souverain par défaut)", calls.length === 1);
}

console.log("\n[5] barreau 1 échoue, escalade cloud ACTIVÉE → barreau 2 tranche");
{
  const { fn, calls } = fakeDispatch(["CLASSE: inconnu", "CLASSE: plateau-iterations\ntrop large"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn, escalateCloud: true, rung2: "juge" });
  check("barreau 2 tranche → diagnostic raffiné", d?.blocker === "plateau-iterations");
  check("DEUX appels (barreau 1 puis 2)", calls.length === 2);
  check("barreau 2 = agent fourni (« juge »)", calls[1] === "juge");
}

console.log("\n[6] les deux barreaux échouent → null (escalade normale reprend)");
{
  const { fn, calls } = fakeDispatch(["CLASSE: inconnu", "rien de clair ici"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn, escalateCloud: true });
  check("null après deux échecs", d === null);
  check("borné à 2 appels max (aucune boucle)", calls.length === 2);
}

console.log("\n[7] robustesse — dispatch en erreur / ne lève jamais");
{
  const { fn } = fakeDispatch(["__err__"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn });
  check("dispatch error → null (pas de throw)", d === null);

  const thrower: StrategeDispatch = async () => { throw new Error("réseau KO"); };
  let threw = false;
  let d2: unknown = "x";
  try { d2 = await reclassifyAmbiguous(SYMPTOMS, { dispatch: thrower }); } catch { threw = true; }
  check("dispatch qui throw → capté, renvoie null", !threw && d2 === null);
}

console.log("\n[8] prompts — catalogue fermé + symptômes injectés");
{
  const sys = buildStrategeSystem();
  check("system liste toutes les classes du catalogue", BRAIN_CATALOGUE.every((c) => sys.includes(c.cls)));
  check("system impose le format CLASSE:", /CLASSE:/.test(sys));
  check("system interdit d'inventer une classe", /n'invente jamais/i.test(sys));
  const usr = buildStrategeUser(SYMPTOMS);
  check("user inclut la tâche", usr.includes("carte interactive"));
  check("user inclut la sortie de build", usr.includes("weird failure"));
  check("user borne le détail de build (≤ ~500)", buildStrategeUser({ ...SYMPTOMS, buildDetail: "x".repeat(5000) }).length < 1000);
}

console.log("\n[9] consultRungWithVote — self-consistency (N tirages + vote)");
{
  // 2/3 votes identiques (knowledge-gap) l'emportent sur 1 minoritaire (wrong-tool).
  const { fn, calls } = fakeDispatch([
    "CLASSE: knowledge-gap\nA",
    "CLASSE: wrong-tool\nB",
    "CLASSE: knowledge-gap\nC",
  ]);
  const r = await consultRungWithVote("orchestrateur", "barreau 1 (local)", SYMPTOMS, fn, 3);
  check("majorité 2/3 l'emporte", r.diagnosis?.blocker === "knowledge-gap");
  check("3 appels en self-consistency", calls.length === 3);

  // Égalité stricte (1 vs 1 vs 1, ou 1 vs 1 avec un null) → pas de majorité claire → null.
  const { fn: fn2 } = fakeDispatch(["CLASSE: knowledge-gap\nA", "CLASSE: wrong-tool\nB", "CLASSE: inconnu"]);
  const r2 = await consultRungWithVote("orchestrateur", "barreau 1 (local)", SYMPTOMS, fn2, 3);
  check("égalité (1/1, le reste inconnu) → null, pas de choix arbitraire", r2.diagnosis === null);

  // Tous inconnus → null.
  const { fn: fn3 } = fakeDispatch(["CLASSE: inconnu", "CLASSE: inconnu", "CLASSE: inconnu"]);
  const r3 = await consultRungWithVote("orchestrateur", "barreau 1 (local)", SYMPTOMS, fn3, 3);
  check("aucune classe reconnue → null", r3.diagnosis === null);
}

console.log("\n[10] reclassifyAmbiguous — selfConsistency opt-in, défaut inchangé");
{
  // Défaut (selfConsistency absent) : UN SEUL appel, comportement historique préservé.
  const { fn, calls } = fakeDispatch(["CLASSE: knowledge-gap\ndoc manquante"]);
  const d = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fn });
  check("sans l'option, toujours 1 seul appel (pas de régression)", calls.length === 1);
  check("diagnostic correct malgré l'ajout de l'option", d?.blocker === "knowledge-gap");

  // Opt-in : 3 appels sur le barreau 1, vote de majorité.
  const { fn: fnVote, calls: callsVote } = fakeDispatch([
    "CLASSE: wandering\nA", "CLASSE: wandering\nB", "CLASSE: knowledge-gap\nC",
  ]);
  const dVote = await reclassifyAmbiguous(SYMPTOMS, { dispatch: fnVote, selfConsistency: true, voteN: 3 });
  check("selfConsistency: true → 3 appels sur le barreau 1", callsVote.length === 3);
  check("vote de majorité appliqué (2/3 wandering)", dVote?.blocker === "wandering");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} stratege-brain : ${pass} ok, ${fail} ko`);
if (fail > 0) process.exit(1);
