// Outil GENERE_IMAGE de l'Élève — génération d'images IA SOUVERAINE via Flux en LOCAL
// (ComfyUI API, $0). Comble la limite L16 : jusqu'ici Mango ne savait que TROUVER des photos
// (Pexels, #153) ; ici il GÉNÈRE des images sur mesure. Pexels reste le défaut rapide ;
// genere_image sert quand le sur-mesure vaut l'attente (~quelques minutes sur GPU modeste).
//
// Pipeline : POST le workflow Flux schnell (GGUF) à ComfyUI (/prompt) → poll /history →
// récupère le PNG (/view) → l'écrit dans public/generated/ du projet (Vite le sert à la
// racine → `<img src="/generated/xxx.png">`). Gaté ELEVE_FLUX=on (défaut OFF). Ne lève jamais ;
// si ComfyUI est injoignable, renvoie une erreur pédagogique (repli chercher_image/Pexels).
//
// Tout est configurable par env (URL, modèles, étapes) et les deps réseau/horloge sont
// injectables → testable sans ComfyUI réel.

import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { KernelTool, KernelToolResult } from "./kernel-mcp.js";

function comfyUrl(): string {
  return (process.env.FLUX_COMFY_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
}
function timeoutMs(): number {
  return Number(process.env.FLUX_TIMEOUT_MS ?? 360_000);
}

export interface FluxModels {
  unet: string;
  clip1: string;
  clip2: string;
  vae: string;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
}

/** Modèles/réglages Flux, surchargés par env (défauts = setup local prouvé). PUR. */
export function fluxModels(): FluxModels {
  return {
    unet: process.env.FLUX_UNET || "flux1-schnell-Q4_K_S.gguf",
    clip1: process.env.FLUX_CLIP1 || "clip_l.safetensors",
    clip2: process.env.FLUX_CLIP2 || "t5-v1_1-xxl-encoder-Q5_K_M.gguf",
    vae: process.env.FLUX_VAE || "ae.safetensors",
    steps: Number(process.env.FLUX_STEPS ?? 4),
    cfg: Number(process.env.FLUX_CFG ?? 1),
    sampler: process.env.FLUX_SAMPLER || "euler",
    scheduler: process.env.FLUX_SCHEDULER || "simple",
  };
}

/** Construit le graphe-workflow ComfyUI (format API). PUR — pipeline Flux prouvé, avec
 *  un étage d'UPSCALE optionnel (Real-ESRGAN, nœuds intégrés ComfyUI) inséré avant la sauvegarde. */
export function buildFluxWorkflow(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  m: FluxModels,
  opts: { upscale?: boolean } = {},
): Record<string, unknown> {
  const g: Record<string, unknown> = {
    "1": { class_type: "UnetLoaderGGUF", inputs: { unet_name: m.unet } },
    "2": { class_type: "DualCLIPLoaderGGUF", inputs: { clip_name1: m.clip1, clip_name2: m.clip2, type: "flux" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: m.vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] } },
    "6": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    "7": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        seed,
        steps: m.steps,
        cfg: m.cfg,
        sampler_name: m.sampler,
        scheduler: m.scheduler,
        denoise: 1.0,
      },
    },
    "8": { class_type: "VAEDecode", inputs: { samples: ["7", 0], vae: ["3", 0] } },
  };
  // Étage d'upscale optionnel (étape 5 de la vidéo) : Real-ESRGAN ×4 via les nœuds intégrés.
  let imageSource: [string, number] = ["8", 0];
  if (opts.upscale) {
    g["10"] = { class_type: "UpscaleModelLoader", inputs: { model_name: process.env.FLUX_UPSCALE_MODEL || "RealESRGAN_x4plus.pth" } };
    g["11"] = { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["10", 0], image: ["8", 0] } };
    imageSource = ["11", 0];
  }
  g["9"] = { class_type: "SaveImage", inputs: { images: imageSource, filename_prefix: "mango_flux" } };
  return g;
}

export interface FluxDeps {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const realFluxDeps: FluxDeps = {
  fetchImpl: (...args) => fetch(...(args as Parameters<typeof fetch>)),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export type FluxResult = { ok: true; bytes: Uint8Array; filename: string } | { ok: false; error: string };

/** Orchestration ComfyUI : soumet, attend, récupère l'image. Ne lève jamais (renvoie {ok:false}). */
export async function generateFlux(
  prompt: string,
  opts: { width: number; height: number; seed: number; upscale?: boolean },
  deps: FluxDeps = realFluxDeps,
): Promise<FluxResult> {
  const base = comfyUrl();
  const graph = buildFluxWorkflow(prompt, opts.width, opts.height, opts.seed, fluxModels(), { upscale: opts.upscale });
  let promptId: string;
  try {
    const res = await deps.fetchImpl(`${base}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: "mango-genere-image" }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `ComfyUI a refusé le workflow (HTTP ${res.status}). ${t.slice(0, 300)}` };
    }
    const j = (await res.json()) as { prompt_id?: string; error?: unknown };
    if (!j.prompt_id) return { ok: false, error: `ComfyUI n'a pas renvoyé de prompt_id : ${JSON.stringify(j).slice(0, 300)}` };
    promptId = j.prompt_id;
  } catch (e) {
    return { ok: false, error: `ComfyUI injoignable sur ${base} (lance-le : python ComfyUI/main.py --listen 127.0.0.1 --port 8188). ${e instanceof Error ? e.message : String(e)}` };
  }

  // Poll /history jusqu'à l'image, une erreur, ou le délai.
  const deadline = deps.now() + timeoutMs();
  let filename = "";
  let subfolder = "";
  while (deps.now() < deadline) {
    await deps.sleep(2500);
    try {
      const h = await deps.fetchImpl(`${base}/history/${promptId}`);
      if (!h.ok) continue;
      const data = (await h.json()) as Record<string, { status?: { status_str?: string }; outputs?: Record<string, { images?: { filename?: string; subfolder?: string; type?: string }[] }> }>;
      const entry = data[promptId];
      if (!entry) continue;
      const imgs = entry.outputs?.["9"]?.images;
      if (imgs && imgs.length && imgs[0]?.filename) {
        filename = imgs[0].filename;
        subfolder = imgs[0].subfolder ?? "";
        break;
      }
      if (entry.status?.status_str === "error") {
        return { ok: false, error: "ComfyUI a rapporté une erreur d'exécution (vérifie les modèles/VRAM dans ses logs)." };
      }
    } catch {
      /* transitoire : on réessaie jusqu'au délai */
    }
  }
  if (!filename) return { ok: false, error: `Génération trop longue (> ${Math.round(timeoutMs() / 1000)}s). Sur GPU modeste, augmente FLUX_TIMEOUT_MS ou réduis la taille.` };

  // Récupère les octets du PNG via /view.
  try {
    const q = `filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=output`;
    const v = await deps.fetchImpl(`${base}/view?${q}`);
    if (!v.ok) return { ok: false, error: `Image générée mais /view a échoué (HTTP ${v.status}).` };
    const buf = new Uint8Array(await v.arrayBuffer());
    if (buf.length === 0) return { ok: false, error: "Image vide renvoyée par ComfyUI." };
    return { ok: true, bytes: buf, filename };
  } catch (e) {
    return { ok: false, error: `Récupération de l'image échouée : ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Outil de l'Élève ─────────────────────────────────────────────────────────

function resolveInside(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`chemin hors du projet : ${rel}`);
  return abs;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

export interface FluxToolDeps extends FluxDeps {
  writeImage: (absPath: string, bytes: Uint8Array) => void;
  /** Détourage : retire le fond → PNG RGBA transparent (étape « PNG transparent » de la vidéo). */
  removeBg: (bytes: Uint8Array) => Promise<Uint8Array>;
}

/** Python qui porte rembg (par défaut celui de ComfyUI). Donné par l'env (machine-dépendant). */
function fluxPython(): string | null {
  return process.env.FLUX_PYTHON?.trim() || null;
}

// rembg en une ligne : lit le PNG, retire le fond, écrit le RGBA.
const REMBG_SCRIPT = "import sys;from rembg import remove;open(sys.argv[2],'wb').write(remove(open(sys.argv[1],'rb').read()))";

/** Détourage RÉEL via rembg (sous-process Python). Lève si FLUX_PYTHON absent / rembg KO. */
async function realRemoveBg(bytes: Uint8Array): Promise<Uint8Array> {
  const py = fluxPython();
  if (!py) throw new Error("FLUX_PYTHON non défini (python avec rembg installé) — requis pour le détourage transparent.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mango-rembg-"));
  const inP = path.join(dir, "in.png");
  const outP = path.join(dir, "out.png");
  fs.writeFileSync(inP, bytes);
  await new Promise<void>((resolve, reject) => {
    execFile(py, ["-s", "-c", REMBG_SCRIPT, inP, outP], { timeout: 180_000, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
  const out = fs.readFileSync(outP);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* nettoyage best-effort */
  }
  return new Uint8Array(out);
}

const realToolDeps: FluxToolDeps = {
  ...realFluxDeps,
  writeImage: (absPath, bytes) => {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, bytes);
  },
  removeBg: realRemoveBg,
};

export function buildEleveFluxTools(projectDir: string, deps: FluxToolDeps = realToolDeps): KernelTool[] {
  const genereImage: KernelTool = {
    name: "genere_image",
    description:
      "GÉNÈRE une image IA sur mesure (Flux, en local, gratuit) quand aucune vraie photo ne convient — logo, illustration, visuel unique, ASSET DE JEU (sprite, PNJ, décor). Donne un `prompt` DÉTAILLÉ en ANGLAIS (sujet, style, lumière, ambiance). Options : `transparent:true` détoure le fond → PNG TRANSPARENT propre (idéal sprite/PNJ — décris alors le sujet « on a plain background »), `upscale:true` augmente la netteté (×4). L'image est enregistrée dans le projet ; l'outil renvoie son chemin (ex. `/generated/xxx.png`). Plus LENT que chercher_image — pour une VRAIE photo, préfère chercher_image (Pexels).",
    inputSchema: {
      prompt: z.string().describe("Description ANGLAISE détaillée (sujet + style + lumière + ambiance). Pour un asset détouré, ajoute « on a plain white background »."),
      nom: z.string().optional().describe("Nom de fichier voulu (sans extension). Sinon dérivé du prompt."),
      largeur: z.number().int().min(256).max(1536).optional().describe("Largeur en px (défaut 1024, multiple de 64)"),
      hauteur: z.number().int().min(256).max(1536).optional().describe("Hauteur en px (défaut 1024, multiple de 64)"),
      transparent: z.boolean().optional().describe("Détoure le fond → PNG RGBA transparent (sprite/PNJ/asset propre)."),
      upscale: z.boolean().optional().describe("Augmente la netteté/résolution (Real-ESRGAN ×4) — pour des assets nets."),
    },
    handler: async (args): Promise<KernelToolResult> => {
      const prompt = String(args.prompt ?? "").trim();
      if (!prompt) return { text: "Donne un `prompt` décrivant l'image (en anglais, détaillé).", isError: true };
      const snap = (n: number) => Math.max(256, Math.min(1536, Math.round(n / 64) * 64));
      const width = snap(Number(args.largeur ?? 1024));
      const height = snap(Number(args.hauteur ?? 1024));
      const upscale = args.upscale === true;
      const transparent = args.transparent === true;
      const seed = (Math.abs(hashString(prompt)) % 1_000_000) + 1; // déterministe par prompt (reproductible, sans Math.random)
      try {
        const r = await generateFlux(prompt, { width, height, seed, upscale }, deps);
        if (!r.ok) {
          return { text: `Génération impossible : ${r.error}\n(Repli : utilise chercher_image pour une vraie photo Pexels.)`, isError: true };
        }
        let bytes = r.bytes;
        if (transparent) {
          try {
            bytes = await deps.removeBg(bytes);
          } catch (e) {
            return {
              text: `Image générée mais le détourage a échoué : ${e instanceof Error ? e.message : String(e)} (rembg/FLUX_PYTHON ?). Réessaie sans transparent, ou détoure dans GIMP.`,
              isError: true,
            };
          }
        }
        const base = args.nom ? slugify(String(args.nom)) : slugify(prompt);
        const rel = path.join("public", "generated", `${base}.png`);
        const abs = resolveInside(projectDir, rel);
        deps.writeImage(abs, bytes);
        const tags = [transparent ? "transparent" : null, upscale ? "upscalé ×4" : null].filter(Boolean).join(", ");
        return {
          text:
            `Image générée${tags ? ` (${tags})` : ""} et enregistrée : ${rel}\n` +
            `Utilise-la via le chemin PUBLIC : \`/generated/${base}.png\` ` +
            `(ex. \`<img src="/generated/${base}.png" alt="${prompt.slice(0, 60)}" />\`).`,
        };
      } catch (e) {
        return { text: `Image non enregistrée : ${e instanceof Error ? e.message : String(e)}`, isError: true };
      }
    },
  };
  return [genereImage];
}

/** Hash déterministe d'une chaîne (seed reproductible sans Math.random). PUR. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
