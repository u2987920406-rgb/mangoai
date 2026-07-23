// Cœur PUR du superviseur de process du backend MangoOS (#196 fault-finding
// Partie 3, plan run-login-cached-noodle.md).
//
// Constat de l'audit (0.5) : `tsx watch` ne relance PAS le backend après un
// SIGKILL — seulement sur changement de fichier — vérifié en réel ce même jour
// avec un vrai crash-test. MangoQA (repo séparé) a déjà résolu exactement ce
// problème (`D:\IA\MangoQA\src\watchdog-core.ts`, 2 vrais crashs heap-overflow
// absorbés en prod). Ce fichier réplique fidèlement ce patron déjà éprouvé —
// mêmes fonctions, mêmes constantes, même logique — pour le backend MangoOS.
// La logique de décision (heartbeat périmé ? backoff ?) vit ici, pure et
// testable sans process ni disque ; l'orchestration (spawn, setInterval,
// lecture fichier réelle) vit dans watchdog.ts.

/** Contenu attendu de la sentinelle `.backend-active` (écrite par backend-heartbeat.ts). */
export interface HeartbeatData {
  heartbeat: string;
  pid: number;
}

/** Parse best-effort — une sentinelle absente/corrompue est un cas normal (process
 *  pas encore démarré, ou coupé au milieu d'une écriture), jamais une exception. */
export function parseHeartbeat(raw: string): HeartbeatData | null {
  try {
    const data = JSON.parse(raw);
    if (typeof data?.heartbeat !== "string" || typeof data?.pid !== "number") return null;
    const ms = Date.parse(data.heartbeat);
    if (Number.isNaN(ms)) return null;
    return { heartbeat: data.heartbeat, pid: data.pid };
  } catch {
    return null;
  }
}

/** Âge du heartbeat en ms. `null` (sentinelle absente/illisible) → Infinity : un
 *  process jamais démarré ou mort depuis longtemps doit être traité comme périmé. */
export function heartbeatAgeMs(raw: string | null, nowMs: number): number {
  if (raw === null) return Infinity;
  const parsed = parseHeartbeat(raw);
  if (parsed === null) return Infinity;
  return nowMs - Date.parse(parsed.heartbeat);
}

/** Un process VIVANT (pas d'exit détecté) mais BLOQUÉ (hang, deadlock) ne déclenche
 *  jamais l'event 'exit' du child_process — seul un heartbeat périmé le révèle.
 *  Seuil par défaut : 6× l'intervalle d'écriture (10s, cf. backend-heartbeat.ts). */
export const DEFAULT_STALE_THRESHOLD_MS = 60_000;

export function isHeartbeatStale(ageMs: number, thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS): boolean {
  return ageMs > thresholdMs;
}

/** Anti-tempête de relances : si le process meurt en boucle très rapprochée (ex.
 *  crash au démarrage, config cassée), reculer le délai de relance au lieu de
 *  marteler indéfiniment au même rythme. Backoff linéaire borné. */
export function respawnDelayMs(consecutiveFastFailures: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * (1 + consecutiveFastFailures);
  return Math.min(delay, maxDelayMs);
}

/** Un crash est "rapide" (échec au démarrage probable) s'il survient avant ce
 *  délai après le spawn — alimente `consecutiveFastFailures` côté appelant. */
export const FAST_FAILURE_THRESHOLD_MS = 10_000;
