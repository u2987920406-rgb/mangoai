// Tests de l'outil vision de l'Élève (eleve-vision-tools.ts) + son branchement gated.
// Déterministe, sans réseau ni navigateur : deps injectées (startPreview/capturePreview/
// dispatch mockés). On exerce le happy path, les dégradés gracieux, le budget, et le
// gating ELEVE_VISION dans buildEleveActionTools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveVisionTools, type VisionDeps } from "../eleve-tools/eleve-vision-tools.js";
import { buildEleveActionTools } from "../eleve-tools/eleve-action-tools.js";
import type { AgentResult } from "../agent/agent-contract.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-vision-"));

/** AgentResult prose-libre OK. */
function okResult(summary: string): AgentResult {
  return { status: "ok", agent: "vision", summary, data: {}, confidence: 1, durationMs: 5 };
}
function errResult(summary: string): AgentResult {
  return { status: "error", agent: "vision", summary, data: {}, confidence: 0, durationMs: 5 };
}

/** Fabrique des deps mockées, en traçant les appels. */
function mockDeps(over: Partial<VisionDeps> = {}): VisionDeps & { calls: { agentId: string; opts: unknown }[] } {
  const calls: { agentId: string; opts: unknown }[] = [];
  const base: VisionDeps = {
    startPreview: async () => ({ url: "http://127.0.0.1:5174/" }),
    capturePreview: async () => Buffer.from("fake-jpeg-bytes"),
    dispatch: async (agentId, _sys, _user, opts) => {
      calls.push({ agentId, opts });
      return okResult("Charte cohérente ; aucun écart visuel détecté.");
    },
  };
  return Object.assign({ calls }, base, over);
}

async function run() {
  console.log("\n[1] Happy path — capture + lecture VL → critique renvoyée");
  {
    const deps = mockDeps();
    const [tool] = buildEleveVisionTools(dir, deps);
    check("outil nommé vois_ecran", tool.name === "vois_ecran");
    const r = await tool.handler({ objectif: "cohérence de l'accueil" });
    check("pas d'erreur", !r.isError);
    check("contient la critique du VL", r.text.includes("Charte cohérente"));
    check("dispatch appelé sur l'agent vision", deps.calls[0]?.agentId === "vision");
    check("dispatch en mode freeform + image + trustExternal", (() => {
      const o = deps.calls[0]?.opts as { imageBase64?: string; freeform?: boolean; trustExternal?: boolean };
      return o?.freeform === true && o?.trustExternal === true && typeof o?.imageBase64 === "string" && o.imageBase64.length > 0;
    })());
  }

  console.log("\n[2] objectif vide → isError pédagogique, sans appel");
  {
    const deps = mockDeps();
    const [tool] = buildEleveVisionTools(dir, deps);
    const r = await tool.handler({ objectif: "   " });
    check("isError", r.isError === true);
    check("aucun dispatch (court-circuit)", deps.calls.length === 0);
  }

  console.log("\n[3] Aperçu indisponible (startPreview rejette) → dégradé gracieux");
  {
    const deps = mockDeps({ startPreview: async () => { throw new Error("vite KO"); } });
    const [tool] = buildEleveVisionTools(dir, deps);
    const r = await tool.handler({ objectif: "x" });
    check("isError", r.isError === true);
    check("message mentionne l'aperçu", /aperçu/i.test(r.text));
    check("ne throw pas (retourne un résultat)", typeof r.text === "string");
  }

  console.log("\n[4] Capture impossible (capturePreview rejette) → dégradé gracieux");
  {
    const deps = mockDeps({ capturePreview: async () => { throw new Error("screenshot KO"); } });
    const [tool] = buildEleveVisionTools(dir, deps);
    const r = await tool.handler({ objectif: "x" });
    check("isError", r.isError === true);
    check("message mentionne la capture", /capture/i.test(r.text));
  }

  console.log("\n[5] Cerveau vision dégradé (dispatch status error) → dégradé gracieux");
  {
    const deps = mockDeps({ dispatch: async () => errResult("modèle indisponible") });
    const [tool] = buildEleveVisionTools(dir, deps);
    const r = await tool.handler({ objectif: "x" });
    check("isError", r.isError === true);
    check("message dit que l'œil n'a pas lu", /n'a pas pu lire/i.test(r.text));
  }

  console.log("\n[6] Budget par tâche (ELEVE_VISION_BUDGET) borne les regards");
  {
    process.env.ELEVE_VISION_BUDGET = "2";
    const deps = mockDeps();
    const [tool] = buildEleveVisionTools(dir, deps);
    const r1 = await tool.handler({ objectif: "a" });
    const r2 = await tool.handler({ objectif: "b" });
    const r3 = await tool.handler({ objectif: "c" });
    check("2 premiers regards OK", !r1.isError && !r2.isError);
    check("3e regard refusé (budget)", r3.isError === true && /budget/i.test(r3.text));
    check("seulement 2 dispatch effectués", deps.calls.length === 2);
    delete process.env.ELEVE_VISION_BUDGET;
  }

  console.log("\n[7] Gating ELEVE_VISION dans buildEleveActionTools (défaut ON, 2026-07-12)");
  {
    delete process.env.ELEVE_VISION;
    const regDefault = buildEleveActionTools(dir);
    check("par défaut (non défini) → vois_ecran présent (Claude a Snapshot en permanence)", regDefault.has("vois_ecran"));
    process.env.ELEVE_VISION = "on";
    const regOn = buildEleveActionTools(dir);
    check("flag ON explicite → vois_ecran présent", regOn.has("vois_ecran"));
    check("flag ON → outils d'action toujours là", ["write_file", "edit_file", "finish"].every((n) => regOn.has(n)));
    process.env.ELEVE_VISION = "off";
    const regOff = buildEleveActionTools(dir);
    check("flag OFF explicite → pas de vois_ecran (coupure d'urgence)", !regOff.has("vois_ecran"));
    delete process.env.ELEVE_VISION;
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-eleve-vision-tools : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("FATAL", e); process.exit(1); });
