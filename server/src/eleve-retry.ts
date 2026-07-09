// Retry/backoff pour le transport du cerveau Élève (postEleveCompletions).
//
// Mesuré (2026-06-28) : un Élève cloud capable (Gemini 2.5 Flash) MÈNE la boucle agentique
// (read → edit → re-read → re-edit, auto-correction) mais le palier GRATUIT renvoie HTTP 429
// (rate-limit) → la boucle abandonnait au 1ᵉʳ 429 (aucun retry). Idem GLM cloud (429 vu en
// session). Remède : retenter quelques fois avec backoff sur les codes TRANSITOIRES
// (429 rate-limit, 503 overload) — en respectant l'en-tête Retry-After si présent. Les autres
// codes (400/401/500…) ne sont PAS retentés (vraie erreur / pas transitoire ; évite de boucler
// sur un 500 d'un runner local cassé). PUR, déterministe, testable.

/** Codes HTTP transitoires que l'on retente. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/**
 * Délai (ms) avant la prochaine tentative, ou `null` si on NE retente PAS (code non
 * transitoire OU budget de tentatives épuisé). Respecte `Retry-After` (secondes) s'il est
 * fourni, sinon backoff exponentiel borné. `attempt` = numéro de la tentative qui vient
 * d'échouer (0 pour la 1ʳᵉ).
 */
export function eleveRetryDelayMs(
  status: number,
  attempt: number,
  retryAfter: string | null,
  maxRetries = 4,
): number | null {
  if (!isRetryableStatus(status) || attempt >= maxRetries) return null;
  const ra = Number((retryAfter ?? "").trim());
  if (Number.isFinite(ra) && ra > 0) return Math.min(Math.round(ra * 1000), 30_000);
  // backoff exponentiel : 2s, 4s, 8s, 16s… borné à 20s.
  return Math.min(2000 * 2 ** attempt, 20_000);
}

/** Nombre de tentatives configurable (env), borné, défaut 4. */
export function eleveMaxRetries(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.ELEVE_RETRY_MAX ?? 4);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 8) : 4;
}

// ── Politique de retry partagée, OPT-IN (chantier #2, T3) ────────────────────
// Le retry HTTP transitoire (429/503 + respect Retry-After) était CÂBLÉ EN DUR dans
// postEleveCompletions. On l'expose en POLITIQUE réutilisable, mais le DÉFAUT reste
// « aucun retry » : un transport ne retente QUE si on lui passe une RetryPolicy. Ça
// préserve à l'octet les chemins qui n'en avaient pas. Seul le transport à outils de
// l'Élève (postEleveCompletions) active la politique — l'extension à d'autres
// transports est un CHANGEMENT de comportement, reportée (décision de Raf).

export interface RetryPolicy {
  /** Budget de tentatives (0 = aucun retry). */
  maxRetries: number;
  /** Si défini, un fetch qui LÈVE (timeout/coupure réseau) est traité comme ce code
   *  transitoire (l'Élève utilise 503) au lieu d'abandonner au 1ᵉʳ hoquet cloud.
   *  Absent → l'exception réseau remonte telle quelle (aucun retry réseau). */
  networkErrorStatus?: number;
}

/** La politique de l'Élève : 429/503, Retry-After respecté, réseau traité en 503.
 *  C'est la SEULE politique active par défaut dans le code (via postEleveCompletions). */
export function eleveRetryPolicy(env: NodeJS.ProcessEnv = process.env): RetryPolicy {
  return { maxRetries: eleveMaxRetries(env), networkErrorStatus: 503 };
}

/** Libellés d'erreur d'un transport (préservés à l'octet par transport). */
export interface RetryLabels {
  /** Code HTTP non transitoire (ou budget épuisé). */
  http: (status: number) => string;
  /** fetch qui lève, budget réseau épuisé. `attempts` = nb de tentatives faites. */
  network: (attempts: number, name: string) => string;
}

/** fetch avec retry OPT-IN. `policy` absent → UN SEUL essai (échec = throw direct,
 *  byte-identique au fetch nu). Sinon retente les codes transitoires avec backoff.
 *  `makeInit` est rappelé À CHAQUE tentative → un AbortSignal.timeout FRAIS par essai
 *  (le timeout borne CHAQUE tentative, comme l'ancienne boucle inline). Renvoie une
 *  Response OK ; lève avec les libellés fournis sur échec définitif. */
export async function fetchWithRetry(
  url: string,
  makeInit: () => RequestInit,
  policy: RetryPolicy | undefined,
  labels: RetryLabels,
): Promise<Response> {
  if (!policy) {
    const res = await fetch(url, makeInit());
    if (!res.ok) {
      await res.text().catch(() => undefined); // draine le corps avant d'abandonner
      throw new Error(labels.http(res.status));
    }
    return res;
  }
  const { maxRetries, networkErrorStatus } = policy;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, makeInit());
    } catch (e) {
      if (networkErrorStatus === undefined) throw e;
      const delay = eleveRetryDelayMs(networkErrorStatus, attempt, null, maxRetries);
      if (delay === null) throw new Error(labels.network(attempt + 1, (e as Error)?.name ?? "réseau"));
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (res.ok) return res;
    const delay = eleveRetryDelayMs(res.status, attempt, res.headers.get("retry-after"), maxRetries);
    await res.text().catch(() => undefined); // draine avant de retenter/abandonner
    if (delay === null) throw new Error(labels.http(res.status));
    await new Promise((r) => setTimeout(r, delay));
  }
}
