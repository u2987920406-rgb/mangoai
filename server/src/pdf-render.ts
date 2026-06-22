// Rendu visuel de PDF (#147) — la primitive qui comble 4 lacunes d'un coup.
//
// `extractPdfText` (pdf-pipeline.ts) ne lit que le TEXTE. Ici on RASTÉRISE une
// page PDF en PNG via pdfjs-dist (legacy, Node) + @napi-rs/canvas (binaires
// précompilés, zéro build natif). Une seule fonction `renderPdfPage` débloque :
//   • Vision PDF  → le PNG est lu par le tool Read (comme un aperçu web)
//   • Zoom        → scale élevé + crop d'une région
//   • Crop        → cropRegion {x,y,w,h} en pixels rendus
//   • OCR scanné  → le PNG part vers un modèle vision local
//
// Souveraineté totale : pur JS + binaire local, aucun service cloud.
// Tout est borné (page, scale, dimensions, crop) — aucun emballement mémoire.

import fs from "node:fs";

// ── Bornes dures (garde-fous mémoire) ────────────────────────────────────────

const SCALE_MIN = 0.25;
const SCALE_MAX = 8;
const DIM_MAX = 5000; // côté max d'un rendu en px ; au-delà on réduit le scale

export interface PdfCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderOptions {
  /** Facteur d'échelle (1 = taille native du PDF). Borné [0.25, 8]. Défaut 2. */
  scale?: number;
  /** Région à découper, en pixels du rendu (après application du scale). */
  crop?: PdfCrop;
}

export interface RenderedPage {
  /** Le PNG de la page (ou de la région croppée). */
  png: Buffer;
  /** Dimensions effectives du PNG renvoyé. */
  width: number;
  height: number;
  /** Numéro de page rendu (1-indexé). */
  pageNum: number;
  /** Nombre total de pages du document. */
  pageCount: number;
  /** Scale réellement appliqué (peut différer si plafonné par DIM_MAX). */
  scale: number;
}

/** Polyfill des globals attendus par pdfjs en environnement Node (DOMMatrix,
 * Path2D, ImageData) — fournis par @napi-rs/canvas. Idempotent. */
async function ensureCanvasGlobals(): Promise<typeof import("@napi-rs/canvas")> {
  const napi = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  for (const name of ["DOMMatrix", "Path2D", "ImageData"] as const) {
    if (g[name] === undefined && (napi as Record<string, unknown>)[name] !== undefined) {
      g[name] = (napi as Record<string, unknown>)[name];
    }
  }
  return napi;
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 2;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
}

/** Rastérise UNE page d'un PDF en PNG. Réutilisable comme outil vision de
 * l'Élève agentique (Phase 2). `pdfPath` doit exister sur le disque. */
export async function renderPdfPage(
  pdfPath: string,
  pageNum: number,
  opts: RenderOptions = {},
): Promise<RenderedPage> {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF introuvable : ${pdfPath}`);

  const napi = await ensureCanvasGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  try {
    const pageCount = doc.numPages;
    if (!Number.isInteger(pageNum) || pageNum < 1 || pageNum > pageCount) {
      throw new Error(`page hors limites : ${pageNum} (le document a ${pageCount} page(s))`);
    }

    const page = await doc.getPage(pageNum);

    // Scale demandé, replafonné si le rendu dépasse DIM_MAX sur un côté.
    let scale = clampScale(opts.scale ?? 2);
    const base = page.getViewport({ scale: 1 });
    const longest = Math.max(base.width, base.height) * scale;
    if (longest > DIM_MAX) scale = scale * (DIM_MAX / longest);

    const viewport = page.getViewport({ scale });
    const fullW = Math.ceil(viewport.width);
    const fullH = Math.ceil(viewport.height);

    const canvas = napi.createCanvas(fullW, fullH);
    const ctx = canvas.getContext("2d");
    // Fond blanc (les PDF transparents sortiraient en noir sinon).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fullW, fullH);

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    // Crop optionnel : on découpe la région dans un second canvas.
    if (opts.crop) {
      const { png, width, height } = cropCanvas(napi, canvas, opts.crop, fullW, fullH);
      return { png, width, height, pageNum, pageCount, scale };
    }

    return {
      png: canvas.toBuffer("image/png"),
      width: fullW,
      height: fullH,
      pageNum,
      pageCount,
      scale,
    };
  } finally {
    await doc.cleanup();
  }
}

/** Découpe une région bornée du canvas rendu dans un nouveau PNG. La région est
 * clampée aux dimensions du rendu (jamais hors cadre). */
function cropCanvas(
  napi: typeof import("@napi-rs/canvas"),
  source: import("@napi-rs/canvas").Canvas,
  crop: PdfCrop,
  fullW: number,
  fullH: number,
): { png: Buffer; width: number; height: number } {
  const x = Math.max(0, Math.min(Math.floor(crop.x), fullW - 1));
  const y = Math.max(0, Math.min(Math.floor(crop.y), fullH - 1));
  const w = Math.max(1, Math.min(Math.floor(crop.w), fullW - x));
  const h = Math.max(1, Math.min(Math.floor(crop.h), fullH - y));

  const out = napi.createCanvas(w, h);
  const octx = out.getContext("2d");
  octx.drawImage(source, x, y, w, h, 0, 0, w, h);
  return { png: out.toBuffer("image/png"), width: w, height: h };
}

// ── Extraction des images EMBARQUÉES (#32) ───────────────────────────────────

export interface ExtractedImage {
  /** Le PNG de l'image embarquée. */
  png: Buffer;
  width: number;
  height: number;
  /** Page d'où provient l'image (1-indexé). */
  pageNum: number;
  /** Index de l'image sur la page (0-indexé). */
  index: number;
}

const MAX_IMAGES = 100; // garde-fou : un PDF pathologique ne nous noie pas

/** Bitmap décodé par pdfjs (forme partielle des objets image internes). */
interface DecodedImage {
  width?: number;
  height?: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
}

/** Convertit un bitmap décodé par pdfjs (kind 1/2/3) en données RGBA. */
function toRgba(data: Uint8Array | Uint8ClampedArray, width: number, height: number, kind: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (kind === 3) {
    // RGBA_32BPP — déjà au bon format.
    out.set(data.subarray(0, out.length));
    return out;
  }
  if (kind === 2) {
    // RGB_24BPP → RGBA.
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      out[i * 4] = data[j];
      out[i * 4 + 1] = data[j + 1];
      out[i * 4 + 2] = data[j + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  // GRAYSCALE (kind 1 ou inconnu) → réplique le canal.
  for (let i = 0; i < width * height; i++) {
    const g = data[i] ?? 0;
    out[i * 4] = g;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Récupère un objet image résolu de la page (API callback de pdfjs). */
function getPageObj(page: { objs: { get: (name: string, cb: (v: unknown) => void) => void } }, name: string): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      page.objs.get(name, resolve);
    } catch {
      resolve(null);
    }
  });
}

/** Extrait les images embarquées (XObjects + inline) d'un PDF en PNG. Best-effort,
 * borné à MAX_IMAGES. Comble la lacune #32 — récupérer les visuels d'un PDF. */
export async function extractPdfImages(pdfPath: string): Promise<ExtractedImage[]> {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF introuvable : ${pdfPath}`);
  const napi = await ensureCanvasGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const OPS = pdfjs.OPS as Record<string, number>;

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const images: ExtractedImage[] = [];
  try {
    for (let p = 1; p <= doc.numPages && images.length < MAX_IMAGES; p++) {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();
      let idx = 0;
      for (let i = 0; i < ops.fnArray.length && images.length < MAX_IMAGES; i++) {
        const fn = ops.fnArray[i];
        let img: DecodedImage | null = null;
        if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
          const name = ops.argsArray[i][0] as string;
          img = (await getPageObj(page as never, name)) as DecodedImage | null;
        } else if (fn === OPS.paintInlineImage) {
          img = ops.argsArray[i][0] as DecodedImage;
        }
        if (!img?.data || !img.width || !img.height) continue;
        try {
          const rgba = toRgba(img.data, img.width, img.height, img.kind ?? 2);
          const canvas = napi.createCanvas(img.width, img.height);
          const ctx = canvas.getContext("2d");
          const imageData = new napi.ImageData(rgba, img.width, img.height);
          ctx.putImageData(imageData, 0, 0);
          images.push({ png: canvas.toBuffer("image/png"), width: img.width, height: img.height, pageNum: p, index: idx++ });
        } catch {
          /* image illisible → on saute, best-effort */
        }
      }
    }
    return images;
  } finally {
    await doc.cleanup();
  }
}

/** Nombre de pages d'un PDF (utilitaire léger, sans rendu). */
export async function pdfPageCount(pdfPath: string): Promise<number> {
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF introuvable : ${pdfPath}`);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  try {
    return doc.numPages;
  } finally {
    await doc.cleanup();
  }
}
