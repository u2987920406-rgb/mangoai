import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildEleveFluxTools } from "../src/eleve-flux-tools.js";
import { buildEleveSliceTools } from "../src/eleve-slice-tools.js";

const proj = path.resolve(process.cwd(), "..", "workspace", "mango-quest");
fs.mkdirSync(path.join(proj, "public", "generated"), { recursive: true });
const [gen] = buildEleveFluxTools(proj);
const [slice] = buildEleveSliceTools(proj);

async function step(label: string, fn: () => Promise<{ text: string; isError?: boolean }>) {
  const t0 = Date.now();
  console.log(`\n▶ ${label}…`);
  const r = await fn();
  console.log(`  (${Math.round((Date.now() - t0) / 1000)}s) ${r.isError ? "✗" : "✓"} ${r.text.split("\n")[0]}`);
  return r;
}

// 1) Héros de Mango Quest — sprite détouré
await step("Héros (transparent)", () =>
  gen!.handler({ prompt: "a brave cartoon RPG hero knight, full body, green tunic and sword, cute game character, on a plain white background", nom: "mq-hero", transparent: true, largeur: 768, hauteur: 768 }),
);

// 2) Planche d'items → slicing (Lot B)
await step("Planche d'items (transparent)", () =>
  gen!.handler({ prompt: "a set of four separate RPG game items with clear gaps between them: a sword, a round shield, a red health potion bottle, a gold coin, cartoon game asset style, on a plain white background", nom: "mq-items", transparent: true, largeur: 1024, hauteur: 1024 }),
);
await step("Découpe de la planche (decoupe_assets)", () => slice!.handler({ chemin: "public/generated/mq-items.png", marge: 8, taille_min: 40 }));

console.log("\n=== Fichiers générés dans mango-quest/public/generated ===");
const dir = path.join(proj, "public", "generated");
for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
  const fp = path.join(dir, f);
  if (fs.statSync(fp).isFile()) console.log("  •", f, "(" + Math.round(fs.statSync(fp).size / 1024) + " Ko)");
}
