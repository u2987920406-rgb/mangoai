// Test de la façade cerveau unique (brain.ts, chantier #2 T5).
//
// La façade N'IMPLÉMENTE rien : elle ORIENTE. On prouve donc (a) que la forme
// appelable route bien vers dispatch (contrat « ne throw jamais » + transport
// injectable préservés), et (b) que les méthodes exposent À L'IDENTIQUE les moteurs
// consolidés (askLLM / chatEleve / elevePost / dispatch / dispatchParallel).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { brain } from "../brain.js";
import { dispatch, dispatchParallel } from "../brain/brain-dispatch.js";
import { askLLM, type AskLLMOptions } from "../llm/llm-engine.js";
import { chatEleve, elevePost } from "../eleve.js";

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

  console.log("\n[askAs] Le chaînon manquant : contrat d'askLLM, route du dispatcher");
  {
    // `brain.ask` contourne tout ; `brain(...)` passe par tout mais change le contrat.
    // `askAs` tient les deux bouts : il rend du TEXTE et il LÈVE, comme askLLM, mais
    // l'appel est compté par le rate limiter et soumis à la garde de souveraineté.
    // C'est ce qui a permis de migrer les 11 appels directs sans toucher à un seul
    // try/catch d'appelant.
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mango-askas-"));
    const REG = path.join(TMP, "brain-registry.json");
    process.env.BRAIN_REGISTRY_FILE = REG;
    const okJson = '<<<MANGO>>>{"status":"ok","summary":"x","data":{},"confidence":1}<<<END>>>';
    const noSleep = async () => { /* pas de backoff */ };

    // 1. Il rend du TEXTE BRUT, pas un AgentResult — et sans contrat Mango imposé.
    let vuSystem = "";
    const txt = await brain.askAs("codeur", "MON SYSTEME", "u", {
      ask: async (s: string) => { vuSystem = s; return "réponse en prose, sans balises"; },
      timeoutMs: 5_000,
    });
    check("askAs rend du texte brut (freeform, pas de parsing Mango)", txt === "réponse en prose, sans balises");
    check("le contrat Mango n'est PAS injecté dans le system", !vuSystem.includes("RÈGLE ABSOLUE"));
    check("le system de l'appelant est conservé tel quel", vuSystem.includes("MON SYSTEME"));

    // 2. Il LÈVE, là où dispatch rendrait un résultat dégradé. C'est le point qui
    //    rend la migration sûre : un appelant qui catch continue de catcher, au lieu
    //    de recevoir « erreur cerveau : … » et de la traiter comme du contenu.
    let leve = false;
    try {
      await brain.askAs("codeur", "s", "u", { ask: async () => { throw new Error("transport HS"); }, timeoutMs: 5_000 });
    } catch (e) { leve = (e as Error).message.includes("transport HS"); }
    check("askAs LÈVE en cas d'échec (contrat d'askLLM préservé)", leve);
    check("…alors que dispatch, lui, ne lève jamais",
      (await brain("codeur", "s", "u", { ask: async () => { throw new Error("x"); }, sleep: noSleep })).status === "error");

    // 3. Override PARTIEL : « même cerveau, autre modèle ». Sans la fusion, un
    //    appelant qui ne précise que le modèle le verrait silencieusement ignoré —
    //    c'est exactement le cas de l'Accueil (`resolvedModel`).
    fs.writeFileSync(REG, JSON.stringify({ codeur: { provider: "ollama", model: "du-registre", baseUrl: "http://x" } }));
    let vues: AskLLMOptions = {};
    await brain.askAs("codeur", "s", "u", {
      model: "impose",
      ask: async (_s: string, _u: string, o: AskLLMOptions) => { vues = o; return "ok"; },
    });
    check("modèle imposé sans provider → le provider du RÔLE est conservé", vues.provider === "ollama");
    check("…et le modèle imposé est bien celui employé", vues.model === "impose");
    check("…et le reste du cerveau du rôle suit (baseUrl)", vues.baseUrl === "http://x");

    // 4. Un override choisit un MOTEUR, il ne lève pas une GARDE. Un rôle localOnly
    //    reste localOnly même quand l'appelant impose un provider cloud.
    fs.writeFileSync(REG, JSON.stringify({ codeur: { provider: "ollama", model: "m", localOnly: true } }));
    let refus = false;
    try {
      await brain.askAs("codeur", "s", "u", { provider: "claude", model: "opus", ask: async () => "ok" });
    } catch (e) { refus = (e as Error).message.includes("localOnly"); }
    check("un override cloud sur un rôle localOnly est REFUSÉ (la garde survit)", refus);

    // 5. Sans aucune option, c'est le cerveau du rôle qui s'applique — nommer un rôle
    //    doit suffire, sinon le registre ne sert à rien.
    fs.writeFileSync(REG, JSON.stringify({ juge: { provider: "ollama", model: "cerveau-du-juge" } }));
    vues = {};
    await brain.askAs("juge", "s", "u", { ask: async (_s: string, _u: string, o: AskLLMOptions) => { vues = o; return "ok"; } });
    check("sans option, askAs emploie le cerveau du rôle", vues.provider === "ollama" && vues.model === "cerveau-du-juge");

    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* best-effort */ }
    delete process.env.BRAIN_REGISTRY_FILE;
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} brain-facade : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
