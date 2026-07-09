// Pré-chauffage de l'œil (lève la limite L22). Un VL local (qwen3-vl:8b, 5,7 Go)
// met ~3-4 min à charger À FROID sur la machine de Raf → le 1er regard
// (vois_ecran #151 / Œil-Coach #152 / Gardien #161) après un boot peut dépasser le
// timeout. On le charge donc EN VRAM dès le démarrage du backend, en arrière-plan.
//
// Fire-and-forget : ne bloque jamais le boot, ne lève JAMAIS (best-effort). Saute si
// l'œil est cloud (`:cloud` → pas de cold-load disque) ou si VISION_PREWARM=off.
// On envoie une minuscule image pour charger AUSSI le projecteur (mmproj) → le 1er
// vrai appel image est pleinement chaud.

import { getBrain, type BrainConfig } from "./brain/brain-registry.js";
import { askOllama } from "./ollama.js";

// 1×1 PNG transparent — charge le projecteur vision en plus des poids.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Le cerveau vision est-il un modèle LOCAL (donc sujet au cold-load) ? PUR. */
export function visionNeedsPrewarm(brain: Pick<BrainConfig, "provider" | "model">): boolean {
  return brain.provider === "ollama" && !!brain.model && !/:cloud$/i.test(brain.model);
}

export interface PrewarmDeps {
  brain: () => Pick<BrainConfig, "provider" | "model">;
  warm: (model: string) => Promise<unknown>;
  now: () => number;
  log: (msg: string) => void;
}

const realDeps: PrewarmDeps = {
  brain: () => getBrain("vision"),
  warm: (model) =>
    askOllama("Tu es l'œil de Mango — un VL. Réponds en un mot.", "Réponds : prêt.", {
      model,
      timeoutMs: 300_000, // cold-load ~3-4 min observé
      imageBase64: TINY_PNG,
    }),
  now: () => Date.now(),
  log: (m) => console.log(m),
};

/**
 * Pré-chauffe le cerveau vision local en arrière-plan. Ne lève JAMAIS ; saute
 * proprement si cloud/non-ollama ou si VISION_PREWARM=off. Renvoie une promesse
 * (résolue quand c'est chaud ou ignoré) — utile aux tests ; l'appelant boot ne
 * l'attend pas.
 */
export async function prewarmVision(deps: PrewarmDeps = realDeps): Promise<void> {
  if (process.env.VISION_PREWARM === "off") return;
  const brain = deps.brain();
  if (!visionNeedsPrewarm(brain)) return; // cloud / non-ollama → rien à pré-charger
  const model = brain.model!;
  const t0 = deps.now();
  deps.log(`[vision] pré-chauffage de l'œil local (${model})…`);
  try {
    await deps.warm(model);
    deps.log(`[vision] œil prêt en ${Math.round((deps.now() - t0) / 1000)}s (${model})`);
  } catch (e) {
    deps.log(`[vision] pré-chauffage ignoré (${e instanceof Error ? e.message.split("\n")[0] : String(e)}) — l'œil chargera au 1er usage`);
  }
}
