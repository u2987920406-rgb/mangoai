// Tests de la couche vision (#159 Phase 3). Déterministe, ZÉRO navigateur/cloud :
// capture + dispatch injectés. On exerce : le parseur PUR de prose étiquetée
// (champs simples + listes, tolérance casse/puces/placeholders), et seeSite
// (capture KO → ok:false, VL en erreur → ok:false, happy → champs remplis, le
// texte donné au VL est sanitizé). Ne lève jamais.

import { parseSiteVision, seeSite, type SiteVisionDeps } from "./site-vision.js";
import type { AgentResult } from "./agent-contract.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

const okResult = (summary: string): AgentResult => ({
  status: "ok",
  agent: "vision",
  summary,
  data: {},
  confidence: 1,
  durationMs: 1,
});

function deps(over: Partial<SiteVisionDeps> = {}): { d: SiteVisionDeps; seen: { user: string[] } } {
  const seen = { user: [] as string[] };
  const d: SiteVisionDeps = {
    capture: over.capture ?? (async () => ({ buf: Buffer.from("img"), height: 900 })),
    dispatch:
      over.dispatch ??
      (async (_a, _s, user) => {
        seen.user.push(user);
        return okResult("CONCEPT: x\nAMBIANCE: y");
      }),
  };
  return { d, seen };
}

async function run() {
  console.log("\n[1] parseSiteVision — champs simples");
  {
    const r = parseSiteVision(
      "CONCEPT: Jeu d'aventure exploratoire\nPUBLIC: ados et adultes\nAMBIANCE: héroïque, mystérieux\nTON: épique",
    );
    check("concept", r.concept === "Jeu d'aventure exploratoire");
    check("public cible", r.publicCible === "ados et adultes");
    check("ambiance (mood)", r.ambiance === "héroïque, mystérieux");
    check("ton", r.ton === "épique");
    check("raw conservé", r.raw.includes("CONCEPT"));
  }

  console.log("\n[2] parseSiteVision — listes (mécaniques + infos)");
  {
    const r = parseSiteVision(
      ["MÉCANIQUES:", "- carte ouverte", "- énigmes", "* inventaire", "INFOS:", "- sortie 2026", "1) multi-plateforme"].join("\n"),
    );
    check("3 mécaniques", r.mecaniques.length === 3 && r.mecaniques.includes("inventaire"));
    check("2 infos (puces variées)", r.infos.length === 2 && r.infos.includes("multi-plateforme"));
  }

  console.log("\n[3] parseSiteVision — tolérance (casse, **gras**, valeur inline, placeholder ignoré)");
  {
    const r = parseSiteVision("**Concept** : Une boutique\nmecaniques: panier\nTON: <indéterminé>");
    check("label en gras + casse", r.concept === "Une boutique");
    check("valeur inline après label de liste", r.mecaniques.includes("panier"));
    check("placeholder <…> ignoré", r.ton === "");
  }

  console.log("\n[4] parseSiteVision — entrée vide");
  {
    const r = parseSiteVision("");
    check("ne lève pas, champs vides", r.concept === "" && r.mecaniques.length === 0 && r.infos.length === 0);
  }

  console.log("\n[5] seeSite — happy path");
  {
    const { d, seen } = deps({
      dispatch: async (_a, _s, user) => {
        seen.user.push(user);
        return okResult("CONCEPT: Café de quartier\nMÉCANIQUES:\n- commande en ligne\nAMBIANCE: chaleureux");
      },
    });
    const r = await seeSite("https://cafe.com", { objectif: "comprendre l'offre", textHint: "Bienvenue chez nous" }, d);
    check("ok", r.ok === true);
    check("concept parsé", r.concept === "Café de quartier");
    check("mécanique parsée", r.mecaniques.includes("commande en ligne"));
    check("objectif transmis au VL", /comprendre l'offre/.test(seen.user[0]));
    check("texte du site sanitizé (DONNÉE)", /UNTRUSTED|<<<|DONNÉE/i.test(seen.user[0]) && seen.user[0].includes("Bienvenue chez nous"));
  }

  console.log("\n[6] seeSite — capture KO → ok:false gracieux");
  {
    const { d } = deps({
      capture: async () => {
        throw new Error("navigateur HS");
      },
    });
    let threw = false;
    let r;
    try {
      r = await seeSite("https://x.com", {}, d);
    } catch {
      threw = true;
    }
    check("ne lève pas", !threw);
    check("ok:false + error capture", r?.ok === false && /capture impossible/.test(r!.error ?? ""));
  }

  console.log("\n[7] seeSite — VL en erreur → ok:false");
  {
    const { d } = deps({
      dispatch: async () => ({ status: "error", agent: "vision", summary: "boom", data: {}, confidence: 0, durationMs: 1 }),
    });
    const r = await seeSite("https://x.com", {}, d);
    check("ok:false quand le VL échoue", r.ok === false && /VL n'a pas pu lire/i.test(r.error ?? ""));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} site-vision : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
