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
