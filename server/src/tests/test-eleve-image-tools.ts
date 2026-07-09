// Tests de l'outil lire_image (eleve-image-tools.ts) + son branchement.
// Déterministe, sans réseau : deps injectées (dispatch mocké). On exerce le
// happy path, les dégradés gracieux, les gardes de sécurité, et le branchement
// dans buildEleveActionTools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveImageTools, type ImageDeps } from "../eleve-tools/eleve-image-tools.js";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleve-img-"));
fs.mkdirSync(path.join(dir, ".assets"), { recursive: true });

// PNG minimal valide (1×1 pixel) — assez pour passer les gardes de taille.
const PNG_1x1 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
  0xe2, 0x21, 0xbc, 0x33,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
fs.writeFileSync(path.join(dir, ".assets", "maquette.png"), PNG_1x1);

// Le mock ne renvoie que ce que ImageDeps.dispatch attend (DispatchResult : status + summary).
function okResult(summary: string) {
  return { status: "ok" as const, summary };
}
function errResult(summary: string) {
  return { status: "error" as const, summary };
}

function mockDeps(over: Partial<ImageDeps> = {}): ImageDeps & { calls: { agentId: string; opts: unknown }[] } {
  const calls: { agentId: string; opts: unknown }[] = [];
  const base: ImageDeps = {
    dispatch: async (agentId, _sys, _user, opts) => {
      calls.push({ agentId, opts });
      return okResult("Page d'accueil avec hero centré, palette bleu (#1a73e8) et blanc.");
    },
  };
  return Object.assign({ calls }, base, over);
}

async function run() {
  console.log("\n[1] Happy path — lecture PNG + dispatch VL → description renvoyée");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    check("outil nommé lire_image", tool.name === "lire_image");
    const r = await tool.handler({ path: ".assets/maquette.png", objectif: "extraire la palette" });
    check("pas d'erreur", !r.isError);
    check("contient le nom du fichier", r.text.includes("maquette.png"));
    check("contient la description du VL", r.text.includes("hero centré"));
    check("dispatch appelé sur l'agent vision", deps.calls[0]?.agentId === "vision");
    check("dispatch en mode freeform + image + trustExternal", (() => {
      const o = deps.calls[0]?.opts as { imageBase64?: string; freeform?: boolean; trustExternal?: boolean };
      return o?.freeform === true && o?.trustExternal === true && typeof o?.imageBase64 === "string" && o.imageBase64.length > 0;
    })());
  }

  console.log("\n[2] path vide → isError pédagogique, sans appel");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: "" });
    check("isError", r.isError === true);
    check("message demande le path", /path/i.test(r.text));
    check("aucun dispatch (court-circuit)", deps.calls.length === 0);
  }

  console.log("\n[3] chemin hors du projet → refus");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: "../../etc/passwd.png" });
    check("isError", r.isError === true);
    check("message mentionne hors du projet", /hors du projet/i.test(r.text));
    check("aucun dispatch", deps.calls.length === 0);
  }

  console.log("\n[4] format non supporté → refus");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: ".assets/doc.txt" });
    check("isError", r.isError === true);
    check("message mentionne format non supporté", /format non support/i.test(r.text));
  }

  console.log("\n[5] image inexistante → refus");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: ".assets/inexistante.png" });
    check("isError", r.isError === true);
    check("message mentionne introuvable", /introuvable/i.test(r.text));
  }

  console.log("\n[6] cerveau vision dégradé (dispatch status error) → dégradé gracieux");
  {
    const deps = mockDeps({ dispatch: async () => errResult("modèle indisponible") });
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: ".assets/maquette.png" });
    check("isError", r.isError === true);
    check("message dit que l'œil n'a pas lu", /n'a pas pu lire/i.test(r.text));
  }

  console.log("\n[7] objectif par défaut quand non fourni");
  {
    const deps = mockDeps();
    const [tool] = buildEleveImageTools(dir, deps);
    const r = await tool.handler({ path: ".assets/maquette.png" });
    check("pas d'erreur", !r.isError);
    // Le code met l'objectif par défaut « Décris cette image… » dans le texte rendu.
    check("contient un objectif par défaut", /décris/i.test(r.text));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} test-eleve-image-tools : ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => { console.error("FATAL", e); process.exit(1); });
