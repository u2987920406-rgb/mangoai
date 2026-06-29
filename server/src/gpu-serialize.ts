// Sérialisation GPU : avant une génération Flux (ComfyUI, ~4 min à 100 % GPU sur la
// GTX 1080 Ti), on DÉCHARGE les modèles Ollama de la VRAM. But :
//   (1) éviter qu'une inférence LLM/VL locale (l'œil vision qwen3-vl, gemma…) tourne
//       EN MÊME TEMPS que Flux — deux charges GPU simultanées font grimper le pic de
//       consommation, cause probable des coupures brutales Kernel-Power 41 (l'alim
//       décroche sur le pic), voir limites.md L61 ;
//   (2) libérer ~6 Go de VRAM pour Flux sur une carte de 11 Go.
// Ollama recharge le modèle au prochain appel (cold-load) — compromis assumé : la
// stabilité prime sur la latence du regard suivant.
//
// Tout est best-effort : ne lève JAMAIS (une VRAM non libérée ne doit pas faire
// échouer une génération). Opt-out via FLUX_SERIALIZE_GPU=off. fetch injectable → testable.

function ollamaUrl(): string {
  return (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

export interface GpuSerializeDeps {
  fetchImpl: typeof fetch;
  log?: (msg: string) => void;
}

const realDeps: GpuSerializeDeps = {
  fetchImpl: (...args) => fetch(...(args as Parameters<typeof fetch>)),
  log: (m) => console.log(m),
};

/** Modèles actuellement chargés en VRAM (GET /api/ps). Ne lève jamais → [] en cas d'échec. */
export async function listLoadedModels(deps: GpuSerializeDeps = realDeps): Promise<string[]> {
  try {
    const r = await deps.fetchImpl(`${ollamaUrl()}/api/ps`);
    if (!r.ok) return [];
    const j = (await r.json()) as { models?: { name?: string; model?: string }[] };
    const names = (j.models ?? []).map((m) => m.name || m.model || "").filter(Boolean);
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

/** Décharge un modèle de la VRAM (POST /api/generate keep_alive:0). Ne lève jamais. */
export async function unloadModel(model: string, deps: GpuSerializeDeps = realDeps): Promise<boolean> {
  try {
    const r = await deps.fetchImpl(`${ollamaUrl()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, keep_alive: 0 }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Décharge TOUS les modèles Ollama chargés en VRAM pour laisser le GPU à Flux.
 * Respecte l'opt-out FLUX_SERIALIZE_GPU=off (→ skipped:true, ne touche à rien).
 * Ne lève JAMAIS. Renvoie la liste des modèles effectivement déchargés.
 */
export async function freeOllamaVram(
  deps: GpuSerializeDeps = realDeps,
): Promise<{ unloaded: string[]; skipped: boolean }> {
  if (process.env.FLUX_SERIALIZE_GPU === "off") return { unloaded: [], skipped: true };
  const loaded = await listLoadedModels(deps);
  if (loaded.length === 0) return { unloaded: [], skipped: false };
  const unloaded: string[] = [];
  for (const m of loaded) {
    if (await unloadModel(m, deps)) unloaded.push(m);
  }
  if (unloaded.length && deps.log) {
    deps.log(`[gpu] VRAM libérée pour Flux — déchargé : ${unloaded.join(", ")}`);
  }
  return { unloaded, skipped: false };
}

/** Adaptateur prêt à l'emploi pour FluxDeps.freeVram (réutilise le fetch global). */
export async function freeGpuForFlux(): Promise<void> {
  await freeOllamaVram();
}
