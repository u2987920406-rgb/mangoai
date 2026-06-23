// Moteur de Goût (#149) — orchestrateur de RENDU : pour K directions, génère le skin
// (tokens + remap littéraux), l'applique au projet, lance l'aperçu, screenshot, restaure.
// Productionnise le banc exp-taste-render2. TOUTES les dépendances lourdes (Sharingan,
// GLM, aperçu Vite, capture) sont injectables → testable sans réseau ni navigateur.

import fs from "node:fs";
import path from "node:path";
import { loadTasteReferences } from "./taste-refs.js";
import { captureDirectionRefs, buildSkinBrief, catalogDirection, defaultCaptureDeps, type CaptureDeps } from "./taste-engine.js";
import { skinTokens, remapLiterals, defaultSkinAsk, type SkinAsk, type FileContent } from "./taste-generate.js";
import { sampleDirections, type TasteDirection } from "./taste-directions.js";
import { startPreview as realStart, stopPreview as realStop } from "./preview.js";
import { capturePreview as realCapture } from "./vision.js";

const REF_DIR_DEFAULT = path.resolve(process.cwd(), "..", "taste-references");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface SkinRender {
  id: string;
  name: string;
  ok: boolean;
  file?: string; // nom du JPEG dans outDir
  image?: string; // URL servie (rempli par la route)
  reason?: string;
  palette: string[];
}

export interface TasteRenderDeps {
  captureDeps?: CaptureDeps;
  ask?: SkinAsk;
  startPreview?: (dir: string) => Promise<{ url: string }>;
  stopPreview?: (dir?: string) => Promise<void>;
  capture?: (url: string) => Promise<Buffer>;
  refDir?: string;
  hmrSettleMs?: number;
}

/** Trouve le fichier de tokens à re-skinner (le plus probable d'abord). */
export function findTokensFile(projectDir: string): string | null {
  for (const c of ["src/theme/tokens.css", "src/tokens.css", "src/styles/tokens.css", "src/index.css"]) {
    const p = path.join(projectDir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Fichiers de style/composants susceptibles de contenir des couleurs en dur (hors fichier de tokens). */
export function walkStyleFiles(srcDir: string, exclude: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(srcDir)) return out;
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const p = path.join(srcDir, e.name);
    if (e.isDirectory()) out.push(...walkStyleFiles(p, exclude));
    else if (/\.(tsx|jsx|ts|css)$/.test(e.name) && path.resolve(p) !== path.resolve(exclude)) out.push(p);
  }
  return out;
}

const inFlight = new Set<string>();

export type ProgressFn = (ev: { type: string; text?: string; skin?: SkinRender }) => void;

/**
 * Génère et rend K skins du projet. Émet la progression via onProgress. NON-DESTRUCTIF :
 * tous les fichiers touchés sont restaurés en finally (même en cas d'erreur).
 */
export async function generateTasteSkins(
  projectDir: string,
  opts: { k?: number; directions?: string[]; outDir: string },
  onProgress: ProgressFn,
  deps: TasteRenderDeps = {},
): Promise<SkinRender[]> {
  const tokensFile = findTokensFile(projectDir);
  if (!tokensFile) throw new Error("aucun fichier de tokens (tokens.css / index.css) trouvé dans ce projet");

  const key = path.resolve(projectDir);
  if (inFlight.has(key)) throw new Error("une génération de goût est déjà en cours pour ce projet");
  inFlight.add(key);

  const captureDeps = deps.captureDeps ?? defaultCaptureDeps;
  const ask = deps.ask ?? defaultSkinAsk;
  const start = deps.startPreview ?? realStart;
  const stop = deps.stopPreview ?? realStop;
  const capture = deps.capture ?? realCapture;
  const refDir = deps.refDir ?? REF_DIR_DEFAULT;
  const settle = deps.hmrSettleMs ?? 2600;

  const refs = loadTasteReferences(refDir);
  const chosen: TasteDirection[] = opts.directions?.length
    ? (opts.directions.map((id) => catalogDirection(id)).filter((d): d is TasteDirection => d !== null))
    : sampleDirections(opts.k ?? 4);

  const srcDir = path.join(projectDir, "src");
  const styleFiles = walkStyleFiles(srcDir, tokensFile);
  const originalTokens = fs.readFileSync(tokensFile, "utf8");
  const originals: FileContent[] = styleFiles.map((p) => ({ path: p, content: fs.readFileSync(p, "utf8") }));
  const restoreAll = () => {
    fs.writeFileSync(tokensFile, originalTokens);
    for (const f of originals) fs.writeFileSync(f.path, f.content);
  };

  fs.mkdirSync(opts.outDir, { recursive: true });
  const results: SkinRender[] = [];
  const built: { dir: TasteDirection; tokens: string; edits: FileContent[]; palette: string[] }[] = [];

  try {
    // 1) Génération (Sharingan + GLM) — aperçu pas encore lancé.
    for (const d of chosen) {
      onProgress({ type: "status", text: `Capture des références — ${d.name}` });
      const dRefs = refs.directions.find((r) => r.id === d.id) ?? {
        id: d.id, name: d.name, kind: "direction", urls: d.referenceUrls, images: [], notes: "", fromCatalog: false,
      };
      const cap = await captureDirectionRefs(dRefs, captureDeps);
      onProgress({ type: "status", text: `Génération du skin — ${d.name}` });
      const skin = await skinTokens(originalTokens, buildSkinBrief(d, cap), ask);
      if (!skin.ok) {
        results.push({ id: d.id, name: d.name, ok: false, reason: skin.reason, palette: cap.palette });
        continue;
      }
      const remap = await remapLiterals(originals, originalTokens, skin.css!, ask);
      built.push({ dir: d, tokens: skin.css!, edits: remap.edits, palette: cap.palette });
    }

    // 2) Rendu : aperçu up, swap, screenshot.
    onProgress({ type: "status", text: "Démarrage de l'aperçu…" });
    const { url } = await start(projectDir);
    for (const b of built) {
      restoreAll();
      fs.writeFileSync(tokensFile, b.tokens);
      for (const e of b.edits) fs.writeFileSync(e.path, e.content);
      await sleep(settle);
      const file = `${b.dir.id}.jpg`;
      fs.writeFileSync(path.join(opts.outDir, file), await capture(url));
      const r: SkinRender = { id: b.dir.id, name: b.dir.name, ok: true, file, palette: b.palette };
      results.push(r);
      onProgress({ type: "skin", skin: r });
    }
  } finally {
    restoreAll();
    await stop(projectDir).catch(() => {});
    inFlight.delete(key);
  }
  return results;
}
