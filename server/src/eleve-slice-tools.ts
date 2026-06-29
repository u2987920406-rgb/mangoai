// Outil DECOUPE_ASSETS de l'Élève — « slicing » automatique d'une planche d'assets
// (étape 7 de la vidéo : Slice Tool de Photopea). À partir d'un PNG TRANSPARENT contenant
// plusieurs objets, on isole chaque objet (composantes connexes de l'alpha) et on exporte
// un PNG par objet → des sprites/assets individuels propres, prêts pour un jeu.
//
// Le découpage utilise PIL + OpenCV (présents dans le python de ComfyUI/rembg) via un
// sous-process Python. Confiné au projet (resolveInside), ne lève jamais, deps injectables.
// Gaté ELEVE_FLUX=on (l'usine à assets, avec genere_image transparent/upscale).

import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";

function resolveInside(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`chemin hors du projet : ${rel}`);
  return abs;
}

function fluxPython(): string | null {
  return process.env.FLUX_PYTHON?.trim() || null;
}

// Slicer : composantes connexes de l'alpha → bbox par objet → crop (+marge) → PNG.
// Sortie : JSON {count, files:[relatifs à outdir]} sur stdout. min_taille filtre les miettes.
const SLICE_SCRIPT = `
import sys, os, json
import numpy as np
from PIL import Image
src, outdir, pad, minsz = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert("RGBA")
arr = np.array(im)
mask = (arr[:, :, 3] > 16).astype("uint8")
try:
    import cv2
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    boxes = []
    for i in range(1, n):
        x, y, w, h, area = (int(stats[i, k]) for k in range(5))
        boxes.append((x, y, w, h))
except Exception:
    from scipy import ndimage
    lab, n = ndimage.label(mask)
    boxes = []
    for sl in ndimage.find_objects(lab):
        if sl is None: continue
        y, x = sl
        boxes.append((x.start, y.start, x.stop - x.start, y.stop - y.start))
os.makedirs(outdir, exist_ok=True)
base = os.path.splitext(os.path.basename(src))[0]
boxes = sorted(boxes, key=lambda b: (b[1], b[0]))
files = []
idx = 0
W, H = im.size
for (x, y, w, h) in boxes:
    if w < minsz or h < minsz: continue
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(W, x + w + pad), min(H, y + h + pad)
    idx += 1
    fn = os.path.join(outdir, base + "_" + str(idx) + ".png")
    im.crop((x0, y0, x1, y1)).save(fn)
    files.append(os.path.basename(fn))
print(json.dumps({"count": idx, "files": files}))
`;

export interface SliceResult {
  count: number;
  files: string[];
}

export interface SliceDeps {
  /** Découpe le PNG `absPng` vers `absOutDir` ; renvoie les fichiers créés. Lève si échec. */
  runSlicer: (absPng: string, absOutDir: string, pad: number, minSize: number) => Promise<SliceResult>;
}

async function realRunSlicer(absPng: string, absOutDir: string, pad: number, minSize: number): Promise<SliceResult> {
  const py = fluxPython();
  if (!py) throw new Error("FLUX_PYTHON non défini (python avec PIL/OpenCV) — requis pour le découpage.");
  const out = await new Promise<string>((resolve, reject) => {
    execFile(py, ["-s", "-c", SLICE_SCRIPT, absPng, absOutDir, String(pad), String(minSize)], { timeout: 120_000, windowsHide: true }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
  const parsed = JSON.parse(out.trim().split("\n").pop() || "{}") as Partial<SliceResult>;
  return { count: typeof parsed.count === "number" ? parsed.count : 0, files: Array.isArray(parsed.files) ? parsed.files : [] };
}

const realSliceDeps: SliceDeps = { runSlicer: realRunSlicer };

export function buildEleveSliceTools(projectDir: string, deps: SliceDeps = realSliceDeps): KernelTool[] {
  const decoupe: KernelTool = {
    name: "decoupe_assets",
    description:
      "Découpe une PLANCHE d'assets TRANSPARENTE (PNG RGBA contenant plusieurs objets isolés) en un fichier PNG par objet — l'équivalent du « Slice Tool ». Donne `chemin` (le PNG transparent dans le projet, ex. /generated/sheet.png). Renvoie les sprites individuels dans un sous-dossier `<nom>_slices/`. Idéal après genere_image(transparent:true) sur une planche de plusieurs éléments.",
    inputSchema: {
      chemin: z.string().describe("Chemin du PNG transparent à découper, relatif au projet (ex. public/generated/sheet.png)"),
      marge: z.number().int().min(0).max(64).optional().describe("Marge en px autour de chaque objet (défaut 4)"),
      taille_min: z.number().int().min(1).max(512).optional().describe("Ignore les objets plus petits que N px (défaut 12, anti-miettes)"),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const chemin = String(args.chemin ?? "").trim().replace(/^\/+/, "");
      if (!chemin) return { text: "Donne le `chemin` du PNG transparent à découper.", isError: true };
      const pad = Math.max(0, Math.min(64, Number(args.marge ?? 4)));
      const minSize = Math.max(1, Math.min(512, Number(args.taille_min ?? 12)));
      try {
        // Tolère un chemin public/... ou /generated/... → résout dans public si besoin.
        let rel = chemin;
        if (!fs.existsSync(resolveInside(projectDir, rel))) {
          const alt = path.join("public", chemin.replace(/^public[\\/]/, ""));
          if (fs.existsSync(resolveInside(projectDir, alt))) rel = alt;
        }
        const absPng = resolveInside(projectDir, rel);
        if (!fs.existsSync(absPng)) return { text: `Fichier introuvable : ${chemin}`, isError: true };
        const base = path.basename(rel).replace(/\.[^.]+$/, "");
        const outRel = path.join(path.dirname(rel), `${base}_slices`);
        const absOut = resolveInside(projectDir, outRel);
        const res = await deps.runSlicer(absPng, absOut, pad, minSize);
        if (res.count === 0) {
          return { text: `Aucun objet détecté dans ${chemin} (l'image est-elle bien TRANSPARENTE et contient-elle des objets séparés ?).`, isError: true };
        }
        const list = res.files.map((f) => `  - ${outRel.replace(/\\/g, "/")}/${f}`).join("\n");
        const pub = outRel.replace(/^public[\\/]/, "/").replace(/\\/g, "/");
        return {
          text: `${res.count} asset(s) découpé(s) dans ${outRel.replace(/\\/g, "/")} :\n${list}\nUtilise-les via le chemin public (ex. \`${pub}/${base}_1.png\`).`,
        };
      } catch (e) {
        return { text: `Découpage échoué : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };
  return [decoupe];
}
