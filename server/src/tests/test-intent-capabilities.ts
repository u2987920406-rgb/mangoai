// Tests du classificateur INTENTION→CAPACITÉS (#182 É2, intent-capabilities.ts).
//
// Ce qu'on prouve :
//   1. Étages 1+2 sont PURS (URL/mots-clés/pièce jointe → capacités, ZÉRO await/I/O
//      côté `requiredCapabilitiesSync`).
//   2. `requiredCapabilities` sur-provisionne TOUJOURS read-local+read-web (D2 étage 1).
//   3. Le signal déterministe (étage 2) ajoute vision/media-gen SANS appel modèle.
//   4. Le routeur LLM (étage 3) n'est JAMAIS consulté si le gate `INTENT_ROUTER_LLM`
//      est OFF (défaut) — même sur une tâche ambiguë : on vérifie qu'un `dispatch`
//      espion n'est PAS appelé.
//   5. Gate ON + tâche ambiguë → le routeur EST consulté, et ses capacités s'ajoutent.
//   6. Preuve du « trou comblé » (1.2 du plan #182) : le registre Discuter final,
//      filtré par les caps calculées pour « regarde stripe.com et dis-moi ce que tu
//      vois », inclut bien `extraire_site` ET `vois_ecran`.

delete process.env.INTENT_ROUTER_LLM; // parti d'un état neutre

import {
  requiredCapabilities,
  requiredCapabilitiesSync,
  hasHeavyCapability,
  type DispatchFn,
} from "../intent-capabilities.js";
import { buildEleveDiscussTools } from "../eleve-tools/eleve-action-tools.js";
import type { AgentResult } from "../agent/agent-contract.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const DIR = process.cwd();

function fakeResult(status: AgentResult["status"], summary: string): AgentResult {
  return { status, agent: "routeur", summary, data: {}, confidence: 0.8, durationMs: 1 };
}

async function run() {
  console.log("\n[1] Étage 1 — sur-provisionnement read-safe (aucune tâche/contexte)");
  {
    const caps = requiredCapabilitiesSync("");
    check("caps = exactement {read-local, read-web} sans signal", caps.size === 2 && caps.has("read-local") && caps.has("read-web"));
    check("aucune capacité lourde par défaut", !hasHeavyCapability(caps));
  }

  console.log("\n[2] Étage 2 — signal déterministe PUR (URL, mots-clés, pièce jointe)");
  {
    const urlCaps = requiredCapabilitiesSync("regarde https://stripe.com et résume-moi l'offre");
    check("URL présente → read-web confirmé (capacité web-profonde de D2)", urlCaps.has("read-web"));
    check("« regarde » → vision détectée", urlCaps.has("vision"));

    const renduCaps = requiredCapabilitiesSync("rends-toi compte du rendu de la page d'accueil, à quoi ça ressemble ?");
    check("« rendu / à quoi ça ressemble » → vision détectée", renduCaps.has("vision"));

    const mediaCaps = requiredCapabilitiesSync("génère-moi une image de header pour la landing");
    check("« génère une image » → media-gen détectée", mediaCaps.has("media-gen"));

    const attachCaps = requiredCapabilitiesSync("regarde le PDF que je viens de déposer", { hasAttachment: true });
    check("pièce jointe (.assets/) → read-local présent (lire_document)", attachCaps.has("read-local"));

    const neutralCaps = requiredCapabilitiesSync("comment structurer mes composants React ?");
    check("tâche texte neutre → AUCUNE capacité lourde ajoutée (juste le défaut)", neutralCaps.size === 2 && !hasHeavyCapability(neutralCaps));
  }

  console.log("\n[3] Étage 3 GATE OFF (défaut) — tâche ambiguë → ZÉRO appel routeur");
  {
    delete process.env.INTENT_ROUTER_LLM;
    let called = 0;
    const spy: DispatchFn = (async (...args: unknown[]) => {
      called++;
      return fakeResult("ok", "vision");
    }) as DispatchFn;
    const caps = await requiredCapabilities("débrouille-toi avec ce qu'il faut pour la suite", {}, { dispatch: spy });
    check("gate OFF → le routeur (spy) n'est JAMAIS appelé", called === 0);
    check("gate OFF sur tâche ambiguë → read-safe seul", caps.size === 2 && caps.has("read-local") && caps.has("read-web"));
  }

  console.log("\n[4] Étage 3 GATE ON — tâche ambiguë → routeur consulté, capacités fusionnées");
  {
    process.env.INTENT_ROUTER_LLM = "on";
    try {
      let called = 0;
      const spy: DispatchFn = (async () => {
        called++;
        return fakeResult("ok", "vision, media-gen");
      }) as DispatchFn;
      const caps = await requiredCapabilities("débrouille-toi avec ce qu'il faut pour la suite", {}, { dispatch: spy });
      check("gate ON + tâche ambiguë → le routeur EST appelé", called === 1);
      check("capacités du routeur fusionnées (vision + media-gen)", caps.has("vision") && caps.has("media-gen"));
      check("le défaut read-safe reste présent (le routeur AJOUTE, ne retire jamais)", caps.has("read-local") && caps.has("read-web"));

      let called2 = 0;
      const spyNotAmbiguous: DispatchFn = (async () => { called2++; return fakeResult("ok", "vision"); }) as DispatchFn;
      await requiredCapabilities("regarde le rendu de la home", {}, { dispatch: spyNotAmbiguous });
      check("gate ON MAIS signal déterministe déjà tranché (vision) → routeur PAS appelé", called2 === 0);

      const degraded: DispatchFn = (async () => fakeResult("error", "indisponible")) as DispatchFn;
      const capsDeg = await requiredCapabilities("débrouille-toi avec ce qu'il faut", {}, { dispatch: degraded });
      check("routeur dégradé (status!=ok) → ensemble vide ajouté, jamais de throw", capsDeg.size === 2);
    } finally {
      delete process.env.INTENT_ROUTER_LLM;
    }
  }

  console.log("\n[5] PREUVE DU TROU COMBLÉ — Discuter + « regarde stripe.com » → extraire_site ET vois_ecran offerts");
  {
    const prevVision = process.env.ELEVE_VISION;
    process.env.ELEVE_VISION = "on";
    try {
      const caps = await requiredCapabilities("regarde stripe.com et dis-moi ce que tu vois");
      check("caps calculées : read-web (extraire_site) présent", caps.has("read-web"));
      check("caps calculées : vision présente", caps.has("vision"));

      const reg = buildEleveDiscussTools(DIR, caps);
      const names = reg.list().map((t) => t.name);
      check("registre Discuter final : extraire_site OFFERT", names.includes("extraire_site"));
      check("registre Discuter final : vois_ecran OFFERT (le trou de 1.2 comblé)", names.includes("vois_ecran"));
      check("registre Discuter final : toujours AUCUN outil mutant (plafond read-only tient)", !names.includes("write_file") && !names.includes("run_command"));

      // Non-régression : sans caps explicites (défaut), vois_ecran reste ABSENT.
      const defaultReg = buildEleveDiscussTools(DIR);
      check("sans requiredCaps (défaut) : vois_ecran toujours ABSENT (byte-identique à avant É2)", !defaultReg.list().map((t) => t.name).includes("vois_ecran"));
    } finally {
      if (prevVision === undefined) delete process.env.ELEVE_VISION;
      else process.env.ELEVE_VISION = prevVision;
    }
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} intent-capabilities : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
