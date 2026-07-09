// Tests de l'orchestrateur spéculatif (#171 slice 2) — ask/execute/verify mockés, aucun LLM réel.
import {
  buildDraftPrompt,
  parseDraft,
  draftSteps,
  speculativeAttempt,
  type DraftStep,
} from "../eleve-speculative/eleve-speculative-runner.js";
import type { SpecStep, SpeculativeDeps } from "../eleve-speculative/eleve-speculative.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const TOOLS = ["read_file", "write_file", "check_build", "teste_parcours"];

async function run() {
  console.log("[1] buildDraftPrompt — PUR");
  {
    const { system, user } = buildDraftPrompt("ajouter une page Contact", 5, TOOLS);
    check("système impose le JSON + la liste d'outils", /tableau JSON/i.test(system) && system.includes("read_file"));
    check("système borne la profondeur", system.includes("5"));
    check("user porte l'objectif", user.includes("ajouter une page Contact"));
  }

  console.log("\n[2] parseDraft — tolérant + garde d'outils");
  {
    const fenced = '```json\n[{"label":"lire App","tool":"read_file","args":{"path":"src/App.tsx"}},{"tool":"check_build"}]\n```';
    const d = parseDraft(fenced, TOOLS);
    check("parse 2 étapes (fences tolérées)", d.length === 2);
    check("label par défaut = tool si absent", d[1].label === "check_build");
    check("args par défaut = {}", JSON.stringify(d[1].args) === "{}");

    const withJunk = 'Voici mon plan: [{"tool":"read_file"}] (j\'espère que ça aide)';
    check("texte parasite autour du tableau → ok", parseDraft(withJunk, TOOLS).length === 1);

    const badTool = '[{"tool":"rm_rf"},{"tool":"read_file"}]';
    check("outil hors liste filtré", parseDraft(badTool, TOOLS).map((s) => s.tool).join() === "read_file");

    check("non-JSON → []", parseDraft("pas de tableau ici", TOOLS).length === 0);
    check("non-tableau → []", parseDraft('{"tool":"x"}', TOOLS).length === 0);
  }

  console.log("\n[3] draftSteps — ask mocké");
  {
    const ask = async () => '[{"label":"lire","tool":"read_file","args":{"path":"a"}},{"label":"build","tool":"check_build","args":{}}]';
    const steps = await draftSteps({ ask }, "objectif", 4, TOOLS);
    check("draft GLM parsé en 2 steps", steps.length === 2 && steps[0].tool === "read_file");

    const askThrows = async () => { throw new Error("réseau coupé"); };
    check("ask qui plante → [] (retombe en séquentiel)", (await draftSteps({ ask: askThrows }, "x", 3, TOOLS)).length === 0);
  }

  console.log("\n[4] speculativeAttempt — accepte tout → pas d'escalade");
  {
    const draft: DraftStep[] = [
      { label: "lire", tool: "read_file", args: {} },
      { label: "écrire", tool: "write_file", args: {} },
      { label: "build", tool: "check_build", args: {} },
    ];
    const executed: string[] = [];
    const deps: SpeculativeDeps<DraftStep> = {
      execute: (s: SpecStep<DraftStep>) => { executed.push(s.payload!.tool); return { ok: true }; },
      verify: () => true,
    };
    const att = await speculativeAttempt(draft, deps);
    check("préfixe entier accepté", att.result.accepted === 3);
    check("pas d'escalade", att.escalate === false);
    check("l'exécuteur a reçu les outils du draft", executed.join() === "read_file,write_file,check_build");
    check("savedRoundTrips = 2", att.result.savedRoundTrips === 2);
  }

  console.log("\n[5] speculativeAttempt — divergence → escalade au cerveau fort");
  {
    const draft: DraftStep[] = [
      { label: "lire", tool: "read_file", args: {} },
      { label: "écrire (faux)", tool: "write_file", args: {} },
      { label: "build", tool: "check_build", args: {} },
    ];
    const deps: SpeculativeDeps<DraftStep> = {
      execute: () => ({ ok: true }),
      verify: (s: SpecStep<DraftStep>) => s.payload!.tool !== "write_file", // le write diverge (build aurait cassé)
    };
    const att = await speculativeAttempt(draft, deps);
    check("préfixe accepté = 1 (la lecture)", att.result.accepted === 1);
    check("divergence à l'étape #1", att.result.divergedAt === 1);
    check("ESCALADE déclenchée", att.escalate === true);
    check("résumé mentionne la divergence", /#1/.test(att.summary));
  }

  console.log(`\n=== eleve-speculative-runner : ${pass} ✓ / ${fail} ✗ ===`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
