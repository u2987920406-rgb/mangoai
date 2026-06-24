// Notification push vers Raf via ntfy.sh — un POST HTTP simple sur un « topic », gratuit,
// sans compte (l'app ntfy sur le téléphone s'abonne au topic). Utilisé par la curation de
// goût nocturne (#149 v2) pour prévenir le matin « X variantes à valider ».
//
// Principes : OPT-IN STRICT (no-op si pas de topic) · n'envoie qu'un TEXTE court + une URL
// LAN (jamais d'image ni de donnée sensible) · NE LÈVE JAMAIS (best-effort, le run nocturne
// ne doit pas casser si ntfy est down) · `fetch` injectable → testable sans réseau.

export interface NotifyDeps {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number }>;
}

const realDeps: NotifyDeps = {
  fetch: (url, init) => fetch(url, init) as unknown as Promise<{ ok: boolean; status: number }>,
};

export interface NotifyResult {
  sent: boolean;
  reason?: "no-topic" | "error";
  status?: number;
}

const NTFY_BASE = "https://ntfy.sh";

/** En-tête HTTP ntfy : ASCII only (ntfy refuse l'UTF-8 brut dans Title/Click). */
function asciiHeader(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
}

/**
 * Envoie une notification push. No-op (sent:false) si `topic` est vide → la fonctionnalité
 * est désactivée tant que Raf n'a pas configuré de topic. Ne lève jamais.
 */
export async function notifyNtfy(
  topic: string | undefined,
  title: string,
  message: string,
  clickUrl?: string,
  deps: NotifyDeps = realDeps,
): Promise<NotifyResult> {
  if (!topic || !topic.trim()) return { sent: false, reason: "no-topic" };
  const headers: Record<string, string> = { Title: asciiHeader(title) };
  if (clickUrl) headers["Click"] = clickUrl;
  try {
    const res = await deps.fetch(`${NTFY_BASE}/${encodeURIComponent(topic.trim())}`, {
      method: "POST",
      headers,
      body: message,
    });
    return res.ok ? { sent: true, status: res.status } : { sent: false, reason: "error", status: res.status };
  } catch {
    return { sent: false, reason: "error" };
  }
}

export { asciiHeader };
