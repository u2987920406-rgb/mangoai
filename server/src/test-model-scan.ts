// Tests de l'examen d'entrée du cerveau (model-scan.ts).
// Déterministe : un SIMULATEUR de cerveau (deps mockées) renvoie des réponses
// canned → chaque sonde score de façon prévisible, on vérifie verdict + early-exit.
// Zéro réseau.

import { scanModel, type ScanDeps } from "./model-scan.js";
import type { ToolCall } from "./eleve-runtime.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

interface Behaviors {
  reasoning: string;
  json: string;
  instruction: string;
  contract: string;
  coding: string;
  tool: { content: string; toolCalls?: ToolCall[] };
}

function fakeDeps(b: Behaviors): ScanDeps {
  return {
    ask: async (_sys, user) => {
      // Marqueurs SPÉCIFIQUES et ordonnés (le prompt codage contient « somme »,
      // donc on le teste AVANT le JSON).
      if (/compteur/.test(user)) return b.reasoning;
      if (/fonction nommée/.test(user)) return b.coding;
      if (/objet JSON/.test(user)) return b.json;
      if (/capitale/.test(user)) return b.instruction;
      if (/hello\.txt/.test(user)) return b.contract;
      return "";
    },
    post: async () => b.tool,
  };
}

const toolCall = (name: string, args: object): ToolCall => ({ id: "1", function: { name, arguments: JSON.stringify(args) } });

const STRONG: Behaviors = {
  reasoning: "21",
  json: '{"somme":42,"nom":"mango"}',
  instruction: "Paris",
  contract: '<mangoos><write path="hello.txt">Bonjour Mango</write><summary>ok</summary></mangoos>',
  coding: "function sum(a,b){return a+b}",
  tool: { content: "", toolCalls: [toolCall("read_file", { path: "src/App.jsx" })] },
};

async function run() {
  console.log("\n[1] Modèle FORT → verdict agentic");
  {
    const r = await scanModel("strong-x", fakeDeps(STRONG));
    check("verdict = agentic", r.verdict === "agentic");
    check("profil suggéré agentic:true + caps généreuses", r.suggestedProfile.agentic && r.suggestedProfile.caps.axiomCap === 10);
    check("6 sondes exécutées (tiers complets)", r.probes.length === 6);
    check("toutes les capacités mesurées", Object.keys(r.capabilities).length === 6);
  }

  console.log("\n[2] Modèle SANS OUTILS → verdict contract");
  {
    const r = await scanModel("no-tools", fakeDeps({ ...STRONG, tool: { content: "je vais lire le fichier", toolCalls: undefined } }));
    check("verdict = contract", r.verdict === "contract");
    check("agentic:false (tool-calling raté)", r.suggestedProfile.agentic === false);
    check("sonde tool-calling échouée", r.probes.find((p) => p.id === "tool-calling")?.passed === false);
  }

  console.log("\n[3] Modèle FAIBLE → early-exit reject (outils/codage non testés)");
  {
    const r = await scanModel("weak-y", fakeDeps({
      reasoning: "je ne sais pas",
      json: "euh voici la réponse",
      instruction: "La capitale est Paris bien sûr",
      contract: "Bien sûr, je crée le fichier pour vous",
      coding: "n/a",
      tool: { content: "n/a", toolCalls: undefined },
    }));
    check("verdict = reject", r.verdict === "reject");
    check("EARLY-EXIT : seules les 4 sondes Tier 0 ont tourné", r.probes.length === 4);
    check("ni tool-calling ni coding exécutés", !r.probes.some((p) => p.id === "tool-calling" || p.id === "coding"));
  }

  console.log("\n[4] Modèle bavard mais non bâtisseur → verdict discuss");
  {
    const r = await scanModel("chat-z", fakeDeps({
      reasoning: "21",
      json: '{"somme":42,"nom":"mango"}',
      instruction: "Paris",
      contract: "Je vais créer ce fichier avec plaisir !", // pas de contrat
      coding: "désolé je ne peux pas", // codage raté
      tool: { content: "je réfléchis", toolCalls: undefined }, // pas d'outils
    }));
    check("verdict = discuss", r.verdict === "discuss");
    check("bases OK mais ni outils ni codage", r.capabilities["raisonnement"] === 1 && r.probes.find((p) => p.id === "coding")?.passed === false);
  }

  console.log("\n[5] Robustesse de la sonde codage (vm)");
  {
    // Arrow function + export → doit quand même fonctionner (export strippé).
    const r = await scanModel("arrow", fakeDeps({ ...STRONG, coding: "```js\nexport const sum = (a, b) => a + b;\n```" }));
    check("codage arrow+export+fences → exécuté et validé", r.probes.find((p) => p.id === "coding")?.passed === true);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} model-scan : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
