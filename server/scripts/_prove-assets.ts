import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { buildEleveFluxTools } from "../src/eleve-flux-tools.js";
import { buildEleveSliceTools } from "../src/eleve-slice-tools.js";

// Lot d'assets Mango Quest — reprise après crash (style cartoon, assorti au héros mq-hero).
// 3 planches PNJ + 3 planches décors → génération Flux + détourage transparent + slice par objet.
const proj = path.resolve(process.cwd(), "..", "workspace", "mango-quest");
fs.mkdirSync(path.join(proj, "public", "generated"), { recursive: true });
const [gen] = buildEleveFluxTools(proj);
const [slice] = buildEleveSliceTools(proj);

const COMMON = "cute cartoon RPG game sprite style matching a brave cartoon knight hero, on a plain white background";

const PLANCHES = [
  {
    nom: "mq-villagers",
    prompt: `a set of four separate cartoon RPG village characters arranged in a 2x2 grid with large clear empty gaps between each one: a friendly merchant in an apron, a town guard with helmet and spear, a village woman in a long dress, a muscular blacksmith holding a hammer, each full body, ${COMMON}`,
  },
  {
    nom: "mq-enemies",
    prompt: `a set of four separate cartoon RPG dungeon enemies arranged in a 2x2 grid with large clear empty gaps between each one: a small green goblin, a white skeleton warrior, a blue jelly slime, a brown bat, each full body, cute cartoon game monster sprite style, on a plain white background`,
  },
  {
    nom: "mq-keychars",
    prompt: `a set of three separate cartoon RPG key characters in a row with large clear empty gaps between each one: a noble king with crown and red cape, an old wise wizard in a blue robe holding a staff, a mysterious hooded merchant, each full body, ${COMMON}`,
  },
  {
    nom: "mq-props-town",
    prompt: `a set of four separate cartoon medieval town props arranged in a 2x2 grid with large clear empty gaps between each one: a small wooden house, a market stall, a stone fountain, a wooden barrel, cute cartoon game asset style, on a plain white background`,
  },
  {
    nom: "mq-props-dungeon",
    prompt: `a set of four separate cartoon dungeon props arranged in a 2x2 grid with large clear empty gaps between each one: a stone wall segment, a lit wall torch, a wooden treasure chest, an iron door, cute cartoon game asset style, on a plain white background`,
  },
  {
    nom: "mq-props-outdoor",
    prompt: `a set of four separate cartoon outdoor nature props arranged in a 2x2 grid with large clear empty gaps between each one: a green tree, a grey boulder rock, a leafy green bush, a small wooden bridge, cute cartoon game asset style, on a plain white background`,
  },
];

async function step(label: string, fn: () => Promise<{ text: string; isError?: boolean }>) {
  const t0 = Date.now();
  console.log(`\n▶ ${label}…`);
  const r = await fn();
  console.log(`  (${Math.round((Date.now() - t0) / 1000)}s) ${r.isError ? "✗" : "✓"} ${r.text.split("\n")[0]}`);
  return r;
}

for (const p of PLANCHES) {
  const g = await step(`Génère ${p.nom} (transparent)`, () =>
    gen!.handler({ prompt: p.prompt, nom: p.nom, transparent: true, largeur: 1024, hauteur: 1024 }),
  );
  if (g.isError) {
    console.log(`  ⚠ génération KO pour ${p.nom} — on saute le slice.`);
    continue;
  }
  await step(`Découpe ${p.nom}`, () =>
    slice!.handler({ chemin: `public/generated/${p.nom}.png`, marge: 8, taille_min: 48 }),
  );
}

console.log("\n=== Inventaire public/generated ===");
const dir = path.join(proj, "public", "generated");
for (const f of fs.readdirSync(dir, { recursive: true }) as string[]) {
  const fp = path.join(dir, f);
  if (fs.statSync(fp).isFile()) console.log("  •", f, "(" + Math.round(fs.statSync(fp).size / 1024) + " Ko)");
}
