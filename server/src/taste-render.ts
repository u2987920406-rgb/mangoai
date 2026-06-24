// Moteur de Goût (#149) — orchestrateur de RENDU : pour K directions, génère le skin
// (tokens + remap littéraux), l'applique au projet, lance l'aperçu, screenshot, restaure.
// Productionnise le banc exp-taste-render2. TOUTES les dépendances lourdes (Sharingan,
// GLM, aperçu Vite, capture) sont injectables → testable sans réseau ni navigateur.

import fs from "node:fs";
import path from "node:path";
import { loadTasteReferences } from "./taste-refs.js";
import { captureDirectionRefs, buildSkinBrief, catalogDirection, defaultCaptureDeps, type CaptureDeps } from "./taste-engine.js";
import { skinTokens, remapLiterals, redesignHero, firstSectionRange, defaultSkinAsk, type SkinAsk, type FileContent } from "./taste-generate.js";
import { sampleDirections, directionMood, type TasteDirection } from "./taste-directions.js";
import { sampleCompositions, compositionBrief, type HeroComposition } from "./taste-compositions.js";
import { imageForDirection } from "./taste-images.js";
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
  // Juge-pixels (#149 v2) — remplis par taste-judge.ts au niveau route (optionnels).
  score?: number; // note 0-100 du cerveau vision (selon le goût appris)
  judgeReason?: string; // une ligne : pourquoi cette note
  broken?: boolean; // le juge a vu une casse visuelle (débordement, illisible)
  recommended?: boolean; // le meilleur non-cassé (pré-sélectionné dans la galerie)
}

export interface TasteRenderDeps {
  captureDeps?: CaptureDeps;
  ask?: SkinAsk;
  image?: (query: string, seed: number) => Promise<string>; // source d'image réelle (Pexels) injectable
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

/** Trouve le composant qui porte le HERO à re-designer (page d'accueil, ou le fichier
 *  le plus riche en <section>). Null si aucun. */
export function findHeroFile(projectDir: string): string | null {
  const named = [
    "src/pages/Accueil.tsx", "src/pages/Home.tsx", "src/pages/Index.tsx", "src/pages/Landing.tsx",
    "src/pages/Accueil.jsx", "src/pages/Home.jsx", "src/App.tsx", "src/App.jsx",
  ];
  for (const c of named) {
    const p = path.join(projectDir, c);
    try {
      if (fs.existsSync(p) && firstSectionRange(fs.readFileSync(p, "utf8"))) return p;
    } catch { /* skip */ }
  }
  let best: { p: string; n: number } | null = null;
  for (const p of walkStyleFiles(path.join(projectDir, "src"), "")) {
    if (!/\.(tsx|jsx)$/.test(p)) continue;
    try {
      const n = (fs.readFileSync(p, "utf8").match(/<section\b/g) || []).length;
      if (n > 0 && (!best || n > best.n)) best = { p, n };
    } catch { /* skip */ }
  }
  return best?.p ?? null;
}

/** Devine le SUJET du projet (pour la recherche d'image) depuis son nom de dossier. */
export function deriveSubject(projectDir: string): string {
  const stop = new Set(["mango", "app", "my", "the", "ts", "js", "nuit", "test", "demo", "v1", "v2", "projet", "project", "mon", "une", "page"]);
  const words = path
    .basename(projectDir)
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((w) => w && !stop.has(w) && !/^\d+$/.test(w) && !/^[a-z0-9]{12,}$/.test(w));
  return words.length ? words.join(" ") : "modern interior";
}

const inFlight = new Set<string>();

export type ProgressFn = (ev: { type: string; text?: string; skin?: SkinRender }) => void;

/**
 * Génère et rend K skins du projet. Émet la progression via onProgress. NON-DESTRUCTIF :
 * tous les fichiers touchés sont restaurés en finally (même en cas d'erreur).
 */
/** Une variante à rendre. En maille « skin » elle porte une DIRECTION (style varié) ;
 *  en maille « héros » toutes partagent UNE direction (style fixe) et varient la COMPOSITION. */
interface Variant {
  id: string; // identifie la variante (= direction.id en skin, = composition.id en héros)
  name: string; // libellé affiché
  dir: TasteDirection; // la direction (style) — partagée par toutes en maille héros
  composition?: HeroComposition; // la composition imposée — uniquement en maille héros
}

export async function generateTasteSkins(
  projectDir: string,
  opts: { k?: number; directions?: string[]; outDir: string; maille?: "skin" | "hero"; favorIds?: string[] },
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
  const image = deps.image ?? ((q: string, s: number) => imageForDirection(q, s));
  const refDir = deps.refDir ?? REF_DIR_DEFAULT;
  const settle = deps.hmrSettleMs ?? 2600;

  const refs = loadTasteReferences(refDir);
  const k = opts.k ?? 4;

  // Boucle fermée (#149 v2) : amorce le sampler avec les favoris appris (exploitation),
  // mais PLAFONNÉE à ~la moitié de k → on garde toujours des places d'exploration (le
  // farthest-point / pas régulier remplit le reste). Aucun favori → undefined → inchangé.
  const seedFavorites = (ids?: string[]): string[] | undefined =>
    ids?.length ? ids.slice(0, Math.max(1, Math.floor(k / 2))) : undefined;

  // Construction des variantes selon la maille.
  let variants: Variant[];
  if (opts.maille === "hero") {
    // Maille « héros » : STYLE fixe (une direction), K COMPOSITIONS de hero différentes.
    const baseId = opts.directions?.[0];
    const base = (baseId ? catalogDirection(baseId) : null) ?? sampleDirections(1)[0];
    variants = sampleCompositions(k, { favorIds: seedFavorites(opts.favorIds) }).map((c) => ({ id: c.id, name: c.name, dir: base, composition: c }));
  } else {
    // Maille « skin » (défaut) : K DIRECTIONS différentes (composition libre).
    const dirs: TasteDirection[] = opts.directions?.length
      ? opts.directions.map((id) => catalogDirection(id)).filter((d): d is TasteDirection => d !== null)
      : sampleDirections(k, { favorIds: seedFavorites(opts.favorIds) });
    variants = dirs.map((d) => ({ id: d.id, name: d.name, dir: d }));
  }

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
  const built: { id: string; name: string; tokens: string; edits: FileContent[]; palette: string[] }[] = [];

  const heroFile = findHeroFile(projectDir);
  const subject = deriveSubject(projectDir);
  const origByPath = new Map(originals.map((f) => [f.path, f.content]));
  const origHero = heroFile ? origByPath.get(heroFile) : undefined;

  // Capture (Sharingan) + skin des tokens : CALCULÉS UNE FOIS par direction puis mis en
  // cache. En maille héros (style fixe), les K compositions réutilisent le même skin.
  type SkinCache = { ok: true; brief: string; css: string; palette: string[] } | { ok: false; reason?: string; palette: string[] };
  const skinCache = new Map<string, SkinCache>();
  async function skinForDir(d: TasteDirection): Promise<SkinCache> {
    const hit = skinCache.get(d.id);
    if (hit) return hit;
    onProgress({ type: "status", text: `Capture des références — ${d.name}` });
    const dRefs = refs.directions.find((r) => r.id === d.id) ?? {
      id: d.id, name: d.name, kind: "direction" as const, urls: d.referenceUrls, images: [], notes: "", fromCatalog: false,
    };
    const cap = await captureDirectionRefs(dRefs, captureDeps);
    const brief = buildSkinBrief(d, cap);
    onProgress({ type: "status", text: `Génération du skin — ${d.name}` });
    const skin = await skinTokens(originalTokens, brief, ask);
    const entry: SkinCache = skin.ok
      ? { ok: true, brief, css: skin.css!, palette: cap.palette }
      : { ok: false, reason: skin.reason, palette: cap.palette };
    skinCache.set(d.id, entry);
    return entry;
  }

  try {
    // 1) Génération (Sharingan + GLM) — aperçu pas encore lancé.
    for (const [i, v] of variants.entries()) {
      const cached = await skinForDir(v.dir);
      if (!cached.ok) {
        results.push({ id: v.id, name: v.name, ok: false, reason: cached.reason, palette: cached.palette });
        continue;
      }

      // Contenus de départ (originaux) ; on greffe le REDESIGN du hero (layout + vraie image).
      // En maille héros, la COMPOSITION est imposée ; en maille skin, GLM choisit le layout.
      const finalByPath = new Map(origByPath);
      if (heroFile && origHero) {
        const range = firstSectionRange(origHero);
        if (range) {
          onProgress({ type: "status", text: `Re-design du hero — ${v.name}` });
          const img = await image(`${subject} ${directionMood(v.dir.id)}`.trim(), i + 1);
          const compBrief = v.composition ? compositionBrief(v.composition) : undefined;
          const rd = await redesignHero(range.hero, cached.brief, img, ask, compBrief);
          if (rd.ok) finalByPath.set(heroFile, `${range.before}\n${rd.hero}\n${range.after}`); // sinon repli token-only
        }
      }

      // Remap des couleurs en dur restantes (CTA, overlays) sur les contenus à jour.
      const remap = await remapLiterals([...finalByPath].map(([p, content]) => ({ path: p, content })), originalTokens, cached.css, ask);
      for (const e of remap.edits) finalByPath.set(e.path, e.content);

      const edits: FileContent[] = [...finalByPath]
        .filter(([p, c]) => c !== origByPath.get(p))
        .map(([p, content]) => ({ path: p, content }));
      built.push({ id: v.id, name: v.name, tokens: cached.css, edits, palette: cached.palette });
    }

    // 2) Rendu : aperçu up, swap, screenshot.
    onProgress({ type: "status", text: "Démarrage de l'aperçu…" });
    const { url } = await start(projectDir);
    for (const b of built) {
      restoreAll();
      fs.writeFileSync(tokensFile, b.tokens);
      for (const e of b.edits) fs.writeFileSync(e.path, e.content);
      await sleep(settle);
      const file = `${b.id}.jpg`;
      fs.writeFileSync(path.join(opts.outDir, file), await capture(url));
      const r: SkinRender = { id: b.id, name: b.name, ok: true, file, palette: b.palette };
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
