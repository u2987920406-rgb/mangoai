// Tests de decoupe_assets (Lot B). Slicer mocké (pas de Python/OpenCV réel). Fichier source
// factice sur disque (tempdir). On exerce : forme, chemin vide, introuvable, happy (liste +
// sous-dossier _slices), 0 objet → isError, slicer qui lève → isError gracieux.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEleveSliceTools, type SliceDeps } from "./eleve-slice-tools.js";

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

function project(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mango-slice-"));
  fs.mkdirSync(path.join(d, "public", "generated"), { recursive: true });
  fs.writeFileSync(path.join(d, "public", "generated", "sheet.png"), Buffer.from([137, 80, 78, 71]));
  return d;
}

function tool(proj: string, over: Partial<SliceDeps> = {}) {
  const calls: { png: string; out: string; pad: number; min: number }[] = [];
  const deps: SliceDeps = {
    runSlicer:
      over.runSlicer ??
      (async (png, out, pad, min) => {
        calls.push({ png, out, pad, min });
        return { count: 3, files: ["sheet_1.png", "sheet_2.png", "sheet_3.png"] };
      }),
  };
  const [t] = buildEleveSliceTools(proj, deps);
  return { t, calls };
}

async function run() {
  console.log("\n[1] Forme");
  {
    const { t } = tool(project());
    check("nom = decoupe_assets", t!.name === "decoupe_assets");
    check("schéma : chemin + marge + taille_min", "chemin" in t!.inputSchema && "marge" in t!.inputSchema && "taille_min" in t!.inputSchema);
  }

  console.log("\n[2] Garde-fous");
  {
    const vide = await tool(project()).t!.handler({ chemin: "  " });
    check("chemin vide → isError", vide.isError === true);

    const introuvable = await tool(project()).t!.handler({ chemin: "public/generated/nope.png" });
    check("fichier introuvable → isError", introuvable.isError === true && /introuvable/.test(introuvable.text));
  }

  console.log("\n[3] Happy — découpe + sous-dossier _slices");
  {
    const proj = project();
    const { t, calls } = tool(proj);
    const r = await t!.handler({ chemin: "public/generated/sheet.png", marge: 6, taille_min: 20 });
    check("pas d'erreur + compte 3", r.isError !== true && /3 asset/.test(r.text));
    check("liste les 3 PNG dans sheet_slices", /sheet_slices\/sheet_1\.png/.test(r.text) && /sheet_3\.png/.test(r.text));
    check("indique le chemin public /generated/sheet_slices", /\/generated\/sheet_slices/.test(r.text));
    check("slicer appelé avec marge/min transmis", calls.length === 1 && calls[0]!.pad === 6 && calls[0]!.min === 20);
    check("sortie = sous-dossier _slices du fichier", /sheet_slices$/.test(calls[0]!.out.replace(/\\/g, "/")));
  }

  console.log("\n[4] Tolère le chemin /generated/... (sans public)");
  {
    const proj = project();
    const { t } = tool(proj);
    const r = await t!.handler({ chemin: "/generated/sheet.png" });
    check("chemin /generated/... résolu sous public", r.isError !== true && /3 asset/.test(r.text));
  }

  console.log("\n[5] 0 objet → isError");
  {
    const proj = project();
    const { t } = tool(proj, { runSlicer: async () => ({ count: 0, files: [] }) });
    const r = await t!.handler({ chemin: "public/generated/sheet.png" });
    check("aucun objet → isError", r.isError === true && /Aucun objet/.test(r.text));
  }

  console.log("\n[6] Slicer qui lève → isError gracieux (ne lève jamais)");
  {
    const proj = project();
    const { t } = tool(proj, { runSlicer: async () => { throw new Error("opencv KO"); } });
    let threw = false;
    let r;
    try {
      r = await t!.handler({ chemin: "public/generated/sheet.png" });
    } catch {
      threw = true;
    }
    check("handler ne lève pas", !threw);
    check("isError + motif", r?.isError === true && /opencv KO|échoué/.test(r!.text));
  }

  console.log(`\n${fail === 0 ? "✅" : "❌"} eleve-slice-tools : ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
