import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveFluxTools } from "../src/eleve-flux-tools.js";

const proj = fs.mkdtempSync(path.join(os.tmpdir(), "mango-lotA-"));
const [t] = buildEleveFluxTools(proj);
console.log("projet:", proj, "| FLUX_PYTHON:", !!process.env.FLUX_PYTHON);
console.log("→ génère un SPRITE détouré (transparent:true)…");
const t0 = Date.now();
const r = await t!.handler({
  prompt: "a cute 2D RPG hero character, full body, knight with green tunic, game sprite, simple cartoon style, on a plain white background",
  nom: "hero-sprite",
  transparent: true,
  largeur: 768,
  hauteur: 768,
});
console.log(`\n=== (${Math.round((Date.now() - t0) / 1000)}s) ===`);
console.log("isError:", r.isError === true);
console.log(r.text);
const out = path.join(proj, "public", "generated", "hero-sprite.png");
console.log("PNG:", fs.existsSync(out), "| Ko:", fs.existsSync(out) ? Math.round(fs.statSync(out).size / 1024) : 0);
console.log("CHEMIN_COPIE:", out);
