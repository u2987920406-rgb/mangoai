// Tests de regarde_site_web (2026-07-12) — vision d'un site EXTERNE pour l'Élève.
// Déterministe, ZÉRO réseau/navigateur : captureExternal et dispatch injectés.
import { buildEleveExternalVisionTools } from "../eleve-tools/eleve-external-vision-tools.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ ${label}`); }
}

async function run(): Promise<void> {
  console.log("\n[1] Enregistrement + schéma");
  {
    const tools = buildEleveExternalVisionTools({
      captureExternal: async () => ({ buf: Buffer.from("fake-jpeg"), height: 900 }),
      dispatch: async () => ({ status: "ok", summary: "Une robe rouge portée par un mannequin." }) as any,
    });
    check("regarde_site_web enregistré", tools.some((t) => t.name === "regarde_site_web"));
  }

  console.log("\n[2] Cas nominal — capture + description renvoyée");
  {
    let capturedUrl = "";
    const tools = buildEleveExternalVisionTools({
      captureExternal: async (url) => { capturedUrl = url; return { buf: Buffer.from("fake-jpeg"), height: 900 }; },
      dispatch: async (_agent, _system, objectif) => ({ status: "ok", summary: `Vu : ${objectif}` }) as any,
    });
    const tool = tools.find((t) => t.name === "regarde_site_web")!;
    const r = await tool.handler({ url: "https://www.zara.com/fr/", objectif: "décris l'image principale" });
    check("pas d'erreur", !r.isError);
    check("contient la description du dispatch", r.text.includes("Vu : décris l'image principale"));
    check("bonne URL transmise à captureExternal", capturedUrl === "https://www.zara.com/fr/");
  }

  console.log("\n[3] Garde-fous");
  {
    const tools = buildEleveExternalVisionTools({
      captureExternal: async () => ({ buf: Buffer.from("x"), height: 10 }),
      dispatch: async () => ({ status: "ok", summary: "ok" }) as any,
    });
    const tool = tools.find((t) => t.name === "regarde_site_web")!;

    const noObjectif = await tool.handler({ url: "https://zara.com" });
    check("objectif vide → isError", noObjectif.isError === true);

    const localhost = await tool.handler({ url: "http://localhost:3000", objectif: "voir" });
    check("localhost refusé (anti-SSRF)", localhost.isError === true);

    const privateIp = await tool.handler({ url: "http://192.168.1.1/admin", objectif: "voir" });
    check("IP privée refusée (anti-SSRF)", privateIp.isError === true);

    const badUrl = await tool.handler({ url: "pas-une-url", objectif: "voir" });
    check("URL invalide refusée", badUrl.isError === true);
  }

  console.log("\n[4] Budget (par tâche, comme vois_ecran)");
  {
    process.env.ELEVE_EXTERNAL_VISION_BUDGET = "1";
    const tools = buildEleveExternalVisionTools({
      captureExternal: async () => ({ buf: Buffer.from("x"), height: 10 }),
      dispatch: async () => ({ status: "ok", summary: "ok" }) as any,
    });
    const tool = tools.find((t) => t.name === "regarde_site_web")!;
    const first = await tool.handler({ url: "https://zara.com", objectif: "voir" });
    check("1er appel OK", !first.isError);
    const second = await tool.handler({ url: "https://zara.com", objectif: "voir encore" });
    check("2e appel refusé (budget épuisé)", second.isError === true);
    delete process.env.ELEVE_EXTERNAL_VISION_BUDGET;
  }

  console.log("\n[5] Échecs fail-open (jamais de throw)");
  {
    const captureError = buildEleveExternalVisionTools({
      captureExternal: async () => { throw new Error("réseau injoignable"); },
      dispatch: async () => ({ status: "ok", summary: "ok" }) as any,
    });
    const r1 = await captureError.find((t) => t.name === "regarde_site_web")!.handler({ url: "https://zara.com", objectif: "voir" });
    check("échec de capture → isError, pas de throw", r1.isError === true);

    const dispatchError = buildEleveExternalVisionTools({
      captureExternal: async () => ({ buf: Buffer.from("x"), height: 10 }),
      dispatch: async () => ({ status: "error", summary: "" }) as any,
    });
    const r2 = await dispatchError.find((t) => t.name === "regarde_site_web")!.handler({ url: "https://zara.com", objectif: "voir" });
    check("échec du cerveau vision → isError, pas de throw", r2.isError === true);
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-external-vision-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
