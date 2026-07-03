// Génération d'images via l'API Krea (api.krea.ai) — modèle Krea 2 (open-source,
// krea-ai/krea-2). Intégration « Image Creator » 2.0 + maillon Krea de genere_image.
//
// Cycle : POST /generate/image/krea/krea-2/<variant> → { job_id } → GET /jobs/<id>
// (polling) → { status:"completed", result:{ urls:[...] } } → téléchargement du PNG.
//
// Contrat : ne lève JAMAIS — renvoie { ok:false, error } avec un message PRÉSENTABLE
// (le 402 « solde API à recharger » est un état normal chez Raf, pas une panne).
// Transport injecté (KreaDeps) → testable sans réseau (test-krea.ts).

export interface KreaDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export interface KreaOptions {
  prompt: string;
  /** "1:1" (défaut) · "3:2" · "2:3" · "16:9" · "9:16" · "4:5" */
  aspectRatio?: string;
  /** "1K" (défaut) · "2K" */
  resolution?: string;
  /** Variante du modèle (défaut "medium"). */
  variant?: string;
  timeoutMs?: number;
}

export type KreaResult =
  | { ok: true; bytes: Uint8Array; sourceUrl: string; ms: number }
  | { ok: false; error: string; status?: number };

const API_URL = () => (process.env.KREA_API_URL ?? "https://api.krea.ai").replace(/\/$/, "");
const DEFAULT_TIMEOUT = () => Number(process.env.KREA_TIMEOUT_MS ?? 120_000);
const POLL_INTERVAL_MS = 2_000;

export const ASPECT_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:5"] as const;

export function kreaEnabled(): boolean {
  return Boolean(process.env.KREA_API_KEY?.trim());
}

/** Message présentable par code HTTP — le 402 est l'état « solde à recharger » (normal). */
export function kreaErrorMessage(status: number, body?: unknown): string {
  if (status === 401) return "clé API Krea invalide (KREA_API_KEY)";
  if (status === 402) return "solde API Krea à zéro — recharge sur krea.ai (le solde API est séparé du compte web)";
  if (status === 429) return "limite de requêtes Krea atteinte — réessaie dans un moment";
  const msg =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).message === "string"
      ? ` — ${(body as Record<string, unknown>).message}`
      : "";
  return `erreur API Krea (HTTP ${status})${msg}`;
}

const realDeps: KreaDeps = {
  fetchFn: fetch,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export async function generateKreaImage(opts: KreaOptions, deps: KreaDeps = realDeps): Promise<KreaResult> {
  const key = process.env.KREA_API_KEY?.trim();
  if (!key) return { ok: false, error: "KREA_API_KEY absente (server/.env)" };
  const prompt = opts.prompt?.trim();
  if (!prompt) return { ok: false, error: "prompt vide" };

  const aspectRatio = ASPECT_RATIOS.includes(opts.aspectRatio as (typeof ASPECT_RATIOS)[number])
    ? (opts.aspectRatio as string)
    : "1:1";
  const resolution = opts.resolution === "2K" ? "2K" : "1K";
  const variant = opts.variant ?? "medium";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT();
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const started = Date.now();

  try {
    // 1. Création du job.
    const create = await deps.fetchFn(`${API_URL()}/generate/image/krea/krea-2/${variant}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, aspect_ratio: aspectRatio, resolution }),
    });
    const createBody = (await create.json().catch(() => ({}))) as Record<string, unknown>;
    if (!create.ok) return { ok: false, error: kreaErrorMessage(create.status, createBody), status: create.status };
    const jobId = typeof createBody.job_id === "string" ? createBody.job_id : null;
    if (!jobId) return { ok: false, error: "réponse Krea sans job_id" };

    // 2. Polling jusqu'à complétion (borné par timeoutMs).
    while (Date.now() - started < timeoutMs) {
      await deps.sleep(POLL_INTERVAL_MS);
      const poll = await deps.fetchFn(`${API_URL()}/jobs/${jobId}`, { headers: { Authorization: `Bearer ${key}` } });
      const job = (await poll.json().catch(() => ({}))) as Record<string, unknown>;
      const status = typeof job.status === "string" ? job.status : "";
      if (status === "completed") {
        const urls = (job.result as Record<string, unknown> | undefined)?.urls;
        const url = Array.isArray(urls) && typeof urls[0] === "string" ? urls[0] : null;
        if (!url) return { ok: false, error: "job Krea terminé mais sans URL d'image" };
        // 3. Téléchargement du PNG.
        const img = await deps.fetchFn(url);
        if (!img.ok) return { ok: false, error: `téléchargement de l'image impossible (HTTP ${img.status})` };
        const bytes = new Uint8Array(await img.arrayBuffer());
        return { ok: true, bytes, sourceUrl: url, ms: Date.now() - started };
      }
      if (status === "failed" || status === "error" || status === "cancelled") {
        return { ok: false, error: `job Krea en échec (${status})` };
      }
      // pending / processing → on continue.
    }
    return { ok: false, error: `délai dépassé (${Math.round(timeoutMs / 1000)} s) — le job Krea n'a pas abouti` };
  } catch (e) {
    return { ok: false, error: `API Krea injoignable : ${e instanceof Error ? e.message : String(e)}` };
  }
}
