// Test de la façade cerveau unique (brain.ts, chantier #2 T5).
//
// La façade N'IMPLÉMENTE rien : elle ORIENTE. On prouve donc (a) que la forme
// appelable route bien vers dispatch (contrat « ne throw jamais » + transport
// injectable préservés), et (b) que les méthodes exposent À L'IDENTIQUE les moteurs
// consolidés (askLLM / chatEleve / elevePost / dispatch / dispatchParallel).

import { brain } from "./brain.js";
import { dispatch, dispatchParallel } from "./brain-dispatch.js";
import { askLLM } from "./llm-engine.js";
import { chatEleve, elevePost } from "./eleve.js";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function run() {
  console.log("\n[1] brain.ts expose À L'IDENTIQUE les moteurs consolidés");
  check("brain.dispatch === dispatch", brain.dispatch === dispatch);
  check("brain.parallel === dispatchParallel", brain.parallel === dispatchParallel);
  check("brain.ask === askLLM", brain.ask === askLLM);
  check("brain.chatEleve === chatEleve", brain.chatEleve === chatEleve);
  check("brain.elevePost === elevePost", brain.elevePost === elevePost);

  console.log("\n[2] brain(...) route vers dispatch — transport injecté, ne throw jamais");
  {
    const captured: { system: string; user: string }[] = [];
    // Cerveau ollama (localOnly-safe, pas de vrai réseau) via brainOverride + ask injecté.
    const r = await brain("architecte" as any, "SYS", "fais X", {
      brainOverride: { provider: "ollama", model: "gemma" } as any,
      trustExternal: true,
      freeform: true,
      ask: async (system, user) => { captured.push({ system, user }); return "réponse du cerveau"; },
    });
    check("le transport injecté a été appelé", captured.length === 1);
    check("system contient le prompt fourni", captured[0]?.system.includes("SYS") === true);
    check("réponse remontée (freeform → summary)", r.status === "ok" && r.summary === "réponse du cerveau");
    check("forme AgentResult (agent renseigné)", r.agent === "architecte");
  }

  console.log("\n[3] brain(...) ne throw jamais — transport qui lève → AgentResult dégradé");
  {
    const r = await brain("architecte" as any, "S", "U", {
      brainOverride: { provider: "ollama", model: "g" } as any,
      trustExternal: true,
      ask: async () => { throw new Error("boom transport"); },
    });
    check("erreur transport → status error (jamais d'exception)", r.status === "error");
    check("résumé dégradé mentionne l'erreur", r.summary.includes("boom transport"));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-facade : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
